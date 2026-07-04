#!/usr/bin/env bash
# MCP smoke — drives the Rust ratchet-mcp binary end-to-end via JSON-RPC over
# stdio. Runs entirely against the mock backend (RATCHET_FORCE_MOCK=1) so no
# hardware is required and no destructive op can ever touch real silicon.
#
# Asserts: initialize handshake, 31-tool surface, read-only calls succeed AND
# carry backend:mock (so an agent can never mistake mock chip data for a real
# read), the confirm gate blocks destructive tools, a confirmed erase on the
# forced mock succeeds (tagged backend:mock), failure_search errors honestly,
# and transport-less hardware tools return JSON-RPC -32000.
#
# Run from repo root: `bash tasks/mcp-smoke.sh`

set -u
cd "$(dirname "$0")/.."

# ── Resolve the ratchet-mcp binary (prefer prebuilt; build release if missing) ──
if [ -x rust/target/release/ratchet-mcp ]; then
  MCP=rust/target/release/ratchet-mcp
elif [ -x rust/target/debug/ratchet-mcp ]; then
  MCP=rust/target/debug/ratchet-mcp
else
  echo "building ratchet-mcp (release)..." >&2
  (cd rust && cargo build --release -p ratchet-mcp --quiet) || exit 1
  MCP=rust/target/release/ratchet-mcp
fi

export RATCHET_FORCE_MOCK=1

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-smoke","version":"0"}}}'
INITIALIZED='{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

PASS=0
FAIL=0
FAILED_CHECKS=()

# One fresh server per request: handshake + one request, then EOF. Prints every
# response line; callers usually take `tail -1` (the answer to the request).
rpc() {
  printf '%s\n%s\n%s\n' "$INIT" "$INITIALIZED" "$1" | "$MCP" 2>/dev/null
}

# check <label> <response> <must-match-grep> [more-must-match...]
check() {
  local label="$1" response="$2"
  shift 2
  local ok=1 pattern
  for pattern in "$@"; do
    if ! grep -q -- "$pattern" <<<"$response"; then ok=0; fi
  done
  if [ "$ok" = 1 ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$label")
    echo "  FAIL: $label" >&2
    echo "        got: $response" >&2
  fi
}

# ── Handshake ──
FULL=$(rpc '{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}')
check "initialize answers with protocolVersion + serverInfo" \
  "$(head -1 <<<"$FULL")" '"protocolVersion"' '"ratchet-mcp"'

# ── Tool surface ──
TOOL_COUNT=$("$MCP" --list-tools | wc -l | tr -d ' ')
if [ "$TOOL_COUNT" = "31" ]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  FAILED_CHECKS+=("tool count $TOOL_COUNT != 31")
  echo "  FAIL: tool count $TOOL_COUNT != 31" >&2
fi
check "tools/list advertises the confirm-gated write_chip" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | tail -1)" \
  '"tools"' '"write_chip"' '"confirm"'

# ── Read-only tools succeed on the mock backend ──
check "detect succeeds" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"detect","arguments":{}}}' | tail -1)" '"result"'
check "identify succeeds, tagged backend:mock" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"identify","arguments":{}}}' | tail -1)" '"result"' 'backend' 'mock'
check "search_chips succeeds" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_chips","arguments":{"query":"W25Q64"}}}' | tail -1)" '"result"'
check "sfdp succeeds, tagged backend:mock" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sfdp","arguments":{}}}' | tail -1)" '"result"' 'density' 'backend' 'mock'
check "wp_status reports protection fields, tagged backend:mock" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"wp_status","arguments":{}}}' | tail -1)" '"result"' 'write_protected' 'backend' 'mock'

# read_chip → verify_chip → analyze_image against the same dump file.
# NOTE: requests with an interpolated path are built in a variable FIRST —
# macOS bash 3.2 mis-parses escaped quotes nested inside "$( ... )" and
# brace-expands the request into fragments.
SMOKE_TMP="$(mktemp -d)"
trap 'rm -rf "$SMOKE_TMP"' EXIT
DUMP="$SMOKE_TMP/mcp-dump.bin"
REQ_READ='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_chip","arguments":{"output":"'$DUMP'"}}}'
RESP_READ=$(rpc "$REQ_READ" | tail -1)
check "read_chip dumps the mock chip, tagged backend:mock" "$RESP_READ" '"result"' 'checksum' 'backend' 'mock'
if [ -s "$DUMP" ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); FAILED_CHECKS+=("read_chip produced empty dump"); echo "  FAIL: read_chip produced empty dump" >&2
fi
REQ_VERIFY='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"verify_chip","arguments":{"file":"'$DUMP'"}}}'
RESP_VERIFY=$(rpc "$REQ_VERIFY" | tail -1)
check "verify_chip matches the fresh dump, tagged backend:mock" "$RESP_VERIFY" '"result"' 'matches\\":true' 'backend' 'mock'
REQ_ANALYZE='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_image","arguments":{"file":"'$DUMP'"}}}'
RESP_ANALYZE=$(rpc "$REQ_ANALYZE" | tail -1)
check "analyze_image reports file size" "$RESP_ANALYZE" '"result"' 'fileSize'

# ── Confirm gate: destructive tools refuse without confirm=true ──
check "write_chip without confirm fails" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"write_chip","arguments":{"input":"/tmp/x.bin"}}}' | tail -1)" '"error"' 'confirm'
check "erase_chip without confirm fails" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"erase_chip","arguments":{}}}' | tail -1)" '"error"' 'confirm'
check "region_erase without confirm fails" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"region_erase","arguments":{"start":0,"length":4096}}}' | tail -1)" '"error"' 'confirm'
check "i2c_write without confirm fails" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"i2c_write","arguments":{"addr":80,"data_hex":"00"}}}' | tail -1)" '"error"' 'confirm'
check "wp_disable without confirm fails" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"wp_disable","arguments":{}}}' | tail -1)" '"error"' 'confirm'
check "wp_disable with confirm succeeds on forced mock" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"wp_disable","arguments":{"confirm":true}}}' | tail -1)" \
  '"result"' 'backend' 'mock'

# ── Destructive op WITH confirm on the forced mock succeeds, tagged backend:mock ──
check "erase_chip with confirm succeeds and reports mock backend" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"erase_chip","arguments":{"confirm":true}}}' | tail -1)" \
  '"result"' 'backend' 'mock'

# ── Honest errors ──
check "failure_search errors honestly (KB not bundled)" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"failure_search","arguments":{"query":"no boot"}}}' | tail -1)" \
  '"error"' 'not bundled'
check "transport-less hw tool returns -32000" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"swd_dump_ram","arguments":{"addr":0,"len":4}}}' | tail -1)" \
  '"error"' '"code":-32000'
check "unknown tool errors" \
  "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bogus_tool","arguments":{}}}' | tail -1)" \
  '"error"' 'Unknown tool'

echo
echo "mcp-smoke: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  for c in "${FAILED_CHECKS[@]}"; do echo "  - $c"; done
  exit 1
fi
exit 0
