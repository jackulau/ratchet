# One-Command End-to-End Workflow

`biospy full-repair` and `biospy full-backup` commands that chain multiple operations into single automated workflows with progress reporting and error bail-out.

**Slug**: `end-to-end-workflow`

## Context

biosMCP now has all the individual pieces: connection quality (`connect`), reading/writing chips, health analysis (`analyzeBiosHealthFromBuffer`), and repair (`repairFromReference`, `repairAuto`, `resetNvram`). But users must manually chain these commands and interpret intermediate results. This deliverable creates two orchestration commands that chain the full pipeline automatically.

## Test Infrastructure

- **Framework**: Custom self-test harness in `src/self-test.ts`
- **Runner**: `runTest(name, asyncFn)` returns `{ name, status, detail, durationMs }`
- **Assertions**: `assert(condition, msg)`, `assertEqual(actual, expected, label)`  -  throw on failure
- **Mock**: MockBackend in `src/backends/mock.ts`  -  simulates chip I/O without hardware
- **Build**: `npx tsc`
- **Type check**: `npx tsc --noEmit`
- **Run tests**: `npm run build && node dist/cli.js --self-test`

## Requirements

1. `biospy full-repair` chains: connect → pre-flight quality check → read chip (double-verify) → analyze health → auto-repair → write repaired image → post-write verify → final health report
2. `biospy full-backup` chains: connect → pre-flight quality check → read chip (double-verify) → verify read consistency → analyze health → save dump with metadata JSON sidecar
3. Each step prints a numbered progress header (`[1/8] Connecting...`, `[2/8] Quality check...`)
4. Any step failure bails with clear error message identifying which step failed and why
5. `full-repair` writes repaired image back to chip only if repairs were needed
6. `full-repair --reference <file>` uses reference-based repair instead of auto-repair
7. `full-backup` saves `<chip>_<date>.bin` and `<chip>_<date>.json` metadata sidecar
8. Metadata sidecar includes: chip info, quality score, health report, checksums, timestamp
9. Both commands handle write protection: check before write, auto-disable if needed
10. `--output <dir>` specifies output directory (default: current directory)
11. `--skip-write` on full-repair runs analysis+repair but doesn't write back to chip
12. Both commands work in `--dry-run` mode using MockBackend (existing pattern)

## Design Decisions

1. **New file `src/workflows/pipeline.ts`**  -  Workflow orchestration in its own module. Rationale: workflows compose existing CLI operations; they're a layer above analysis and backends. Separate directory signals this is orchestration, not new capability.

2. **Step-based pipeline with bail-out**  -  Each step returns success/fail. Pipeline stops on first failure. Rationale: for flash chip operations, continuing after a failed step risks bricking hardware. Fail-fast is safest.

3. **Buffer-based pipeline internally**  -  Pipeline functions take/return Buffers. File I/O at CLI boundary only. Rationale: matches repair.ts pattern, enables testing with MockBackend without filesystem.

4. **Metadata sidecar as JSON**  -  Structured metadata alongside the binary dump. Rationale: binary dump must be raw flash content (no headers), so metadata goes in a companion file. JSON is human-readable and machine-parseable.

5. **Reuse existing helpers**  -  Uses `runPreFlightQualityCheck`, `analyzeBiosHealthFromBuffer`, `repairAuto`/`repairFromReference`. Rationale: these are tested and proven. The workflow is orchestration, not reimplementation.

## Confidence

| Area | Level | Evidence |
|------|-------|----------|
| Read/write pipeline | HIGH | cmdRead (cli.ts:323), cmdWrite (cli.ts:390) patterns well-understood |
| Quality check | HIGH | runPreFlightQualityCheck (cli.ts:260) already implemented |
| Health analysis | HIGH | analyzeBiosHealthFromBuffer (recovery.ts:35) tested in deliverable 1 |
| Repair orchestration | HIGH | repairAuto, repairFromReference (repair.ts) tested in deliverable 2 |
| MockBackend coverage | HIGH | readChip, writeChip, verifyChip, isWriteProtected all exist in mock.ts |
| Metadata sidecar | MEDIUM | New concept, but straightforward JSON serialization |
| Write protection auto-disable | HIGH | isWriteProtected + disableWriteProtection exist in backends |

## Tasks

### Task 1: Pipeline step infrastructure

**Files**: `src/workflows/pipeline.ts` (new)
**Test Files**: `src/self-test.ts` (extend)

**Description**: Create pipeline module with step execution framework. Define `PipelineStep`, `PipelineResult`, and step runner that tracks progress, handles bail-out, and collects results.

**Acceptance Criteria**:
- [ ] `PipelineStep` type: name, number, total, execute function
- [ ] `PipelineResult` type: success, steps completed, steps failed, error step, elapsed time, data (key-value bag)
- [ ] `runPipeline(steps)` executes steps in order, prints progress headers, stops on first failure
- [ ] Each step prints `[N/M] Step name...` before executing
- [ ] Failed step records which step failed and error message
- [ ] `PipelineContext` type carries state between steps (buffers, chip info, quality score, etc.)

**Tests to Write**:
- `runPipeline with all passing steps completes`  -  3 steps all succeed → result.success = true
- `runPipeline stops on first failure`  -  step 2 of 3 fails → result shows step 2 failed, step 3 not run
- `runPipeline collects step timing`  -  verify each step has duration recorded

**Verification**:
```bash
npm run build && node dist/cli.js --self-test 2>&1 | grep -E "runPipeline|FAIL" && echo "PASS" || echo "FAIL"
```

### Task 2: Full-backup workflow

**Files**: `src/workflows/pipeline.ts` (modify)
**Test Files**: `src/self-test.ts` (extend)

**Description**: Implement `buildBackupPipeline()` that creates the step sequence for full-backup: connect → quality check → read (double-verify) → analyze → save with metadata.

**Acceptance Criteria**:
- [ ] `buildBackupPipeline(ctx)` returns array of PipelineSteps for backup workflow
- [ ] Step 1: Connection quality check (uses pre-flight quality scoring)
- [ ] Step 2: Read chip with double-verify
- [ ] Step 3: Analyze health of read image
- [ ] Step 4: Save dump file and JSON metadata sidecar
- [ ] `BackupMetadata` type: chipInfo, qualityScore, healthReport, sha256, timestamp, biosVersion
- [ ] `generateBackupMetadata()` collects all metadata from pipeline context into structured object

**Tests to Write**:
- `buildBackupPipeline creates 4 steps`  -  verify step count and names
- `generateBackupMetadata includes all required fields`  -  mock data → verify chipInfo, sha256, timestamp present
- `backup pipeline with MockBackend completes`  -  run full backup pipeline with mock → success

**Verification**:
```bash
npm run build && node dist/cli.js --self-test 2>&1 | grep -E "backup|Backup|FAIL" && echo "PASS" || echo "FAIL"
```

### Task 3: Full-repair workflow

**Files**: `src/workflows/pipeline.ts` (modify)
**Test Files**: `src/self-test.ts` (extend)

**Description**: Implement `buildRepairPipeline()` that creates the step sequence for full-repair: connect → quality check → read → analyze → repair → write repaired → verify → final health report.

**Acceptance Criteria**:
- [ ] `buildRepairPipeline(ctx)` returns array of PipelineSteps for repair workflow
- [ ] Step 1: Connection quality check
- [ ] Step 2: Read chip with double-verify
- [ ] Step 3: Analyze health
- [ ] Step 4: Repair (auto or reference-based depending on ctx.referencePath)
- [ ] Step 5: Write repaired image to chip (skipped if no repairs needed or --skip-write)
- [ ] Step 6: Post-write verify
- [ ] Step 7: Final health report of repaired image
- [ ] Pipeline skips write+verify+final if no repairs were needed
- [ ] Write step checks/disables write protection before writing

**Tests to Write**:
- `buildRepairPipeline creates correct step sequence`  -  verify step names
- `repair pipeline with healthy image skips write`  -  no damage → pipeline reports no repairs, skips write
- `repair pipeline with damaged image performs full cycle`  -  corrupt reset vector → repair → write → verify
- `repair pipeline with reference uses reference repair`  -  ctx.referencePath set → uses repairFromReference

**Verification**:
```bash
npm run build && node dist/cli.js --self-test 2>&1 | grep -E "repair pipeline|FAIL" && echo "PASS" || echo "FAIL"
```

### Task 4: CLI commands

**Files**: `src/cli.ts` (modify)
**Test Files**: `src/self-test.ts` (extend)

**Description**: Add `biospy full-repair` and `biospy full-backup` CLI commands with flags: `--reference`, `--output`, `--skip-write`, `--dry-run`.

**Acceptance Criteria**:
- [ ] `full-repair` and `full-backup` cases added to command switch
- [ ] `cmdFullRepair(args)` builds and runs repair pipeline
- [ ] `cmdFullBackup(args)` builds and runs backup pipeline
- [ ] `--reference <file>` passed to repair pipeline context
- [ ] `--output <dir>` sets output directory
- [ ] `--skip-write` skips write-back step in repair
- [ ] `--dry-run` uses MockBackend (existing pattern)
- [ ] Output file naming: `<chip>_<YYYYMMDD_HHMMSS>.bin` for backup
- [ ] Error messages identify which pipeline step failed

**Tests to Write**:
- `full-backup dry-run completes with MockBackend`  -  dry-run backup → success, metadata generated
- `full-repair dry-run with healthy mock reports no repairs`  -  dry-run repair → no repairs needed
- `full-repair dry-run with --skip-write skips write step`  -  verify write step skipped

**Verification**:
```bash
npm run build && npx tsc --noEmit && echo "PASS" || echo "FAIL"
```

### Task 5: Integration tests

**Files**: `src/self-test.ts` (modify)
**Test Files**: N/A (this IS the test task)

**Description**: Add integration tests covering full workflow end-to-end with MockBackend.

**Acceptance Criteria**:
- [ ] Full backup pipeline end-to-end with MockBackend
- [ ] Full repair pipeline end-to-end with MockBackend (healthy image)
- [ ] Full repair pipeline end-to-end with MockBackend (damaged image requiring repair)
- [ ] Pipeline bail-out behavior on step failure
- [ ] All integration tests pass

**Tests to Write**:
- `full-backup end-to-end: mock read → analyze → metadata`  -  complete backup with mock
- `full-repair end-to-end: mock healthy → no write needed`  -  healthy image → skip write
- `full-repair end-to-end: mock damaged → repair → write → verify`  -  damaged image → full cycle
- `pipeline bail-out: step failure stops execution`  -  inject failure → verify clean stop

**Verification**:
```bash
npm run build && node dist/cli.js --self-test 2>&1 | tail -5 | grep "passed" && echo "PASS" || echo "FAIL"
```

## Integration Tests

1. **Full backup pipeline**: MockBackend → connect → read → analyze → save metadata → verify all fields
2. **Full repair pipeline (healthy)**: MockBackend → connect → read → analyze → no damage → skip write → success
3. **Full repair pipeline (damaged)**: MockBackend → connect → read → analyze → repair reset vector → write → verify → success
4. **Pipeline bail-out**: Inject step failure → verify pipeline stops cleanly at failed step

## Verification Gate

```bash
npx tsc --noEmit
npm run build
node dist/cli.js --self-test
```

## Review Scores

| Perspective | Score | Hard Rejections |
|-------------|-------|-----------------|
| CEO | Skipped | N/A |
| Architecture | Skipped | N/A |
| Engineering | Skipped | N/A |

Rationale: Previous specs' reviewers hallucinated content. Codebase well-understood from deliverables 1-2. Tight scope, follows established patterns.

## Open Questions

None  -  all resolved from codebase analysis.
