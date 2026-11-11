// Shared types  -  ports of src/types.ts.
// Serialized into the `--json` envelope output, so field renaming is observable.

use serde::{Deserialize, Serialize};

/// Lowercase hex-encode bytes into a single pre-sized String (no per-byte heap alloc).
pub fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(&mut s, "{b:02x}");
    }
    s
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProgrammerInfo {
    #[serde(rename = "type")]
    pub kind: String,
    pub connected: bool,
    #[serde(rename = "vendorId")]
    pub vendor_id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub description: String,
    pub backend: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChipInfo {
    pub name: String,
    #[serde(rename = "vendorName")]
    pub vendor_name: String,
    #[serde(rename = "jedecId")]
    pub jedec_id: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "sizeHuman")]
    pub size_human: String,
    #[serde(rename = "type")]
    pub chip_type: String,
    #[serde(rename = "pageSize", skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(rename = "sectorSize", skip_serializing_if = "Option::is_none")]
    pub sector_size: Option<u32>,
    #[serde(rename = "blockSize", skip_serializing_if = "Option::is_none")]
    pub block_size: Option<u32>,
    #[serde(rename = "writeProtected", skip_serializing_if = "Option::is_none")]
    pub write_protected: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voltage: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadResult {
    pub success: bool,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub checksum: String,
    #[serde(rename = "allFF", skip_serializing_if = "Option::is_none")]
    pub all_ff: Option<bool>,
    #[serde(rename = "allZero", skip_serializing_if = "Option::is_none")]
    pub all_zero: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WriteResult {
    pub success: bool,
    #[serde(rename = "backupPath")]
    pub backup_path: Option<String>,
    pub verified: bool,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl WriteResult {
    /// Why a caller must report this write as failed, or `None` when it stands.
    ///
    /// A write that says `success: false`, or that was asked to verify and came
    /// back unverified, has not put the image on the chip as far as anyone can
    /// tell. Front ends route that through this method so it becomes an error
    /// (a non-zero exit, a JSON-RPC error) instead of a field inside a response
    /// that otherwise reads as success.
    pub fn failure(&self, verify_requested: bool) -> Option<String> {
        if !self.success {
            return Some(
                self.error
                    .clone()
                    .unwrap_or_else(|| "the write did not complete".to_string()),
            );
        }
        if verify_requested && !self.verified {
            return Some(
                "the chip was programmed but its contents were not verified against the image"
                    .to_string(),
            );
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EraseResult {
    pub success: bool,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VerifyResult {
    pub matches: bool,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "chipChecksum")]
    pub chip_checksum: String,
    #[serde(rename = "fileChecksum")]
    pub file_checksum: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SfdpInfo {
    #[serde(rename = "densityBits")]
    pub density_bits: u64,
    #[serde(rename = "densityBytes")]
    pub density_bytes: u64,
    #[serde(rename = "pageSize")]
    pub page_size: u32,
    #[serde(rename = "sectorSize4KB")]
    pub sector_size_4kb: bool,
    #[serde(rename = "blockSize32KB")]
    pub block_size_32kb: bool,
    #[serde(rename = "blockSize64KB")]
    pub block_size_64kb: bool,
    #[serde(rename = "supports4ByteAddr")]
    pub supports_4byte_addr: bool,
    #[serde(rename = "fastReadSupported")]
    pub fast_read_supported: bool,
    #[serde(rename = "rawHeader")]
    pub raw_header: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct JedecId {
    pub manufacturer: u8,
    #[serde(rename = "memoryType")]
    pub memory_type: u8,
    pub capacity: u8,
}

impl JedecId {
    pub fn to_hex(self) -> String {
        format!(
            "{:02x}{:02x}{:02x}",
            self.manufacturer, self.memory_type, self.capacity
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StatusRegisters {
    pub sr1: u8,
    pub sr2: u8,
    pub sr3: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityMode {
    Stable,
    Noisy,
    Disconnected,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub stable: bool,
    pub reads: u32,
    pub matches: u32,
    #[serde(rename = "jedecId")]
    pub jedec_id: String,
    pub timings: Vec<u32>,
    #[serde(rename = "statusRegister")]
    pub status_register: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub type ProgressCallback<'a> = &'a mut dyn FnMut(u8, u64, u64, f64, f64);

#[cfg(test)]
mod tests {
    use super::*;

    fn write_result(success: bool, verified: bool, error: Option<&str>) -> WriteResult {
        WriteResult {
            success,
            backup_path: None,
            verified,
            duration_ms: 0,
            error: error.map(str::to_string),
        }
    }

    #[test]
    fn verified_write_is_not_a_failure() {
        assert_eq!(write_result(true, true, None).failure(true), None);
    }

    #[test]
    fn skipped_verify_is_not_a_failure_when_it_was_not_requested() {
        assert_eq!(write_result(true, false, None).failure(false), None);
    }

    #[test]
    fn unverified_write_is_a_failure_when_verify_was_requested() {
        let why = write_result(true, false, None).failure(true).unwrap();
        assert!(why.contains("not verified"), "{why}");
    }

    #[test]
    fn unsuccessful_write_is_a_failure_and_carries_the_backend_error() {
        let r = write_result(false, false, Some("File not found: x.bin"));
        assert_eq!(r.failure(true).as_deref(), Some("File not found: x.bin"));
        // Also when verify was skipped: the write itself did not happen.
        assert_eq!(r.failure(false).as_deref(), Some("File not found: x.bin"));
        assert!(write_result(false, false, None).failure(false).is_some());
    }
}
