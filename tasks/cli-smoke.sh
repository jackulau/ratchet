#!/usr/bin/env bash
# CLI smoke — exercises the documented `ratchet` commands in safe modes against the
# mock backend (RATCHET_FORCE_MOCK=1), so the whole SPI/BIOS motherboard-fix path
# (read → write → verify → erase → full-repair) is checked end-to-end without hardware.
# Fails fast on any non-zero exit from a path that should succeed.
#
# Run from repo root: `bash tasks/cli-smoke.sh`

set -u
cd "$(dirname "$0")/.."

# ── Resolve the ratchet binary (prefer a prebuilt one; build release if missing) ──
if [ -x rust/target/release/ratchet ]; then
  RATCHET=rust/target/release/ratchet
elif [ -x rust/target/debug/ratchet ]; then
  RATCHET=rust/target/debug/ratchet
else
  echo "building ratchet (release) for smoke…" >&2
  (cd rust && cargo build --release -p ratchet-cli) >/dev/null 2>&1 || {
    echo "FAIL: could not build ratchet" >&2
    exit 1
  }
  RATCHET=rust/target/release/ratchet
fi

# Mock backend for every hardware-facing command — deterministic, no device needed.
export RATCHET_FORCE_MOCK=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
FAILED_CMDS=()

run() { # run "label" cmd... — expect exit 0
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1)); FAILED_CMDS+=("$label"); echo "  FAIL: $label  →  $*" >&2
  fi
}

expect_fail() { # expect_fail "label" cmd... — expect non-zero
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    FAIL=$((FAIL + 1)); FAILED_CMDS+=("$label (expected non-zero)")
    echo "  FAIL: $label expected non-zero exit but succeeded" >&2
  else
    PASS=$((PASS + 1))
  fi
}

# ── Help / version / self-test ───────────────────────────────
run "help"               $RATCHET --help
run "version"            $RATCHET --version
run "self-test"          $RATCHET self-test

# ── Database / lookup paths (no hardware) ────────────────────
run "search W25Q64"      $RATCHET search W25Q64
run "search by jedec"    $RATCHET search ef4017
run "search by vendor"   $RATCHET search Macronix
run "chip-info jedec"    $RATCHET chip-info ef4017
run "chip-info name"     $RATCHET chip-info W25Q64JV
expect_fail "chip-info bogus" $RATCHET chip-info notarealchip0000

# ── Programmer / chip status (mock) ──────────────────────────
run "status"             $RATCHET status
run "detect"             $RATCHET detect
run "identify"           $RATCHET identify
run "wp-status"          $RATCHET wp-status

# ── The motherboard-fix path: read → write → verify → erase ──
DUMP="$TMP/dump.bin"
run "read (backup)"      $RATCHET read "$DUMP"
if [ -s "$DUMP" ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); FAILED_CMDS+=("read produced empty file"); fi
# A real (non-blank) image to flash — an all-0xFF dump is correctly refused, so derive
# a varied 4 MB image from the binary itself.
IMG="$TMP/img.bin"
head -c $((4 * 1024 * 1024)) "$RATCHET" > "$IMG"
run "write (auto backup + verify)"      $RATCHET write "$IMG"
run "write --skip-backup --skip-verify" $RATCHET write "$IMG" --skip-backup --skip-verify
expect_fail "write refuses blank image" $RATCHET write "$DUMP"
run "verify"             $RATCHET verify "$DUMP"
run "erase"              $RATCHET erase

# ── Whole-chip workflows (the pipelines a repair drives) ─────
# full-backup writes ratchet-backup-<chip>.bin into CWD — run it inside the temp
# dir so the smoke can never collide with (or clobber) a backup at repo root.
run "full-backup"        bash -c "cd '$TMP' && '$PWD/$RATCHET' full-backup"
expect_fail "full-backup refuses clobber" bash -c "cd '$TMP' && '$PWD/$RATCHET' full-backup"
run "full-backup --force overwrites" bash -c "cd '$TMP' && '$PWD/$RATCHET' full-backup --force"
run "full-repair --skip-write" $RATCHET full-repair --skip-write
run "full-repair"        $RATCHET full-repair

# ── Pure analysis on the dump ────────────────────────────────
run "analyze"            $RATCHET analyze "$DUMP"
run "checksum"           $RATCHET checksum "$DUMP"

# ── Report ───────────────────────────────────────────────────
echo ""
echo "cli-smoke: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  printf '  - %s\n' "${FAILED_CMDS[@]}" >&2
  exit 1
fi
exit 0
