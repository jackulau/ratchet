# Integration Validation & Edge Case Hardening

Expand self-test coverage for edge cases: partial read failures, write-during-disconnect, region round-trip, and ensure every user-facing command has at least one self-test path.

**Slug**: `integration-hardening`

## Context

150 tests pass, but some edge cases remain untested: partial read failures, write protection handling during disconnect, region extraction/replacement round-trips. Goal also requires every user-facing CLI command to have a self-test path.

## Test Infrastructure

- **Framework**: Custom self-test harness in `src/self-test.ts`
- **Build**: `npx tsc`
- **Type check**: `npx tsc --noEmit`
- **Run tests**: `npm run build && node dist/cli.js --self-test`

## Tasks

### Task 1: Edge case tests — partial reads, disconnect, region round-trip
### Task 2: Missing CLI command coverage
### Task 3: Fix any bugs discovered

## Verification Gate

```bash
npx tsc --noEmit
npm run build
node dist/cli.js --self-test
```
