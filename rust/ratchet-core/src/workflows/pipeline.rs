// Backup + repair pipeline orchestrator.
// PipelineBackend abstracts the hardware so tests inject a stub backend.
// Sync (blocking)  -  Rust doesn't need Node-style async for file/USB IO.

use crate::analysis::recovery::{analyze_bios_health_from_buffer, BiosHealthReport, CheckStatus};
use crate::analysis::repair::{repair_auto, repair_from_reference, RepairReport};
use crate::connection::quality::{
    compute_quality_score, ConnectionQualityResult, RawConnectionData,
};
use crate::types::ChipInfo;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StepResult {
    pub name: String,
    pub number: u32,
    pub success: bool,
    pub detail: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectionTestData {
    pub stable: bool,
    pub reads: u32,
    pub matches: u32,
    pub jedec_id: String,
    pub timings: Vec<u32>,
    pub status_register: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReadOutcome {
    pub success: bool,
    pub size_bytes: u64,
    pub checksum: String,
    pub data: Vec<u8>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WriteOutcome {
    pub success: bool,
    pub verified: bool,
    pub error: Option<String>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VerifyOutcome {
    pub matches: bool,
    pub chip_checksum: String,
    pub file_checksum: String,
}

/// Trait the pipeline drives. Real backends adapt their existing methods to this surface.
/// Methods return Results so failures can short-circuit a step cleanly.
pub trait PipelineBackend {
    fn connection_test(&mut self) -> Result<ConnectionTestData, String>;
    fn identify_chip(&mut self) -> Result<Option<ChipInfo>, String>;
    fn read_chip_double_verify(&mut self) -> Result<ReadOutcome, String>;
    fn write_chip(&mut self, data: &[u8]) -> Result<WriteOutcome, String>;
    fn verify_chip(&mut self, data: &[u8]) -> Result<VerifyOutcome, String>;
    fn is_write_protected(&mut self) -> Result<bool, String>;
    fn disable_write_protection(&mut self) -> Result<(), String>;

    /// SR1 snapshot taken BEFORE the Write step clears the BP bits, so they
    /// can be re-applied afterwards. `None` = the backend cannot report SR1;
    /// restoration is then skipped (and reported) rather than guessed.
    fn read_status_register(&mut self) -> Result<Option<u8>, String> {
        Ok(None)
    }

    /// Re-apply previously saved BP bits after a successful repair write. The
    /// default refuses so an adapter that never implemented restore cannot
    /// silently pretend the chip was re-protected.
    fn restore_write_protection(&mut self, _sr1: u8) -> Result<(), String> {
        Err("write-protection restore not supported by this backend".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BackupMetadata {
    pub timestamp: String,
    #[serde(rename = "chipInfo", skip_serializing_if = "Option::is_none")]
    pub chip_info: Option<ChipInfo>,
    #[serde(rename = "qualityScore")]
    pub quality_score: u32,
    #[serde(rename = "healthReport", skip_serializing_if = "Option::is_none")]
    pub health_report: Option<BiosHealthReport>,
    pub sha256: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "biosVersion", skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
}

pub struct PipelineContext<'a> {
    pub backend: &'a mut dyn PipelineBackend,
    pub dry_run: bool,
    pub reference_path: Option<PathBuf>,
    pub skip_write: bool,

    pub quality_score: u32,
    pub quality_result: Option<ConnectionQualityResult>,
    pub chip_info: Option<ChipInfo>,
    pub image_data: Option<Vec<u8>>,
    pub health_report: Option<BiosHealthReport>,
    pub repaired_data: Option<Vec<u8>>,
    pub repair_report: Option<RepairReport>,
    pub repairs_needed: bool,
    pub write_verified: bool,
    pub final_health_report: Option<BiosHealthReport>,
    pub metadata: Option<BackupMetadata>,
}

impl<'a> PipelineContext<'a> {
    pub fn new(backend: &'a mut dyn PipelineBackend) -> Self {
        Self {
            backend,
            dry_run: false,
            reference_path: None,
            skip_write: false,
            quality_score: 0,
            quality_result: None,
            chip_info: None,
            image_data: None,
            health_report: None,
            repaired_data: None,
            repair_report: None,
            repairs_needed: false,
            write_verified: false,
            final_health_report: None,
            metadata: None,
        }
    }
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

pub fn generate_backup_metadata(ctx: &PipelineContext) -> BackupMetadata {
    let (sha256, size) = match &ctx.image_data {
        Some(d) => (sha256_hex(d), d.len() as u64),
        None => (String::new(), 0),
    };
    BackupMetadata {
        timestamp: current_timestamp(),
        chip_info: ctx.chip_info.clone(),
        quality_score: ctx.quality_score,
        health_report: ctx.health_report.clone(),
        sha256,
        size_bytes: size,
        bios_version: None,
    }
}

fn current_timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_secs())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PipelineResult {
    pub success: bool,
    pub steps_completed: u32,
    pub step_results: Vec<StepResult>,
    pub error_step: Option<String>,
    pub error_detail: Option<String>,
    pub total_duration_ms: u64,
}

/// Step kinds  -  implemented inline by the pipeline runner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepKind {
    Quality,
    Read,
    Analyze,
    Repair,
    Write,
    PostVerify,
    FinalHealth,
    BackupMetadata,
}

#[derive(Debug, Clone)]
pub struct Step {
    pub name: &'static str,
    pub number: u32,
    pub kind: StepKind,
}

pub fn build_backup_pipeline() -> Vec<Step> {
    vec![
        Step {
            name: "Connection quality check",
            number: 1,
            kind: StepKind::Quality,
        },
        Step {
            name: "Read chip (double-verify)",
            number: 2,
            kind: StepKind::Read,
        },
        Step {
            name: "Analyze health",
            number: 3,
            kind: StepKind::Analyze,
        },
        Step {
            name: "Save backup with metadata",
            number: 4,
            kind: StepKind::BackupMetadata,
        },
    ]
}

pub fn build_repair_pipeline() -> Vec<Step> {
    vec![
        Step {
            name: "Connection quality check",
            number: 1,
            kind: StepKind::Quality,
        },
        Step {
            name: "Read chip (double-verify)",
            number: 2,
            kind: StepKind::Read,
        },
        Step {
            name: "Analyze health",
            number: 3,
            kind: StepKind::Analyze,
        },
        Step {
            name: "Repair",
            number: 4,
            kind: StepKind::Repair,
        },
        Step {
            name: "Write repaired image",
            number: 5,
            kind: StepKind::Write,
        },
        Step {
            name: "Post-write verify",
            number: 6,
            kind: StepKind::PostVerify,
        },
        Step {
            name: "Final health report",
            number: 7,
            kind: StepKind::FinalHealth,
        },
    ]
}

fn execute_step(step: &Step, ctx: &mut PipelineContext) -> Result<String, String> {
    match step.kind {
        StepKind::Quality => {
            let ct = ctx.backend.connection_test()?;
            let mut readings: Vec<String> = Vec::with_capacity(ct.reads as usize);
            for _ in 0..ct.matches {
                readings.push(ct.jedec_id.clone());
            }
            for _ in ct.matches..ct.reads {
                readings.push("000000".to_string());
            }
            let raw = RawConnectionData {
                jedec_readings: readings,
                timings_ms: ct.timings.clone(),
                status_register_ok: ct.status_register.is_some(),
            };
            let quality = compute_quality_score(&raw);
            ctx.quality_score = quality.score;
            ctx.quality_result = Some(quality.clone());
            if quality.score < 50 {
                return Err(format!(
                    "Connection quality too low: {}/100 ({})",
                    quality.score, quality.grade
                ));
            }
            ctx.chip_info = ctx.backend.identify_chip()?;
            let mut detail = format!("Quality: {}/100 ({})", quality.score, quality.grade);
            if let Some(c) = &ctx.chip_info {
                detail.push_str(&format!(", Chip: {}", c.name));
            }
            Ok(detail)
        }
        StepKind::Read => {
            let r = ctx.backend.read_chip_double_verify()?;
            if !r.success {
                return Err(r.error.unwrap_or_else(|| "Read failed".to_string()));
            }
            let n = r.data.len();
            let chk = r.checksum.clone();
            ctx.image_data = Some(r.data);
            Ok(format!(
                "Read {n} bytes, SHA256: {}...",
                &chk[..chk.len().min(16)]
            ))
        }
        StepKind::Analyze => {
            let data = ctx
                .image_data
                .as_ref()
                .ok_or_else(|| "No image data to analyze".to_string())?;
            let h = analyze_bios_health_from_buffer(data);
            let p = h
                .checks
                .iter()
                .filter(|c| c.status == CheckStatus::Pass)
                .count();
            let w = h
                .checks
                .iter()
                .filter(|c| c.status == CheckStatus::Warn)
                .count();
            let f = h
                .checks
                .iter()
                .filter(|c| c.status == CheckStatus::Fail)
                .count();
            let status_label = match h.overall_status {
                CheckStatus::Pass => "pass",
                CheckStatus::Warn => "warn",
                CheckStatus::Fail => "fail",
            };
            ctx.health_report = Some(h);
            Ok(format!(
                "Health: {p} pass, {w} warn, {f} fail  -  {status_label}"
            ))
        }
        StepKind::Repair => {
            let data = ctx
                .image_data
                .as_ref()
                .ok_or_else(|| "No image data to repair".to_string())?;
            let (repaired, report) = if let Some(ref path) = ctx.reference_path {
                let refdata = fs::read(path).map_err(|e| format!("Reference read failed: {e}"))?;
                let r = repair_from_reference(data, &refdata);
                (r.repaired, r.report)
            } else {
                let r = repair_auto(data);
                (r.repaired, r.report)
            };
            ctx.repairs_needed = report.total_bytes_changed > 0;
            let action_count = report.actions.len();
            let bytes = report.total_bytes_changed;
            ctx.repaired_data = Some(repaired);
            ctx.repair_report = Some(report);
            if !ctx.repairs_needed {
                Ok("No repairs needed  -  image is healthy".to_string())
            } else {
                Ok(format!(
                    "Repaired: {bytes} bytes changed, {action_count} actions"
                ))
            }
        }
        StepKind::Write => {
            if !ctx.repairs_needed || ctx.skip_write {
                return Ok(if ctx.skip_write {
                    "Write skipped (--skip-write)".to_string()
                } else {
                    "No repairs needed  -  write skipped".to_string()
                });
            }
            let data = ctx
                .repaired_data
                .clone()
                .ok_or_else(|| "No repaired data to write".to_string())?;
            let wp = ctx.backend.is_write_protected()?;
            // Snapshot SR1 BEFORE clearing protection so the prior BP bits can
            // be re-applied after the write — the old behavior left the chip
            // permanently unprotected after every repair.
            let saved_sr1 = if wp {
                ctx.backend.read_status_register()?
            } else {
                None
            };
            if wp {
                ctx.backend.disable_write_protection()?;
            }
            let r = ctx.backend.write_chip(&data)?;
            if !r.success {
                return Err(r.error.unwrap_or_else(|| "Write failed".to_string()));
            }
            if wp {
                match saved_sr1 {
                    Some(sr1) => {
                        ctx.backend.restore_write_protection(sr1).map_err(|e| {
                            format!("write succeeded but restoring write protection failed: {e}")
                        })?;
                        Ok("Write complete (write protection restored)".to_string())
                    }
                    None => Ok("Write complete (write protection auto-disabled; \
                                 restore unsupported by backend)"
                        .to_string()),
                }
            } else {
                Ok("Write complete".to_string())
            }
        }
        StepKind::PostVerify => {
            if !ctx.repairs_needed || ctx.skip_write {
                return Ok("Verify skipped  -  no write performed".to_string());
            }
            let data = ctx
                .repaired_data
                .clone()
                .ok_or_else(|| "No repaired data to verify".to_string())?;
            let v = ctx.backend.verify_chip(&data)?;
            ctx.write_verified = v.matches;
            if !v.matches {
                return Err(
                    "Post-write verification FAILED  -  chip content does not match repaired image"
                        .to_string(),
                );
            }
            Ok("Verification passed  -  chip matches repaired image".to_string())
        }
        StepKind::FinalHealth => {
            let img = if ctx.repairs_needed && !ctx.skip_write {
                ctx.repaired_data.as_ref()
            } else {
                ctx.image_data.as_ref()
            }
            .ok_or_else(|| "No image data for final health check".to_string())?;
            let h = analyze_bios_health_from_buffer(img);
            let label = match h.overall_status {
                CheckStatus::Pass => "pass",
                CheckStatus::Warn => "warn",
                CheckStatus::Fail => "fail",
            };
            ctx.final_health_report = Some(h);
            Ok(format!("Final health: {label}"))
        }
        StepKind::BackupMetadata => {
            let meta = generate_backup_metadata(ctx);
            let sha_prefix = meta.sha256[..meta.sha256.len().min(16)].to_string();
            let size = meta.size_bytes;
            ctx.metadata = Some(meta);
            Ok(format!("Metadata generated: {sha_prefix}..., {size} bytes"))
        }
    }
}

pub fn run_pipeline(steps: &[Step], ctx: &mut PipelineContext) -> PipelineResult {
    let pipeline_start = Instant::now();
    let mut results: Vec<StepResult> = Vec::with_capacity(steps.len());

    for step in steps {
        let step_start = Instant::now();
        match execute_step(step, ctx) {
            Ok(detail) => results.push(StepResult {
                name: step.name.to_string(),
                number: step.number,
                success: true,
                detail,
                duration_ms: step_start.elapsed().as_millis() as u64,
            }),
            Err(msg) => {
                results.push(StepResult {
                    name: step.name.to_string(),
                    number: step.number,
                    success: false,
                    detail: msg.clone(),
                    duration_ms: step_start.elapsed().as_millis() as u64,
                });
                return PipelineResult {
                    success: false,
                    steps_completed: results.len() as u32,
                    step_results: results,
                    error_step: Some(step.name.to_string()),
                    error_detail: Some(msg),
                    total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
                };
            }
        }
    }
    PipelineResult {
        success: true,
        steps_completed: results.len() as u32,
        step_results: results,
        error_step: None,
        error_detail: None,
        total_duration_ms: pipeline_start.elapsed().as_millis() as u64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Stub backend with configurable behavior.
    struct StubBackend {
        connection_data: ConnectionTestData,
        chip: Option<ChipInfo>,
        read_data: Vec<u8>,
        write_protected: bool,
        sr1: u8,
        restored_sr1: Option<u8>,
        write_should_match: bool,
        write_call_count: u32,
        verify_call_count: u32,
    }

    impl StubBackend {
        fn new_healthy() -> Self {
            Self {
                connection_data: ConnectionTestData {
                    stable: true,
                    reads: 10,
                    matches: 10,
                    jedec_id: "ef4017".to_string(),
                    timings: vec![5; 10],
                    status_register: Some(0),
                },
                chip: Some(ChipInfo {
                    name: "W25Q64JV".to_string(),
                    vendor_name: "Winbond".to_string(),
                    jedec_id: "ef4017".to_string(),
                    size_bytes: 8 * 1024 * 1024,
                    size_human: "8 MB".to_string(),
                    chip_type: "spi".to_string(),
                    page_size: Some(256),
                    sector_size: Some(4096),
                    block_size: Some(65536),
                    write_protected: Some(false),
                    voltage: Some(3.3),
                }),
                read_data: {
                    // Valid-looking image: 256KB with reset vector at the end.
                    let mut v = vec![0x55u8; 256 * 1024];
                    let n = v.len() - 1;
                    v[n] = 0xea;
                    v
                },
                write_protected: false,
                sr1: 0x00,
                restored_sr1: None,
                write_should_match: true,
                write_call_count: 0,
                verify_call_count: 0,
            }
        }
    }

    impl PipelineBackend for StubBackend {
        fn connection_test(&mut self) -> Result<ConnectionTestData, String> {
            Ok(self.connection_data.clone())
        }
        fn identify_chip(&mut self) -> Result<Option<ChipInfo>, String> {
            Ok(self.chip.clone())
        }
        fn read_chip_double_verify(&mut self) -> Result<ReadOutcome, String> {
            Ok(ReadOutcome {
                success: true,
                size_bytes: self.read_data.len() as u64,
                checksum: sha256_hex(&self.read_data),
                data: self.read_data.clone(),
                error: None,
            })
        }
        fn write_chip(&mut self, _data: &[u8]) -> Result<WriteOutcome, String> {
            self.write_call_count += 1;
            Ok(WriteOutcome {
                success: true,
                verified: true,
                error: None,
                backup_path: None,
            })
        }
        fn verify_chip(&mut self, _data: &[u8]) -> Result<VerifyOutcome, String> {
            self.verify_call_count += 1;
            Ok(VerifyOutcome {
                matches: self.write_should_match,
                chip_checksum: "a".to_string(),
                file_checksum: "a".to_string(),
            })
        }
        fn is_write_protected(&mut self) -> Result<bool, String> {
            Ok(self.write_protected)
        }
        fn disable_write_protection(&mut self) -> Result<(), String> {
            self.write_protected = false;
            self.sr1 = 0x00;
            Ok(())
        }
        fn read_status_register(&mut self) -> Result<Option<u8>, String> {
            Ok(Some(self.sr1))
        }
        fn restore_write_protection(&mut self, sr1: u8) -> Result<(), String> {
            self.restored_sr1 = Some(sr1);
            self.sr1 = sr1;
            self.write_protected = sr1 & 0x1c != 0;
            Ok(())
        }
    }

    #[test]
    fn backup_pipeline_runs_4_steps() {
        let mut backend = StubBackend::new_healthy();
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_backup_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(result.success, "expected success: {result:?}");
        assert_eq!(result.steps_completed, 4);
        assert!(ctx.metadata.is_some());
        assert!(ctx.health_report.is_some());
        assert!(ctx.image_data.is_some());
    }

    #[test]
    fn low_quality_short_circuits_pipeline() {
        let mut backend = StubBackend::new_healthy();
        backend.connection_data.matches = 1;
        backend.connection_data.status_register = None;
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_backup_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(!result.success);
        assert!(result
            .error_detail
            .unwrap()
            .contains("Connection quality too low"));
        assert_eq!(result.steps_completed, 1);
    }

    #[test]
    fn repair_pipeline_skips_write_when_healthy() {
        let mut backend = StubBackend::new_healthy();
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_repair_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(result.success);
        assert_eq!(result.steps_completed, 7);
        let write_step = result
            .step_results
            .iter()
            .find(|s| s.name == "Write repaired image")
            .unwrap();
        assert!(
            write_step.detail.contains("write skipped")
                || write_step.detail.contains("Write skipped")
        );
        // backend.write_chip should never have been called for healthy image.
    }

    #[test]
    fn repair_pipeline_writes_when_reset_vector_zeroed() {
        let mut backend = StubBackend::new_healthy();
        // Zero out the reset vector to trigger auto-repair.
        let n = backend.read_data.len();
        backend.read_data[n - 16..].fill(0);
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_repair_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(result.success, "{result:?}");
        let write_step = result
            .step_results
            .iter()
            .find(|s| s.name == "Write repaired image")
            .unwrap();
        assert!(write_step.detail.contains("Write complete"));
    }

    #[test]
    fn write_protection_restored_after_repair() {
        let mut backend = StubBackend::new_healthy();
        // Protected chip with BP bits set in SR1; trigger auto-repair.
        backend.write_protected = true;
        backend.sr1 = 0x0c;
        let n = backend.read_data.len();
        backend.read_data[n - 16..].fill(0);
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_repair_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(result.success, "{result:?}");
        drop(ctx);
        let write_step = result
            .step_results
            .iter()
            .find(|s| s.name == "Write repaired image")
            .unwrap();
        assert!(
            write_step.detail.contains("write protection restored"),
            "step must report the restoration, got: {}",
            write_step.detail
        );
        assert_eq!(
            backend.restored_sr1,
            Some(0x0c),
            "the EXACT prior BP bits must be re-applied"
        );
        assert!(
            backend.write_protected,
            "chip must be protected again after the repair"
        );
    }

    #[test]
    fn metadata_contains_checksum_and_size() {
        let mut backend = StubBackend::new_healthy();
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_backup_pipeline();
        let _ = run_pipeline(&steps, &mut ctx);
        let m = ctx.metadata.as_ref().unwrap();
        assert_eq!(m.size_bytes, 256 * 1024);
        assert_eq!(m.sha256.len(), 64);
    }

    #[test]
    fn skip_write_flag_honoured() {
        let mut backend = StubBackend::new_healthy();
        let n = backend.read_data.len();
        backend.read_data[n - 16..].fill(0);
        let mut ctx = PipelineContext::new(&mut backend);
        ctx.skip_write = true;
        let steps = build_repair_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(result.success);
        let write_step = result
            .step_results
            .iter()
            .find(|s| s.name == "Write repaired image")
            .unwrap();
        assert!(write_step.detail.contains("Write skipped"));
    }

    #[test]
    fn post_verify_fails_when_chip_mismatches() {
        let mut backend = StubBackend::new_healthy();
        let n = backend.read_data.len();
        backend.read_data[n - 16..].fill(0);
        backend.write_should_match = false;
        let mut ctx = PipelineContext::new(&mut backend);
        let steps = build_repair_pipeline();
        let result = run_pipeline(&steps, &mut ctx);
        assert!(!result.success);
        assert!(result.error_detail.unwrap().contains("verification FAILED"));
    }
}
