// BIOS analyzer — UEFI FV detection, Intel FD region walk, vendor/version scan,
// diff, checksum, firmware-blob extraction (UEFI Capsule / Intel Flash Image / AMI cap).
// Ports src/analysis/bios.ts.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const UEFI_FV_SIGNATURE: &[u8] = b"_FVH";
const INTEL_FD_SIGNATURE: &[u8] = &[0x5a, 0xa5, 0xf0, 0x0f];
const UEFI_CAPSULE_GUID: &[u8] = &[
    0xbd, 0x86, 0x66, 0x3b, 0x76, 0x0d, 0x30, 0x40, 0xb7, 0x0e, 0xb5, 0x51, 0x9e, 0x2f, 0xc5, 0xa0,
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiosRegion {
    pub name: String,
    pub offset: u64,
    pub size: u64,
    #[serde(rename = "type")]
    pub region_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiosAnalysis {
    #[serde(rename = "fileSize")]
    pub file_size: u64,
    pub checksum: String,
    pub regions: Vec<BiosRegion>,
    #[serde(rename = "isUefi")]
    pub is_uefi: bool,
    #[serde(rename = "biosVendor", skip_serializing_if = "Option::is_none")]
    pub bios_vendor: Option<String>,
    #[serde(rename = "biosVersion", skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
    #[serde(rename = "buildDate", skip_serializing_if = "Option::is_none")]
    pub build_date: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffRegion {
    pub offset: u64,
    pub length: u64,
    #[serde(rename = "oldValue")]
    pub old_value: String,
    #[serde(rename = "newValue")]
    pub new_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffResult {
    pub identical: bool,
    #[serde(rename = "totalDifferences")]
    pub total_differences: u64,
    #[serde(rename = "sizeA")]
    pub size_a: u64,
    #[serde(rename = "sizeB")]
    pub size_b: u64,
    #[serde(rename = "sizeMismatch")]
    pub size_mismatch: bool,
    pub regions: Vec<DiffRegion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExtractResult {
    pub format: String,
    #[serde(rename = "originalSize")]
    pub original_size: u64,
    #[serde(rename = "strippedBytes")]
    pub stripped_bytes: u64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChecksumResult {
    pub sha256: String,
    pub crc32: String,
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    let out = h.finalize();
    let mut s = String::with_capacity(64);
    for b in out {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn crc32(data: &[u8]) -> String {
    let mut crc: u32 = 0xffffffff;
    for &byte in data {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xedb88320
            } else {
                crc >> 1
            };
        }
    }
    format!("{:08x}", crc ^ 0xffffffff)
}

fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3],
    ])
}

fn find_signature(data: &[u8], sig: &[u8], start: usize) -> Option<usize> {
    if data.len() < sig.len() {
        return None;
    }
    let last = data.len() - sig.len();
    for i in start..=last {
        if &data[i..i + sig.len()] == sig {
            return Some(i);
        }
    }
    None
}

#[derive(Debug, Clone, Copy)]
struct FlashDescriptor {
    region_base: usize,
}

fn parse_flash_descriptor(data: &[u8], offset: usize) -> Option<FlashDescriptor> {
    if offset + 0x20 > data.len() {
        return None;
    }
    let flmap0 = read_u32_le(data, offset + 0x14);
    let region_base = (((flmap0 >> 16) & 0xff) as usize) << 4;
    Some(FlashDescriptor { region_base })
}

fn extract_intel_regions(data: &[u8], fd: FlashDescriptor) -> Vec<BiosRegion> {
    let names = [
        "Flash Descriptor",
        "BIOS",
        "Intel ME",
        "GbE",
        "Platform Data",
    ];
    let mut out = Vec::new();
    for i in 0..5usize {
        let reg_offset = fd.region_base + i * 4;
        if reg_offset + 4 > data.len() {
            break;
        }
        let reg = read_u32_le(data, reg_offset);
        let base = ((reg & 0x1fff) as usize) << 12;
        let limit = ((((reg >> 16) & 0x1fff) as usize) << 12) | 0xfff;
        if limit > base && limit < data.len() {
            out.push(BiosRegion {
                name: names.get(i).copied().unwrap_or("Unknown").to_string(),
                offset: base as u64,
                size: (limit - base + 1) as u64,
                region_type: "intel_fd_region".to_string(),
                description: Some(format!("Intel FD region {i}")),
            });
        }
    }
    out
}

const VENDOR_PATTERNS: &[(&str, &str)] = &[
    ("American Megatrends", "AMI"),
    ("Phoenix Technologies", "Phoenix"),
    ("Award Software", "Award"),
    ("Insyde Corp", "Insyde"),
    ("LENOVO", "Lenovo"),
    ("Dell Inc", "Dell"),
    ("Hewlett-Packard", "HP"),
    ("ASUSTeK", "ASUS"),
    ("Gigabyte", "Gigabyte"),
    ("MSI", "MSI"),
];

fn ascii_view(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len());
    for &b in data {
        if (0x20..=0x7e).contains(&b) {
            out.push(b as char);
        } else {
            out.push(' ');
        }
    }
    out
}

fn detect_vendor(text_lower: &str) -> Option<String> {
    VENDOR_PATTERNS
        .iter()
        .find(|(needle, _)| text_lower.contains(&needle.to_ascii_lowercase()))
        .map(|(_, name)| name.to_string())
}

fn detect_version(text: &str) -> Option<String> {
    // Look for [BIOS|Version|Ver][.: ]+(\d+\.\d+[\w.]*)
    let bytes = text.as_bytes();
    let keys = ["BIOS", "Version", "Ver"];
    for key in &keys {
        let kb = key.as_bytes();
        if let Some(pos) = find_substring_ignore_ascii_case(bytes, kb) {
            let mut i = pos + kb.len();
            while i < bytes.len() && matches!(bytes[i], b'.' | b':' | b' ') {
                i += 1;
            }
            // Consume digits.digits and trailing word chars
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i > start && i < bytes.len() && bytes[i] == b'.' {
                i += 1;
                let dec_start = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                if i > dec_start {
                    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'.')
                    {
                        i += 1;
                    }
                    return Some(String::from_utf8_lossy(&bytes[start..i]).into_owned());
                }
            }
        }
    }
    None
}

fn detect_date(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    // Pattern 1: MM/DD/YYYY
    for start in 0..bytes.len().saturating_sub(10) {
        let s = &bytes[start..start + 10];
        if s[0].is_ascii_digit()
            && s[1].is_ascii_digit()
            && s[2] == b'/'
            && s[3].is_ascii_digit()
            && s[4].is_ascii_digit()
            && s[5] == b'/'
            && s[6].is_ascii_digit()
            && s[7].is_ascii_digit()
            && s[8].is_ascii_digit()
            && s[9].is_ascii_digit()
        {
            return Some(String::from_utf8_lossy(s).into_owned());
        }
        // Pattern 2: YYYY-MM-DD
        if s[0].is_ascii_digit()
            && s[1].is_ascii_digit()
            && s[2].is_ascii_digit()
            && s[3].is_ascii_digit()
            && s[4] == b'-'
            && s[5].is_ascii_digit()
            && s[6].is_ascii_digit()
            && s[7] == b'-'
            && s[8].is_ascii_digit()
            && s[9].is_ascii_digit()
        {
            return Some(String::from_utf8_lossy(s).into_owned());
        }
    }
    None
}

fn find_substring_ignore_ascii_case(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    let last = hay.len() - needle.len();
    'outer: for i in 0..=last {
        for (j, &n) in needle.iter().enumerate() {
            if hay[i + j].to_ascii_lowercase() != n.to_ascii_lowercase() {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

/// Analyze raw firmware bytes (in-memory variant — file variant just wraps it).
pub fn analyze_bytes(data: &[u8]) -> BiosAnalysis {
    let mut regions: Vec<BiosRegion> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut is_uefi = false;

    if let Some(fd_offset) = find_signature(data, INTEL_FD_SIGNATURE, 0) {
        if fd_offset < 0x20 {
            if let Some(fd) = parse_flash_descriptor(data, fd_offset) {
                regions.extend(extract_intel_regions(data, fd));
            }
        }
    }

    let mut offset = 0;
    while offset < data.len().saturating_sub(4) {
        match find_signature(data, UEFI_FV_SIGNATURE, offset) {
            Some(fvh_offset) => {
                is_uefi = true;
                let fv_base_signed = (fvh_offset as i64) - 40;
                if fv_base_signed >= 0 {
                    let fv_base = fv_base_signed as usize;
                    if fv_base + 56 <= data.len() {
                        let fv_length = read_u32_le(data, fv_base + 32) as usize;
                        if fv_length > 0 && fv_length <= data.len() - fv_base {
                            regions.push(BiosRegion {
                                name: "UEFI Firmware Volume".to_string(),
                                offset: fv_base as u64,
                                size: fv_length as u64,
                                region_type: "uefi_fv".to_string(),
                                description: Some(format!("FV at 0x{fv_base:x}")),
                            });
                        }
                    }
                }
                offset = fvh_offset + 4;
            }
            None => break,
        }
    }

    let text = ascii_view(data);
    let text_lower = text.to_ascii_lowercase();
    let bios_vendor = detect_vendor(&text_lower);
    let bios_version = detect_version(&text);
    let build_date = detect_date(&text);

    if data.is_empty() {
        warnings.push("Image is empty (0 bytes)".to_string());
    } else if data.iter().all(|b| *b == 0xff) {
        warnings.push("Image is entirely 0xFF — chip may be blank or erased".to_string());
    } else if data.iter().all(|b| *b == 0x00) {
        warnings.push("Image is entirely 0x00 — read may have failed".to_string());
    } else {
        let ff_count = data.iter().filter(|b| **b == 0xff).count();
        let ff_pct = (ff_count as f64 / data.len() as f64) * 100.0;
        if ff_pct > 90.0 {
            warnings.push(format!(
                "Image is {ff_pct:.1}% empty (0xFF) — may be partially erased"
            ));
        }
    }

    if !is_uefi && regions.is_empty() && data.len() >= 16 {
        let last = &data[data.len() - 16..];
        if last[15] == 0xea {
            regions.push(BiosRegion {
                name: "Legacy BIOS Reset Vector".to_string(),
                offset: (data.len() - 16) as u64,
                size: 16,
                region_type: "legacy_reset".to_string(),
                description: Some("x86 reset vector at FFFF:FFF0".to_string()),
            });
        }
    }

    BiosAnalysis {
        file_size: data.len() as u64,
        checksum: sha256_hex(data),
        regions,
        is_uefi,
        bios_vendor,
        bios_version,
        build_date,
        warnings,
    }
}

/// File-path wrapper for [`analyze_bytes`].
pub fn analyze(path: &Path) -> std::io::Result<BiosAnalysis> {
    let data = fs::read(path)?;
    Ok(analyze_bytes(&data))
}

/// Byte-level diff. Caps `regions` to first 100 hits.
pub fn diff_bytes(a: &[u8], b: &[u8]) -> DiffResult {
    let max_len = a.len().max(b.len());
    let mut regions: Vec<DiffRegion> = Vec::new();
    let mut in_diff = false;
    let mut diff_start: usize = 0;

    for i in 0..max_len {
        let av: i16 = if i < a.len() { a[i] as i16 } else { -1 };
        let bv: i16 = if i < b.len() { b[i] as i16 } else { -1 };
        if av != bv && !in_diff {
            in_diff = true;
            diff_start = i;
        } else if av == bv && in_diff {
            in_diff = false;
            let len = i - diff_start;
            let snippet_a = &a[diff_start..(diff_start + 16).min(i).min(a.len())];
            let snippet_b = &b[diff_start..(diff_start + 16).min(i).min(b.len())];
            regions.push(DiffRegion {
                offset: diff_start as u64,
                length: len as u64,
                old_value: hex(snippet_a),
                new_value: hex(snippet_b),
            });
        }
    }
    if in_diff {
        let snippet_a_end = (diff_start + 16).min(a.len());
        let snippet_b_end = (diff_start + 16).min(b.len());
        let snippet_a = if diff_start < a.len() {
            &a[diff_start..snippet_a_end]
        } else {
            &[]
        };
        let snippet_b = if diff_start < b.len() {
            &b[diff_start..snippet_b_end]
        } else {
            &[]
        };
        regions.push(DiffRegion {
            offset: diff_start as u64,
            length: (max_len - diff_start) as u64,
            old_value: hex(snippet_a),
            new_value: hex(snippet_b),
        });
    }

    DiffResult {
        identical: regions.is_empty() && a.len() == b.len(),
        total_differences: regions.len() as u64,
        size_a: a.len() as u64,
        size_b: b.len() as u64,
        size_mismatch: a.len() != b.len(),
        regions: regions.into_iter().take(100).collect(),
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Extract firmware payload from common wrappers (UEFI Capsule, Intel Flash Image, AMI cap).
/// Returns the inner data and metadata about what was stripped.
pub fn extract_firmware(data: &[u8]) -> (Vec<u8>, ExtractResult) {
    let original_size = data.len() as u64;
    let mut warnings: Vec<String> = Vec::new();

    // UEFI Capsule
    if data.len() >= 28 && &data[0..16] == UEFI_CAPSULE_GUID {
        let capsule_size = read_u32_le(data, 8) as usize;
        let body_offset = read_u32_le(data, 16) as usize;
        if body_offset > 0 && body_offset < data.len() {
            if capsule_size > 0 && capsule_size != data.len() {
                warnings.push(format!(
                    "Capsule header declares size {capsule_size} but file is {} bytes",
                    data.len()
                ));
            }
            return (
                data[body_offset..].to_vec(),
                ExtractResult {
                    format: "UEFI Capsule".to_string(),
                    original_size,
                    stripped_bytes: body_offset as u64,
                    warnings,
                },
            );
        }
    }

    // Intel Flash Image — descriptor signature 5AA5F00F at offset 0x10
    if data.len() > 0x14 && read_u32_le(data, 0x10) == 0x0ff0_a55a {
        let flmap0 = read_u32_le(data, 0x14 + 0x14);
        let region_base = (((flmap0 >> 16) & 0xff) as usize) << 4;
        let bios_reg_offset = region_base + 4; // region 1
        if bios_reg_offset + 4 <= data.len() {
            let reg = read_u32_le(data, bios_reg_offset);
            let base = ((reg & 0x1fff) as usize) << 12;
            let limit = ((((reg >> 16) & 0x1fff) as usize) << 12) | 0xfff;

            let me_reg_offset = region_base + 8;
            if me_reg_offset + 4 <= data.len() {
                let me_reg = read_u32_le(data, me_reg_offset);
                let me_base = ((me_reg & 0x1fff) as usize) << 12;
                let me_limit = ((((me_reg >> 16) & 0x1fff) as usize) << 12) | 0xfff;
                if me_limit > me_base {
                    warnings.push(
                        "Intel ME region detected — this may be locked by the chipset".to_string(),
                    );
                }
            }

            if limit > base && limit < data.len() {
                let bios_data = &data[base..=limit];
                return (
                    bios_data.to_vec(),
                    ExtractResult {
                        format: "Intel Flash Image".to_string(),
                        original_size,
                        stripped_bytes: original_size - bios_data.len() as u64,
                        warnings,
                    },
                );
            }
        }
        warnings
            .push("Intel Flash Descriptor detected but could not parse BIOS region".to_string());
        return (
            data.to_vec(),
            ExtractResult {
                format: "Intel Flash Image".to_string(),
                original_size,
                stripped_bytes: 0,
                warnings,
            },
        );
    }

    // AMI .cap — MZ header + 0x800 envelope
    const AMI_CAP_HEADER_SIZE: usize = 0x800;
    if data.len() > AMI_CAP_HEADER_SIZE && data[0] == 0x4d && data[1] == 0x5a {
        let after = &data[AMI_CAP_HEADER_SIZE..];
        let has_fvh = find_signature(after, UEFI_FV_SIGNATURE, 0).is_some();
        let not_empty = !after.iter().take(64).all(|b| *b == 0xff || *b == 0x00);
        if has_fvh || not_empty {
            return (
                after.to_vec(),
                ExtractResult {
                    format: "AMI BIOS Cap".to_string(),
                    original_size,
                    stripped_bytes: AMI_CAP_HEADER_SIZE as u64,
                    warnings,
                },
            );
        }
    }

    (
        data.to_vec(),
        ExtractResult {
            format: "Raw Binary".to_string(),
            original_size,
            stripped_bytes: 0,
            warnings,
        },
    )
}

pub fn checksums(data: &[u8]) -> ChecksumResult {
    ChecksumResult {
        sha256: sha256_hex(data),
        crc32: crc32(data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic_uefi_image() -> Vec<u8> {
        // Build a minimal UEFI FV header: 40 bytes of zeros, then "_FVH", then size field at +32.
        let mut v = vec![0u8; 4096];
        // FV base at 0, header at offset 40 contains "_FVH" signature.
        v[40..44].copy_from_slice(UEFI_FV_SIGNATURE);
        // FV length at offset 32 (LE u32) — declare 1KB volume.
        let len: u32 = 1024;
        v[32..36].copy_from_slice(&len.to_le_bytes());
        v
    }

    fn legacy_bios_image() -> Vec<u8> {
        // 64KB filled with 0xff except last 16 bytes ending in 0xea (jump opcode).
        let mut v = vec![0xffu8; 64 * 1024];
        v[64 * 1024 - 16..].copy_from_slice(&[
            0xea, 0x5b, 0xe0, 0x00, 0xf0, 0x30, 0x36, 0x2f, 0x32, 0x33, 0x2f, 0x39, 0x39, 0x00,
            0x00, 0xea,
        ]);
        // Embed an AMI vendor string to test vendor detection.
        let needle = b"American Megatrends Inc. v2.18.1216";
        let pos = 1024;
        v[pos..pos + needle.len()].copy_from_slice(needle);
        v
    }

    fn intel_fd_image() -> Vec<u8> {
        // 4MB image with Intel FD signature at offset 0x10, FLMAP0 at 0x14+0x14=0x28
        // pointing region base at 0x40 (flmap0 = 0x00040000 → ((0>>16)&0xff)<<4 = 0).
        // We'll use region_base=0x40 directly: FLMAP0 = (0x04 << 16) so (4<<4)=0x40.
        let mut v = vec![0u8; 4 * 1024 * 1024];
        // Signature at 0x10
        v[0x10..0x14].copy_from_slice(INTEL_FD_SIGNATURE);
        // FLMAP0 at 0x14+0x14 = 0x28; we want region_base = ((flmap0 >> 16) & 0xff) << 4 = 0x40
        // So (flmap0 >> 16) & 0xff = 4 → flmap0 = 0x00040000.
        let flmap0: u32 = 0x0004_0000;
        // analyze_bytes reads flmap0 at sig_offset+0x14 = 0x10+0x14 = 0x24.
        // extract_firmware reads flmap0 at the literal absolute 0x14+0x14 = 0x28.
        // Write at both so either function picks up the same value (mirrors TS quirks).
        v[0x24..0x28].copy_from_slice(&flmap0.to_le_bytes());
        v[0x28..0x2c].copy_from_slice(&flmap0.to_le_bytes());

        // Region descriptors at 0x40:
        //   region 0 (FD):   base=0, limit=0xfff      → reg = (0 & 0x1fff) | ((0 & 0x1fff) << 16) = 0
        //   region 1 (BIOS): base=0x100000, limit=0x1FFFFF (covers 1MB starting at 1MB mark)
        //     base_field = (0x100000 >> 12) = 0x100, limit_field = (0x1FF000 >> 12) = 0x1ff
        let bios_reg: u32 = 0x0100 | (0x01ff << 16);
        v[0x44..0x48].copy_from_slice(&bios_reg.to_le_bytes());
        v
    }

    fn ami_cap_image() -> Vec<u8> {
        // 0x4D 0x5A (MZ), then 0x800 zeros, then UEFI FV at offset 0x800.
        let mut v = vec![0u8; 0x800 + 4096];
        v[0] = 0x4d;
        v[1] = 0x5a;
        // After 0x800, plant a UEFI FV with valid header.
        let off = 0x800;
        v[off + 40..off + 44].copy_from_slice(UEFI_FV_SIGNATURE);
        let len: u32 = 1024;
        v[off + 32..off + 36].copy_from_slice(&len.to_le_bytes());
        v
    }

    #[test]
    fn detects_uefi_firmware_volume() {
        let v = synthetic_uefi_image();
        let a = analyze_bytes(&v);
        assert!(a.is_uefi, "should detect UEFI FV");
        assert!(a.regions.iter().any(|r| r.region_type == "uefi_fv"));
    }

    #[test]
    fn detects_legacy_reset_vector() {
        let v = legacy_bios_image();
        let a = analyze_bytes(&v);
        assert!(!a.is_uefi);
        assert!(a.regions.iter().any(|r| r.region_type == "legacy_reset"));
    }

    #[test]
    fn detects_vendor_ami() {
        let v = legacy_bios_image();
        let a = analyze_bytes(&v);
        assert_eq!(a.bios_vendor.as_deref(), Some("AMI"));
    }

    #[test]
    fn detects_vendor_phoenix() {
        let mut v = vec![0u8; 4096];
        let s = b"Phoenix Technologies Ltd";
        v[100..100 + s.len()].copy_from_slice(s);
        let a = analyze_bytes(&v);
        assert_eq!(a.bios_vendor.as_deref(), Some("Phoenix"));
    }

    #[test]
    fn detects_vendor_award() {
        let mut v = vec![0u8; 4096];
        v[100..114].copy_from_slice(b"Award Software");
        let a = analyze_bytes(&v);
        assert_eq!(a.bios_vendor.as_deref(), Some("Award"));
    }

    #[test]
    fn detects_intel_flash_descriptor_regions() {
        let v = intel_fd_image();
        let a = analyze_bytes(&v);
        assert!(a
            .regions
            .iter()
            .any(|r| r.region_type == "intel_fd_region" && r.name == "BIOS"));
    }

    #[test]
    fn warns_on_all_ff_image() {
        let v = vec![0xffu8; 1024];
        let a = analyze_bytes(&v);
        assert!(a.warnings.iter().any(|w| w.contains("entirely 0xFF")));
    }

    #[test]
    fn warns_on_all_zero_image() {
        let v = vec![0u8; 1024];
        let a = analyze_bytes(&v);
        assert!(a.warnings.iter().any(|w| w.contains("entirely 0x00")));
    }

    #[test]
    fn warns_on_mostly_ff_image() {
        let mut v = vec![0xffu8; 10_000];
        v[100..200].fill(0x42);
        let a = analyze_bytes(&v);
        // 99% ff → should warn at >90%.
        assert!(a.warnings.iter().any(|w| w.contains("empty (0xFF)")));
    }

    #[test]
    fn warns_on_empty_image() {
        let a = analyze_bytes(&[]);
        assert!(a.warnings.iter().any(|w| w.contains("empty")));
    }

    #[test]
    fn detects_version_string() {
        let mut v = vec![0u8; 1024];
        let s = b"BIOS Version 2.34.5678 build";
        v[10..10 + s.len()].copy_from_slice(s);
        let a = analyze_bytes(&v);
        assert!(a.bios_version.is_some());
        assert!(a.bios_version.unwrap().starts_with("2.34"));
    }

    #[test]
    fn detects_date_string() {
        let mut v = vec![0u8; 1024];
        let s = b"Build 06/23/1999";
        v[10..10 + s.len()].copy_from_slice(s);
        let a = analyze_bytes(&v);
        assert_eq!(a.build_date.as_deref(), Some("06/23/1999"));
    }

    #[test]
    fn diff_identical_images() {
        let a = vec![0u8; 1024];
        let b = vec![0u8; 1024];
        let d = diff_bytes(&a, &b);
        assert!(d.identical);
        assert_eq!(d.total_differences, 0);
        assert!(!d.size_mismatch);
    }

    #[test]
    fn diff_detects_single_region() {
        let a = vec![0u8; 1024];
        let mut b = vec![0u8; 1024];
        b[100..110].fill(0xaa);
        let d = diff_bytes(&a, &b);
        assert!(!d.identical);
        assert_eq!(d.total_differences, 1);
        assert_eq!(d.regions[0].offset, 100);
        assert_eq!(d.regions[0].length, 10);
    }

    #[test]
    fn diff_size_mismatch_flagged() {
        let a = vec![0u8; 1024];
        let b = vec![0u8; 512];
        let d = diff_bytes(&a, &b);
        assert!(d.size_mismatch);
    }

    #[test]
    fn extract_uefi_capsule_strips_header() {
        let mut v = vec![0u8; 1024];
        v[0..16].copy_from_slice(UEFI_CAPSULE_GUID);
        // body_offset at offset 16 = 28.
        // capsule_size field overlaps GUID bytes 8..12 (matches TS quirk).
        // Do NOT overwrite GUID bytes — the GUID-equality check would fail.
        v[16..20].copy_from_slice(&28u32.to_le_bytes());
        v[28..1024].fill(0xab);
        let (body, meta) = extract_firmware(&v);
        assert_eq!(meta.format, "UEFI Capsule");
        assert_eq!(meta.stripped_bytes, 28);
        assert_eq!(body.len(), 1024 - 28);
        assert!(body.iter().all(|b| *b == 0xab));
    }

    #[test]
    fn extract_intel_flash_image_returns_bios_region() {
        let v = intel_fd_image();
        let (body, meta) = extract_firmware(&v);
        assert_eq!(meta.format, "Intel Flash Image");
        assert_eq!(body.len(), 0x100000); // 1MB BIOS region from intel_fd_image
    }

    #[test]
    fn extract_ami_cap_strips_0x800_header() {
        let v = ami_cap_image();
        let (body, meta) = extract_firmware(&v);
        assert_eq!(meta.format, "AMI BIOS Cap");
        assert_eq!(meta.stripped_bytes, 0x800);
        assert_eq!(body.len(), 4096);
    }

    #[test]
    fn extract_raw_binary_when_no_known_header() {
        let v = vec![0x42u8; 1024];
        let (body, meta) = extract_firmware(&v);
        assert_eq!(meta.format, "Raw Binary");
        assert_eq!(meta.stripped_bytes, 0);
        assert_eq!(body.len(), 1024);
    }

    #[test]
    fn checksums_match_known_values() {
        let c = checksums(b"hello");
        assert_eq!(
            c.sha256,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
        assert_eq!(c.crc32, "3610a686");
    }

    /// Parity test #1 — synthetic AMI BIOS image with reset vector + vendor string.
    /// Asserts the same fields the TS impl reports.
    #[test]
    fn parity_ami_legacy_image() {
        let v = legacy_bios_image();
        let a = analyze_bytes(&v);
        assert_eq!(a.file_size, 65536);
        assert!(a.regions.iter().any(|r| r.region_type == "legacy_reset"));
        assert_eq!(a.bios_vendor.as_deref(), Some("AMI"));
        assert!(!a.is_uefi);
    }

    /// Parity test #2 — synthetic UEFI image with FV header.
    #[test]
    fn parity_uefi_fv_image() {
        let v = synthetic_uefi_image();
        let a = analyze_bytes(&v);
        assert!(a.is_uefi);
        assert!(a
            .regions
            .iter()
            .find(|r| r.region_type == "uefi_fv")
            .is_some());
        assert_eq!(a.file_size, 4096);
    }

    /// Parity test #3 — synthetic Intel Flash Descriptor image with BIOS region.
    #[test]
    fn parity_intel_fd_image() {
        let v = intel_fd_image();
        let a = analyze_bytes(&v);
        let bios = a
            .regions
            .iter()
            .find(|r| r.name == "BIOS")
            .expect("BIOS region present");
        assert_eq!(bios.region_type, "intel_fd_region");
        assert_eq!(bios.offset, 0x100000);
        assert!(bios.size > 0);
    }
}
