// BIOS health checks + recovery suggestions.
// Ports src/analysis/recovery.ts.

use crate::analysis::me::{parse_me_region, MeState};
use crate::analysis::nvram::{parse_nvram_store, NvramVarState};
use crate::analysis::regions::{extract_region, list_regions};
use crate::analysis::uefi::scan_firmware_volumes;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const INTEL_FD_SIG: u32 = 0x0ff0_a55a;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HealthCheck {
    pub name: String,
    pub status: CheckStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecoveryStep {
    pub order: u32,
    pub action: String,
    pub command: String,
    pub risk: Risk,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiosHealthReport {
    pub checks: Vec<HealthCheck>,
    #[serde(rename = "overallStatus")]
    pub overall_status: CheckStatus,
    #[serde(rename = "recoverySteps")]
    pub recovery_steps: Vec<RecoveryStep>,
}

fn read_u32_le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

pub fn analyze_bios_health_from_buffer(data: &[u8]) -> BiosHealthReport {
    let mut checks: Vec<HealthCheck> = Vec::new();

    // Check 1: File size
    let valid_sizes: &[usize] = &[
        256 * 1024,
        512 * 1024,
        1024 * 1024,
        2 * 1024 * 1024,
        4 * 1024 * 1024,
        8 * 1024 * 1024,
        16 * 1024 * 1024,
        32 * 1024 * 1024,
        64 * 1024 * 1024,
        128 * 1024 * 1024,
    ];
    let is_pow2 = valid_sizes.contains(&data.len());
    checks.push(HealthCheck {
        name: "File size".to_string(),
        status: if is_pow2 {
            CheckStatus::Pass
        } else {
            CheckStatus::Warn
        },
        detail: if is_pow2 {
            format!(
                "{:.1} MB  -  valid flash chip size",
                data.len() as f64 / 1024.0 / 1024.0
            )
        } else {
            format!(
                "{} bytes  -  not a standard flash chip size (may be a partial dump or capsule)",
                data.len()
            )
        },
    });

    // Check 2: Content
    let all_ff = data.iter().all(|b| *b == 0xff);
    let all_zero = data.iter().all(|b| *b == 0x00);
    if all_ff {
        checks.push(HealthCheck {
            name: "Content check".to_string(),
            status: CheckStatus::Fail,
            detail: "Image is entirely 0xFF  -  blank/erased chip".to_string(),
        });
    } else if all_zero {
        checks.push(HealthCheck {
            name: "Content check".to_string(),
            status: CheckStatus::Fail,
            detail: "Image is entirely 0x00  -  failed read or dead chip".to_string(),
        });
    } else {
        let ff_count = data.iter().filter(|b| **b == 0xff).count();
        let ff_pct = (ff_count as f64 / data.len() as f64) * 100.0;
        if ff_pct > 95.0 {
            checks.push(HealthCheck {
                name: "Content check".to_string(),
                status: CheckStatus::Warn,
                detail: format!("{ff_pct:.1}% empty (0xFF)  -  partially erased or minimal firmware"),
            });
        } else {
            checks.push(HealthCheck {
                name: "Content check".to_string(),
                status: CheckStatus::Pass,
                detail: format!("{ff_pct:.1}% empty space  -  normal"),
            });
        }
    }

    // Check 3: Intel FD
    let has_intel_fd = data.len() > 0x14 && read_u32_le(data, 0x10) == INTEL_FD_SIG;
    if has_intel_fd {
        let regions = list_regions(data);
        let names: Vec<String> = regions.iter().map(|r| r.name.clone()).collect();
        checks.push(HealthCheck {
            name: "Intel Flash Descriptor".to_string(),
            status: CheckStatus::Pass,
            detail: format!(
                "Valid descriptor found  -  {} regions: {}",
                regions.len(),
                names.join(", ")
            ),
        });
        for region in &regions {
            if region.offset as usize + region.size as usize > data.len() {
                checks.push(HealthCheck {
                    name: format!("Region: {}", region.name),
                    status: CheckStatus::Fail,
                    detail: format!(
                        "Region extends beyond image boundary (offset 0x{:x} + 0x{:x} > 0x{:x})",
                        region.offset,
                        region.size,
                        data.len()
                    ),
                });
            }
        }
    } else {
        checks.push(HealthCheck {
            name: "Intel Flash Descriptor".to_string(),
            status: CheckStatus::Warn,
            detail: "No Intel Flash Descriptor  -  raw BIOS image or non-Intel platform".to_string(),
        });
    }

    // Check 4: UEFI volumes
    let fvs = scan_firmware_volumes(data);
    if !fvs.is_empty() {
        let total_files: usize = fvs.iter().map(|fv| fv.files.len()).sum();
        let mut phases: Vec<String> = fvs.iter().map(|fv| fv.phase.clone()).collect();
        phases.sort();
        phases.dedup();
        checks.push(HealthCheck {
            name: "UEFI Firmware Volumes".to_string(),
            status: CheckStatus::Pass,
            detail: format!(
                "{} volumes found, {} FFS files, phases: {}",
                fvs.len(),
                total_files,
                phases.join(", ")
            ),
        });
        let has_pei = fvs.iter().any(|fv| fv.phase == "PEI");
        let has_dxe = fvs.iter().any(|fv| fv.phase == "DXE");
        if !has_pei {
            checks.push(HealthCheck {
                name: "PEI phase".to_string(),
                status: CheckStatus::Warn,
                detail: "No PEI firmware volume detected  -  may be compressed or nested".to_string(),
            });
        }
        if !has_dxe {
            checks.push(HealthCheck {
                name: "DXE phase".to_string(),
                status: CheckStatus::Warn,
                detail: "No DXE firmware volume detected  -  may be compressed or nested".to_string(),
            });
        }
    } else if data.len() >= 16 && data[data.len() - 1] == 0xea {
        checks.push(HealthCheck {
            name: "Legacy BIOS".to_string(),
            status: CheckStatus::Pass,
            detail: "Legacy BIOS reset vector found at FFFF:FFF0".to_string(),
        });
    } else {
        checks.push(HealthCheck {
            name: "UEFI Firmware Volumes".to_string(),
            status: CheckStatus::Fail,
            detail: "No UEFI firmware volumes found  -  image may be corrupt, truncated, or not a BIOS image".to_string(),
        });
    }

    // Check 5: ME (only if Intel FD present)
    if has_intel_fd {
        if let Some((me_data, region)) = extract_region(data, "me") {
            let me = parse_me_region(&me_data, region.offset);
            if me.found {
                checks.push(HealthCheck {
                    name: "Intel ME".to_string(),
                    status: match me.state {
                        MeState::Normal => CheckStatus::Pass,
                        MeState::Corrupted => CheckStatus::Fail,
                        _ => CheckStatus::Warn,
                    },
                    detail: format!(
                        "ME {}  -  state: {:?}, {} partitions",
                        me.version,
                        me.state,
                        me.partitions.len()
                    ),
                });
            } else {
                checks.push(HealthCheck {
                    name: "Intel ME".to_string(),
                    status: if me.state == MeState::Disabled {
                        CheckStatus::Warn
                    } else {
                        CheckStatus::Fail
                    },
                    detail: me
                        .warnings
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "ME region issue".to_string()),
                });
            }
        }
    }

    // Check 6: NVRAM
    let nvram = parse_nvram_store(data, None);
    if nvram.found {
        let valid_count = nvram
            .variables
            .iter()
            .filter(|v| v.state == NvramVarState::Valid)
            .count();
        checks.push(HealthCheck {
            name: "NVRAM Store".to_string(),
            status: if !nvram.warnings.is_empty() {
                CheckStatus::Warn
            } else {
                CheckStatus::Pass
            },
            detail: format!(
                "{valid_count} valid variables, {} deleted, {:.1} KB free",
                nvram.deleted_count,
                nvram.free_size as f64 / 1024.0
            ),
        });
    } else {
        checks.push(HealthCheck {
            name: "NVRAM Store".to_string(),
            status: CheckStatus::Warn,
            detail: "No NVRAM variable store found  -  may be in a compressed volume".to_string(),
        });
    }

    // Check 7: Reset vector (only for 1MB+ images)
    if data.len() >= 1024 * 1024 {
        let rv = &data[data.len() - 16..];
        let has_valid = rv[15] == 0xea || (rv[14] == 0x90 && rv[15] == 0x90);
        checks.push(HealthCheck {
            name: "Reset vector".to_string(),
            status: if has_valid {
                CheckStatus::Pass
            } else {
                CheckStatus::Warn
            },
            detail: if has_valid {
                "Valid x86 reset vector at end of image".to_string()
            } else {
                "No standard reset vector  -  may use UEFI SEC entry point instead".to_string()
            },
        });
    }

    let has_fail = checks.iter().any(|c| c.status == CheckStatus::Fail);
    let has_warn = checks.iter().any(|c| c.status == CheckStatus::Warn);
    let overall = if has_fail {
        CheckStatus::Fail
    } else if has_warn {
        CheckStatus::Warn
    } else {
        CheckStatus::Pass
    };

    let recovery_steps = suggest_recovery_strategy(&checks);

    BiosHealthReport {
        checks,
        overall_status: overall,
        recovery_steps,
    }
}

pub fn analyze_bios_health(path: &Path) -> std::io::Result<BiosHealthReport> {
    let data = fs::read(path)?;
    Ok(analyze_bios_health_from_buffer(&data))
}

fn suggest_recovery_strategy(checks: &[HealthCheck]) -> Vec<RecoveryStep> {
    let mut steps: Vec<RecoveryStep> = Vec::new();
    let mut order: u32 = 1;

    let fails: Vec<&HealthCheck> = checks
        .iter()
        .filter(|c| c.status == CheckStatus::Fail)
        .collect();

    if fails.iter().any(|c| c.name == "Content check") {
        steps.push(RecoveryStep {
            order,
            action:
                "Image appears blank or all-zero  -  re-read the chip with better SOIC clip contact"
                    .to_string(),
            command: "ratchet read new_dump.bin --safe".to_string(),
            risk: Risk::Low,
        });
        return steps;
    }

    if fails.iter().any(|c| c.name == "UEFI Firmware Volumes") {
        steps.push(RecoveryStep {
            order,
            action: "No valid firmware found  -  obtain correct BIOS from manufacturer and reflash"
                .to_string(),
            command: "ratchet write correct_bios.bin".to_string(),
            risk: Risk::Medium,
        });
        order += 1;
    }

    if fails.iter().any(|c| c.name.starts_with("Region:")) {
        steps.push(RecoveryStep {
            order,
            action:
                "Region boundary error  -  image may be truncated. Re-read chip and verify full size"
                    .to_string(),
            command: "ratchet read full_dump.bin && ratchet analyze full_dump.bin".to_string(),
            risk: Risk::Low,
        });
        order += 1;
    }

    if checks
        .iter()
        .any(|c| c.name == "Intel ME" && c.status == CheckStatus::Fail)
    {
        steps.push(RecoveryStep {
            order,
            action: "ME region corrupted  -  extract ME region from a donor image (same board model) and replace".to_string(),
            command: "ratchet region-extract donor.bin me --output donor_me.bin && ratchet region-replace corrupt.bin me donor_me.bin --output fixed.bin".to_string(),
            risk: Risk::Medium,
        });
        order += 1;
    }

    if let Some(nv) = checks
        .iter()
        .find(|c| c.name == "NVRAM Store" && c.status == CheckStatus::Warn)
    {
        if nv.detail.contains("deleted") {
            steps.push(RecoveryStep {
                order,
                action: "NVRAM has many deleted variables  -  clear CMOS or reflash to rebuild NVRAM"
                    .to_string(),
                command: "Clear CMOS jumper on motherboard, or reflash clean BIOS".to_string(),
                risk: Risk::Low,
            });
            order += 1;
        }
    }
    let _ = order; // silence unused-after-last-increment warning on some branches

    if steps.is_empty() {
        let has_warn = checks.iter().any(|c| c.status == CheckStatus::Warn);
        steps.push(if has_warn {
            RecoveryStep {
                order: 1,
                action:
                    "Image has warnings but no critical failures  -  may be usable. Flash and test"
                        .to_string(),
                command: "ratchet write dump.bin && ratchet verify dump.bin".to_string(),
                risk: Risk::Low,
            }
        } else {
            RecoveryStep {
                order: 1,
                action: "Image looks healthy  -  no recovery needed".to_string(),
                command: "ratchet verify dump.bin".to_string(),
                risk: Risk::Low,
            }
        });
    }

    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_image_fails_content_check() {
        let v = vec![0xffu8; 256 * 1024];
        let r = analyze_bios_health_from_buffer(&v);
        assert_eq!(r.overall_status, CheckStatus::Fail);
        assert!(r
            .checks
            .iter()
            .any(|c| c.name == "Content check" && c.status == CheckStatus::Fail));
    }

    #[test]
    fn zero_image_fails_content_check() {
        let v = vec![0x00u8; 256 * 1024];
        let r = analyze_bios_health_from_buffer(&v);
        assert_eq!(r.overall_status, CheckStatus::Fail);
    }

    #[test]
    fn unusual_size_warns() {
        let v = vec![0x55u8; 12345];
        let r = analyze_bios_health_from_buffer(&v);
        assert!(r
            .checks
            .iter()
            .any(|c| c.name == "File size" && c.status == CheckStatus::Warn));
    }

    #[test]
    fn standard_8mb_image_passes_size_check() {
        let mut v = vec![0x55u8; 8 * 1024 * 1024];
        {
            let n = v.len() - 1;
            v[n] = 0xea;
        }
        let r = analyze_bios_health_from_buffer(&v);
        assert!(r
            .checks
            .iter()
            .any(|c| c.name == "File size" && c.status == CheckStatus::Pass));
    }

    #[test]
    fn recovery_step_for_failed_content() {
        let v = vec![0xffu8; 256 * 1024];
        let r = analyze_bios_health_from_buffer(&v);
        assert!(!r.recovery_steps.is_empty());
        assert!(r.recovery_steps[0].action.contains("blank or all-zero"));
    }

    #[test]
    fn healthy_image_gets_verify_recovery_step() {
        let mut v = vec![0x55u8; 1024 * 1024];
        {
            let n = v.len() - 1;
            v[n] = 0xea;
        }
        let r = analyze_bios_health_from_buffer(&v);
        // No fails should yield at least one informational step.
        assert!(!r.recovery_steps.is_empty());
    }

    #[test]
    fn mostly_ff_image_warns() {
        let mut v = vec![0xffu8; 256 * 1024];
        v[100..200].fill(0xaa);
        let r = analyze_bios_health_from_buffer(&v);
        assert!(r
            .checks
            .iter()
            .any(|c| c.name == "Content check" && c.status == CheckStatus::Warn));
    }
}
