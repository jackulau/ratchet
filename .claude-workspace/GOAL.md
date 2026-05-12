---
status: active
mode: auto
objective: 'Ensure biosMCP is fully working end-to-end with proper USB connection establishment, automatic verification/validation, actual BIOS repair capability (not just diagnostics), and easy workflow for connection setup and component integrity verification.'
created_at: 2026-05-11T21:00:00Z
updated_at: 2026-05-11T21:00:00Z
turns: 1
current_deliverable: 4
current_spec: ""
auto_started_at: 2026-05-11T21:00:00Z
sessions: 0
consecutive_failures: 0
---

## Deliverables

- [x] 1. Connection wizard & signal quality — Single `biospy connect` command that auto-detects programmer type (CH341A/CH347), identifies chip via JEDEC, runs multi-pass signal integrity test (5-10 reads checking consistency), reports connection quality score (0-100%), diagnoses bad clips/wiring/orientation, suggests specific fixes. Add `--monitor` flag for continuous quality assessment during long operations. Integrate into read/write commands as pre-flight check.
- [x] 2. Automated BIOS repair engine — Actual repair capability beyond diagnostics: extract/replace corrupted regions from reference image, rebuild damaged Intel Flash Descriptor, repair corrupted NVRAM variable store (clear bad entries, rebuild header), inject known-good ME firmware region, patch reset vector if zeroed. New commands: `biospy repair <broken.bin> --reference <good.bin>`, `biospy repair --auto` (self-diagnose and fix what it can), `biospy repair --nvram-reset`. All repairs produce diff report showing what changed.
- [x] 3. One-command end-to-end workflow — `biospy full-repair` command that chains: connect → pre-flight signal check → read chip (double-verify) → analyze for corruption → repair automatically → write repaired image → post-write verify → final health report. Each step reports progress and can bail with clear error. Also `biospy full-backup` for read → verify → analyze → save with metadata. Both commands handle write protection automatically.
- [ ] 4. Integration validation & edge case hardening — Expand self-test to cover: full repair workflow with mock (corrupt image → repair → verify fixed), connection quality scoring with simulated noise, partial read failures with retry/recovery, write-during-disconnect graceful handling, region extraction/replacement round-trip, NVRAM rebuild consistency. Target: every user-facing command has at least one self-test path. Fix any bugs found.

## Progress Log

- [21:00] Created goal — entering auto-execution mode
- [22:30] Deliverable 1 COMPLETE — biospy connect command with quality scoring (0-100%), 10-read signal integrity test, --monitor continuous mode, pre-flight quality gate for read/write, MockBackend quality modes (stable/noisy/disconnected), 29 new self-tests, 112/112 total pass
- [23:00] Deliverable 2 COMPLETE — BIOS repair engine
- [23:30] Deliverable 3 COMPLETE — full-repair and full-backup pipeline commands, step-based orchestration with bail-out, MockBackend dry-run, backup metadata sidecar, write protection auto-disable, 17 new self-tests, 150/150 total pass — BIOS repair engine: repairFromReference (region-by-region), resetNvram ($VSS header preserved), repairResetVector (x86 far jump), repairAuto (health-based), CLI `biospy repair` with --reference/--auto/--nvram-reset/--dry-run/--output, diff reports, 21 new self-tests, 133/133 total pass
