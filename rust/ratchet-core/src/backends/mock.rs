// Mock backend  -  in-memory flash emulation. Used for tests and `RATCHET_FORCE_MOCK=1`.
// Mirrors src/backends/mock.ts.

use super::{Backend, BackendError, Result, WriteOpts};
use crate::chips::{format_size, lookup_by_jedec_id};
use crate::types::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const MOCK_JEDEC: JedecId = JedecId {
    manufacturer: 0xef,
    memory_type: 0x40,
    capacity: 0x17,
};
const MOCK_SIZE: usize = 8 * 1024 * 1024; // 8MB  -  W25Q64

pub struct MockBackend {
    flash: Vec<u8>,
    opened: bool,
    write_protected: bool,
    quality_mode: QualityMode,
}

impl Default for MockBackend {
    fn default() -> Self {
        Self::new(MOCK_SIZE)
    }
}

impl MockBackend {
    pub fn new(size_bytes: usize) -> Self {
        Self {
            flash: vec![0xff; size_bytes],
            opened: false,
            write_protected: false,
            quality_mode: QualityMode::Stable,
        }
    }

    pub fn set_quality_mode(&mut self, mode: QualityMode) {
        self.quality_mode = mode;
    }

    pub fn flash_bytes(&self) -> &[u8] {
        &self.flash
    }

    pub fn set_write_protected(&mut self, wp: bool) {
        self.write_protected = wp;
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    crate::types::hex_encode(&h.finalize())
}

impl Backend for MockBackend {
    fn detect_programmer(&mut self) -> Result<ProgrammerInfo> {
        // The mock must never masquerade as real hardware in machine-readable
        // output: it previously reported kind "ch341a" with the real VID/PID
        // 1a86:5512, so an agent checking `detect` believed a programmer was
        // attached. Every field now says mock.
        Ok(ProgrammerInfo {
            kind: "mock".to_string(),
            connected: true,
            vendor_id: "0000".to_string(),
            product_id: "0000".to_string(),
            description: "Mock programmer (in-memory, no hardware)".to_string(),
            backend: "mock".to_string(),
        })
    }

    fn open(&mut self) -> Result<()> {
        self.opened = true;
        Ok(())
    }

    fn close(&mut self) -> Result<()> {
        self.opened = false;
        Ok(())
    }

    fn read_jedec_id(&mut self) -> Result<JedecId> {
        Ok(MOCK_JEDEC)
    }

    fn identify_chip(&mut self) -> Result<Option<ChipInfo>> {
        let jedec_hex = MOCK_JEDEC.to_hex();
        let info = if let Some(db) = lookup_by_jedec_id(&jedec_hex) {
            ChipInfo {
                name: db.name.clone(),
                vendor_name: db.vendor.clone(),
                jedec_id: jedec_hex,
                size_bytes: db.size_bytes,
                size_human: format_size(db.size_bytes),
                chip_type: "spi".to_string(),
                page_size: Some(db.page_size),
                sector_size: Some(db.sector_size),
                block_size: Some(db.block_size),
                write_protected: Some(self.write_protected),
                voltage: Some(db.voltage),
            }
        } else {
            ChipInfo {
                name: "W25Q64".to_string(),
                vendor_name: "Winbond".to_string(),
                jedec_id: jedec_hex,
                size_bytes: MOCK_SIZE as u64,
                size_human: "8 MB".to_string(),
                chip_type: "spi".to_string(),
                page_size: Some(256),
                sector_size: Some(4096),
                block_size: Some(65536),
                write_protected: Some(self.write_protected),
                voltage: Some(3.3),
            }
        };
        Ok(Some(info))
    }

    fn read_status_registers(&mut self) -> Result<StatusRegisters> {
        Ok(StatusRegisters {
            sr1: if self.write_protected { 0x1c } else { 0x00 },
            sr2: 0x00,
            sr3: 0x00,
        })
    }

    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>> {
        Ok(Some(SfdpInfo {
            density_bits: (self.flash.len() * 8) as u64,
            density_bytes: self.flash.len() as u64,
            page_size: 256,
            sector_size_4kb: true,
            block_size_32kb: true,
            block_size_64kb: true,
            supports_4byte_addr: false,
            fast_read_supported: true,
            raw_header: "53464450000101ff".to_string(),
        }))
    }

    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult> {
        let start = Instant::now();
        std::fs::write(output_path, &self.flash)?;
        let checksum = sha256_hex(&self.flash);
        let all_ff = self.flash.iter().all(|&b| b == 0xff);
        let all_zero = self.flash.iter().all(|&b| b == 0x00);
        Ok(ReadResult {
            success: true,
            file_path: output_path.display().to_string(),
            size_bytes: self.flash.len() as u64,
            duration_ms: start.elapsed().as_millis() as u64,
            checksum,
            all_ff: Some(all_ff),
            all_zero: Some(all_zero),
            error: None,
        })
    }

    fn write_chip(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let start = Instant::now();
        if !input_path.exists() {
            return Ok(WriteResult {
                success: false,
                backup_path: None,
                verified: false,
                duration_ms: 0,
                error: Some(format!("File not found: {}", input_path.display())),
            });
        }
        let firmware = std::fs::read(input_path)?;
        super::reject_blank_image(&firmware)?;
        let backup_path = if opts.skip_backup {
            None
        } else {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let path = std::env::temp_dir().join(format!("ratchet-backup-mock-{}.bin", ts));
            std::fs::write(&path, &self.flash)?;
            Some(path.display().to_string())
        };
        let n = firmware.len().min(self.flash.len());
        self.flash[..n].copy_from_slice(&firmware[..n]);

        Ok(WriteResult {
            success: true,
            backup_path,
            verified: !opts.skip_verify,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn verify_chip(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let start = Instant::now();
        let file_data = std::fs::read(file_path)?;
        let chip_checksum = sha256_hex(&self.flash);
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
        self.flash.iter_mut().for_each(|b| *b = 0xff);
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        let sector_size: u64 = 4096;
        let aligned = (address & !(sector_size - 1)) as usize;
        let end = (aligned + sector_size as usize).min(self.flash.len());
        if aligned < self.flash.len() {
            self.flash[aligned..end].iter_mut().for_each(|b| *b = 0xff);
        }
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        let block_size: u64 = 65536;
        let aligned = (address & !(block_size - 1)) as usize;
        let end = (aligned + block_size as usize).min(self.flash.len());
        if aligned < self.flash.len() {
            self.flash[aligned..end].iter_mut().for_each(|b| *b = 0xff);
        }
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult> {
        let start = Instant::now();
        let s = start_addr as usize;
        let e = ((start_addr + length) as usize).min(self.flash.len());
        if s < self.flash.len() {
            self.flash[s..e].iter_mut().for_each(|b| *b = 0xff);
        }
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    fn is_write_protected(&mut self) -> Result<bool> {
        Ok(self.write_protected)
    }

    fn disable_write_protection(&mut self) -> Result<()> {
        self.write_protected = false;
        Ok(())
    }

    fn connection_test(&mut self) -> Result<ConnectionTestResult> {
        let read_count: u32 = 10;
        match self.quality_mode {
            QualityMode::Disconnected => Ok(ConnectionTestResult {
                stable: false,
                reads: read_count,
                matches: read_count,
                jedec_id: "000000".to_string(),
                timings: vec![5; read_count as usize],
                status_register: None,
                error: Some("No chip responding  -  check clip/socket connection".to_string()),
            }),
            QualityMode::Noisy => {
                let noisy_ids = ["ab1234", "cd5678", "000000"];
                let mut ids: Vec<String> = Vec::with_capacity(read_count as usize);
                let mut timings: Vec<u32> = Vec::with_capacity(read_count as usize);
                for i in 0..read_count {
                    if i % 3 == 2 {
                        ids.push(noisy_ids[(i as usize) % noisy_ids.len()].to_string());
                        timings.push(5 + i * 25);
                    } else {
                        ids.push("ef4017".to_string());
                        timings.push(5);
                    }
                }
                let first = ids[0].clone();
                let matches = ids.iter().filter(|id| *id == &first).count() as u32;
                Ok(ConnectionTestResult {
                    stable: false,
                    reads: read_count,
                    matches,
                    jedec_id: first,
                    timings,
                    status_register: Some(0x00),
                    error: Some(format!(
                        "Unstable: {}/{} consistent  -  reseat SOIC clip",
                        matches, read_count
                    )),
                })
            }
            QualityMode::Stable => Ok(ConnectionTestResult {
                stable: true,
                reads: read_count,
                matches: read_count,
                jedec_id: "ef4017".to_string(),
                timings: vec![5; read_count as usize],
                status_register: Some(0x00),
                error: None,
            }),
        }
    }

    fn reset_chip(&mut self) -> Result<()> {
        Ok(())
    }
}

// Silence unused-import warnings if BackendError isn't referenced in this file directly.
#[allow(dead_code)]
fn _ensure_error_in_use() -> Option<BackendError> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ratchet-mock-test-{}-{}", std::process::id(), name))
    }

    #[test]
    fn detect_reports_mock_kind() {
        // Machine-readable honesty: an agent inspecting detect output must be
        // able to tell the mock from real silicon. No real kind, VID, or PID.
        let mut m = MockBackend::default();
        let info = m.detect_programmer().unwrap();
        assert_eq!(info.kind, "mock");
        assert_eq!(info.backend, "mock");
        assert_ne!(info.vendor_id, "1a86", "mock must not claim the WCH VID");
        assert_ne!(info.product_id, "5512", "mock must not claim a real PID");
    }

    #[test]
    fn default_size_is_8mb() {
        let mut m = MockBackend::default();
        let info = m.identify_chip().unwrap().unwrap();
        assert_eq!(info.size_bytes, 8 * 1024 * 1024);
    }

    #[test]
    fn read_jedec_id_returns_ef4017() {
        let mut m = MockBackend::default();
        let id = m.read_jedec_id().unwrap();
        assert_eq!(id.to_hex(), "ef4017");
    }

    #[test]
    fn read_chip_writes_file_of_correct_size() {
        let mut m = MockBackend::default();
        let path = tmp_file("read.bin");
        let r = m.read_chip(&path).unwrap();
        assert!(r.success);
        assert_eq!(r.size_bytes, 8 * 1024 * 1024);
        assert!(r.all_ff.unwrap());
        let meta = std::fs::metadata(&path).unwrap();
        assert_eq!(meta.len(), 8 * 1024 * 1024);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn write_then_verify_roundtrip() {
        let mut m = MockBackend::default();
        let src = tmp_file("write-src.bin");
        let data: Vec<u8> = (0..8 * 1024 * 1024).map(|i| (i % 251) as u8).collect();
        std::fs::write(&src, &data).unwrap();

        let w = m.write_chip(&src, WriteOpts::default()).unwrap();
        assert!(w.success);
        assert!(w.backup_path.is_some(), "default opts must produce backup");
        assert!(w.verified);

        let v = m.verify_chip(&src).unwrap();
        assert!(v.matches);
        assert_eq!(v.chip_checksum, v.file_checksum);
        std::fs::remove_file(&src).ok();
    }

    #[test]
    fn write_skip_backup_and_verify_opts() {
        let mut m = MockBackend::default();
        let src = tmp_file("write-noback.bin");
        std::fs::write(&src, vec![0xaau8; 8 * 1024 * 1024]).unwrap();
        let w = m
            .write_chip(
                &src,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        assert!(w.success);
        assert!(w.backup_path.is_none());
        assert!(!w.verified);
        std::fs::remove_file(&src).ok();
    }

    #[test]
    fn write_missing_file_reports_error() {
        let mut m = MockBackend::default();
        let path = tmp_file("does-not-exist-XYZ.bin");
        let w = m.write_chip(&path, WriteOpts::default()).unwrap();
        assert!(!w.success);
        assert!(w.error.unwrap().contains("not found"));
    }

    #[test]
    fn erase_fills_ff() {
        let mut m = MockBackend::default();
        // Pre-fill with non-FF so we can detect erase.
        m.flash.iter_mut().for_each(|b| *b = 0xaa);
        let r = m.erase_chip().unwrap();
        assert!(r.success);
        assert!(m.flash.iter().all(|&b| b == 0xff));
    }

    #[test]
    fn sector_erase_4kb_aligned() {
        let mut m = MockBackend::default();
        m.flash.iter_mut().for_each(|b| *b = 0x55);
        m.sector_erase(0x1234).unwrap(); // unaligned → aligned to 0x1000
        for i in 0x0000..0x1000 {
            assert_eq!(m.flash[i], 0x55, "before sector should be untouched");
        }
        for i in 0x1000..0x2000 {
            assert_eq!(m.flash[i], 0xff, "sector should be erased");
        }
        for i in 0x2000..0x2010 {
            assert_eq!(m.flash[i], 0x55, "after sector should be untouched");
        }
    }

    #[test]
    fn block_erase_64kb_aligned() {
        let mut m = MockBackend::default();
        m.flash.iter_mut().for_each(|b| *b = 0x55);
        m.block_erase(0x10005).unwrap(); // aligns to 0x10000
        for i in 0x10000..0x20000 {
            assert_eq!(m.flash[i], 0xff);
        }
    }

    #[test]
    fn region_erase_arbitrary_range() {
        let mut m = MockBackend::default();
        m.flash.iter_mut().for_each(|b| *b = 0x55);
        m.region_erase(100, 50).unwrap();
        for i in 100..150 {
            assert_eq!(m.flash[i], 0xff);
        }
        assert_eq!(m.flash[150], 0x55);
    }

    #[test]
    fn connection_test_stable_default() {
        let mut m = MockBackend::default();
        let r = m.connection_test().unwrap();
        assert!(r.stable);
        assert_eq!(r.matches, r.reads);
    }

    #[test]
    fn connection_test_noisy_mode() {
        let mut m = MockBackend::default();
        m.set_quality_mode(QualityMode::Noisy);
        let r = m.connection_test().unwrap();
        assert!(!r.stable);
        assert!(r.matches < r.reads);
        assert!(r.error.unwrap().contains("Unstable"));
    }

    #[test]
    fn connection_test_disconnected_mode() {
        let mut m = MockBackend::default();
        m.set_quality_mode(QualityMode::Disconnected);
        let r = m.connection_test().unwrap();
        assert!(!r.stable);
        assert_eq!(r.jedec_id, "000000");
        assert!(r.status_register.is_none());
    }

    #[test]
    fn write_protected_state_round_trip() {
        let mut m = MockBackend::default();
        assert!(!m.is_write_protected().unwrap());
        m.set_write_protected(true);
        assert!(m.is_write_protected().unwrap());
        m.disable_write_protection().unwrap();
        assert!(!m.is_write_protected().unwrap());
    }
}
