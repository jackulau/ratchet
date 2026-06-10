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
/// CH347F (the QFN/full-featured variant) enumerates as 0x55de with the same
/// bulk SPI protocol and endpoint layout. 0x55dc is the HID-mode CH347 with a
/// different endpoint layout and is deliberately NOT probed.
pub const CH347F_PID: u16 = 0x55de;
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
pub const SPI_CMD_RDSR2: u8 = 0x35;
pub const SPI_CMD_RDSR3: u8 = 0x15;
pub const SPI_CMD_WRSR: u8 = 0x01;
pub const SPI_CMD_EWSR: u8 = 0x50;
pub const SPI_CMD_SFDP: u8 = 0x5a;

// 4-byte addressing
pub const SPI_CMD_RESET_ENABLE: u8 = 0x66;
pub const SPI_CMD_RESET: u8 = 0x99;
pub const SPI_CMD_ENTER_4BYTE: u8 = 0xb7;
pub const SPI_CMD_EXIT_4BYTE: u8 = 0xe9;
pub const SPI_CMD_READ_4BYTE: u8 = 0x13;
pub const SPI_CMD_PAGE_PROGRAM_4BYTE: u8 = 0x12;
pub const SPI_CMD_SECTOR_ERASE_4BYTE: u8 = 0x21;
pub const SPI_CMD_BLOCK_ERASE_4BYTE: u8 = 0xdc;

pub const SPI_SR_WIP: u8 = 0x01;
pub const SPI_SR_WEL: u8 = 0x02;
/// Block-protect bits BP0-BP2: any set means part of the array is write-protected.
pub const SPI_SR_BP_MASK: u8 = 0x1c;

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

    /// Read exactly `buf.len()` bytes into a caller-provided buffer. Streaming
    /// reads call this once per 510-byte chunk; the live bus overrides it to
    /// fill the slice directly — the default wraps `read` for mocks/tests.
    /// Fails closed with `ShortTransfer` on a short read.
    fn read_into(&mut self, buf: &mut [u8]) -> Result<()> {
        let rx = self.read(buf.len())?;
        if rx.len() < buf.len() {
            return Err(BackendError::Usb(ratchet_usb::UsbError::ShortTransfer {
                expected: buf.len(),
                actual: rx.len(),
            }));
        }
        buf.copy_from_slice(&rx[..buf.len()]);
        Ok(())
    }
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
    progress: Option<crate::backends::ProgressFn>,
}

impl<T: Transport> Ch347Protocol<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            use_4byte_addr: false,
            clock_divisor: 3, // default 7.5MHz (safe for most chips)
            progress: None,
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
        let res = self.spi_transfer_inner(tx);
        if res.is_err() {
            // CS must be released even when a chunk write/read fails mid-stream:
            // a chip left selected treats the next command's clocks as
            // continuation data. Best-effort — the original error is what the
            // caller must see.
            let _ = self.transport.write(&build_cs_xfer_packet(&[], false, 0));
            let _ = self.transport.read(4);
        }
        res
    }

    fn spi_transfer_inner(&mut self, tx: &[u8]) -> Result<Vec<u8>> {
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
            if rx.len() < 4 + chunk_len {
                // A short transport read must be a hard error, not a panic (the
                // old slice indexing) and never silent padding. The wrapper
                // releases CS.
                return Err(BackendError::Usb(ratchet_usb::UsbError::ShortTransfer {
                    expected: 4 + chunk_len,
                    actual: rx.len(),
                }));
            }
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

    pub fn read_status_register2(&mut self) -> Result<u8> {
        let rx = self.spi_command(&[SPI_CMD_RDSR2, 0])?;
        Ok(rx[1])
    }

    pub fn read_status_register3(&mut self) -> Result<u8> {
        let rx = self.spi_command(&[SPI_CMD_RDSR3, 0])?;
        Ok(rx[1])
    }

    /// SFDP read (0x5A): 3-byte SFDP-space address + one dummy byte, then `len`
    /// data bytes clocked out.
    pub fn sfdp_read_at(&mut self, addr: u32, len: usize) -> Result<Vec<u8>> {
        let mut tx = vec![
            SPI_CMD_SFDP,
            (addr >> 16) as u8,
            (addr >> 8) as u8,
            addr as u8,
            0, // dummy cycle per JESD216
        ];
        let data_start = tx.len();
        tx.resize(data_start + len, 0);
        let mut rx = self.spi_command(&tx)?;
        rx.truncate(data_start + len);
        rx.drain(..data_start);
        Ok(rx)
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
        self.chip_erase_with_timeout(ERASE_TIMEOUT)
    }

    /// Chip-erase with a caller-sized WIP timeout: 16-32 MB parts take 200-400 s,
    /// far past the fixed default. The backend sizes this from chip capacity.
    pub fn chip_erase_with_timeout(&mut self, timeout: Duration) -> Result<()> {
        self.write_enable()?;
        self.spi_command(&[SPI_CMD_CHIP_ERASE])?;
        self.wait_until_ready(timeout)
    }

    pub fn read_data(&mut self, address: u32, length: usize) -> Result<Vec<u8>> {
        // Stream the read in 510-byte chunks instead of materializing a
        // chip-size tx of zeros plus a chip-size echo (the old path held ~3x
        // the chip size in transient memory for a full dump). CS stays
        // asserted across chunks exactly as spi_transfer framed it; a failure
        // mid-stream still releases CS.
        let mut out = Vec::with_capacity(length);
        let res = self.read_data_stream(address, length, &mut out);
        if res.is_err() {
            let _ = self.transport.write(&build_cs_xfer_packet(&[], false, 0));
            let _ = self.transport.read(4);
        }
        res.map(|()| out)
    }

    fn read_data_stream(&mut self, address: u32, length: usize, out: &mut Vec<u8>) -> Result<()> {
        // Opcode + address in the first CS-asserted packet; echo discarded.
        let mut hdr: Vec<u8> = Vec::with_capacity(5);
        hdr.push(if self.use_4byte_addr {
            SPI_CMD_READ_4BYTE
        } else {
            SPI_CMD_READ
        });
        hdr.extend(address_bytes(address, self.use_4byte_addr));
        let mut rx = vec![0u8; 4 + CH347_MAX_SPI_PAYLOAD];
        self.transport.write(&build_cs_xfer_packet(&hdr, true, 0))?;
        self.transport.read_into(&mut rx[..4 + hdr.len()])?;

        // Clock the data out: zeros shifted in clock bytes out, one reused
        // packet + rx buffer per chunk.
        let zeros = [0u8; CH347_MAX_SPI_PAYLOAD];
        let mut pkt: Vec<u8> = Vec::with_capacity(4 + CH347_MAX_SPI_PAYLOAD);
        let mut remaining = length;
        while remaining > 0 {
            let n = remaining.min(CH347_MAX_SPI_PAYLOAD);
            pkt.clear();
            pkt.push(CH347_CMD_SPI_CS_XFER);
            pkt.push((n & 0xff) as u8);
            pkt.push(((n >> 8) & 0xff) as u8);
            pkt.push(0x00); // cs_assert=true, cs_index=0
            pkt.extend_from_slice(&zeros[..n]);
            self.transport.write(&pkt)?;
            self.transport.read_into(&mut rx[..4 + n])?;
            out.extend_from_slice(&rx[4..4 + n]);
            remaining -= n;
            if let Some(cb) = self.progress.as_mut() {
                cb(out.len() as u64, length as u64);
            }
        }

        // CS-deassert XFER (empty payload) terminates the transaction.
        self.transport.write(&build_cs_xfer_packet(&[], false, 0))?;
        let _drain = self.transport.read(4)?;
        Ok(())
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

    /// Refuse destructive ops on write-protected silicon: protected chips silently
    /// ignore erase/program commands, which would otherwise read as fake success.
    fn ensure_not_write_protected(&mut self) -> Result<()> {
        if self.proto.read_status_register()? & SPI_SR_BP_MASK != 0 {
            return Err(BackendError::WriteProtected);
        }
        Ok(())
    }

    /// Best-effort EX4B after a top-level operation whose identify step may have
    /// entered 4-byte mode. The operation's own result takes precedence over a
    /// failure to restore addressing mode.
    fn exit_4byte_if_entered(&mut self) {
        if self.proto.use_4byte_addr() {
            let _ = self.proto.exit_4byte_mode();
        }
    }

    /// Standalone erase verbs arrive without a prior identify, so a >16 MB chip
    /// would still be in power-on 3-byte mode and the erase address would silently
    /// wrap at 16 MB — destroying the wrong sector. Identify first (which enters
    /// 4-byte mode for big chips), then hard-refuse any range the active 3-byte
    /// framing cannot express. `end` is exclusive.
    fn prepare_erase_addressing(&mut self, end: u64) -> Result<()> {
        self.identify_chip()?;
        if !self.proto.use_4byte_addr() && end > ADDR_4BYTE_THRESHOLD {
            return Err(BackendError::Other(format!(
                "erase range ends at {end:#x} but the chip is in 3-byte address mode \
                 (16 MB limit); a 3-byte frame would silently wrap and erase the wrong sector"
            )));
        }
        Ok(())
    }

    /// Whole-chip read without the trailing EX4B: write_chip's backup step runs this
    /// mid-operation while 4-byte mode must stay active.
    fn read_chip_to_file(&mut self, output_path: &Path) -> Result<ReadResult> {
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

    /// Read-back comparison without the trailing EX4B: write_chip's verify step runs
    /// this mid-operation while 4-byte mode must stay active.
    fn verify_against_file(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let start = Instant::now();
        let file_data = fs::read(file_path)?;
        // Identify first so 4-byte mode (EN4B) is active before reading back a >16 MB chip;
        // a standalone `verify` would otherwise read with 3-byte addressing and misaddress.
        self.identify_chip()?;
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

    fn write_chip_inner(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let start = Instant::now();
        let firmware = fs::read(input_path)?;
        super::reject_blank_image(&firmware)?;
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

        // Refuse protected silicon before the (possibly minutes-long) backup read:
        // a protected chip ignores erase/program and would fake-succeed.
        self.ensure_not_write_protected()?;

        // 1. Back up current contents before overwriting (unless skipped).
        let backup_path = if opts.skip_backup {
            None
        } else {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let path = std::env::temp_dir().join(format!("ratchet-backup-{}.bin", ts));
            self.read_chip_to_file(&path)?;
            Some(path.display().to_string())
        };

        // 2. Erase the sectors the image covers — program can only flip 1→0 (each sector_erase
        //    now WREN + erase + WIP-wait). The stride MUST match the issued opcode:
        //    proto.sector_erase sends the 4 KB sector-erase (0x20/0x21), so stepping by the
        //    DB's sectorSize (64 KB on 155 of 806 chips) would leave unerased gaps that AND
        //    stale data into the image.
        let mut addr: u32 = 0;
        while (addr as usize) < firmware.len() {
            self.proto.sector_erase(addr)?;
            addr = addr.saturating_add(4096);
        }

        // 3. Program page-by-page, never crossing a page boundary.
        let mut offset = 0usize;
        while offset < firmware.len() {
            let page_end = (offset / page_size + 1) * page_size;
            let chunk_end = page_end.min(firmware.len());
            self.proto
                .page_program(offset as u32, &firmware[offset..chunk_end])?;
            offset = chunk_end;
            if let Some(cb) = self.proto.progress.as_mut() {
                cb(offset as u64, firmware.len() as u64);
            }
        }

        // 4. Read back and compare unless skipped — no more hardcoded `verified: true`.
        let verified = if opts.skip_verify {
            false
        } else {
            self.verify_against_file(input_path)?.matches
        };

        Ok(WriteResult {
            success: true,
            backup_path,
            verified,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    hex_encode(&h.finalize())
}

/// The CH347 wire protocol carries 32-bit addresses; refuse anything wider
/// instead of silently truncating with `as u32` (which would target the
/// wrong sector on a hypothetical >4 GB part or a caller bug).
fn checked_addr32(address: u64) -> Result<u32> {
    u32::try_from(address).map_err(|_| {
        BackendError::Other(format!(
            "address {address:#x} exceeds the 32-bit range of the CH347 SPI framing"
        ))
    })
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
        let Some(db) = lookup_by_jedec_id(&hex) else {
            return Ok(None);
        };
        let info = ChipInfo {
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
        };
        // Chips larger than 16 MB need 4-byte addressing — enter it now (sends EN4B 0xb7).
        if db.size_bytes > 16 * 1024 * 1024 {
            self.proto.enter_4byte_mode()?;
        }
        Ok(Some(info))
    }

    fn read_status_registers(&mut self) -> Result<StatusRegisters> {
        Ok(StatusRegisters {
            sr1: self.proto.read_status_register()?,
            sr2: self.proto.read_status_register2()?,
            sr3: self.proto.read_status_register3()?,
        })
    }

    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>> {
        // Full JESD216 discovery via the live transport — same parser as CH341A.
        crate::sfdp::discover_sfdp(|addr, len| self.proto.sfdp_read_at(addr, len))
    }

    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult> {
        let res = self.read_chip_to_file(output_path);
        self.exit_4byte_if_entered();
        res
    }

    fn write_chip(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let res = self.write_chip_inner(input_path, opts);
        self.exit_4byte_if_entered();
        res
    }

    fn verify_chip(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let res = self.verify_against_file(file_path);
        self.exit_4byte_if_entered();
        res
    }

    fn erase_chip(&mut self) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        // Identify to size the WIP timeout — chip-erase on 16-32 MB parts runs
        // 200-400 s, far past the old fixed default. Unknown capacity gets the
        // largest supported part's budget.
        let res = self.identify_chip().and_then(|chip| {
            let timeout = match chip {
                Some(c) if c.size_bytes > 0 => {
                    crate::backends::ch341a::erase_timeout_for(c.size_bytes)
                }
                _ => crate::backends::ch341a::erase_timeout_for(32 * 1024 * 1024),
            };
            let start = Instant::now();
            self.proto.chip_erase_with_timeout(timeout)?;
            Ok(EraseResult {
                success: true,
                duration_ms: start.elapsed().as_millis() as u64,
                error: None,
            })
        });
        self.exit_4byte_if_entered();
        res
    }

    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| {
                let start = Instant::now();
                self.proto.sector_erase(checked_addr32(address)?)?;
                Ok(EraseResult {
                    success: true,
                    duration_ms: start.elapsed().as_millis() as u64,
                    error: None,
                })
            });
        self.exit_4byte_if_entered();
        res
    }

    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| {
                let start = Instant::now();
                self.proto.block_erase_64k(checked_addr32(address)?)?;
                Ok(EraseResult {
                    success: true,
                    duration_ms: start.elapsed().as_millis() as u64,
                    error: None,
                })
            });
        self.exit_4byte_if_entered();
        res
    }

    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult> {
        // Protection is checked once up front, not per sector.
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(start_addr.saturating_add(length))
            .and_then(|()| {
                let start = Instant::now();
                // Align down to the 4 KB sector grid like CH341A — the erase opcode
                // wipes the whole containing sector regardless of the byte offset.
                let mut addr = start_addr & !0xfff;
                let end = start_addr + length;
                while addr < end {
                    self.proto.sector_erase(checked_addr32(addr)?)?;
                    addr += 4096;
                }
                Ok(EraseResult {
                    success: true,
                    duration_ms: start.elapsed().as_millis() as u64,
                    error: None,
                })
            });
        self.exit_4byte_if_entered();
        res
    }

    fn is_write_protected(&mut self) -> Result<bool> {
        Ok(self.proto.read_status_register()? & SPI_SR_BP_MASK != 0)
    }

    fn disable_write_protection(&mut self) -> Result<()> {
        // EWSR (volatile write-enable for status register), clear all protection
        // bits, then wait out the status-register write cycle — issuing the next
        // command mid-cycle races the register update. A bare WREN (the previous
        // implementation) never cleared the BP bits at all.
        self.proto.spi_command(&[SPI_CMD_EWSR])?;
        self.proto.spi_command(&[SPI_CMD_WRSR, 0])?;
        self.proto.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
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
        // JEDEC software reset: 0x66 (enable reset) then 0x99 (reset), each in
        // its own CS frame, then a settle delay (tRST is ≤30 µs on common parts;
        // 1 ms is comfortably safe). The previous implementation was a no-op
        // that reported success.
        self.proto.spi_command(&[SPI_CMD_RESET_ENABLE])?;
        self.proto.spi_command(&[SPI_CMD_RESET])?;
        std::thread::sleep(Duration::from_millis(1));
        // Reset returns the chip to power-on state, including 3-byte addressing.
        self.proto.set_4byte_addr(false);
        Ok(())
    }

    fn set_progress_callback(&mut self, cb: crate::backends::ProgressFn) {
        self.proto.progress = Some(cb);
    }
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
        // Streamed framing: read 1 echoes the opcode+address header (discarded),
        // read 2 carries the data chunk behind the 4-byte CH347 header, read 3
        // drains the CS-deassert.
        let mut chunk = vec![0u8; 4];
        chunk.extend(0..32u8);
        let t = primed_transport(vec![
            vec![0u8; 4 + 4], // header echo: CH347 hdr + opcode + 3 addr
            chunk,
            vec![0u8; 4], // deassert drain
        ]);
        let mut p = Ch347Protocol::new(t);
        let out = p.read_data(0x10_0000, 32).unwrap();
        assert_eq!(out, (0..32u8).collect::<Vec<_>>());
        // The header packet must carry READ (0x03) + the 3-byte address, and a
        // trailing CS-deassert packet must terminate the stream.
        let writes = &p.transport_mut().writes;
        assert_eq!(&writes[0][4..8], &[SPI_CMD_READ, 0x10, 0x00, 0x00]);
        assert_eq!(writes.last().unwrap(), &build_cs_xfer_packet(&[], false, 0));
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

    #[test]
    fn backend_identify_large_chip_enters_4byte_en4b() {
        // W25Q256 (ef4019) = 32 MB → identify must enter 4-byte mode (EN4B 0xb7).
        let t = primed_transport(vec![vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x19]]);
        let mut b = Ch347Backend::new(t);
        let info = Backend::identify_chip(&mut b).unwrap().unwrap();
        assert!(info.size_bytes > 16 * 1024 * 1024);
        assert!(b.protocol().use_4byte_addr(), "4-byte mode must be enabled");
        let sent_en4b =
            b.protocol().transport_mut().writes.iter().any(|w| {
                w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == SPI_CMD_ENTER_4BYTE
            });
        assert!(sent_en4b, "EN4B (0xb7) must be sent for a >16 MB chip");
    }

    #[test]
    fn cs_deasserted_after_midstream_error() {
        // A transport whose reads fail mid-command (USB timeout). The CS-deassert
        // framing (empty CS_XFER with the deassert bit) must still be written so
        // the chip is not left selected for the next command.
        struct FailReadTransport {
            writes: Vec<Vec<u8>>,
        }
        impl Transport for FailReadTransport {
            fn write(&mut self, d: &[u8]) -> Result<()> {
                self.writes.push(d.to_vec());
                Ok(())
            }
            fn read(&mut self, _len: usize) -> Result<Vec<u8>> {
                Err(BackendError::Other("usb timeout".into()))
            }
        }
        let mut p = Ch347Protocol::new(FailReadTransport { writes: Vec::new() });
        p.spi_command(&[SPI_CMD_RDSR, 0]).unwrap_err();
        let writes = &p.transport_mut().writes;
        assert_eq!(
            writes.last().unwrap(),
            &build_cs_xfer_packet(&[], false, 0),
            "CS must be deasserted after a mid-command transport error"
        );
    }

    #[test]
    fn short_transport_read_is_error_not_panic() {
        // The old code sliced rx[4..4+chunk_len] straight out of the transport
        // read — a short read panicked the process mid-operation. It must be a
        // hard ShortTransfer error instead.
        struct ShortTransport;
        impl Transport for ShortTransport {
            fn write(&mut self, _d: &[u8]) -> Result<()> {
                Ok(())
            }
            fn read(&mut self, len: usize) -> Result<Vec<u8>> {
                Ok(vec![0u8; len.saturating_sub(1)])
            }
        }
        let mut p = Ch347Protocol::new(ShortTransport);
        let err = p.spi_command(&[SPI_CMD_RDSR, 0]).unwrap_err();
        assert!(
            matches!(
                err,
                BackendError::Usb(ratchet_usb::UsbError::ShortTransfer { .. })
            ),
            "short transport read must be a hard error, got: {err}"
        );
    }

    #[test]
    fn region_erase_uses_4byte_addressing_above_16mb() {
        // W25Q256 (ef4019) = 32 MB. A standalone region-erase above 16 MB must
        // identify first, enter 4-byte mode, issue the 4-byte sector-erase opcode
        // (0x21) with all four address bytes, and exit 4-byte mode afterwards.
        // The old path stayed in 3-byte mode and truncated the address (`as u32`),
        // erasing the WRONG sector.
        let t = primed_transport(vec![
            vec![0u8; 4 + 2], // WP guard RDSR → unprotected
            vec![0u8; 4],
            vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x19], // RDID → W25Q256
            vec![0u8; 4],
        ]);
        let mut b = Ch347Backend::new(t);
        Backend::region_erase(&mut b, 0x0100_0000, 4096).unwrap();
        assert!(
            !b.protocol().use_4byte_addr(),
            "must exit 4-byte mode afterwards"
        );
        let writes = &b.protocol().transport_mut().writes;
        let sent = |op: u8| {
            writes
                .iter()
                .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == op)
        };
        assert!(
            sent(SPI_CMD_ENTER_4BYTE),
            "EN4B must be sent before erasing above 16 MB"
        );
        assert!(
            writes.iter().any(|w| w.len() >= 9
                && w[0] == CH347_CMD_SPI_CS_XFER
                && w[4] == SPI_CMD_SECTOR_ERASE_4BYTE
                && w[5..9] == [0x01, 0x00, 0x00, 0x00]),
            "erase must use the 4-byte opcode (0x21) with the full 4-byte address"
        );
        assert!(
            sent(SPI_CMD_EXIT_4BYTE),
            "EX4B must restore 3-byte mode after the erase"
        );
    }

    #[test]
    fn region_erase_refuses_out_of_range_in_3byte_mode() {
        // W25Q128 (ef4018) = 16 MB stays in 3-byte mode; a region beyond 16 MB
        // cannot be expressed in a 3-byte frame and must be refused, not wrapped.
        let t = primed_transport(vec![
            vec![0u8; 4 + 2], // WP guard RDSR → unprotected
            vec![0u8; 4],
            vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x18], // RDID → W25Q128
            vec![0u8; 4],
        ]);
        let mut b = Ch347Backend::new(t);
        let err = Backend::region_erase(&mut b, 0x0100_0000, 4096).unwrap_err();
        assert!(
            format!("{err}").contains("3-byte"),
            "refusal must explain the 3-byte addressing limit, got: {err}"
        );
        let writes = &b.protocol().transport_mut().writes;
        assert!(
            !writes.iter().any(|w| w.len() > 4
                && w[0] == CH347_CMD_SPI_CS_XFER
                && (w[4] == SPI_CMD_SECTOR_ERASE || w[4] == SPI_CMD_SECTOR_ERASE_4BYTE)),
            "no erase opcode may reach the chip for an unaddressable range"
        );
    }

    #[test]
    fn backend_verify_enters_and_exits_4byte_for_large_chip() {
        // A standalone verify of a >16 MB chip must identify first and enter 4-byte mode
        // (else it misaddresses the read-back), then EXIT 4-byte mode on completion so
        // the chip is not left misaddressing for the next tool.
        let path = std::env::temp_dir().join("ratchet-ch347-verify-4b.bin");
        std::fs::write(&path, vec![0xa5u8; 32]).unwrap();
        let t = primed_transport(vec![vec![0u8, 0, 0, 0, 0xff, 0xef, 0x40, 0x19]]); // RDID → ef4019 (32 MB)
        let mut b = Ch347Backend::new(t);
        let _ = Backend::verify_chip(&mut b, &path);
        assert!(
            !b.protocol().use_4byte_addr(),
            "4-byte flag must be cleared after the operation"
        );
        let writes = &b.protocol().transport_mut().writes;
        let sent = |op: u8| {
            writes
                .iter()
                .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == op)
        };
        assert!(sent(SPI_CMD_ENTER_4BYTE), "EN4B must be sent during verify");
        assert!(sent(SPI_CMD_EXIT_4BYTE), "EX4B must be sent after verify");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn backend_read_status_registers_reads_sr1_sr2_sr3() {
        let t = primed_transport(vec![
            vec![0, 0, 0, 0, 0xff, 0x11],
            vec![0u8; 4], // RDSR (0x05)
            vec![0, 0, 0, 0, 0xff, 0x22],
            vec![0u8; 4], // RDSR2 (0x35)
            vec![0, 0, 0, 0, 0xff, 0x33],
            vec![0u8; 4], // RDSR3 (0x15)
        ]);
        let mut b = Ch347Backend::new(t);
        let sr = Backend::read_status_registers(&mut b).unwrap();
        assert_eq!((sr.sr1, sr.sr2, sr.sr3), (0x11, 0x22, 0x33));
        let writes = &b.protocol().transport_mut().writes;
        let sent = |op: u8| {
            writes
                .iter()
                .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == op)
        };
        assert!(sent(SPI_CMD_RDSR), "SR1 read (0x05) must be issued");
        assert!(sent(SPI_CMD_RDSR2), "SR2 read (0x35) must be issued");
        assert!(sent(SPI_CMD_RDSR3), "SR3 read (0x15) must be issued");
    }

    #[test]
    fn backend_read_sfdp_issues_5a_and_parses_density() {
        use crate::sfdp::{build_synthetic_sfdp, BuildSfdpOptions};
        let sfdp_space = build_synthetic_sfdp(&BuildSfdpOptions::default());
        // Header read: tx = 5 + 16 = 21 bytes, single CH347 packet → rx is the
        // 4-byte packet header + 21 echo/data bytes (data at [4+5..]).
        let mut rx1 = vec![0u8; 4 + 5];
        rx1.extend_from_slice(&sfdp_space[..16]);
        // BFPT read at 0x80 (80 bytes): tx = 85 → rx = 4 + 85.
        let mut rx2 = vec![0u8; 4 + 5];
        rx2.extend_from_slice(&sfdp_space[0x80..0x80 + 80]);
        let t = primed_transport(vec![rx1, vec![0u8; 4], rx2, vec![0u8; 4]]);
        let mut b = Ch347Backend::new(t);
        let info = Backend::read_sfdp(&mut b).unwrap().expect("SFDP present");
        assert_eq!(info.density_bytes, 8 * 1024 * 1024);
        assert!(info.fast_read_supported);
        let writes = &b.protocol().transport_mut().writes;
        let sfdp_frame = writes
            .iter()
            .find(|w| w.len() > 8 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == SPI_CMD_SFDP)
            .expect("an SFDP (0x5a) packet must be issued");
        // 3-byte SFDP address 0 + dummy byte follow the opcode.
        assert_eq!(&sfdp_frame[5..9], &[0, 0, 0, 0]);
    }

    #[test]
    fn backend_read_sfdp_returns_none_without_signature() {
        // All-zero response → no "SFDP" signature → honest None, not fabricated data.
        let t = primed_transport(vec![vec![0u8; 4 + 21], vec![0u8; 4]]);
        let mut b = Ch347Backend::new(t);
        assert!(Backend::read_sfdp(&mut b).unwrap().is_none());
    }

    #[test]
    fn backend_erase_chip_refuses_when_write_protected() {
        // Guard RDSR returns BP bits set → refuse before any WREN/CHIP_ERASE bytes.
        let t = primed_transport(vec![vec![0u8, 0, 0, 0, 0xff, SPI_SR_BP_MASK], vec![0u8; 4]]);
        let mut b = Ch347Backend::new(t);
        let err = Backend::erase_chip(&mut b).unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
        let writes = &b.protocol().transport_mut().writes;
        assert!(
            !writes
                .iter()
                .any(|w| w.len() > 4 && (w[4] == SPI_CMD_CHIP_ERASE || w[4] == SPI_CMD_WREN)),
            "no write-enable or erase may reach a protected chip"
        );
    }

    #[test]
    fn backend_sector_erase_refuses_when_write_protected() {
        let t = primed_transport(vec![vec![0u8, 0, 0, 0, 0xff, SPI_SR_BP_MASK], vec![0u8; 4]]);
        let mut b = Ch347Backend::new(t);
        let err = Backend::sector_erase(&mut b, 0).unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
    }

    #[test]
    fn backend_disable_write_protection_clears_sr_and_polls_wip() {
        // Empty read queue ⇒ zeros ⇒ RDSR reads WIP=0 (cycle already done).
        let mut b = Ch347Backend::new(CapturingTransport::new());
        Backend::disable_write_protection(&mut b).unwrap();
        let writes = &b.protocol().transport_mut().writes;
        let sent = |op: u8| {
            writes
                .iter()
                .any(|w| w.len() > 4 && w[0] == CH347_CMD_SPI_CS_XFER && w[4] == op)
        };
        assert!(sent(SPI_CMD_EWSR), "EWSR must precede the WRSR");
        assert!(sent(SPI_CMD_WRSR), "WRSR must clear the protection bits");
        assert!(sent(SPI_CMD_RDSR), "a WIP poll must follow the WRSR");
    }
}
