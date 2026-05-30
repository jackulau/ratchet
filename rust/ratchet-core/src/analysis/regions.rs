// Intel Flash Descriptor region listing / extraction / replacement.
// Ports src/analysis/regions.ts.

use serde::{Deserialize, Serialize};

const INTEL_FD_SIG: u32 = 0x0ff0_a55a;
const REGION_NAMES: &[&str] = &["descriptor", "bios", "me", "gbe", "platform"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RegionInfo {
    pub name: String,
    pub offset: u64,
    pub size: u64,
    #[serde(rename = "type")]
    pub region_type: String,
}

fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3],
    ])
}

fn parse_flash_descriptor_regions(data: &[u8]) -> Vec<RegionInfo> {
    if data.len() < 0x20 || read_u32_le(data, 0x10) != INTEL_FD_SIG {
        return vec![];
    }
    let flmap0 = read_u32_le(data, 0x14 + 0x14);
    let region_base = (((flmap0 >> 16) & 0xff) as usize) << 4;
    let mut out = Vec::new();
    for i in 0..5usize {
        let reg_offset = region_base + i * 4;
        if reg_offset + 4 > data.len() {
            break;
        }
        let reg = read_u32_le(data, reg_offset);
        let base = ((reg & 0x1fff) as usize) << 12;
        let limit = ((((reg >> 16) & 0x1fff) as usize) << 12) | 0xfff;
        if limit > base && limit < data.len() {
            out.push(RegionInfo {
                name: REGION_NAMES
                    .get(i)
                    .copied()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("region{i}")),
                offset: base as u64,
                size: (limit - base + 1) as u64,
                region_type: "intel_fd".to_string(),
            });
        }
    }
    out
}

pub fn list_regions(image: &[u8]) -> Vec<RegionInfo> {
    let fd_regions = parse_flash_descriptor_regions(image);
    if !fd_regions.is_empty() {
        return fd_regions;
    }
    vec![RegionInfo {
        name: "bios".to_string(),
        offset: 0,
        size: image.len() as u64,
        region_type: "raw".to_string(),
    }]
}

pub fn extract_region(image: &[u8], region_name: &str) -> Option<(Vec<u8>, RegionInfo)> {
    let regions = list_regions(image);
    let lower = region_name.to_ascii_lowercase();
    let region = regions
        .into_iter()
        .find(|r| r.name.to_ascii_lowercase() == lower)?;
    let start = region.offset as usize;
    let end = start + region.size as usize;
    let end = end.min(image.len());
    Some((image[start..end].to_vec(), region))
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReplaceResult {
    pub data: Vec<u8>,
    pub region: RegionInfo,
    pub warnings: Vec<String>,
}

pub fn replace_region(
    image: &[u8],
    region_name: &str,
    replacement: &[u8],
) -> Option<ReplaceResult> {
    let mut result = image.to_vec();
    let (region, warnings) = replace_region_in_place(&mut result, region_name, replacement)?;
    Some(ReplaceResult {
        data: result,
        region,
        warnings,
    })
}

/// In-place variant of [`replace_region`]: mutates `image` directly instead of
/// cloning the whole buffer per call. Returns the matched region + any warnings,
/// or `None` if the region name is not present.
pub fn replace_region_in_place(
    image: &mut [u8],
    region_name: &str,
    replacement: &[u8],
) -> Option<(RegionInfo, Vec<String>)> {
    let regions = list_regions(image);
    let lower = region_name.to_ascii_lowercase();
    let region = regions
        .into_iter()
        .find(|r| r.name.to_ascii_lowercase() == lower)?;

    let mut warnings: Vec<String> = Vec::new();
    let region_size = region.size as usize;
    let rep_data: Vec<u8> = if replacement.len() != region_size {
        if replacement.len() < region_size {
            warnings.push(format!(
                "Replacement ({} bytes) smaller than region ({} bytes)  -  padding with 0xFF",
                replacement.len(),
                region_size
            ));
            let mut v = vec![0xffu8; region_size];
            v[..replacement.len()].copy_from_slice(replacement);
            v
        } else {
            warnings.push(format!(
                "Replacement ({} bytes) larger than region ({} bytes)  -  truncating",
                replacement.len(),
                region_size
            ));
            replacement[..region_size].to_vec()
        }
    } else {
        replacement.to_vec()
    };

    let start = region.offset as usize;
    let end = (start + region_size).min(image.len());
    let copy_len = end - start;
    image[start..end].copy_from_slice(&rep_data[..copy_len]);
    Some((region, warnings))
}

pub fn rebuild_image(base: &[u8], replacements: &[(String, Vec<u8>)]) -> (Vec<u8>, Vec<String>) {
    let mut warnings: Vec<String> = Vec::new();
    let mut result = base.to_vec();
    for (name, rep) in replacements {
        match replace_region_in_place(&mut result, name, rep) {
            Some((_region, w)) => warnings.extend(w),
            None => warnings.push(format!("Region \"{name}\" not found in image  -  skipped")),
        }
    }
    (result, warnings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::eq_op, clippy::erasing_op, clippy::identity_op)]
    fn intel_fd_image() -> Vec<u8> {
        let mut v = vec![0u8; 4 * 1024 * 1024];
        v[0x10..0x14].copy_from_slice(&INTEL_FD_SIG.to_le_bytes());
        v[0x28..0x2c].copy_from_slice(&0x0004_0000u32.to_le_bytes());
        // region 0 (descriptor): base=0, limit=0  -  fixture keeps `a | (b << 16)` shape for parity with other regions
        let desc_reg: u32 = 0 | (0 << 16);
        v[0x40..0x44].copy_from_slice(&desc_reg.to_le_bytes());
        // region 1 (bios): base=0x100000, limit=0x1fffff
        let bios_reg: u32 = 0x0100 | (0x01ff << 16);
        v[0x44..0x48].copy_from_slice(&bios_reg.to_le_bytes());
        // region 2 (me): base=0x200000, limit=0x2fffff
        let me_reg: u32 = 0x0200 | (0x02ff << 16);
        v[0x48..0x4c].copy_from_slice(&me_reg.to_le_bytes());
        v
    }

    #[test]
    fn list_regions_returns_intel_fd_regions() {
        let v = intel_fd_image();
        let regions = list_regions(&v);
        assert!(regions.iter().any(|r| r.name == "bios"));
        assert!(regions.iter().any(|r| r.name == "me"));
        let bios = regions.iter().find(|r| r.name == "bios").unwrap();
        assert_eq!(bios.offset, 0x100000);
        assert_eq!(bios.size, 0x100000);
    }

    #[test]
    fn list_regions_falls_back_to_raw_bios_for_unknown_image() {
        let v = vec![0xffu8; 1024];
        let regions = list_regions(&v);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].name, "bios");
        assert_eq!(regions[0].region_type, "raw");
    }

    #[test]
    fn extract_region_returns_correct_bytes() {
        let mut v = intel_fd_image();
        v[0x100000..0x100010].copy_from_slice(b"BIOS_REGION_HERE");
        let (data, info) = extract_region(&v, "bios").unwrap();
        assert_eq!(info.offset, 0x100000);
        assert_eq!(&data[..16], b"BIOS_REGION_HERE");
    }

    #[test]
    fn extract_region_case_insensitive() {
        let v = intel_fd_image();
        assert!(extract_region(&v, "BIOS").is_some());
        assert!(extract_region(&v, "Me").is_some());
    }

    #[test]
    fn extract_region_returns_none_for_missing() {
        let v = vec![0xffu8; 1024];
        assert!(extract_region(&v, "me").is_none());
    }

    #[test]
    fn replace_region_pads_smaller_with_ff() {
        let v = intel_fd_image();
        let rep = vec![0xaau8; 100];
        let r = replace_region(&v, "bios", &rep).unwrap();
        assert!(r.warnings.iter().any(|w| w.contains("padding with 0xFF")));
        let bios_data = &r.data[0x100000..0x100000 + 100];
        assert!(bios_data.iter().all(|b| *b == 0xaa));
        assert_eq!(r.data[0x100000 + 100], 0xff);
    }

    #[test]
    fn replace_region_truncates_larger() {
        let v = intel_fd_image();
        let rep = vec![0x42u8; 0x100000 + 1000];
        let r = replace_region(&v, "bios", &rep).unwrap();
        assert!(r.warnings.iter().any(|w| w.contains("truncating")));
        assert_eq!(r.data[0x100000], 0x42);
        // Just past end of BIOS region  -  should be untouched from base image (0x00).
        assert_eq!(r.data[0x100000 + 0x100000], 0x00);
    }

    #[test]
    fn rebuild_image_applies_multiple_replacements() {
        let v = intel_fd_image();
        let reps = vec![
            ("bios".to_string(), vec![0x11u8; 0x100000]),
            ("me".to_string(), vec![0x22u8; 0x100000]),
        ];
        let (out, warnings) = rebuild_image(&v, &reps);
        assert_eq!(out[0x100000], 0x11);
        assert_eq!(out[0x200000], 0x22);
        assert!(warnings.is_empty(), "no warnings expected");
    }

    #[test]
    fn rebuild_image_warns_on_missing_region() {
        let v = vec![0xffu8; 1024]; // no FD → only "bios" region
        let reps = vec![("me".to_string(), vec![0u8; 1024])];
        let (_, warnings) = rebuild_image(&v, &reps);
        assert!(warnings.iter().any(|w| w.contains("not found")));
    }
}
