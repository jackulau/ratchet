// CH341A SPI backend  -  ports src/backends/ch341a.ts.
//
// Architecture: protocol-level functions (packet builders / parsers) are pure
// and heavily tested without USB. The backend struct wires them to a `UsbBus`
// trait, which real hardware satisfies via ratchet_usb::DeviceHandle. Tests use
// an in-memory recorder to assert protocol correctness without hardware.

use super::{reject_blank_image, Backend, BackendError, Result, WriteOpts};
use crate::chips::{format_size, lookup_by_jedec_id, needs_4byte_addressing};
use crate::types::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// USB device IDs ─────────────────────────────────────────────────────────────
pub const CH341A_VID: u16 = 0x1a86;
pub const CH341A_PID: u16 = 0x5512;
pub const CH341B_PID: u16 = 0x5523;
pub const QINHENG_VID_ALT: u16 = 0x4348;

// CH341A USB endpoints ───────────────────────────────────────────────────────
pub const USB_EP_OUT: u8 = 0x02;
pub const USB_EP_IN: u8 = 0x82;
pub const PACKET_LENGTH: usize = 0x20;
pub const MAX_XFER: usize = 32;

// CH341A USB command opcodes ─────────────────────────────────────────────────
pub const CMD_SPI_STREAM: u8 = 0xa8;
pub const CMD_UIO_STREAM: u8 = 0xab;

pub const UIO_STM_IN: u8 = 0x00;
pub const UIO_STM_DIR: u8 = 0x40;
pub const UIO_STM_OUT: u8 = 0x80;
pub const UIO_STM_END: u8 = 0x20;

pub const STM_SPI_CS: u8 = 0x01;
pub const STM_SPI_DBG: u8 = 0x04;

// SPI flash command bytes ────────────────────────────────────────────────────
pub const SPI_RDID: u8 = 0x9f;
pub const SPI_READ: u8 = 0x03;
pub const SPI_FAST_READ: u8 = 0x0b;
pub const SPI_WREN: u8 = 0x06;
pub const SPI_WRDI: u8 = 0x04;
pub const SPI_PAGE_PROGRAM: u8 = 0x02;
pub const SPI_SECTOR_ERASE: u8 = 0x20;
pub const SPI_BLOCK_ERASE_32K: u8 = 0x52;
pub const SPI_BLOCK_ERASE: u8 = 0xd8;
pub const SPI_CHIP_ERASE: u8 = 0xc7;
pub const SPI_RDSR: u8 = 0x05;
pub const SPI_RDSR2: u8 = 0x35;
pub const SPI_RDSR3: u8 = 0x15;
pub const SPI_WRSR: u8 = 0x01;
pub const SPI_EWSR: u8 = 0x50;
pub const SPI_SFDP: u8 = 0x5a;
pub const SPI_EN4B: u8 = 0xb7;
pub const SPI_EX4B: u8 = 0xe9;
pub const SPI_READ_4B: u8 = 0x13;
pub const SPI_PAGE_PROGRAM_4B: u8 = 0x12;
pub const SPI_SECTOR_ERASE_4B: u8 = 0x21;
pub const SPI_BLOCK_ERASE_4B: u8 = 0xdc;

// Status register bits
pub const SR_WIP: u8 = 0x01;
pub const SR_WEL: u8 = 0x02;
/// Block-protect bits BP0-BP2: any set means part of the array is write-protected.
pub const SR_BP_MASK: u8 = 0x1c;

// Timeouts
pub const USB_TIMEOUT: Duration = Duration::from_millis(5000);
pub const PAGE_PROGRAM_TIMEOUT: Duration = Duration::from_millis(10000);
pub const ERASE_TIMEOUT: Duration = Duration::from_millis(120000);

pub const SIZE_16MB: u64 = 16 * 1024 * 1024;

// ─── Pure protocol functions (no I/O) ───────────────────────────────────────

/// Build the SPI-mode-enable UIO packet sent right after claiming the interface.
pub fn enable_spi_mode_packet() -> [u8; 4] {
    [
        CMD_UIO_STREAM,
        UIO_STM_OUT | STM_SPI_CS,
        UIO_STM_DIR | (STM_SPI_CS | STM_SPI_DBG),
        UIO_STM_END,
    ]
}

/// CS-low (assert) UIO packet.
pub fn cs_assert_packet() -> [u8; 3] {
    [CMD_UIO_STREAM, UIO_STM_OUT, UIO_STM_END]
}

/// CS-high (deassert) UIO packet.
pub fn cs_deassert_packet() -> [u8; 3] {
    [CMD_UIO_STREAM, UIO_STM_OUT | STM_SPI_CS, UIO_STM_END]
}

/// Encode an SPI flash address. 3-byte mode for chips ≤16MB; 4-byte for larger.
pub fn address_bytes(addr: u64, use_4byte: bool) -> Vec<u8> {
    if use_4byte {
        vec![
            ((addr >> 24) & 0xff) as u8,
            ((addr >> 16) & 0xff) as u8,
            ((addr >> 8) & 0xff) as u8,
            (addr & 0xff) as u8,
        ]
    } else {
        vec![
            ((addr >> 16) & 0xff) as u8,
            ((addr >> 8) & 0xff) as u8,
            (addr & 0xff) as u8,
        ]
    }
}

/// Chunk an SPI tx stream into CH341A USB packets.
/// Each packet starts with CMD_SPI_STREAM and carries up to 31 SPI data bytes.
pub fn spi_stream_chunks(tx: &[u8]) -> Vec<Vec<u8>> {
    let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
    let mut out = Vec::new();
    let mut offset = 0;
    while offset < tx.len() {
        let chunk_len = (tx.len() - offset).min(max_payload);
        let mut packet = Vec::with_capacity(chunk_len + 1);
        packet.push(CMD_SPI_STREAM);
        packet.extend_from_slice(&tx[offset..offset + chunk_len]);
        out.push(packet);
        offset += chunk_len;
    }
    out
}

/// Decode a 4-byte RDID response (cmd echo + 3 ID bytes).
pub fn decode_jedec_response(rx: &[u8]) -> Option<JedecId> {
    if rx.len() < 4 {
        return None;
    }
    Some(JedecId {
        manufacturer: rx[1],
        memory_type: rx[2],
        capacity: rx[3],
    })
}

// ─── UsbBus abstraction (for hardware injection and testing) ────────────────

/// Minimal USB transport surface the CH341A backend needs.
/// Real hardware wraps `ratchet_usb::DeviceHandle`; tests use a recorder.
pub trait UsbBus: Send {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()>;
    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>>;
}

/// In-memory bus for tests. Captures every write and serves pre-queued reads.
pub struct MockBus {
    pub writes: Vec<Vec<u8>>,
    pub read_queue: std::collections::VecDeque<Vec<u8>>,
}

impl MockBus {
    pub fn new() -> Self {
        Self {
            writes: Vec::new(),
            read_queue: std::collections::VecDeque::new(),
        }
    }
    pub fn queue_read(&mut self, data: Vec<u8>) {
        self.read_queue.push_back(data);
    }
}

impl Default for MockBus {
    fn default() -> Self {
        Self::new()
    }
}

impl UsbBus for MockBus {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
        self.writes.push(data.to_vec());
        Ok(())
    }
    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
        let data = self
            .read_queue
            .pop_front()
            .ok_or_else(|| BackendError::Other("MockBus: read queue empty".into()))?;
        if data.len() < len {
            let mut padded = data;
            padded.resize(len, 0);
            Ok(padded)
        } else {
            Ok(data[..len].to_vec())
        }
    }
}

// ─── CH341A backend (generic over UsbBus) ───────────────────────────────────

pub struct CH341ABackend<B: UsbBus> {
    bus: Option<B>,
    use_4byte_addr: bool,
}

impl<B: UsbBus> CH341ABackend<B> {
    pub fn with_bus(bus: B) -> Self {
        Self {
            bus: Some(bus),
            use_4byte_addr: false,
        }
    }

    pub fn enable_spi_mode(&mut self) -> Result<()> {
        let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
        bus.bulk_write(&enable_spi_mode_packet())
    }

    /// Send an SPI command (CS↓ … data … CS↑), returning the rx bytes.
    pub fn spi_command(&mut self, cmd: &[u8]) -> Result<Vec<u8>> {
        let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
        bus.bulk_write(&cs_assert_packet())?;
        let res = Self::spi_command_chunks(bus, cmd);
        // CS must be released on success AND failure: a chip left selected after
        // a mid-stream USB error treats the next command's clocks as continuation
        // data. The original error takes precedence over a deassert failure.
        let deassert = bus.bulk_write(&cs_deassert_packet());
        let rx = res?;
        deassert?;
        Ok(rx)
    }

    fn spi_command_chunks(bus: &mut B, cmd: &[u8]) -> Result<Vec<u8>> {
        let mut rx = Vec::with_capacity(cmd.len());
        // Chunk inline with a single reused packet buffer: only the payload bytes
        // change per chunk, so we avoid building a fresh Vec<Vec<u8>> of sub-packets.
        let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
        let mut packet: Vec<u8> = Vec::with_capacity(max_payload + 1);
        let mut offset = 0;
        while offset < cmd.len() {
            let chunk_len = (cmd.len() - offset).min(max_payload);
            packet.clear();
            packet.push(CMD_SPI_STREAM);
            packet.extend_from_slice(&cmd[offset..offset + chunk_len]);
            bus.bulk_write(&packet)?;
            let r = bus.bulk_read(chunk_len)?;
            rx.extend_from_slice(&r);
            offset += chunk_len;
        }
        Ok(rx)
    }

    pub fn rdid(&mut self) -> Result<JedecId> {
        let rx = self.spi_command(&[SPI_RDID, 0, 0, 0])?;
        decode_jedec_response(&rx).ok_or(BackendError::ChipNotDetected)
    }

    /// Read SR1, failing CLOSED on a short/garbled RDSR response. A flaky bus
    /// must never read as "ready" (WIP clear) or "unprotected" (BP clear): those
    /// optimistic defaults green-light destructive ops exactly when the transport
    /// is least trustworthy.
    fn read_sr1_strict(&mut self) -> Result<u8> {
        self.spi_command(&[SPI_RDSR, 0])?
            .get(1)
            .copied()
            .ok_or_else(|| {
                BackendError::Other(
                    "short RDSR response — status register unreadable; failing closed".into(),
                )
            })
    }

    /// Poll RDSR until the write-in-progress (WIP) bit clears, or `timeout` elapses.
    /// Every erase and page-program MUST be followed by this: SPI flash NAKs further
    /// commands while an internal write/erase is running, and chip-erase can take well
    /// over a minute on a 16MB part. Skipping it silently corrupts writes.
    pub fn wait_until_ready(&mut self, timeout: Duration) -> Result<()> {
        let start = Instant::now();
        let mut backoff = Duration::from_micros(50);
        loop {
            let sr1 = self.read_sr1_strict()?;
            if sr1 & SR_WIP == 0 {
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

    /// Read `len` bytes starting at `start_addr` via the READ (0x03) opcode.
    /// Shared by `read_chip` (whole chip) and `verify_chip` (file-length read-back) so the two
    /// always use identical addressing.
    ///
    /// The whole range streams inside ONE CS assertion: the opcode + address go out
    /// once and the chip auto-increments while data is clocked out in 31-byte USB
    /// packets. The old scheme re-issued READ + address + CS toggle per KiB — a
    /// 5-byte header and two extra USB frames every 1024 bytes of an 8-16 MB dump.
    pub fn read_range(&mut self, start_addr: u64, len: usize) -> Result<Vec<u8>> {
        if len == 0 {
            return Ok(Vec::new());
        }
        let use_4byte = self.use_4byte_addr;
        let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
        bus.bulk_write(&cs_assert_packet())?;
        let res = Self::read_range_chunks(bus, start_addr, len, use_4byte);
        // CS must be released on success AND failure (see spi_command); the
        // original error takes precedence over a deassert failure.
        let deassert = bus.bulk_write(&cs_deassert_packet());
        let buf = res?;
        deassert?;
        Ok(buf)
    }

    fn read_range_chunks(
        bus: &mut B,
        start_addr: u64,
        len: usize,
        use_4byte: bool,
    ) -> Result<Vec<u8>> {
        let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
        let mut packet: Vec<u8> = Vec::with_capacity(max_payload + 1);
        // Opcode + address, echoed back full-duplex and discarded.
        packet.push(CMD_SPI_STREAM);
        packet.push(SPI_READ);
        packet.extend(address_bytes(start_addr, use_4byte));
        let header_len = packet.len() - 1;
        bus.bulk_write(&packet)?;
        let _echo = bus.bulk_read(header_len)?;
        // Clock out the data: every dummy byte shifted in clocks one byte out.
        let zeros = [0u8; MAX_XFER - 1];
        let mut buf = Vec::with_capacity(len);
        while buf.len() < len {
            let n = (len - buf.len()).min(max_payload);
            packet.clear();
            packet.push(CMD_SPI_STREAM);
            packet.extend_from_slice(&zeros[..n]);
            bus.bulk_write(&packet)?;
            let rx = bus.bulk_read(n)?;
            if rx.len() < n {
                // A short chunk would shift every subsequent byte left — an
                // offset-misaligned dump that verify/backup would trust. Abort
                // instead of returning corrupt data (caller releases CS).
                return Err(BackendError::Usb(ratchet_usb::UsbError::ShortTransfer {
                    expected: n,
                    actual: rx.len(),
                }));
            }
            buf.extend_from_slice(&rx[..n]);
        }
        Ok(buf)
    }

    /// Program a single page (≤ page_size bytes, never crossing a page boundary): WREN, then
    /// PAGE_PROGRAM with the address + data, then wait for WIP to clear before returning.
    pub fn page_program(&mut self, addr: u64, data: &[u8]) -> Result<()> {
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = Vec::with_capacity(1 + 4 + data.len());
        cmd.push(if self.use_4byte_addr {
            SPI_PAGE_PROGRAM_4B
        } else {
            SPI_PAGE_PROGRAM
        });
        cmd.extend(address_bytes(addr, self.use_4byte_addr));
        cmd.extend_from_slice(data);
        self.spi_command(&cmd)?;
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }

    /// Put the chip into 4-byte address mode (EN4B, 0xb7) and remember it. Required for chips
    /// larger than 16 MB: without it a 4-byte address sent after a plain READ (0x03) is
    /// misinterpreted, so reads/writes land at the wrong offset. Sending EN4B is the most
    /// compatible activation — it works even on parts that lack the dedicated 4-byte opcodes.
    pub fn enter_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_EN4B])?;
        self.use_4byte_addr = true;
        Ok(())
    }

    /// Leave 4-byte address mode (EX4B, 0xe9) and clear the flag. Always paired with
    /// enter_4byte_mode at operation end: a chip left in 4-byte mode misaddresses for
    /// the next tool (or the motherboard itself) that assumes power-on 3-byte mode.
    pub fn exit_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_EX4B])?;
        self.use_4byte_addr = false;
        Ok(())
    }

    /// Best-effort EX4B after a top-level operation whose identify step may have
    /// entered 4-byte mode. The operation's own result takes precedence over a
    /// failure to restore addressing mode.
    fn exit_4byte_if_entered(&mut self) {
        if self.use_4byte_addr {
            let _ = self.exit_4byte_mode();
        }
    }

    /// SFDP read (0x5A): 3-byte SFDP-space address + one dummy byte, then `len`
    /// data bytes clocked out.
    fn sfdp_read_at(&mut self, addr: u32, len: usize) -> Result<Vec<u8>> {
        let mut cmd = vec![
            SPI_SFDP,
            (addr >> 16) as u8,
            (addr >> 8) as u8,
            addr as u8,
            0, // dummy cycle per JESD216
        ];
        let data_start = cmd.len();
        cmd.resize(data_start + len, 0);
        let rx = self.spi_command(&cmd)?;
        if rx.len() < data_start + len {
            return Err(BackendError::Other("short SFDP response".into()));
        }
        Ok(rx[data_start..data_start + len].to_vec())
    }

    /// Refuse destructive ops on write-protected silicon: protected chips silently
    /// ignore erase/program commands, which would otherwise read as fake success.
    /// Reads SR1 strictly — a short response must not read as "unprotected".
    fn ensure_not_write_protected(&mut self) -> Result<()> {
        if self.read_sr1_strict()? & SR_BP_MASK != 0 {
            return Err(BackendError::WriteProtected);
        }
        Ok(())
    }

    /// Standalone erase verbs arrive without a prior identify, so a >16 MB chip
    /// would still be in power-on 3-byte mode and the erase address would silently
    /// wrap at 16 MB — destroying the wrong sector. Identify first (which enters
    /// 4-byte mode for big chips), then hard-refuse any range the active 3-byte
    /// framing cannot express. `end` is exclusive.
    fn prepare_erase_addressing(&mut self, end: u64) -> Result<()> {
        self.identify_chip()?;
        if !self.use_4byte_addr && end > SIZE_16MB {
            return Err(BackendError::Other(format!(
                "erase range ends at {end:#x} but the chip is in 3-byte address mode \
                 (16 MB limit); a 3-byte frame would silently wrap and erase the wrong sector"
            )));
        }
        Ok(())
    }

    /// Erase one sector without the write-protect pre-check. Callers that loop over
    /// many sectors (write_chip, region_erase) check protection once up front.
    fn sector_erase_inner(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = vec![if self.use_4byte_addr {
            SPI_SECTOR_ERASE_4B
        } else {
            SPI_SECTOR_ERASE
        }];
        cmd.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&cmd)?;
        self.wait_until_ready(ERASE_TIMEOUT)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    /// Whole-chip read without the trailing EX4B: write_chip's backup step runs this
    /// mid-operation while 4-byte mode must stay active.
    fn read_chip_to_file(&mut self, output_path: &Path) -> Result<ReadResult> {
        let start = Instant::now();
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let size = chip.size_bytes as usize;
        if size == 0 {
            return Err(BackendError::ChipNotDetected);
        }
        let buf = self.read_range(0, size)?;
        std::fs::write(output_path, &buf)?;
        let mut h = Sha256::new();
        h.update(&buf);
        let checksum: String = hex_encode(&h.finalize());
        let all_ff = buf.iter().all(|&b| b == 0xff);
        let all_zero = buf.iter().all(|&b| b == 0x00);
        Ok(ReadResult {
            success: true,
            file_path: output_path.display().to_string(),
            size_bytes: buf.len() as u64,
            duration_ms: start.elapsed().as_millis() as u64,
            checksum,
            all_ff: Some(all_ff),
            all_zero: Some(all_zero),
            error: None,
        })
    }

    /// Read-back comparison without the trailing EX4B: write_chip's verify step runs
    /// this mid-operation while 4-byte mode must stay active.
    fn verify_against_file(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let start = Instant::now();
        let file_data = std::fs::read(file_path)?;
        // Identify first so 4-byte mode (EN4B) is active before reading back a >16 MB chip;
        // a standalone `verify` would otherwise read with 3-byte addressing.
        self.identify_chip()?;
        let chip_data = self.read_range(0, file_data.len())?;
        let mut hc = Sha256::new();
        hc.update(&chip_data);
        let chip_checksum = hex_encode(&hc.finalize());
        let mut hf = Sha256::new();
        hf.update(&file_data);
        let file_checksum = hex_encode(&hf.finalize());
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
        let firmware = std::fs::read(input_path)?;
        reject_blank_image(&firmware)?;
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let chip_size = chip.size_bytes as usize;
        if chip_size == 0 {
            return Err(BackendError::Other(format!(
                "unknown chip capacity for JEDEC id {} — refusing to write blind; \
                 the oversize guard cannot protect an unidentified chip",
                chip.jedec_id
            )));
        }
        if firmware.len() > chip_size {
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

        // 1. Back up current chip contents BEFORE touching anything (unless told to skip).
        //    A user reflashing a motherboard should never lose their only copy of the old BIOS.
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

        // 2. Erase every sector the image touches — SPI program can only flip 1→0, so the
        //    target must be 0xFF first. (Each sector_erase issues WREN + erase + WIP-wait.)
        //    The stride MUST match the issued opcode: sector_erase_inner sends the 4 KB
        //    sector-erase (0x20/0x21), so stepping by the DB's sectorSize (64 KB on 155
        //    of 806 chips) would leave unerased gaps that AND stale data into the image.
        let mut addr: u64 = 0;
        while (addr as usize) < firmware.len() {
            self.sector_erase_inner(addr)?;
            addr += 4096;
        }

        // 3. Program page-by-page, never letting a PAGE_PROGRAM cross a page boundary (the chip
        //    wraps the address within the page if you do, silently corrupting the write).
        let mut offset = 0usize;
        while offset < firmware.len() {
            let page_end = (offset / page_size + 1) * page_size;
            let chunk_end = page_end.min(firmware.len());
            self.page_program(offset as u64, &firmware[offset..chunk_end])?;
            offset = chunk_end;
        }

        // 4. Read back and compare unless the caller opted out.
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

impl<B: UsbBus> Backend for CH341ABackend<B> {
    fn detect_programmer(&mut self) -> Result<ProgrammerInfo> {
        Ok(ProgrammerInfo {
            kind: "ch341a".into(),
            connected: self.bus.is_some(),
            vendor_id: format!("{:04x}", CH341A_VID),
            product_id: format!("{:04x}", CH341A_PID),
            description: "CH341A USB SPI Programmer".into(),
            backend: "native".into(),
        })
    }
    fn open(&mut self) -> Result<()> {
        self.enable_spi_mode()
    }
    fn close(&mut self) -> Result<()> {
        Ok(())
    }
    fn read_jedec_id(&mut self) -> Result<JedecId> {
        self.rdid()
    }
    fn identify_chip(&mut self) -> Result<Option<ChipInfo>> {
        let id = self.rdid()?;
        let hex = id.to_hex();
        if hex == "000000" || hex == "ffffff" {
            return Ok(None);
        }
        let info = if let Some(db) = lookup_by_jedec_id(&hex) {
            ChipInfo {
                name: db.name.clone(),
                vendor_name: db.vendor.clone(),
                jedec_id: hex.clone(),
                size_bytes: db.size_bytes,
                size_human: format_size(db.size_bytes),
                chip_type: "spi".into(),
                page_size: Some(db.page_size),
                sector_size: Some(db.sector_size),
                block_size: Some(db.block_size),
                write_protected: None,
                voltage: Some(db.voltage),
            }
        } else {
            ChipInfo {
                name: format!("Unknown {}", hex.to_ascii_uppercase()),
                vendor_name: "Unknown".into(),
                jedec_id: hex.clone(),
                size_bytes: 0,
                size_human: "?".into(),
                chip_type: "spi".into(),
                page_size: Some(256),
                sector_size: Some(4096),
                block_size: Some(65536),
                write_protected: None,
                voltage: None,
            }
        };
        // Chips larger than 16 MB need 4-byte addressing; enter it now (sends EN4B) so every
        // subsequent read/write/erase addresses the full chip instead of wrapping at 16 MB.
        let needs_4b = if info.size_bytes > 0 {
            info.size_bytes > SIZE_16MB
        } else {
            needs_4byte_addressing(&hex)
        };
        if needs_4b {
            self.enter_4byte_mode()?;
        }
        Ok(Some(info))
    }
    fn read_status_registers(&mut self) -> Result<StatusRegisters> {
        let sr1 = self
            .spi_command(&[SPI_RDSR, 0])?
            .get(1)
            .copied()
            .unwrap_or(0);
        let sr2 = self
            .spi_command(&[SPI_RDSR2, 0])?
            .get(1)
            .copied()
            .unwrap_or(0);
        let sr3 = self
            .spi_command(&[SPI_RDSR3, 0])?
            .get(1)
            .copied()
            .unwrap_or(0);
        Ok(StatusRegisters { sr1, sr2, sr3 })
    }
    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>> {
        // Full JESD216 discovery: header, then the real Basic Flash Parameter
        // Table — density/page/erase geometry come from the chip, not defaults.
        crate::sfdp::discover_sfdp(|addr, len| self.sfdp_read_at(addr, len))
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
        let start = Instant::now();
        self.spi_command(&[SPI_WREN])?;
        self.spi_command(&[SPI_CHIP_ERASE])?;
        self.wait_until_ready(ERASE_TIMEOUT)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }
    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| self.sector_erase_inner(address));
        self.exit_4byte_if_entered();
        res
    }
    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| {
                let start = Instant::now();
                self.spi_command(&[SPI_WREN])?;
                let mut cmd = vec![if self.use_4byte_addr {
                    SPI_BLOCK_ERASE_4B
                } else {
                    SPI_BLOCK_ERASE
                }];
                cmd.extend(address_bytes(address, self.use_4byte_addr));
                self.spi_command(&cmd)?;
                self.wait_until_ready(ERASE_TIMEOUT)?;
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
        // Sector-by-sector erase across the range; each sector_erase waits for WIP to clear.
        // Protection is checked once up front, not per sector.
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(start_addr.saturating_add(length))
            .and_then(|()| {
                let start = Instant::now();
                let mut addr = start_addr & !0xfff;
                let end = start_addr + length;
                while addr < end {
                    self.sector_erase_inner(addr)?;
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
        let sr = self.read_status_registers()?;
        Ok((sr.sr1 & SR_BP_MASK) != 0)
    }
    fn disable_write_protection(&mut self) -> Result<()> {
        self.spi_command(&[SPI_EWSR])?;
        self.spi_command(&[SPI_WRSR, 0])?;
        // WRSR starts an internal status-register write cycle (WIP set); issuing the
        // next command before it completes races the register update.
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }
    fn connection_test(&mut self) -> Result<ConnectionTestResult> {
        let mut ids = Vec::with_capacity(10);
        let mut timings = Vec::with_capacity(10);
        for _ in 0..10 {
            let t0 = Instant::now();
            let id = self.rdid()?.to_hex();
            timings.push(t0.elapsed().as_millis() as u32);
            ids.push(id);
        }
        let first = ids[0].clone();
        let matches = ids.iter().filter(|id| *id == &first).count() as u32;
        let stable = matches == 10;
        let sr = self.read_status_registers().ok();
        Ok(ConnectionTestResult {
            stable,
            reads: 10,
            matches,
            jedec_id: first,
            timings,
            status_register: sr.map(|s| s.sr1),
            error: None,
        })
    }
    fn reset_chip(&mut self) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enable_spi_mode_packet_layout() {
        let pkt = enable_spi_mode_packet();
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_OUT | STM_SPI_CS);
        assert_eq!(pkt[2], UIO_STM_DIR | (STM_SPI_CS | STM_SPI_DBG));
        assert_eq!(pkt[3], UIO_STM_END);
    }

    #[test]
    fn cs_assert_and_deassert_differ_by_cs_bit() {
        let a = cs_assert_packet();
        let d = cs_deassert_packet();
        assert_eq!(a[0], CMD_UIO_STREAM);
        assert_eq!(d[0], CMD_UIO_STREAM);
        // Assert pulls CS low (no CS bit set in the OUT mask); deassert sets CS high.
        assert_eq!(a[1] & STM_SPI_CS, 0);
        assert_eq!(d[1] & STM_SPI_CS, STM_SPI_CS);
    }

    #[test]
    fn address_bytes_3byte_mode() {
        assert_eq!(address_bytes(0x123456, false), vec![0x12, 0x34, 0x56]);
        assert_eq!(address_bytes(0x000000, false), vec![0x00, 0x00, 0x00]);
        assert_eq!(address_bytes(0xffffff, false), vec![0xff, 0xff, 0xff]);
    }

    #[test]
    fn address_bytes_4byte_mode() {
        assert_eq!(
            address_bytes(0x01234567, true),
            vec![0x01, 0x23, 0x45, 0x67]
        );
        assert_eq!(
            address_bytes(0xdeadbeef, true),
            vec![0xde, 0xad, 0xbe, 0xef]
        );
    }

    #[test]
    fn spi_stream_single_packet_under_31_bytes() {
        let tx = vec![SPI_RDID, 0, 0, 0];
        let chunks = spi_stream_chunks(&tx);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0][0], CMD_SPI_STREAM);
        assert_eq!(&chunks[0][1..], &tx[..]);
    }

    #[test]
    fn spi_stream_chunks_31_byte_boundary() {
        let tx = vec![0xaa; 31];
        let chunks = spi_stream_chunks(&tx);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), 32); // 1 cmd byte + 31 data
    }

    #[test]
    fn spi_stream_chunks_split_at_31_bytes() {
        let tx = vec![0xbb; 70];
        let chunks = spi_stream_chunks(&tx);
        // 70 / 31 = 2 full + 1 partial = 3 chunks
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 32);
        assert_eq!(chunks[1].len(), 32);
        assert_eq!(chunks[2].len(), 9); // cmd + 8 leftover
        for c in &chunks {
            assert_eq!(c[0], CMD_SPI_STREAM);
        }
    }

    #[test]
    fn decode_jedec_winbond_w25q64() {
        // Cmd echo at index 0, then mfr/type/cap.
        let rx = vec![0x00, 0xef, 0x40, 0x17];
        let id = decode_jedec_response(&rx).unwrap();
        assert_eq!(id.to_hex(), "ef4017");
    }

    #[test]
    fn decode_jedec_too_short_returns_none() {
        assert!(decode_jedec_response(&[0; 3]).is_none());
    }

    #[test]
    fn backend_open_writes_enable_spi_packet() {
        let mut backend = CH341ABackend::with_bus(MockBus::new());
        backend.open().unwrap();
        let bus = backend.bus.as_ref().unwrap();
        assert_eq!(bus.writes.len(), 1);
        assert_eq!(bus.writes[0], enable_spi_mode_packet().to_vec());
    }

    #[test]
    fn backend_rdid_wraps_in_cs_pulses_and_returns_decoded_id() {
        let mut bus = MockBus::new();
        // Response to bulk_read after the 4-byte SPI_RDID: cmd echo + 3 ID bytes.
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x17]);
        let mut backend = CH341ABackend::with_bus(bus);
        let id = backend.rdid().unwrap();
        assert_eq!(id.to_hex(), "ef4017");

        // Writes: cs_assert, spi_stream_packet(RDID+3x0), cs_deassert.
        let bus = backend.bus.as_ref().unwrap();
        assert_eq!(bus.writes.len(), 3);
        assert_eq!(bus.writes[0], cs_assert_packet().to_vec());
        assert_eq!(bus.writes[1][0], CMD_SPI_STREAM);
        assert_eq!(bus.writes[1][1], SPI_RDID);
        assert_eq!(bus.writes[2], cs_deassert_packet().to_vec());
    }

    #[test]
    fn backend_erase_chip_sends_wren_then_chip_erase_then_polls_wip() {
        let mut bus = MockBus::new();
        // Write-protect guard RDSR, WREN read, CHIP_ERASE read, then one RDSR poll
        // whose byte[1]=0 → WIP clear.
        for _ in 0..4 {
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.erase_chip().unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // Frames: [guard RDSR][WREN][CHIP_ERASE][poll RDSR], 3 writes each (cs, pkt, cs).
        assert_eq!(bus.writes[4][1], SPI_WREN);
        assert_eq!(bus.writes[7][1], SPI_CHIP_ERASE);
        // A WIP poll (RDSR 0x05) must follow the erase — otherwise we'd race the busy chip.
        assert!(bus
            .writes
            .iter()
            .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR));
    }

    #[test]
    fn erase_chip_refuses_when_write_protected() {
        let mut bus = MockBus::new();
        // Guard RDSR returns BP bits set → must refuse before any WREN/CHIP_ERASE.
        bus.queue_read(vec![0x00, SR_BP_MASK]);
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.erase_chip().unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            !writes.iter().any(|w| w.len() >= 2
                && w[0] == CMD_SPI_STREAM
                && (w[1] == SPI_WREN || w[1] == SPI_CHIP_ERASE)),
            "no write-enable or erase may reach a protected chip"
        );
    }

    #[test]
    fn sector_erase_refuses_when_write_protected() {
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, SR_BP_MASK]);
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.sector_erase(0).unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
    }

    #[test]
    fn write_chip_refuses_unknown_capacity_chip() {
        // JEDEC id aabb11 is not in the chip DB → size_bytes 0 → must refuse, not
        // skip the oversize guard and write blind. (Capacity byte 0x11 < 0x19 keeps
        // the 4-byte-addressing heuristic quiet.)
        let path = std::env::temp_dir().join("ratchet-test-unknown-capacity.bin");
        std::fs::write(&path, vec![0xa5u8; 64]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0xaa, 0xbb, 0x11]);
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("unknown chip capacity"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn disable_write_protection_polls_wip_after_wrsr() {
        let mut bus = MockBus::new();
        bus.queue_read(vec![0u8; 8]); // EWSR
        bus.queue_read(vec![0u8; 8]); // WRSR
        bus.queue_read(vec![0x00, SR_WIP]); // status-register write still running
        bus.queue_read(vec![0x00, 0x00]); // done
        let mut backend = CH341ABackend::with_bus(bus);
        backend.disable_write_protection().unwrap();
        let writes = &backend.bus.as_ref().unwrap().writes;
        let rdsr_polls = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR)
            .count();
        assert!(
            rdsr_polls >= 2,
            "WRSR must be followed by WIP polling (saw {rdsr_polls} RDSR frames)"
        );
    }

    #[test]
    fn write_chip_erases_full_range_when_sector_size_not_4k() {
        // EN25P05 (1c2010) reports sectorSize=65536 in the DB, but the erase loop
        // issues the 4 KB sector-erase opcode (0x20). Striding by 64 KB would erase
        // only the first 4 KB of each 64 KB step, AND-ing stale data into the rest
        // of the image. Every 4 KB of the programmed range must receive an erase.
        let path = std::env::temp_dir().join("ratchet-test-erase-stride.bin");
        std::fs::write(&path, vec![0xa5u8; 8192]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0x1c, 0x20, 0x10]); // RDID → EN25P05 (64 KB, sectorSize 64 KB)
        for _ in 0..600 {
            bus.queue_read(vec![0u8; 40]); // WP guard, WREN/erase/poll, program chunks
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        let writes = &backend.bus.as_ref().unwrap().writes;
        let erase_addrs: Vec<u32> = writes
            .iter()
            .filter(|w| w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == SPI_SECTOR_ERASE)
            .map(|w| u32::from_be_bytes([0, w[2], w[3], w[4]]))
            .collect();
        assert_eq!(
            erase_addrs,
            vec![0x0000, 0x1000],
            "every 4 KB of the 8 KB image must be erased (got {erase_addrs:x?})"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn region_erase_uses_4byte_addressing_above_16mb() {
        // W25Q256 (ef4019) = 32 MB. A standalone region-erase above 16 MB must
        // identify first, enter 4-byte mode, issue the 4-byte sector-erase opcode
        // (0x21) with all four address bytes, and exit 4-byte mode afterwards.
        // Without that, the 3-byte frame wraps and the WRONG sector is destroyed.
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0x00]); // WP guard RDSR → unprotected
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x19]); // RDID → W25Q256
        bus.queue_read(vec![0u8; 8]); // EN4B
        bus.queue_read(vec![0u8; 8]); // WREN
        bus.queue_read(vec![0u8; 8]); // sector erase cmd
        bus.queue_read(vec![0x00, 0x00]); // WIP poll → ready
        bus.queue_read(vec![0u8; 8]); // EX4B
        let mut backend = CH341ABackend::with_bus(bus);
        backend.region_erase(0x0100_0000, 4096).unwrap();
        assert!(!backend.use_4byte_addr, "must exit 4-byte mode afterwards");
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B must be sent before erasing above 16 MB"
        );
        assert!(
            writes.iter().any(|w| w.len() >= 6
                && w[0] == CMD_SPI_STREAM
                && w[1] == SPI_SECTOR_ERASE_4B
                && w[2..6] == [0x01, 0x00, 0x00, 0x00]),
            "erase must use the 4-byte opcode (0x21) with the full 4-byte address"
        );
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EX4B),
            "EX4B must restore 3-byte mode after the erase"
        );
    }

    #[test]
    fn region_erase_refuses_out_of_range_in_3byte_mode() {
        // W25Q128 (ef4018) = 16 MB stays in 3-byte mode; a region beyond 16 MB
        // cannot be expressed in a 3-byte frame and must be refused, not wrapped.
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0x00]); // WP guard RDSR → unprotected
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x18]); // RDID → W25Q128
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.region_erase(0x0100_0000, 4096).unwrap_err();
        assert!(
            format!("{err}").contains("3-byte"),
            "refusal must explain the 3-byte addressing limit, got: {err}"
        );
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            !writes.iter().any(|w| w.len() >= 2
                && w[0] == CMD_SPI_STREAM
                && (w[1] == SPI_SECTOR_ERASE || w[1] == SPI_SECTOR_ERASE_4B)),
            "no erase opcode may reach the chip for an unaddressable range"
        );
    }

    #[test]
    fn verify_chip_exits_4byte_mode_after_completion() {
        // >16 MB chip (ef4019): verify enters 4-byte mode for the read-back, then must
        // exit (EX4B 0xe9) so the chip is not left misaddressing for the next tool.
        let path = std::env::temp_dir().join("ratchet-test-ex4b-verify.bin");
        std::fs::write(&path, vec![0xa5u8; 32]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x19]); // RDID → W25Q256
        for _ in 0..8 {
            bus.queue_read(vec![0u8; 40]); // EN4B + read chunks + EX4B (don't-care)
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.verify_chip(&path).unwrap();
        assert!(
            !backend.use_4byte_addr,
            "4-byte flag must be cleared after the operation"
        );
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EX4B),
            "EX4B (0xe9) must be sent after an operation that entered 4-byte mode"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn backend_sector_erase_uses_3byte_addr_by_default() {
        let mut bus = MockBus::new();
        // Guard RDSR, identify RDID (zeros → no chip), WREN, SECTOR_ERASE, RDSR poll.
        for _ in 0..5 {
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.sector_erase(0x123456).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // writes[10] = stream packet for SECTOR_ERASE (after guard + RDID + WREN frames)
        let pkt = &bus.writes[10];
        assert_eq!(pkt[0], CMD_SPI_STREAM);
        assert_eq!(pkt[1], SPI_SECTOR_ERASE);
        assert_eq!(&pkt[2..5], &[0x12, 0x34, 0x56]);
    }

    #[test]
    fn backend_sector_erase_uses_4byte_when_enabled() {
        let mut bus = MockBus::new();
        // Guard RDSR, identify RDID, WREN, SECTOR_ERASE, RDSR poll, trailing EX4B.
        for _ in 0..6 {
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.use_4byte_addr = true;
        backend.sector_erase(0x01020304).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        let pkt = &bus.writes[10];
        assert_eq!(pkt[1], SPI_SECTOR_ERASE_4B);
        assert_eq!(&pkt[2..6], &[0x01, 0x02, 0x03, 0x04]);
    }

    /// A bus that always returns fewer bytes than requested — exercises the
    /// fail-closed paths for garbled/short transport reads.
    struct ShortReadBus;
    impl UsbBus for ShortReadBus {
        fn bulk_write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }
        fn bulk_read(&mut self, _len: usize) -> Result<Vec<u8>> {
            Ok(vec![0u8; 1])
        }
    }

    #[test]
    fn short_status_read_fails_closed() {
        // A short RDSR response must NEVER be interpreted as "ready" — the old
        // .get(1).unwrap_or(0) read a starved bus as WIP-clear, green-lighting
        // the next destructive command exactly when the bus was flakiest.
        let mut backend = CH341ABackend::with_bus(ShortReadBus);
        let err = backend
            .wait_until_ready(Duration::from_millis(10))
            .unwrap_err();
        assert!(
            format!("{err}").contains("short RDSR"),
            "ready-poll must fail closed on a short status read, got: {err}"
        );

        // Same for the write-protect guard: a short response must not read as
        // "unprotected" (BP bits clear).
        let mut backend = CH341ABackend::with_bus(ShortReadBus);
        let err = backend.erase_chip().unwrap_err();
        assert!(
            format!("{err}").contains("short RDSR"),
            "WP guard must fail closed on a short status read, got: {err}"
        );
    }

    #[test]
    fn short_bulk_read_is_hard_error() {
        // A bus that answers the opcode/address echo fully but starves the data
        // chunks. The old code appended the short slice and kept going — every
        // subsequent byte shifted left, silently corrupting backups and verifies.
        struct HeaderThenShortBus {
            reads: usize,
        }
        impl UsbBus for HeaderThenShortBus {
            fn bulk_write(&mut self, _d: &[u8]) -> Result<()> {
                Ok(())
            }
            fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
                self.reads += 1;
                if self.reads == 1 {
                    Ok(vec![0u8; len]) // header echo
                } else {
                    Ok(vec![0u8; len.saturating_sub(1)]) // short data chunk
                }
            }
        }
        let mut backend = CH341ABackend::with_bus(HeaderThenShortBus { reads: 0 });
        let err = backend.read_range(0, 64).unwrap_err();
        assert!(
            matches!(
                err,
                BackendError::Usb(ratchet_usb::UsbError::ShortTransfer { .. })
            ),
            "short data chunk must abort the read, got: {err}"
        );
    }

    #[test]
    fn cs_deasserted_after_midstream_error() {
        // A bus whose reads fail mid-command (USB timeout). The chip must not be
        // left selected: the CS-deassert framing must still go out, or the next
        // command's clocks are interpreted as continuation data by the flash.
        struct FailReadBus {
            writes: Vec<Vec<u8>>,
        }
        impl UsbBus for FailReadBus {
            fn bulk_write(&mut self, d: &[u8]) -> Result<()> {
                self.writes.push(d.to_vec());
                Ok(())
            }
            fn bulk_read(&mut self, _len: usize) -> Result<Vec<u8>> {
                Err(BackendError::Other("usb timeout".into()))
            }
        }

        // spi_command path
        let mut backend = CH341ABackend::with_bus(FailReadBus { writes: Vec::new() });
        backend.spi_command(&[SPI_RDSR, 0]).unwrap_err();
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert_eq!(
            writes.last().unwrap(),
            &cs_deassert_packet().to_vec(),
            "CS must be deasserted after a mid-command bulk error"
        );

        // read_range path (header echo read fails)
        let mut backend = CH341ABackend::with_bus(FailReadBus { writes: Vec::new() });
        backend.read_range(0, 64).unwrap_err();
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert_eq!(
            writes.last().unwrap(),
            &cs_deassert_packet().to_vec(),
            "CS must be deasserted after a mid-read bulk error"
        );
    }

    /// A bus that always reports the chip busy (WIP=1) — used to exercise the timeout path.
    struct AlwaysBusyBus;
    impl UsbBus for AlwaysBusyBus {
        fn bulk_write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }
        fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
            // byte[1] carries the status; WIP bit set.
            let mut v = vec![0u8; len.max(2)];
            v[1] = SR_WIP;
            Ok(v)
        }
    }

    #[test]
    fn wait_until_ready_polls_rdsr_until_wip_clears() {
        let mut bus = MockBus::new();
        // Two busy polls (WIP=1) then ready (WIP=0). byte[1] is the status register.
        bus.queue_read(vec![0x00, SR_WIP]);
        bus.queue_read(vec![0x00, SR_WIP]);
        bus.queue_read(vec![0x00, 0x00]);
        let mut backend = CH341ABackend::with_bus(bus);
        backend.wait_until_ready(ERASE_TIMEOUT).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // Exactly three RDSR stream packets were issued (busy, busy, ready).
        let rdsr_polls = bus
            .writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR)
            .count();
        assert_eq!(rdsr_polls, 3);
    }

    #[test]
    fn wait_until_ready_times_out_when_chip_never_ready() {
        let mut backend = CH341ABackend::with_bus(AlwaysBusyBus);
        let err = backend
            .wait_until_ready(Duration::from_millis(5))
            .unwrap_err();
        assert!(format!("{err}").contains("busy"));
    }

    /// Index of the first SPI-stream packet whose opcode + 3-byte address match.
    fn find_cmd_at_addr(writes: &[Vec<u8>], opcode: u8, addr3: [u8; 3]) -> Option<usize> {
        writes.iter().position(|w| {
            w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == opcode && w[2..5] == addr3
        })
    }

    #[test]
    fn write_chip_erases_then_page_programs_across_page_boundaries() {
        // 300-byte image → spans two 256-byte pages, so we must see PAGE_PROGRAM at addr 0
        // AND at addr 256 (0x000100). Erase must precede the first program.
        let firmware: Vec<u8> = (0..300u32).map(|i| (i % 251) as u8).collect();
        let path = std::env::temp_dir().join("ratchet-test-d2-write.bin");
        std::fs::write(&path, &firmware).unwrap();

        let mut bus = MockBus::new();
        // RDID → Winbond W25Q128 (ef4018), the most common motherboard BIOS chip: 16 MB,
        // 256-byte pages, 4 KB sectors, 3-byte addressing.
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x18]);
        // Every subsequent read is don't-care except RDSR polls, whose byte[1]=0 ⇒ WIP clear.
        for _ in 0..80 {
            bus.queue_read(vec![0u8; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);

        let res = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        assert!(res.success);
        assert_eq!(res.backup_path, None); // skip_backup honored
        assert!(!res.verified); // skip_verify honored

        let writes = &backend.bus.as_ref().unwrap().writes;
        let erase_idx = find_cmd_at_addr(writes, SPI_SECTOR_ERASE, [0, 0, 0])
            .expect("sector-erase at addr 0 must be issued before programming");
        let pp0_idx =
            find_cmd_at_addr(writes, SPI_PAGE_PROGRAM, [0, 0, 0]).expect("page-program at addr 0");
        let pp1_idx = find_cmd_at_addr(writes, SPI_PAGE_PROGRAM, [0x00, 0x01, 0x00])
            .expect("page-program at addr 256 (page boundary split)");
        // Erase before program; first page before second.
        assert!(erase_idx < pp0_idx, "must erase before programming");
        assert!(pp0_idx < pp1_idx, "pages programmed in order");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_chip_rejects_image_larger_than_chip() {
        // Winbond W25Q64 (ef4017) = 8 MB. A 9 MB image must be rejected, not silently truncated.
        let big = vec![0xa5u8; 9 * 1024 * 1024];
        let path = std::env::temp_dir().join("ratchet-test-d2-oversize.bin");
        std::fs::write(&path, &big).unwrap();

        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x17]); // RDID → W25Q64, 8 MB
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("chip holds only"));
        let _ = std::fs::remove_file(&path);
    }

    /// A test bus that emulates a real SPI NOR flash behind the CH341A USB framing, so a full
    /// write_chip → read-back → verify_chip cycle runs without hardware. It accumulates the SPI
    /// bytes of each CS-low frame, answers reads full-duplex (response byte i depends on the
    /// command bytes already in the frame), and applies erase/program side-effects on CS-high.
    /// PAGE_PROGRAM uses real AND-into-flash semantics, so a missing erase-before-write would
    /// leave stale 0-bits and fail verification — exactly like silicon.
    struct LoopbackFlash {
        flash: Vec<u8>,
        jedec: [u8; 3],
        frame: Vec<u8>,
        read_pos: usize,
    }
    impl LoopbackFlash {
        fn new(size: usize, jedec: [u8; 3]) -> Self {
            Self {
                flash: vec![0xff; size],
                jedec,
                frame: Vec::new(),
                read_pos: 0,
            }
        }
        fn decode_addr(bytes: &[u8]) -> usize {
            bytes.iter().fold(0usize, |acc, &b| (acc << 8) | b as usize)
        }
        /// Full-duplex response for absolute frame position `pos`, given `self.frame` so far.
        fn response_byte(&self, pos: usize) -> u8 {
            if self.frame.is_empty() {
                return 0;
            }
            match self.frame[0] {
                SPI_RDID => {
                    if (1..=3).contains(&pos) {
                        self.jedec[pos - 1]
                    } else {
                        0
                    }
                }
                SPI_RDSR | SPI_RDSR2 | SPI_RDSR3 => 0, // WIP clear
                op @ (SPI_READ | SPI_READ_4B) => {
                    let addr_len = if op == SPI_READ_4B { 4 } else { 3 };
                    let data_start = 1 + addr_len;
                    if pos >= data_start && self.frame.len() >= data_start {
                        let base = Self::decode_addr(&self.frame[1..data_start]);
                        *self.flash.get(base + (pos - data_start)).unwrap_or(&0xff)
                    } else {
                        0
                    }
                }
                _ => 0,
            }
        }
        /// Apply erase/program effects when the CS frame closes.
        fn commit_frame(&mut self) {
            if self.frame.is_empty() {
                return;
            }
            match self.frame[0] {
                SPI_CHIP_ERASE => self.flash.iter_mut().for_each(|b| *b = 0xff),
                op @ (SPI_SECTOR_ERASE | SPI_SECTOR_ERASE_4B) => {
                    let al = if op == SPI_SECTOR_ERASE_4B { 4 } else { 3 };
                    let a = Self::decode_addr(&self.frame[1..1 + al]);
                    for b in self.flash.iter_mut().skip(a).take(4096) {
                        *b = 0xff;
                    }
                }
                op @ (SPI_PAGE_PROGRAM | SPI_PAGE_PROGRAM_4B) => {
                    let al = if op == SPI_PAGE_PROGRAM_4B { 4 } else { 3 };
                    let a = Self::decode_addr(&self.frame[1..1 + al]);
                    for (i, &d) in self.frame[1 + al..].iter().enumerate() {
                        if let Some(cell) = self.flash.get_mut(a + i) {
                            *cell &= d; // program can only clear bits — faithful to NOR flash
                        }
                    }
                }
                _ => {}
            }
            self.frame.clear();
            self.read_pos = 0;
        }
    }
    impl UsbBus for LoopbackFlash {
        fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
            match data.first().copied() {
                Some(CMD_UIO_STREAM) => {
                    // CS bit clear ⇒ CS-low (frame start); CS bit set ⇒ CS-high (frame commit).
                    if data.get(1).map(|b| b & STM_SPI_CS == 0).unwrap_or(false) {
                        self.frame.clear();
                        self.read_pos = 0;
                    } else {
                        self.commit_frame();
                    }
                }
                Some(CMD_SPI_STREAM) => self.frame.extend_from_slice(&data[1..]),
                _ => {}
            }
            Ok(())
        }
        fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
            let out: Vec<u8> = (0..len)
                .map(|j| self.response_byte(self.read_pos + j))
                .collect();
            self.read_pos += len;
            Ok(out)
        }
    }

    #[test]
    fn write_then_verify_round_trip_via_loopback_flash() {
        // Emulate a W25Q128 (ef4018). Image spans 2 sectors + 17 pages to exercise boundaries.
        let firmware: Vec<u8> = (0..(4096u32 + 100)).map(|i| (i % 251) as u8).collect();
        let path = std::env::temp_dir().join("ratchet-test-d3-roundtrip.bin");
        std::fs::write(&path, &firmware).unwrap();

        let bus = LoopbackFlash::new(16 * 1024 * 1024, [0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);

        // Default-ish opts but skip the (16 MB) backup read to keep the test quick; DO verify.
        let w = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: false,
                },
            )
            .unwrap();
        assert!(w.success);
        assert!(
            w.verified,
            "read-back verify after a real program cycle must match"
        );

        // Independent verify call against the same image also matches.
        let v = backend.verify_chip(&path).unwrap();
        assert!(v.matches);
        assert_eq!(v.chip_checksum, v.file_checksum);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn verify_chip_detects_mismatch_via_loopback() {
        let firmware: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
        let written = std::env::temp_dir().join("ratchet-test-d3-written.bin");
        let other = std::env::temp_dir().join("ratchet-test-d3-other.bin");
        std::fs::write(&written, &firmware).unwrap();
        std::fs::write(&other, vec![0x5au8; 1000]).unwrap();

        let bus = LoopbackFlash::new(16 * 1024 * 1024, [0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &written,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();

        // The chip now holds `firmware`; verifying a different file must NOT match.
        let v = backend.verify_chip(&other).unwrap();
        assert!(!v.matches, "verify must detect a chip≠file mismatch");
        // And verifying the real image matches.
        assert!(backend.verify_chip(&written).unwrap().matches);

        std::fs::remove_file(&written).ok();
        std::fs::remove_file(&other).ok();
    }

    #[test]
    fn identify_large_chip_sends_en4b_and_enables_4byte() {
        // W25Q256 (ef4019) = 32 MB → must enter 4-byte mode (EN4B 0xb7) so >16 MB is addressable.
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x19]);
        for _ in 0..4 {
            bus.queue_read(vec![0u8; 8]); // EN4B command's reads (don't-care)
        }
        let mut backend = CH341ABackend::with_bus(bus);
        let info = backend.identify_chip().unwrap().unwrap();
        assert!(info.size_bytes > SIZE_16MB);
        assert!(backend.use_4byte_addr, "4-byte addressing flag must be set");
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B (0xb7) must be sent when identifying a >16 MB chip"
        );
    }

    #[test]
    fn identify_small_chip_does_not_send_en4b() {
        // W25Q128 (ef4018) = 16 MB → stays in 3-byte mode, no EN4B.
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x00, 0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);
        backend.identify_chip().unwrap();
        assert!(!backend.use_4byte_addr);
        let writes = &backend.bus.as_ref().unwrap().writes;
        assert!(
            !writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B must NOT be sent for a ≤16 MB chip"
        );
    }

    #[test]
    fn read_range_streams_single_opcode() {
        // 3 KiB read: the READ opcode + address must be issued exactly ONCE,
        // inside exactly one CS assertion — never re-addressed per KiB.
        let mut bus = MockBus::new();
        for _ in 0..120 {
            bus.queue_read(vec![0u8; 40]); // header echo + 31-byte data chunks
        }
        let mut backend = CH341ABackend::with_bus(bus);
        let data = backend.read_range(0, 3 * 1024).unwrap();
        assert_eq!(data.len(), 3 * 1024);
        let writes = &backend.bus.as_ref().unwrap().writes;
        let read_opcodes = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_READ)
            .count();
        assert_eq!(read_opcodes, 1, "READ (0x03) must go out once per range");
        let cs_asserts = writes
            .iter()
            .filter(|w| w.as_slice() == cs_assert_packet())
            .count();
        let cs_deasserts = writes
            .iter()
            .filter(|w| w.as_slice() == cs_deassert_packet())
            .count();
        assert_eq!((cs_asserts, cs_deasserts), (1, 1), "one CS pulse per range");
    }

    #[test]
    fn read_sfdp_parses_real_header_and_density() {
        use crate::sfdp::{build_synthetic_sfdp, BuildSfdpOptions};
        let sfdp_space = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let mut bus = MockBus::new();
        // Header read: tx = 5 (cmd+addr+dummy) + 16 = 21 bytes, single chunk →
        // one bulk_read(21) whose data sits at [5..21].
        let mut rx1 = vec![0u8; 5];
        rx1.extend_from_slice(&sfdp_space[..16]);
        bus.queue_read(rx1);
        // BFPT read at 0x80 (20 dwords = 80 bytes): tx = 85 bytes → CH341A chunks
        // of 31 + 31 + 23, each answered by one queued bulk_read.
        let mut rx2 = vec![0u8; 5];
        rx2.extend_from_slice(&sfdp_space[0x80..0x80 + 80]);
        bus.queue_read(rx2[..31].to_vec());
        bus.queue_read(rx2[31..62].to_vec());
        bus.queue_read(rx2[62..85].to_vec());
        let mut backend = CH341ABackend::with_bus(bus);
        let info = backend.read_sfdp().unwrap().expect("SFDP present");
        // Real density parsed from the BFPT — never the fabricated zeros.
        assert_eq!(info.density_bytes, 8 * 1024 * 1024);
        assert_eq!(info.density_bits, 8 * 1024 * 1024 * 8);
        assert_eq!(info.page_size, 256);
        assert!(info.sector_size_4kb);
        assert!(!info.supports_4byte_addr);
        // Wire bytes: 0x5a + 3-byte address 0 + dummy.
        let writes = &backend.bus.as_ref().unwrap().writes;
        let first_sfdp = writes
            .iter()
            .find(|w| w.len() >= 6 && w[0] == CMD_SPI_STREAM && w[1] == SPI_SFDP)
            .expect("an SFDP (0x5a) frame must be issued");
        assert_eq!(&first_sfdp[2..6], &[0, 0, 0, 0]);
    }

    #[test]
    fn read_sfdp_returns_none_without_valid_signature() {
        let mut bus = MockBus::new();
        bus.queue_read(vec![0u8; 21]); // zeros — no "SFDP" signature
        let mut backend = CH341ABackend::with_bus(bus);
        assert!(backend.read_sfdp().unwrap().is_none());
    }

    #[test]
    fn write_chip_refuses_blank_all_ff_image() {
        // Flashing an all-0xFF (blank) image would wipe a working BIOS — must be refused.
        let path = std::env::temp_dir().join("ratchet-test-blank-ff.bin");
        std::fs::write(&path, vec![0xffu8; 4096]).unwrap();
        let mut backend = CH341ABackend::with_bus(MockBus::new());
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("blank"));
        std::fs::remove_file(&path).ok();
    }
}
