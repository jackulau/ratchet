# Remove Flashrom Dependency

Remove the flashrom backend entirely from biospy. Make native CH341A/CH347 the only supported path with improved error messages when no programmer is detected.

## Slug

`remove-flashrom-dependency`

## Context

biospy v0.5.0 has three backends: CH341A (native USB), CH347 (native USB), and flashrom (external CLI wrapper). The flashrom backend is a fallback that shells out to the `flashrom` binary. The native backends are superior — direct USB control, progress reporting, SFDP support, region erase, write protection management. flashrom adds complexity without value. Removing it simplifies the codebase, eliminates an external dependency, and makes error messages clearer.

## Test Infrastructure

**Framework**: None currently exists. Verification via TypeScript compilation and grep-based checks.

**Build command**: `npm run build` (runs `tsc`)
**Type check**: `npx tsc --noEmit`
**No test runner, linter, or CI configured.**

## Requirements

1. Delete `src/backends/flashrom.ts` entirely
2. Remove all flashrom imports, instantiation, and references from `src/cli.ts`
3. Remove `"flashrom"` from `BackendType` union in `src/types.ts`
4. Update `BackendKind` type in `src/cli.ts` to `"ch341a" | "ch347"` only
5. Remove flashrom fallback from `pickBackend()` — when no programmer found, throw clear error with troubleshooting steps
6. Remove flashrom fallback from `identifyAny()` — only try CH341A and CH347
7. Remove flashrom branches from all command handlers (read, write, erase, blank-check, verify)
8. Remove flashrom section from `cmdStatus()` and `cmdSetup()`
9. Update help text — remove flashrom from `-b` options, `-p` option, and backends section
10. Remove `-p, --programmer` flag entirely (only used for flashrom programmer type)
11. Update version to 0.6.0
12. Update README.md — remove flashrom references
13. When no programmer detected, show actionable error: check USB connection, verify driver, check SOIC clip seating

## Design Decisions

### Remove vs deprecate flashrom
**Decision**: Hard remove, not deprecation.
**Rationale**: flashrom was always a fallback. Native backends cover 100% of flashrom's chip operations plus more (region erase, SFDP, write protection, progress bars). No user should prefer flashrom over native.

### Remove `-p, --programmer` flag
**Decision**: Remove entirely.
**Rationale**: This flag only controlled the flashrom programmer type (e.g., `ch341a_spi`). With no flashrom, it has no purpose. The `-b` flag remains for forcing CH341A vs CH347.

### Error message strategy
**Decision**: Structured troubleshooting checklist when no programmer found.
**Rationale**: Without flashrom fallback, users hitting "no programmer" need clear guidance instead of a generic error.

## Confidence

| Area | Level | Evidence |
|------|-------|---------|
| Files to change | HIGH | Grep found all 40+ flashrom references across 4 source files |
| Safe removal | HIGH | Native backends implement all flashrom methods + more (region erase, SFDP, WP) |
| No shared dependencies | HIGH | FlashromBackend has no imports used by other modules |
| CLI arg parsing | HIGH | `-p` flag only feeds flashrom; confirmed in parseArgs() at cli.ts:1016 |
| Build verification | HIGH | `npx tsc --noEmit` catches all type errors from removal |

## Tasks

### Task 1: Delete flashrom backend

**Files**: `src/backends/flashrom.ts`
**Description**: Delete the entire flashrom backend file (479 lines).
**Acceptance Criteria**:
- `src/backends/flashrom.ts` does not exist
- No runtime code references FlashromBackend class

**Verification**:
```bash
test ! -f src/backends/flashrom.ts && echo "PASS" || echo "FAIL"
```

---

### Task 2: Update types.ts — remove flashrom from BackendType

**Files**: `src/types.ts`
**Description**: Change `BackendType` from `"native" | "flashrom"` to just `"native"`. Also remove the `backend?: BackendType` field from `ProgrammerInfo` since it's now always native, or keep it as `"native"` only.

**Acceptance Criteria**:
- `BackendType` no longer includes `"flashrom"`
- TypeScript compiles without errors

**Verification**:
```bash
! grep -q '"flashrom"' src/types.ts && echo "PASS" || echo "FAIL"
```

---

### Task 3: Clean cli.ts — remove flashrom import, instance, and BackendKind

**Files**: `src/cli.ts`
**Description**:
- Remove `import { FlashromBackend } from "./backends/flashrom.js";` (line 5)
- Remove `const flashrom = new FlashromBackend();` (line 20)
- Change `type BackendKind = "ch341a" | "ch347" | "flashrom"` to `type BackendKind = "ch341a" | "ch347"` (line 31)

**Acceptance Criteria**:
- No import of FlashromBackend
- No flashrom instance
- BackendKind has exactly two values

**Verification**:
```bash
! grep -q 'FlashromBackend\|flashrom\.js' src/cli.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4: Update pickBackend() — remove flashrom, improve no-programmer error

**Files**: `src/cli.ts`
**Description**:
- Remove `if (force === "flashrom")` branch (lines 34-36)
- Remove flashrom auto-detect fallback (lines 58-62)
- Add explicit validation for unknown backend names — if `force` is set but not `"ch341a"` or `"ch347"`, throw error: `Unknown backend: "${force}". Supported: ch341a, ch347`
- When no programmer found (all detection fails), throw descriptive error with troubleshooting:
  ```
  No CH341A or CH347 programmer detected.

  Troubleshooting:
    1. Check USB connection — unplug and reconnect the programmer
    2. Verify the programmer is powered (LED should be on)
    3. Try a different USB port (avoid hubs)
    4. Check driver installation:
       macOS: no driver needed (libusb)
       Linux: ensure user is in 'plugdev' group, or run with sudo
       Windows: install WCH drivers or use Zadig for libusb
    5. If using SOIC clip: check clip seating on chip (pin 1 alignment)
  ```

**Acceptance Criteria**:
- `pickBackend("flashrom")` is no longer valid
- `pickBackend("flashrom")` throws explicit error (not silent fallthrough to ch341a)
- No flashrom fallback in auto-detection
- Descriptive error message when no programmer found
- Auto-detection only tries CH341A → CH347

**Verification**:
```bash
! grep -q 'flashrom' src/cli.ts && npx tsc --noEmit && echo "PASS" || echo "FAIL"
```

---

### Task 5: Update identifyAny() — remove flashrom fallback

**Files**: `src/cli.ts`
**Description**:
- Remove the flashrom.identifyChip() try/catch block (lines 80-85)
- Remove `programmer` parameter since it was only used for flashrom
- Function should only try CH341A then CH347

**Acceptance Criteria**:
- identifyAny only tries two backends
- No flashrom.identifyChip call

**Verification**:
```bash
! grep -q 'flashrom' src/cli.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6: Update command handlers — remove flashrom branches

**Files**: `src/cli.ts`
**Description**: Remove the `else` (flashrom) branches from these command handlers:
- `cmdStatus()`: Remove "Flashrom" header section (lines 143-149)
- `cmdRead()`: Remove `else { flashrom.readChip(...) }` branch (lines 268-270)
- `cmdWrite()`: Remove `else { flashrom.writeChip(...) }` branch (line 421-422)
- `cmdErase()`: Remove `else result = await flashrom.eraseChip(...)` (line 548)
- `cmdBlankCheck()`: Remove `else { flashrom.readChip(...) }` branch (lines 462-463)
- `cmdVerify()`: Remove `else result = await flashrom.verifyChip(...)` (line 620)
- `cmdRegionErase()`: Remove the `if (backend.kind === "flashrom")` error check (lines 585-588) — this is now impossible since pickBackend can't return flashrom

For each, the pattern changes from:
```typescript
if (backend.kind === "ch341a") { ... }
else if (backend.kind === "ch347") { ... }
else { /* flashrom */ }
```
to:
```typescript
if (backend.kind === "ch341a") { ... }
else { /* ch347 */ }
```

**Acceptance Criteria**:
- No flashrom branches in any command handler
- All commands still work for ch341a and ch347 backends
- TypeScript compiles cleanly

**Verification**:
```bash
! grep -q 'flashrom' src/cli.ts && npx tsc --noEmit && echo "PASS" || echo "FAIL"
```

---

### Task 7: Update cmdSetup() — remove flashrom check

**Files**: `src/cli.ts`
**Description**: Remove the flashrom detection block from setup/doctor (lines 970-978). No replacement needed — setup should only check CH341A, CH347, serialport, and chip database.

**Acceptance Criteria**:
- Setup command doesn't check for or mention flashrom
- No `brew install flashrom` suggestion

**Verification**:
```bash
! grep -q 'flashrom' src/cli.ts && echo "PASS" || echo "FAIL"
```

---

### Task 8: Update help text and remove -p flag

**Files**: `src/cli.ts`
**Description**:
- Remove `-p, --programmer` from help text (line 1072) and arg parsing (line 1016)
- Remove `programmer` from Args interface (line 999)
- Update `-b, --backend` help to show only `ch341a | ch347` (line 1071)
- Remove `flashrom` from BACKENDS section (line 1087)
- Remove `-p` references from `parseArgs()` function
- Clean up any remaining `args.programmer` references

**Acceptance Criteria**:
- `-p` flag is not parsed or documented
- Help text shows only ch341a and ch347 backends
- No flashrom in help output
- Args interface has no programmer field

**Verification**:
```bash
! grep -q 'flashrom\|programmer' src/cli.ts && npx tsc --noEmit && echo "PASS" || echo "FAIL"
```

---

### Task 9: Update version to 0.6.0

**Files**: `src/cli.ts`, `package.json`
**Description**: Bump version from 0.5.0 to 0.6.0 in both the CLI VERSION constant and package.json.

**Acceptance Criteria**:
- `const VERSION = "0.6.0"` in cli.ts
- `"version": "0.6.0"` in package.json

**Verification**:
```bash
grep -q '"0.6.0"' package.json && grep -q '0.6.0' src/cli.ts && echo "PASS" || echo "FAIL"
```

---

### Task 10: Update README.md

**Files**: `README.md`
**Description**: Remove all flashrom references:
- Remove "and flashrom's CLI" from description
- Remove flashrom backend from architecture diagram
- Remove "Flashrom is auto-detected as a fallback" text
- Remove `-p, --programmer` from options
- Update `-b, --backend` to show only `native | ch341a | ch347`
- Remove `flashrom (optional, for fallback backend)` from requirements
- Add note that v0.6.0 is fully native — no external tools required

**Acceptance Criteria**:
- No flashrom references in README
- Architecture shows only native USB backends
- Install requirements don't list flashrom

**Verification**:
```bash
! grep -qi 'flashrom' README.md && echo "PASS" || echo "FAIL"
```

---

### Task 11: Final build verification

**Files**: All
**Description**: Run full TypeScript build to ensure everything compiles cleanly after all removals.

**Acceptance Criteria**:
- `npx tsc --noEmit` exits 0
- `npm run build` exits 0
- No file in src/ references flashrom

**Verification**:
```bash
npx tsc --noEmit && ! grep -rq 'flashrom' src/ && echo "PASS" || echo "FAIL"
```

## Integration Tests

Since no test framework exists, integration verification is done via build + grep:

```bash
# 1. flashrom.ts deleted
test ! -f src/backends/flashrom.ts

# 2. No flashrom references in source
! grep -rq 'flashrom' src/

# 3. TypeScript compiles
npx tsc --noEmit

# 4. Full build succeeds
npm run build

# 5. CLI shows version 0.6.0
node dist/cli.js --version | grep -q '0.6.0'

# 6. Help text has no flashrom
! node dist/cli.js help 2>&1 | grep -qi 'flashrom'

# 7. No -p/--programmer in help
! node dist/cli.js help 2>&1 | grep -q 'programmer'
```

## Verification Gate

All commands must exit 0:

```bash
npx tsc --noEmit
rm -rf dist/ && npm run build
test ! -f src/backends/flashrom.ts
! grep -rq 'flashrom' src/
! grep -rq 'flashrom' dist/
! grep -qi 'flashrom' README.md
node dist/cli.js --version | grep -q '0.6.0'
```

## Review Scores

| Perspective | Score | Hard Rejections |
|-------------|-------|-----------------|
| CEO (problem-solution fit) | 6.8/10 | None |
| Design/Architecture | 7.4/10 | None |
| Engineering | 5.0/10 | None |

Key feedback applied: explicit validation for unknown backend names (prevents silent fallthrough), dist/ cleanup in verification gate, stale artifact grep.

## Open Questions

None — all questions self-resolved from codebase analysis.

## Self-Resolution Log

| Question | Resolution | Confidence | Source |
|----------|-----------|------------|--------|
| What files reference flashrom? | 4 source files + README | HIGH | grep -r flashrom src/ |
| Does removing flashrom lose functionality? | No — native backends cover all operations + more | HIGH | Method comparison across backends |
| What should BackendType become? | Just "native" | HIGH | types.ts:1 |
| Is -p flag used for anything else? | No — only feeds flashrom programmer type | HIGH | cli.ts:1016, parseArgs() |
| Should we add a Backend interface? | Out of scope — separate refactor | MEDIUM | Architecture analysis |
| What error message for no programmer? | Structured troubleshooting checklist | HIGH | Best practice for hardware tools |
