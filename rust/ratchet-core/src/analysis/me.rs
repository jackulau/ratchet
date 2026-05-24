// Intel ME region parser. $FPT signature → partitions, $MN2 → version.
// Ports src/analysis/me.ts.

use serde::{Deserialize, Serialize};

const FPT_SIGNATURE: &[u8] = b"$FPT";
const MN2_SIGNATURE: u32 = 0x324e_4d24; // "$MN2"

const FPT_NAMES: &[(&str, &str)] = &[
    ("FTPR", "Fault Tolerant Partition"),
    ("NFTP", "Non-Fault Tolerant Partition"),
    ("MFS", "ME File System"),
    ("DLMP", "Download Manifest"),
    ("PSVN", "Platform Security Version Number"),
    ("IVBP", "Independent Validation Boot Partition"),
    ("UTOK", "Unlock Token"),
    ("ISHC", "ISH Main"),
    ("OEMP", "OEM Data"),
    ("FITC", "Flash Image Tool Configuration"),
    ("WCOD", "Wireless Microcode"),
    ("LOCL", "Locality Manifest"),
    ("FLOG", "Flash Log"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MeState {
    Normal,
    Disabled,
    Corrupted,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MePartition {
    pub name: String,
    pub offset: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntelMeInfo {
    pub found: bool,
    pub version: String,
    pub state: MeState,
    #[serde(rename = "regionOffset")]
    pub region_offset: u64,
    #[serde(rename = "regionSize")]
    pub region_size: u64,
    pub partitions: Vec<MePartition>,
    pub warnings: Vec<String>,
}

fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3],
    ])
}

fn read_u16_le(buf: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([buf[offset], buf[offset + 1]])
}

fn fpt_full_name(short: &str) -> String {
    FPT_NAMES
        .iter()
        .find(|(k, _)| *k == short)
        .map(|(_, long)| format!("{short} ({long})"))
        .unwrap_or_else(|| short.to_string())
}

pub fn parse_me_region(data: &[u8], region_offset: u64) -> IntelMeInfo {
    let mut warnings: Vec<String> = Vec::new();
    let mut partitions: Vec<MePartition> = Vec::new();
    let mut version = "unknown".to_string();

    // Find $FPT in first 256 bytes.
    let search_end = data.len().saturating_sub(4).min(0x100);
    let mut fpt_offset: Option<usize> = None;
    for i in 0..search_end {
        if &data[i..i + 4] == FPT_SIGNATURE {
            fpt_offset = Some(i);
            break;
        }
    }

    let fpt_offset = match fpt_offset {
        Some(o) => o,
        None => {
            let sample_end = 256.min(data.len());
            let sample = &data[..sample_end];
            if sample.iter().all(|b| *b == 0xff) {
                return IntelMeInfo {
                    found: false,
                    version: "none".to_string(),
                    state: MeState::Disabled,
                    region_offset,
                    region_size: data.len() as u64,
                    partitions: vec![],
                    warnings: vec![
                        "ME region is blank (all 0xFF) — ME disabled or not present".to_string()
                    ],
                };
            }
            if sample.iter().all(|b| *b == 0x00) {
                return IntelMeInfo {
                    found: false,
                    version: "none".to_string(),
                    state: MeState::Corrupted,
                    region_offset,
                    region_size: data.len() as u64,
                    partitions: vec![],
                    warnings: vec![
                        "ME region is all zeros — likely erased or corrupted".to_string()
                    ],
                };
            }
            return IntelMeInfo {
                found: false,
                version: "none".to_string(),
                state: MeState::Unknown,
                region_offset,
                region_size: data.len() as u64,
                partitions: vec![],
                warnings: vec!["No $FPT signature found in ME region".to_string()],
            };
        }
    };

    if fpt_offset + 32 > data.len() {
        return IntelMeInfo {
            found: true,
            version,
            state: MeState::Corrupted,
            region_offset,
            region_size: data.len() as u64,
            partitions: vec![],
            warnings: vec!["$FPT header truncated".to_string()],
        };
    }

    let num_entries = read_u32_le(data, fpt_offset + 4);
    if num_entries > 32 {
        warnings.push(format!(
            "Unusual FPT entry count: {num_entries} — may be corrupted"
        ));
    }

    let entry_size = 32;
    let entries_start = fpt_offset + 32;
    let safe_entries = num_entries.min(32) as usize;

    for i in 0..safe_entries {
        let entry_offset = entries_start + i * entry_size;
        if entry_offset + entry_size > data.len() {
            break;
        }
        let name_bytes = &data[entry_offset..entry_offset + 4];
        let name: String = name_bytes
            .iter()
            .copied()
            .filter(|b| *b != 0)
            .map(|b| b as char)
            .collect();
        let part_offset = read_u32_le(data, entry_offset + 8);
        let part_size = read_u32_le(data, entry_offset + 12);

        if part_size > 0 && (part_size as usize) < data.len() {
            partitions.push(MePartition {
                name: fpt_full_name(&name),
                offset: u64::from(part_offset),
                size: u64::from(part_size),
            });
        }
    }

    // Extract version from FTPR via $MN2.
    if let Some(ftpr) = partitions.iter().find(|p| p.name.starts_with("FTPR")) {
        let ftpr_start = ftpr.offset as usize;
        let ftpr_end = (ftpr_start + ftpr.size as usize).min(data.len());
        if ftpr_end > 4 {
            for i in ftpr_start..ftpr_end - 4 {
                if read_u32_le(data, i) == MN2_SIGNATURE && i + 0x20 < data.len() {
                    let major = read_u16_le(data, i + 0x18);
                    let minor = read_u16_le(data, i + 0x1a);
                    let hotfix = read_u16_le(data, i + 0x1c);
                    let build = read_u16_le(data, i + 0x1e);
                    if major > 0 && major < 50 {
                        version = format!("{major}.{minor}.{hotfix}.{build}");
                    }
                    break;
                }
            }
        }
    }

    if version == "unknown" {
        warnings
            .push("Could not extract ME firmware version — $MN2 manifest not found".to_string());
    }

    IntelMeInfo {
        found: true,
        version,
        state: MeState::Normal,
        region_offset,
        region_size: data.len() as u64,
        partitions,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn me_image_with_fpt(partitions: &[(&str, u32, u32)]) -> Vec<u8> {
        let mut v = vec![0xaau8; 64 * 1024];
        // Place $FPT at offset 0x10
        let fpt = 0x10usize;
        v[fpt..fpt + 4].copy_from_slice(FPT_SIGNATURE);
        v[fpt + 4..fpt + 8].copy_from_slice(&(partitions.len() as u32).to_le_bytes());
        // Entry block starts at fpt + 32
        let entries_start = fpt + 32;
        for (i, (name, offset, size)) in partitions.iter().enumerate() {
            let entry = entries_start + i * 32;
            let nb = name.as_bytes();
            let n = nb.len().min(4);
            v[entry..entry + n].copy_from_slice(&nb[..n]);
            v[entry + 8..entry + 12].copy_from_slice(&offset.to_le_bytes());
            v[entry + 12..entry + 16].copy_from_slice(&size.to_le_bytes());
        }
        v
    }

    #[test]
    fn detects_blank_me_region_as_disabled() {
        let v = vec![0xffu8; 4096];
        let info = parse_me_region(&v, 0);
        assert_eq!(info.state, MeState::Disabled);
        assert!(!info.found);
        assert!(info.warnings.iter().any(|w| w.contains("blank")));
    }

    #[test]
    fn detects_zero_me_region_as_corrupted() {
        let v = vec![0u8; 4096];
        let info = parse_me_region(&v, 0);
        assert_eq!(info.state, MeState::Corrupted);
    }

    #[test]
    fn no_fpt_returns_unknown() {
        let mut v = vec![0xaau8; 4096];
        v[1000..1004].copy_from_slice(b"junk");
        let info = parse_me_region(&v, 0);
        assert_eq!(info.state, MeState::Unknown);
    }

    #[test]
    fn parses_fpt_partitions() {
        let v = me_image_with_fpt(&[("FTPR", 0x1000, 0x1000), ("MFS", 0x2000, 0x500)]);
        let info = parse_me_region(&v, 0);
        assert!(info.found);
        assert_eq!(info.state, MeState::Normal);
        assert_eq!(info.partitions.len(), 2);
        assert!(info.partitions[0].name.starts_with("FTPR"));
        assert!(info.partitions[1].name.starts_with("MFS"));
        assert_eq!(info.partitions[0].offset, 0x1000);
    }

    #[test]
    fn extracts_version_from_mn2_manifest() {
        let mut v = me_image_with_fpt(&[("FTPR", 0x1000, 0x1000)]);
        // Embed $MN2 inside the FTPR partition at 0x1000 + 0x10.
        let mn2_at = 0x1000 + 0x10;
        v[mn2_at..mn2_at + 4].copy_from_slice(&MN2_SIGNATURE.to_le_bytes());
        // Version at mn2 + 0x18: major=11, minor=8, hotfix=70, build=3402
        v[mn2_at + 0x18..mn2_at + 0x1a].copy_from_slice(&11u16.to_le_bytes());
        v[mn2_at + 0x1a..mn2_at + 0x1c].copy_from_slice(&8u16.to_le_bytes());
        v[mn2_at + 0x1c..mn2_at + 0x1e].copy_from_slice(&70u16.to_le_bytes());
        v[mn2_at + 0x1e..mn2_at + 0x20].copy_from_slice(&3402u16.to_le_bytes());
        let info = parse_me_region(&v, 0);
        assert_eq!(info.version, "11.8.70.3402");
    }

    #[test]
    fn warns_on_unusual_entry_count() {
        let mut v = me_image_with_fpt(&[("FTPR", 0x1000, 0x1000)]);
        // Override num_entries to a weird value (33 > 32 limit).
        v[0x10 + 4..0x10 + 8].copy_from_slice(&33u32.to_le_bytes());
        let info = parse_me_region(&v, 0);
        assert!(info.warnings.iter().any(|w| w.contains("Unusual FPT")));
    }
}
