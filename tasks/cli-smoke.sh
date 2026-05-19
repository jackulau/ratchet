#!/usr/bin/env bash
# CLI smoke — exercises every documented biospy command in safe modes
# (dry-run / lookup-only). Fails fast on any non-zero exit from a path that
# should succeed. Hardware commands run with --dry-run; lookup commands have
# no hardware dependency.
#
# Run from repo root: `bash tasks/cli-smoke.sh`

set -u
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
FAILED_CMDS=()

run() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_CMDS+=("$label")
    echo "  FAIL: $label  →  $*" >&2
  fi
}

expect_fail() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    FAIL=$((FAIL + 1))
    FAILED_CMDS+=("$label (expected non-zero)")
    echo "  FAIL: $label expected non-zero exit but succeeded" >&2
  else
    PASS=$((PASS + 1))
  fi
}

BIOSPY="node dist/cli.js"

# ── Help / version / self-test ──────────────────────────────
run "help"                $BIOSPY --help
run "version"             $BIOSPY --version
run "self-test"           $BIOSPY --self-test

# ── Database / lookup paths (no hardware needed) ─────────────
run "search (empty)"      $BIOSPY search
run "search W25Q64"       $BIOSPY search W25Q64
run "search by jedec"     $BIOSPY search ef4017
run "search by vendor"    $BIOSPY search Macronix
run "chip-info jedec"     $BIOSPY chip-info ef4017
run "chip-info name"     $BIOSPY chip-info W25Q64JV
expect_fail "chip-info bogus" $BIOSPY chip-info notarealchip0000

# ── Hardware-facing commands in dry-run ──────────────────────
run "status --dry-run"    $BIOSPY status --dry-run
run "detect"              $BIOSPY detect
run "identify --dry-run"  $BIOSPY identify --dry-run
run "wp-status --dry-run" $BIOSPY wp-status --dry-run
run "sfdp --dry-run"      $BIOSPY sfdp --dry-run

# ── Diagnostic helpers (read-only data) ──────────────────────
run "post-decode 00"           $BIOSPY post-decode 00
run "post-decode B0"           $BIOSPY post-decode B0
run "failure-db corruption"    $BIOSPY failure-db corruption
run "power-sequence"           $BIOSPY power-sequence
run "voltage-ref ATX24"        $BIOSPY voltage-ref ATX24

# ── Laptop / GPU / storage / embedded databases ──────────────
run "laptop-failures battery"  $BIOSPY laptop-failures battery
run "gpu-failures memory"      $BIOSPY gpu-failures memory
run "storage-diag samsung"     $BIOSPY storage-diag samsung
run "nand-check tlc"           $BIOSPY nand-check tlc
run "hdd-pcb WD"               $BIOSPY hdd-pcb WD
run "router-flash openwrt"     $BIOSPY router-flash openwrt
run "mcu-info STM32"           $BIOSPY mcu-info STM32

# ── File-based commands with synthetic input ─────────────────
TMP_BIN="$(mktemp -t biospy-smoke-XXXX.bin)"
trap 'rm -f "$TMP_BIN"' EXIT
# Create a synthetic 8MB BIOS image (all 0xFF padded with a marker).
node -e "const fs=require('fs');const b=Buffer.alloc(8*1024*1024,0xff);b.write('BIOS-TEST',0);fs.writeFileSync('$TMP_BIN',b);"
run "checksum file"            $BIOSPY checksum "$TMP_BIN"
run "dump file"                $BIOSPY dump "$TMP_BIN" 0x0 64
run "analyze file"             $BIOSPY analyze "$TMP_BIN"

# ── Bad inputs should fail cleanly (non-zero, no crash) ──────
expect_fail "missing file"     $BIOSPY checksum /tmp/does-not-exist-zzz
expect_fail "bad post-code"    $BIOSPY post-decode notahexcode

# ── Setup / connection diagnostic (no hardware needed) ───────
run "setup --dry-run" $BIOSPY setup --dry-run

# ── Summary ──────────────────────────────────────────────────
echo
echo "CLI smoke: $PASS pass, $FAIL fail"
if [ $FAIL -gt 0 ]; then
  echo "Failed commands:"
  for c in "${FAILED_CMDS[@]}"; do echo "  - $c"; done
  exit 1
fi
exit 0
