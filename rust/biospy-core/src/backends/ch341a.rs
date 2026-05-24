// CH341A SPI backend — ports src/backends/ch341a.ts.
//
// Architecture: protocol-level functions (packet builders / parsers) are pure
// and heavily tested without USB. The backend struct wires them to a `UsbBus`
// trait, which real hardware satisfies via biospy_usb::DeviceHandle. Tests use
// an in-memory recorder to assert protocol correctness without hardware.

use super::{Backend, BackendError, Result, WriteOpts};
use crate::chips::{format_size, lookup_by_jedec_id, needs_4byte_addressing};
use crate::types::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Duration, Instant};

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
/// Real hardware wraps `biospy_usb::DeviceHandle`; tests use a recorder.
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
        let mut rx = Vec::with_capacity(cmd.len());
        for packet in spi_stream_chunks(cmd) {
            let chunk_data_len = packet.len() - 1;
            bus.bulk_write(&packet)?;
            let r = bus.bulk_read(chunk_data_len)?;
            rx.extend_from_slice(&r);
        }
        bus.bulk_write(&cs_deassert_packet())?;
        Ok(rx)
    }

    pub fn rdid(&mut self) -> Result<JedecId> {
        let rx = self.spi_command(&[SPI_RDID, 0, 0, 0])?;
        decode_jedec_response(&rx).ok_or(BackendError::ChipNotDetected)
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
            if db.size_bytes > SIZE_16MB {
                self.use_4byte_addr = true;
            }
            ChipInfo {
                name: db.name.clone(),
                vendor_name: db.vendor.clone(),
                jedec_id: hex,
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
            let needs_4b = needs_4byte_addressing(&hex);
            if needs_4b {
                self.use_4byte_addr = true;
            }
            ChipInfo {
                name: format!("Unknown {}", hex.to_ascii_uppercase()),
                vendor_name: "Unknown".into(),
                jedec_id: hex,
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
        let mut cmd = vec![SPI_SFDP, 0, 0, 0, 0];
        // 8 bytes header
        cmd.extend(std::iter::repeat_n(0, 8));
        let rx = self.spi_command(&cmd)?;
        // First 5 bytes are cmd + 3 addr + dummy. Header bytes start at 5.
        if rx.len() < 5 + 8 {
            return Ok(None);
        }
        let hdr = &rx[5..5 + 8];
        let info = crate::sfdp::parse_sfdp_header(hdr);
        if !info.valid {
            return Ok(None);
        }
        Ok(Some(SfdpInfo {
            density_bits: 0,
            density_bytes: 0,
            page_size: 256,
            sector_size_4kb: true,
            block_size_32kb: true,
            block_size_64kb: true,
            supports_4byte_addr: false,
            fast_read_supported: true,
            raw_header: hdr.iter().map(|b| format!("{:02x}", b)).collect(),
        }))
    }
    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult> {
        let start = Instant::now();
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let size = chip.size_bytes as usize;
        if size == 0 {
            return Err(BackendError::ChipNotDetected);
        }
        let mut buf = Vec::with_capacity(size);
        let chunk_size = 1024;
        let mut addr: u64 = 0;
        while (addr as usize) < size {
            let n = chunk_size.min(size - addr as usize);
            let mut cmd = vec![SPI_READ];
            cmd.extend(address_bytes(addr, self.use_4byte_addr));
            cmd.extend(std::iter::repeat_n(0u8, n));
            let rx = self.spi_command(&cmd)?;
            let data_start = 1 + if self.use_4byte_addr { 4 } else { 3 };
            buf.extend_from_slice(&rx[data_start..data_start + n]);
            addr += n as u64;
        }
        std::fs::write(output_path, &buf)?;
        let mut h = Sha256::new();
        h.update(&buf);
        let checksum: String = h.finalize().iter().map(|b| format!("{:02x}", b)).collect();
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
    fn write_chip(&mut self, _input_path: &Path, _opts: WriteOpts) -> Result<WriteResult> {
        Err(BackendError::Other(
            "write_chip wired in follow-up (D12 chip ops workflow)".into(),
        ))
    }
    fn verify_chip(&mut self, _file_path: &Path) -> Result<VerifyResult> {
        Err(BackendError::Other("verify_chip wired in D12".into()))
    }
    fn erase_chip(&mut self) -> Result<EraseResult> {
        self.spi_command(&[SPI_WREN])?;
        self.spi_command(&[SPI_CHIP_ERASE])?;
        Ok(EraseResult {
            success: true,
            duration_ms: 0,
            error: None,
        })
    }
    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = vec![if self.use_4byte_addr {
            SPI_SECTOR_ERASE_4B
        } else {
            SPI_SECTOR_ERASE
        }];
        cmd.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&cmd)?;
        Ok(EraseResult {
            success: true,
            duration_ms: 0,
            error: None,
        })
    }
    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = vec![if self.use_4byte_addr {
            SPI_BLOCK_ERASE_4B
        } else {
            SPI_BLOCK_ERASE
        }];
        cmd.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&cmd)?;
        Ok(EraseResult {
            success: true,
            duration_ms: 0,
            error: None,
        })
    }
    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult> {
        // Sector-by-sector erase across the range.
        let mut addr = start_addr & !0xfff;
        let end = start_addr + length;
        while addr < end {
            self.sector_erase(addr)?;
            addr += 4096;
        }
        Ok(EraseResult {
            success: true,
            duration_ms: 0,
            error: None,
        })
    }
    fn is_write_protected(&mut self) -> Result<bool> {
        let sr = self.read_status_registers()?;
        Ok((sr.sr1 & 0x1c) != 0)
    }
    fn disable_write_protection(&mut self) -> Result<()> {
        self.spi_command(&[SPI_EWSR])?;
        self.spi_command(&[SPI_WRSR, 0])?;
        Ok(())
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
    fn backend_erase_chip_sends_wren_then_chip_erase() {
        let mut bus = MockBus::new();
        for _ in 0..4 {
            // Two SPI commands × (CS_assert read + stream read + CS_deassert read) reads.
            // Each spi_command reads exactly once (combined chunks). Two commands → 2 reads.
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.erase_chip().unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // CS↓ + stream(WREN) + CS↑ + CS↓ + stream(C7) + CS↑ = 6 writes.
        assert_eq!(bus.writes.len(), 6);
        assert_eq!(bus.writes[1][1], SPI_WREN);
        assert_eq!(bus.writes[4][1], SPI_CHIP_ERASE);
    }

    #[test]
    fn backend_sector_erase_uses_3byte_addr_by_default() {
        let mut bus = MockBus::new();
        for _ in 0..2 {
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.sector_erase(0x123456).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // writes[4] = stream packet for SECTOR_ERASE
        let pkt = &bus.writes[4];
        assert_eq!(pkt[0], CMD_SPI_STREAM);
        assert_eq!(pkt[1], SPI_SECTOR_ERASE);
        assert_eq!(&pkt[2..5], &[0x12, 0x34, 0x56]);
    }

    #[test]
    fn backend_sector_erase_uses_4byte_when_enabled() {
        let mut bus = MockBus::new();
        for _ in 0..2 {
            bus.queue_read(vec![0; 8]);
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.use_4byte_addr = true;
        backend.sector_erase(0x01020304).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        let pkt = &bus.writes[4];
        assert_eq!(pkt[1], SPI_SECTOR_ERASE_4B);
        assert_eq!(&pkt[2..6], &[0x01, 0x02, 0x03, 0x04]);
    }
}
