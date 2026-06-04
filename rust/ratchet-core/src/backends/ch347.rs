// CH347 backend  -  USB-HS SPI programmer (up to 60MHz, 510-byte SPI packets, 4-byte addr).
// Ports src/backends/ch347.ts. Transport-abstracted for hardware-free tests.

#![allow(dead_code)]

use super::{Backend, BackendError, Result, WriteOpts};
use crate::chips::{format_size, lookup_by_jedec_id};
use crate::types::*;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// ─── USB device IDs ──────────────────────────────────────────────────────────

pub const CH347_VID: u16 = 0x1a86;
pub const CH347_PID: u16 = 0x55db;
pub const CH347_SPI_INTERFACE: u8 = 2;
pub const CH347_EP_OUT: u8 = 0x06;
pub const CH347_EP_IN: u8 = 0x86;

// ─── CH347 SPI packet commands ──────────────────────────────────────────────

pub const CH347_CMD_SPI_CONFIG: u8 = 0xc0;
pub const CH347_CMD_SPI_CS_XFER: u8 = 0xc1;

pub const CH347_SPI_CONFIG_LEN: usize = 26;
pub const CH347_MAX_SPI_PAYLOAD: usize = 510;

/// Clock divisor → human-readable speed table. Index 0 = 60MHz, 7 = 468.75KHz.
pub const CH347_CLOCK_DIVISORS: &[(u8, &str)] = &[
    (0, "60 MHz"),
    (1, "30 MHz"),
    (2, "15 MHz"),
    (3, "7.5 MHz"),
    (4, "3.75 MHz"),
    (5, "1.875 MHz"),
    (6, "937.5 KHz"),
    (7, "468.75 KHz"),
];

// ─── SPI flash opcodes (subset, same as CH341A) ─────────────────────────────

pub const SPI_CMD_RDID: u8 = 0x9f;
pub const SPI_CMD_READ: u8 = 0x03;
pub const SPI_CMD_FAST_READ: u8 = 0x0b;
pub const SPI_CMD_WREN: u8 = 0x06;
pub const SPI_CMD_PAGE_PROGRAM: u8 = 0x02;
pub const SPI_CMD_SECTOR_ERASE: u8 = 0x20;
pub const SPI_CMD_BLOCK_ERASE: u8 = 0xd8;
pub const SPI_CMD_CHIP_ERASE: u8 = 0xc7;
pub const SPI_CMD_RDSR: u8 = 0x05;
pub const SPI_CMD_WRSR: u8 = 0x01;
pub const SPI_CMD_EWSR: u8 = 0x50;
pub const SPI_CMD_SFDP: u8 = 0x5a;

// 4-byte addressing
pub const SPI_CMD_ENTER_4BYTE: u8 = 0xb7;
pub const SPI_CMD_EXIT_4BYTE: u8 = 0xe9;
pub const SPI_CMD_READ_4BYTE: u8 = 0x13;
pub const SPI_CMD_PAGE_PROGRAM_4BYTE: u8 = 0x12;
pub const SPI_CMD_SECTOR_ERASE_4BYTE: u8 = 0x21;
pub const SPI_CMD_BLOCK_ERASE_4BYTE: u8 = 0xdc;

pub const SPI_SR_WIP: u8 = 0x01;
pub const SPI_SR_WEL: u8 = 0x02;

// WIP-poll timeouts. Page-program completes in ~ms; a full chip-erase can run for minutes.
pub const PAGE_PROGRAM_TIMEOUT: Duration = Duration::from_millis(10_000);
pub const ERASE_TIMEOUT: Duration = Duration::from_millis(240_000);

pub const ADDR_4BYTE_THRESHOLD: u64 = 16 * 1024 * 1024;

// ─── Transport trait + capturing impl ───────────────────────────────────────

/// Abstracts CH347 bulk I/O. Tests use [`CapturingTransport`]; production
/// will plug in a real libusb-backed impl in D18.
pub trait Transport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read(&mut self, len: usize) -> Result<Vec<u8>>;
}

pub struct CapturingTransport {
    pub writes: Vec<Vec<u8>>,
    pub reads: std::collections::VecDeque<Vec<u8>>,
}

impl CapturingTransport {
    pub fn new() -> Self {
        Self {
            writes: Vec::new(),
            reads: std::collections::VecDeque::new(),
        }
    }

    pub fn queue_read(&mut self, bytes: Vec<u8>) {
        self.reads.push_back(bytes);
    }
}

impl Default for CapturingTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl Transport for CapturingTransport {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writes.push(data.to_vec());
        Ok(())
    }

    fn read(&mut self, len: usize) -> Result<Vec<u8>> {
        let mut buf = self.reads.pop_front().unwrap_or_else(|| vec![0u8; len]);
        buf.resize(len, 0);
        Ok(buf)
    }
}

// ─── Packet builders ─────────────────────────────────────────────────────────

/// SPI config packet: sets clock divisor, MSB-first, mode 0, CS0 active-low.
pub fn build_spi_config_packet(clock_divisor: u8) -> Vec<u8> {
    let mut pkt = vec![0u8; 3 + CH347_SPI_CONFIG_LEN];
    pkt[0] = CH347_CMD_SPI_CONFIG;
    pkt[1] = (CH347_SPI_CONFIG_LEN & 0xff) as u8;
    pkt[2] = ((CH347_SPI_CONFIG_LEN >> 8) & 0xff) as u8;
    pkt[3] = 0x00; // SPI mode 0
    pkt[4] = clock_divisor;
    pkt[5] = 0x00; // MSB-first
                   // Bytes 6..end already zero (CS0 active-low, reserved).
    pkt
}

/// CS+Transfer packet: 4-byte header + `data` bytes.
/// `cs_assert=true` drives CS low; false drives CS high. `cs_index` selects CS line (0=CS0).
pub fn build_cs_xfer_packet(data: &[u8], cs_assert: bool, cs_index: u8) -> Vec<u8> {
    let mut pkt = vec![0u8; 4 + data.len()];
    pkt[0] = CH347_CMD_SPI_CS_XFER;
    pkt[1] = (data.len() & 0xff) as u8;
    pkt[2] = ((data.len() >> 8) & 0xff) as u8;
    pkt[3] = if cs_assert { 0x00 } else { 0x80 } | (cs_index & 0x7f);
    pkt[4..].copy_from_slice(data);
    pkt
}

pub fn address_bytes(addr: u32, use_4byte: bool) -> Vec<u8> {
    if use_4byte {
        vec![
            (addr >> 24) as u8,
            (addr >> 16) as u8,
            (addr >> 8) as u8,
            addr as u8,
        ]
    } else {
        vec![(addr >> 16) as u8, (addr >> 8) as u8, addr as u8]
    }
}

// ─── Protocol over Transport ────────────────────────────────────────────────

pub struct Ch347Protocol<T: Transport> {
    transport: T,
    use_4byte_addr: bool,
    clock_divisor: u8,
}

impl<T: Transport> Ch347Protocol<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            use_4byte_addr: false,
            clock_divisor: 3, // default 7.5MHz (safe for most chips)
        }
    }

    pub fn set_clock_divisor(&mut self, div: u8) {
        self.clock_divisor = div.min(7);
    }

    pub fn clock_divisor(&self) -> u8 {
        self.clock_divisor
    }

    pub fn set_4byte_addr(&mut self, enable: bool) {
        self.use_4byte_addr = enable;
    }

    pub fn use_4byte_addr(&self) -> bool {
        self.use_4byte_addr
    }

    pub fn transport_mut(&mut self) -> &mut T {
        &mut self.transport
    }

    /// Send SPI config (clock + mode 0 + MSB-first + CS0 active-low).
    pub fn send_config(&mut self) -> Result<()> {
        self.transport
            .write(&build_spi_config_packet(self.clock_divisor))
    }

    /// Full SPI transaction with CS toggle. Chunked at 510 bytes/packet.
    pub fn spi_command(&mut self, cmd: &[u8]) -> Result<Vec<u8>> {
        self.spi_transfer(cmd)
    }

    fn spi_transfer(&mut self, tx: &[u8]) -> Result<Vec<u8>> {
        let mut result = vec![0u8; tx.len()];
        // Reused CS-assert packet buffer: only the payload bytes change per chunk,
        // so we rewrite it in place instead of allocating a fresh Vec per 510-byte chunk.
        let mut pkt: Vec<u8> = Vec::with_capacity(4 + CH347_MAX_SPI_PAYLOAD);
        let mut offset = 0;
        while offset < tx.len() {
            let remaining = tx.len() - offset;
            let chunk_len = remaining.min(CH347_MAX_SPI_PAYLOAD);
            let chunk = &tx[offset..offset + chunk_len];
            let is_last = offset + chunk_len >= tx.len();

            // CS-assert XFER carrying this chunk (header + payload), buffer reused.
            pkt.clear();
            pkt.push(CH347_CMD_SPI_CS_XFER);
            pkt.push((chunk_len & 0xff) as u8);
            pkt.push(((chunk_len >> 8) & 0xff) as u8);
            pkt.push(0x00); // cs_assert=true, cs_index=0
            pkt.extend_from_slice(chunk);
            self.transport.write(&pkt)?;
            let rx = self.transport.read(4 + chunk_len)?;
            result[offset..offset + chunk_len].copy_from_slice(&rx[4..4 + chunk_len]);

            if is_last {
                // CS-deassert XFER (empty payload) terminates the transaction.
                let pkt_de = build_cs_xfer_packet(&[], false, 0);
                self.transport.write(&pkt_de)?;
                let _drain = self.transport.read(4)?;
            }
            offset += chunk_len;
        }
        Ok(result)
    }

    pub fn read_jedec_id(&mut self) -> Result<JedecId> {
        let rx = self.spi_command(&[SPI_CMD_RDID, 0, 0, 0])?;
        Ok(JedecId {
            manufacturer: rx[1],
            memory_type: rx[2],
            capacity: rx[3],
        })
    }

    pub fn read_status_register(&mut self) -> Result<u8> {
        let rx = self.spi_command(&[SPI_CMD_RDSR, 0])?;
        Ok(rx[1])
    }

    /// Poll RDSR until the WIP bit clears or `timeout` elapses. Required after every erase and
    /// program: the chip NAKs new commands while busy, and chip-erase runs for tens of seconds.
    pub fn wait_until_ready(&mut self, timeout: Duration) -> Result<()> {
        let start = Instant::now();
        let mut backoff = Duration::from_micros(50);
        loop {
            if self.read_status_register()? & SPI_SR_WIP == 0 {
                return Ok(());
            }
            if start.elapsed() >= timeout {
                return Err(BackendError::Other(format!(
                    "chip still busy (WIP set) after {} ms",
                    timeout.as_millis()
                )));
            }
            std::thread::sleep(backoff);
            backoff = (backoff * 2).min(Duration::from_millis(20));
        }
    }

    pub fn write_enable(&mut self) -> Result<()> {
        self.spi_command(&[SPI_CMD_WREN]).map(|_| ())
    }

    pub fn page_program(&mut self, address: u32, data: &[u8]) -> Result<()> {
        self.write_enable()?;
        let mut tx: Vec<u8> = Vec::with_capacity(1 + 4 + data.len());
        tx.push(if self.use_4byte_addr {
            SPI_CMD_PAGE_PROGRAM_4BYTE
        } else {
            SPI_CMD_PAGE_PROGRAM
        });
        tx.extend(address_bytes(address, self.use_4byte_addr));
        tx.extend_from_slice(data);
        self.spi_command(&tx)?;
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }

    pub fn sector_erase(&mut self, address: u32) -> Result<()> {
        self.write_enable()?;
        let mut tx: Vec<u8> = Vec::with_capacity(5);
        tx.push(if self.use_4byte_addr {
            SPI_CMD_SECTOR_ERASE_4BYTE
        } else {
            SPI_CMD_SECTOR_ERASE
        });
        tx.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&tx)?;
        self.wait_until_ready(ERASE_TIMEOUT)
    }

    pub fn block_erase_64k(&mut self, address: u32) -> Result<()> {
        self.write_enable()?;
        let mut tx: Vec<u8> = Vec::with_capacity(5);
        tx.push(if self.use_4byte_addr {
            SPI_CMD_BLOCK_ERASE_4BYTE
        } else {
            SPI_CMD_BLOCK_ERASE
        });
        tx.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&tx)?;
        self.wait_until_ready(ERASE_TIMEOUT)
    }

    pub fn chip_erase(&mut self) -> Result<()> {
        self.write_enable()?;
        self.spi_command(&[SPI_CMD_CHIP_ERASE])?;
        self.wait_until_ready(ERASE_TIMEOUT)
    }

    pub fn read_data(&mut self, address: u32, length: usize) -> Result<Vec<u8>> {
        let mut tx: Vec<u8> = Vec::with_capacity(5 + length);
        tx.push(if self.use_4byte_addr {
            SPI_CMD_READ_4BYTE
        } else {
            SPI_CMD_READ
        });
        tx.extend(address_bytes(address, self.use_4byte_addr));
        tx.extend(std::iter::repeat_n(0u8, length));
        let mut rx = self.spi_command(&tx)?;
        let addr_len = if self.use_4byte_addr { 4 } else { 3 };
        // Reuse rx's allocation: drop the leading opcode+address echo and trailing
        // bytes in place rather than copying the data slice into a fresh Vec.
        rx.truncate(1 + addr_len + length);
        rx.drain(..1 + addr_len);
        Ok(rx)
    }

    pub fn enter_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_CMD_ENTER_4BYTE])?;
        self.use_4byte_addr = true;
        Ok(())
    }

    pub fn exit_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_CMD_EXIT_4BYTE])?;
        self.use_4byte_addr = false;
        Ok(())
    }
}

// ─── Backend impl wrapping the protocol ─────────────────────────────────────

pub struct Ch347Backend<T: Transport + Send> {
    proto: Ch347Protocol<T>,
}

impl<T: Transport + Send> Ch347Backend<T> {
    pub fn new(transport: T) -> Self {
        Self {
            proto: Ch347Protocol::new(transport),
        }
    }

    pub fn protocol(&mut self) -> &mut Ch347Protocol<T> {
        &mut self.proto
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    hex_encode(&h.finalize())
}

impl<T: Transport + Send> Backend for Ch347Backend<T> {
    fn detect_programmer(&mut self) -> Result<ProgrammerInfo> {
        Ok(ProgrammerInfo {
            kind: "ch347".to_string(),
            connected: true,
            vendor_id: format!("{:04x}", CH347_VID),
            product_id: format!("{:04x}", CH347_PID),
            description: "CH347 USB SPI/I2C/JTAG Programmer".to_string(),
            backend: "native".to_string(),
        })
    }

    fn open(&mut self) -> Result<()> {
        self.proto.send_config()
    }

    fn close(&mut self) -> Result<()> {
        Ok(())
    }

    fn read_jedec_id(&mut self) -> Result<JedecId> {
        self.proto.read_jedec_id()
    }

    fn identify_chip(&mut self) -> Result<Option<ChipInfo>> {
        let id = self.proto.read_jedec_id()?;
        let hex = id.to_hex();
        if let Some(db) = lookup_by_jedec_id(&hex) {
            Ok(Some(ChipInfo {
                name: db.name.clone(),
                vendor_name: db.vendor.clone(),
                jedec_id: hex,
                size_bytes: db.size_bytes,
                size_human: format_size(db.size_bytes),
                chip_type: "spi".to_string(),
                page_size: Some(db.page_size),
                sector_size: Some(db.sector_size),
                block_size: Some(db.block_size),
                write_protected: None,
                voltage: Some(db.voltage),
            }))
        } else {
            Ok(None)
        }
    }

    fn read_status_registers(&mut self) -> Result<StatusRegisters> {
        Ok(StatusRegisters {
            sr1: self.proto.read_status_register()?,
            sr2: 0,
            sr3: 0,
        })
    }

    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>> {
        Ok(None)
    }

    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult> {
        let start = Instant::now();
        // Read the ACTUAL chip size, not a hardcoded 8 MB (a 16 MB BIOS was reading half).
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let size = chip.size_bytes as usize;
        if size == 0 {
            return Err(BackendError::ChipNotDetected);
        }
        let data = self.proto.read_data(0, size)?;
        fs::write(output_path, &data)?;
        Ok(ReadResult {
            success: true,
            file_path: output_path.display().to_string(),
            size_bytes: data.len() as u64,
            duration_ms: start.elapsed().as_millis() as u64,
            checksum: sha256_hex(&data),
            all_ff: Some(data.iter().all(|b| *b == 0xff)),
            all_zero: Some(data.iter().all(|b| *b == 0x00)),
            error: None,
        })
    }

    fn write_chip(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let start = Instant::now();
        let firmware = fs::read(input_path)?;
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let chip_size = chip.size_bytes as usize;
        if chip_size > 0 && firmware.len() > chip_size {
            return Err(BackendError::Other(format!(
                "image is {} bytes but the chip holds only {} bytes",
                firmware.len(),
                chip_size
            )));
        }
        let page_size = chip.page_size.unwrap_or(256).max(1) as usize;
        let sector_size = chip.sector_size.unwrap_or(4096).max(1) as u32;

        // 1. Back up current contents before overwriting (unless skipped).
        let backup_path = if opts.skip_backup {
            None
        } else {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let path = std::env::temp_dir().join(format!("ratchet-backup-{}.bin", ts));
            self.read_chip(&path)?;
            Some(path.display().to_string())
        };

        // 2. Erase the sectors the image covers — program can only flip 1→0 (each sector_erase
        //    now WREN + erase + WIP-wait). Previously write skipped erase entirely.
        let mut addr: u32 = 0;
        while (addr as usize) < firmware.len() {
            self.proto.sector_erase(addr)?;
            addr = addr.saturating_add(sector_size);
        }

        // 3. Program page-by-page, never crossing a page boundary.
        let mut offset = 0usize;
        while offset < firmware.len() {
            let page_end = (offset / page_size + 1) * page_size;
            let chunk_end = page_end.min(firmware.len());
            self.proto
                .page_program(offset as u32, &firmware[offset..chunk_end])?;
            offset = chunk_end;
        }

        // 4. Read back and compare unless skipped — no more hardcoded `verified: true`.
        let verified = if opts.skip_verify {
            false
        } else {
            self.verify_chip(input_path)?.matches
        };

        Ok(WriteResult {
            success: true,
            backup_path,
            verified,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn verify_chip(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let start = Instant::now();
        let file_data = fs::read(file_path)?;
        let chip_data = self.proto.read_data(0, file_data.len())?;
        let chip_checksum = sha256_hex(&chip_data);
        let file_checksum = sha256_hex(&file_data);
        Ok(VerifyResult {
            matches: chip_checksum == file_checksum,
            file_path: file_path.display().to_string(),
            chip_checksum,
            file_checksum,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    fn erase_chip(&mut self) -> Result<EraseResult> {
        let start = Instant::now();
        self.proto.chip_erase()?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        self.proto.sector_erase(address as u32)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        self.proto.block_erase_64k(address as u32)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult> {
        let start = Instant::now();
        let mut addr = start_addr;
        let end = start_addr + length;
        while addr < end {
            self.proto.sector_erase(addr as u32)?;
            addr += 4096;
        }
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn is_write_protected(&mut self) -> Result<bool> {
        Ok(self.proto.read_status_register()? & 0x1c != 0)
    }

    fn disable_write_protection(&mut self) -> Result<()> {
        self.proto.write_enable()
    }

    fn connection_test(&mut self) -> Result<ConnectionTestResult> {
        let mut ids: Vec<String> = Vec::with_capacity(10);
        for _ in 0..10 {
            ids.push(self.proto.read_jedec_id()?.to_hex());
        }
        let first = ids[0].clone();
        let matches = ids.iter().filter(|x| **x == first).count() as u32;
        let stable = matches == 10;
        Ok(ConnectionTestResult {
            stable,
            reads: 10,
            matches,
            jedec_id: first,
            timings: vec![3; 10], // CH347 is much faster than CH341A
            status_register: None,
            error: if stable {
                None
            } else {
                Some(format!(
                    "Unstable: {matches}/10 consistent  -  reseat clip/check power"
                ))
            },
        })
    }

    fn reset_chip(&mut self) -> Result<()> {
        Ok(())
    }
}

#[allow(dead_code)]
fn _backend_error_in_scope(e: BackendError) -> BackendError {
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    fn primed_transport(reads: Vec<Vec<u8>>) -> CapturingTransport {
        let mut t = CapturingTransport::new();
        for r in reads {
            t.queue_read(r);
        }
        t
    }

    /// Single-packet SPI command (≤510 bytes) writes: [CS-assert+payload], [CS-deassert empty].
    fn assert_single_packet_shape(t: &CapturingTransport) {
        let writes = &t.writes;
        // First write is CS_XFER with cs_assert bit=0 (asserted).
        assert_eq!(writes[0][0], CH347_CMD_SPI_CS_XFER);
        assert_eq!(writes[0][3] & 0x80, 0); // CS asserted
                                            // Final write is CS_XFER with cs_deassert (bit 7 set).
        let last = writes.last().unwrap();
        assert_eq!(last[0], CH347_CMD_SPI_CS_XFER);
        assert!(last[3] & 0x80 != 0);
    }

    #[test]
    fn config_packet_has_correct_length_and_cmd() {
        let pkt = build_spi_config_packet(3);
        assert_eq!(pkt[0], CH347_CMD_SPI_CONFIG);
        assert_eq!(pkt[1], CH347_SPI_CONFIG_LEN as u8);
        assert_eq!(pkt[2], 0);
        assert_eq!(pkt[3], 0x00); // mode 0
        assert_eq!(pkt[4], 3); // clock divisor
        assert_eq!(pkt[5], 0x00); // MSB-first
        assert_eq!(pkt.len(), 3 + CH347_SPI_CONFIG_LEN);
    }

    #[test]
    fn cs_xfer_assert_clears_high_bit() {
        let pkt = build_cs_xfer_packet(&[0x9f], true, 0);
        assert_eq!(pkt[0], CH347_CMD_SPI_CS_XFER);
        assert_eq!(pkt[1], 1);
        assert_eq!(pkt[2], 0);
        assert_eq!(pkt[3] & 0x80, 0);
        assert_eq!(pkt[4], 0x9f);
    }

    #[test]
    fn cs_xfer_deassert_sets_high_bit() {
        let pkt = build_cs_xfer_packet(&[], false, 0);
        assert_eq!(pkt[0], CH347_CMD_SPI_CS_XFER);
        assert_eq!(pkt[3] & 0x80, 0x80);
        assert_eq!(pkt.len(), 4);
    }

    #[test]
    fn cs_xfer_index_encodes_in_low_7_bits() {
        let pkt = build_cs_xfer_packet(&[0xff], true, 1);
        assert_eq!(pkt[3] & 0x7f, 1);
    }

    #[test]
    fn address_bytes_3_and_4_byte() {
        assert_eq!(address_bytes(0x123456, false), vec![0x12, 0x34, 0x56]);
        assert_eq!(
            address_bytes(0xDEADBEEF, true),
            vec![0xde, 0xad, 0xbe, 0xef]
        );
    }

    #[test]
    fn send_config_writes_one_packet() {
        let mut p = Ch347Protocol::new(CapturingTransport::new());
        p.send_config().unwrap();
        let w = &p.transport_mut().writes;
        assert_eq!(w.len(), 1);
        assert_eq!(w[0][0], CH347_CMD_SPI_CONFIG);
    }

    #[test]
    fn clock_divisor_clamps_to_7() {
        let mut p = Ch347Protocol::new(CapturingTransport::new());
        p.set_clock_divisor(99);
        assert_eq!(p.clock_divisor(), 7);
    }

    /// JEDEC ID single-packet protocol:
    ///   1. CS_XFER (CS-asserted) + payload [0x9f 0 0 0]
    ///   2. read 4-byte header + 4 bytes data
    ///   3. CS_XFER (CS-deasserted) empty
    ///   4. read 4-byte drain
    #[test]
    fn jedec_id_emits_correct_packet_sequence() {
        // Reads: first read returns 4-byte header + 4 bytes [0xff 0xef 0x40 0x17].
        // Second read returns 4 bytes drain.
        let t = primed_transport(vec![
            vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x17],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        let id = p.read_jedec_id().unwrap();
        assert_eq!(id.to_hex(), "ef4017");
        assert_single_packet_shape(p.transport_mut());

        // First write payload = SPI bytes (after 4-byte header)
        let payload = &p.transport_mut().writes[0][4..];
        assert_eq!(payload, &[SPI_CMD_RDID, 0, 0, 0]);
    }

    #[test]
    fn sector_erase_3byte_uses_20_opcode() {
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 4],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.sector_erase(0xAB_CDEF).unwrap();
        let writes = &p.transport_mut().writes;

        // First spi_command = WREN: CS_XFER (0xC1) + [0x06]
        assert_eq!(writes[0][0], CH347_CMD_SPI_CS_XFER);
        assert_eq!(writes[0][4], SPI_CMD_WREN);

        // Second spi_command = ERASE: skip the deassert packet (writes[1])  -  it's empty.
        // writes[2] = CS_XFER assert + [0x20 0xab 0xcd 0xef].
        // writes[1] is the WREN deassert (empty payload).
        assert_eq!(writes[2][0], CH347_CMD_SPI_CS_XFER);
        assert_eq!(writes[2][4], SPI_CMD_SECTOR_ERASE);
        assert_eq!(&writes[2][5..8], &[0xab, 0xcd, 0xef]);
    }

    #[test]
    fn sector_erase_4byte_uses_21_opcode() {
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 5],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.set_4byte_addr(true);
        p.sector_erase(0xAA_BB_CC_DD).unwrap();
        let writes = &p.transport_mut().writes;
        assert_eq!(writes[2][4], SPI_CMD_SECTOR_ERASE_4BYTE);
        assert_eq!(&writes[2][5..9], &[0xaa, 0xbb, 0xcc, 0xdd]);
    }

    #[test]
    fn block_erase_64k_uses_d8_or_dc() {
        // 3-byte
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 4],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.block_erase_64k(0).unwrap();
        assert_eq!(p.transport_mut().writes[2][4], SPI_CMD_BLOCK_ERASE);

        // 4-byte
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 5],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.set_4byte_addr(true);
        p.block_erase_64k(0).unwrap();
        assert_eq!(p.transport_mut().writes[2][4], SPI_CMD_BLOCK_ERASE_4BYTE);
    }

    #[test]
    fn chip_erase_uses_c7_opcode() {
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 1],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.chip_erase().unwrap();
        let writes = &p.transport_mut().writes;
        assert_eq!(writes[0][4], SPI_CMD_WREN);
        assert_eq!(writes[2][4], SPI_CMD_CHIP_ERASE);
    }

    #[test]
    fn page_program_uses_02_opcode_3byte() {
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 260],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        p.page_program(0, &data).unwrap();
        let writes = &p.transport_mut().writes;
        assert_eq!(writes[2][4], SPI_CMD_PAGE_PROGRAM);
        // 3-byte addr (all zero) + 256 data bytes.
        assert_eq!(&writes[2][5..8], &[0, 0, 0]);
        assert_eq!(writes[2][8], 0); // first data byte
    }

    #[test]
    fn page_program_polls_wip_after_write() {
        // Empty read queue ⇒ CapturingTransport returns zeros ⇒ RDSR reads WIP=0 (ready).
        let mut p = Ch347Protocol::new(CapturingTransport::new());
        p.page_program(0, &[0xab; 16]).unwrap();
        // A WIP poll (RDSR) CS_XFER must appear after the PAGE_PROGRAM, else we'd race the chip.
        let polled = p
            .transport_mut()
            .writes
            .iter()
            .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == SPI_CMD_RDSR);
        assert!(polled, "page_program must poll RDSR/WIP before returning");
    }

    #[test]
    fn chip_erase_polls_wip_after_erase() {
        let mut p = Ch347Protocol::new(CapturingTransport::new());
        p.chip_erase().unwrap();
        let polled = p
            .transport_mut()
            .writes
            .iter()
            .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == SPI_CMD_RDSR);
        assert!(polled, "chip_erase must poll RDSR/WIP before returning");
    }

    #[test]
    fn page_program_4byte_uses_12_opcode() {
        let t = primed_transport(vec![
            vec![0u8; 4 + 1],
            vec![0u8; 4],
            vec![0u8; 4 + 261],
            vec![0u8; 4],
        ]);
        let mut p = Ch347Protocol::new(t);
        p.set_4byte_addr(true);
        let data = vec![0xaau8; 256];
        p.page_program(0, &data).unwrap();
        assert_eq!(p.transport_mut().writes[2][4], SPI_CMD_PAGE_PROGRAM_4BYTE);
    }

    #[test]
    fn read_data_returns_payload_after_opcode_and_addr() {
        // SPI echo: 4-byte CH347 header + 1 opcode + 3 addr + N data
        let mut payload = vec![0u8; 4 + 1 + 3];
        payload.extend(0..32u8);
        let t = primed_transport(vec![payload, vec![0u8; 4]]);
        let mut p = Ch347Protocol::new(t);
        let out = p.read_data(0x10_0000, 32).unwrap();
        assert_eq!(out, (0..32u8).collect::<Vec<_>>());
    }

    #[test]
    fn enter_4byte_mode_sets_flag_and_sends_b7() {
        let t = primed_transport(vec![vec![0u8; 4 + 1], vec![0u8; 4]]);
        let mut p = Ch347Protocol::new(t);
        p.enter_4byte_mode().unwrap();
        assert!(p.use_4byte_addr());
        assert_eq!(p.transport_mut().writes[0][4], SPI_CMD_ENTER_4BYTE);
    }

    #[test]
    fn read_status_register_returns_byte_after_opcode() {
        let t = primed_transport(vec![vec![0u8, 0, 0, 0, 0xff, 0x42], vec![0u8; 4]]);
        let mut p = Ch347Protocol::new(t);
        assert_eq!(p.read_status_register().unwrap(), 0x42);
    }

    #[test]
    fn clock_divisor_table_covers_all_8_speeds() {
        assert_eq!(CH347_CLOCK_DIVISORS.len(), 8);
        assert_eq!(CH347_CLOCK_DIVISORS[0].1, "60 MHz");
        assert_eq!(CH347_CLOCK_DIVISORS[7].1, "468.75 KHz");
    }

    #[test]
    fn max_spi_payload_is_510() {
        assert_eq!(CH347_MAX_SPI_PAYLOAD, 510);
    }

    #[test]
    fn backend_open_sends_config() {
        let mut b = Ch347Backend::new(CapturingTransport::new());
        b.open().unwrap();
        let writes = &b.protocol().transport_mut().writes;
        assert_eq!(writes[0][0], CH347_CMD_SPI_CONFIG);
    }

    #[test]
    fn backend_jedec_id_through_trait() {
        let t = primed_transport(vec![
            vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x17],
            vec![0u8; 4],
        ]);
        let mut b = Ch347Backend::new(t);
        let id = Backend::read_jedec_id(&mut b).unwrap();
        assert_eq!(id.to_hex(), "ef4017");
    }
}
