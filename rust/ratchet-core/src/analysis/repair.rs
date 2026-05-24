// Repair: reference-based region replacement, NVRAM reset, reset-vector patch, auto-repair.
// Ports src/analysis/repair.ts.

use crate::analysis::nvram::{find_nvram_store, parse_nvram_store, NvramVarState};
use crate::analysis::regions::{extract_region, list_regions, replace_region, RegionInfo};
use sha2::{Digest, Sha256};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RegionDiff {
    pub name: String,
    pub offset: u64,
    pub size: u64,
    #[serde(rename = "inputChecksum")]
    pub input_checksum: String,
    #[serde(rename = "outputChecksum")]
    pub output_checksum: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepairReport {
    pub actions: Vec<String>,
    #[serde(rename = "totalBytesChanged")]
    pub total_bytes_changed: u64,
    #[serde(rename = "inputChecksum")]
    pub input_checksum: String,
    #[serde(rename = "outputChecksum")]
    pub output_checksum: String,
    pub regions: Vec<RegionDiff>,
    pub warnings: Vec<String>,
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

fn region_checksum(image: &[u8], region: &RegionInfo) -> String {
    let start = region.offset as usize;
    let end = (start + region.size as usize).min(image.len());
    sha256_hex(&image[start..end])
}

pub fn generate_repair_report(input: &[u8], output: &[u8], actions: Vec<String>) -> RepairReport {
    let input_regions = list_regions(input);
    let output_regions = list_regions(output);
    let regions_to_compare = if input_regions.len() >= output_regions.len() {
        input_regions
    } else {
        output_regions
    };

    let mut regions: Vec<RegionDiff> = Vec::new();
    let mut total_bytes_changed: u64 = 0;

    for region in regions_to_compare {
        let in_chk = if region.offset as usize + region.size as usize <= input.len() {
            region_checksum(input, &region)
        } else {
            "N/A".to_string()
        };
        let out_chk = if region.offset as usize + region.size as usize <= output.len() {
            region_checksum(output, &region)
        } else {
            "N/A".to_string()
        };
        let changed = in_chk != out_chk;
        if changed {
            let start = region.offset as usize;
            let end = (start + region.size as usize)
                .min(input.len())
                .min(output.len());
            for i in start..end {
                if input[i] != output[i] {
                    total_bytes_changed += 1;
                }
            }
        }
        regions.push(RegionDiff {
            name: region.name,
            offset: region.offset,
            size: region.size,
            input_checksum: in_chk,
            output_checksum: out_chk,
            changed,
        });
    }

    RepairReport {
        actions,
        total_bytes_changed,
        input_checksum: sha256_hex(input),
        output_checksum: sha256_hex(output),
        regions,
        warnings: vec![],
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RepairResult {
    pub repaired: Vec<u8>,
    pub report: RepairReport,
}

pub fn repair_from_reference(broken: &[u8], reference: &[u8]) -> RepairResult {
    let mut warnings: Vec<String> = Vec::new();
    let mut actions: Vec<String> = Vec::new();
    if broken.len() != reference.len() {
        warnings.push(format!(
            "Size mismatch: broken={}, reference={}",
            broken.len(),
            reference.len()
        ));
    }

    let broken_regions = list_regions(broken);

    // Non-Intel-FD: full replacement.
    if broken_regions.len() == 1 && broken_regions[0].region_type == "raw" {
        actions.push("Full image replacement (no Intel Flash Descriptor)".to_string());
        warnings.push("No Intel FD  -  replaced entire image from reference".to_string());
        let repaired: Vec<u8> = if reference.len() == broken.len() {
            reference.to_vec()
        } else if reference.len() < broken.len() {
            let mut v = vec![0xffu8; broken.len()];
            v[..reference.len()].copy_from_slice(reference);
            v
        } else {
            reference[..broken.len()].to_vec()
        };
        let mut report = generate_repair_report(broken, &repaired, actions);
        report.warnings = warnings;
        return RepairResult { repaired, report };
    }

    // Intel FD: per-region comparison + replacement.
    let mut repaired: Vec<u8> = broken.to_vec();
    for region in broken_regions {
        let bdata = match extract_region(broken, &region.name) {
            Some(x) => x,
            None => continue,
        };
        let rdata = match extract_region(reference, &region.name) {
            Some(x) => x,
            None => continue,
        };
        let bchk = sha256_hex(&bdata.0);
        let rchk = sha256_hex(&rdata.0);
        if bchk != rchk {
            actions.push(format!(
                "Replaced region \"{}\" from reference",
                region.name
            ));
            if let Some(result) = replace_region(&repaired, &region.name, &rdata.0) {
                repaired = result.data;
                warnings.extend(result.warnings);
            }
        }
    }

    if actions.is_empty() {
        actions.push("No corrupted regions found  -  image matches reference".to_string());
    }
    let mut report = generate_repair_report(broken, &repaired, actions);
    report.warnings = warnings;
    RepairResult { repaired, report }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NvramResetResult {
    pub repaired: Vec<u8>,
    pub report: RepairReport,
    pub store_offset: u64,
    pub store_size: u64,
}

pub fn reset_nvram(image: &[u8]) -> Result<NvramResetResult, &'static str> {
    let store_offset = find_nvram_store(image).ok_or("No NVRAM variable store found in image")?;
    let store = parse_nvram_store(image, Some(store_offset));
    let store_size = if store.size > 0 {
        store.size as usize
    } else {
        0
    };

    let mut repaired = image.to_vec();
    const VSS_HEADER_SIZE: usize = 28;
    let clear_start = store_offset + VSS_HEADER_SIZE;
    let clear_end = store_offset + store_size;
    let bytes_cleared = if clear_end > clear_start && clear_end <= repaired.len() {
        repaired[clear_start..clear_end].fill(0xff);
        clear_end - clear_start
    } else {
        0
    };
    let actions = vec![format!(
        "NVRAM reset: cleared {bytes_cleared} bytes of variable data at offset 0x{store_offset:x}"
    )];
    let report = generate_repair_report(image, &repaired, actions);
    Ok(NvramResetResult {
        repaired,
        report,
        store_offset: store_offset as u64,
        store_size: store_size as u64,
    })
}

pub fn repair_reset_vector(image: &[u8]) -> RepairResult {
    if image.len() < 16 {
        return RepairResult {
            repaired: image.to_vec(),
            report: generate_repair_report(
                image,
                image,
                vec!["Image too small for reset vector repair".to_string()],
            ),
        };
    }
    let reset_offset = image.len() - 16;
    let reset_area = &image[reset_offset..];
    let is_zeroed = reset_area.iter().all(|b| *b == 0x00);
    if !is_zeroed {
        return RepairResult {
            repaired: image.to_vec(),
            report: generate_repair_report(
                image,
                image,
                vec!["Reset vector already valid  -  no repair needed".to_string()],
            ),
        };
    }
    let mut repaired = image.to_vec();
    repaired[reset_offset] = 0xea;
    repaired[reset_offset + 1] = 0xf0;
    repaired[reset_offset + 2] = 0xff;
    repaired[reset_offset + 3] = 0x00;
    repaired[reset_offset + 4] = 0xf0;
    for i in 5..16 {
        repaired[reset_offset + i] = 0x90;
    }
    let actions =
        vec!["Patched zeroed reset vector with standard x86 far jump (EA F0 FF 00 F0)".to_string()];
    let report = generate_repair_report(image, &repaired, actions);
    RepairResult { repaired, report }
}

/// Auto-repair runs all applicable repairs in sequence (reset vector, NVRAM).
pub fn repair_auto(image: &[u8]) -> RepairResult {
    let mut actions: Vec<String> = Vec::new();
    let mut current: Vec<u8> = image.to_vec();

    // Fix 1: Reset vector.
    if image.len() >= 16 {
        let reset_area = &image[image.len() - 16..];
        if reset_area.iter().all(|b| *b == 0x00) {
            let r = repair_reset_vector(&current);
            current = r.repaired;
            actions.extend(r.report.actions);
        }
    }

    // Fix 2: NVRAM with too many deletes.
    let store = parse_nvram_store(&current, None);
    if store.found && !store.variables.is_empty() && {
        let deleted = store.deleted_count as f64;
        let total = store.variables.len() as f64;
        deleted / total > 0.5
    } {
        if let Ok(r) = reset_nvram(&current) {
            current = r.repaired;
            actions.extend(r.report.actions);
        }
    }

    if actions.is_empty() {
        actions.push("No repairs needed  -  image appears healthy".to_string());
    }
    let report = generate_repair_report(image, &current, actions);
    let _ = NvramVarState::Valid; // silence unused-import lint when feature gates change
    RepairResult {
        repaired: current,
        report,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_identical_images_no_changes() {
        let a = vec![0u8; 1024];
        let b = a.clone();
        let report = generate_repair_report(&a, &b, vec![]);
        assert_eq!(report.total_bytes_changed, 0);
        assert_eq!(report.input_checksum, report.output_checksum);
    }

    #[test]
    fn report_detects_byte_changes() {
        let a = vec![0u8; 1024];
        let mut b = a.clone();
        b[100..110].fill(0xaa);
        let report = generate_repair_report(&a, &b, vec!["test".to_string()]);
        assert_eq!(report.total_bytes_changed, 10);
        assert_ne!(report.input_checksum, report.output_checksum);
    }

    #[test]
    fn repair_from_reference_replaces_full_raw_image() {
        let broken = vec![0u8; 1024];
        let reference = vec![0xabu8; 1024];
        let result = repair_from_reference(&broken, &reference);
        assert_eq!(result.repaired, reference);
        assert!(result
            .report
            .actions
            .iter()
            .any(|a| a.contains("Full image replacement")));
    }

    #[test]
    fn repair_from_reference_pads_when_reference_smaller() {
        let broken = vec![0u8; 1024];
        let reference = vec![0xabu8; 512];
        let result = repair_from_reference(&broken, &reference);
        assert_eq!(result.repaired.len(), 1024);
        assert!(result.repaired[..512].iter().all(|b| *b == 0xab));
        assert!(result.repaired[512..].iter().all(|b| *b == 0xff));
    }

    #[test]
    fn repair_reset_vector_patches_zeroed_area() {
        let mut img = vec![0x55u8; 64 * 1024];
        img[64 * 1024 - 16..].fill(0x00);
        let r = repair_reset_vector(&img);
        let off = img.len() - 16;
        assert_eq!(r.repaired[off], 0xea);
        assert_eq!(r.repaired[off + 4], 0xf0);
        // Rest filled with NOPs.
        assert_eq!(r.repaired[off + 5], 0x90);
        assert!(r
            .report
            .actions
            .iter()
            .any(|a| a.contains("Patched zeroed reset vector")));
    }

    #[test]
    fn repair_reset_vector_no_op_when_already_valid() {
        let mut img = vec![0x55u8; 64 * 1024];
        img[64 * 1024 - 1] = 0xea;
        let r = repair_reset_vector(&img);
        assert_eq!(r.repaired, img);
        assert!(r.report.actions.iter().any(|a| a.contains("already valid")));
    }

    #[test]
    fn repair_reset_vector_too_small() {
        let img = vec![0xffu8; 8];
        let r = repair_reset_vector(&img);
        assert!(r.report.actions.iter().any(|a| a.contains("too small")));
    }

    #[test]
    fn reset_nvram_fails_when_no_store() {
        let img = vec![0x55u8; 1024];
        assert!(reset_nvram(&img).is_err());
    }

    #[test]
    fn auto_repair_runs_reset_vector_fix() {
        let mut img = vec![0x55u8; 64 * 1024];
        img[64 * 1024 - 16..].fill(0x00);
        let r = repair_auto(&img);
        assert!(r
            .report
            .actions
            .iter()
            .any(|a| a.contains("Patched zeroed reset vector")));
    }

    #[test]
    fn auto_repair_noop_when_healthy() {
        let mut img = vec![0x55u8; 64 * 1024];
        img[64 * 1024 - 1] = 0xea; // valid reset vector
        let r = repair_auto(&img);
        assert!(r
            .report
            .actions
            .iter()
            .any(|a| a.contains("No repairs needed")));
    }
}
