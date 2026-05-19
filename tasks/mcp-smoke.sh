#!/usr/bin/env bash
# MCP smoke — drives dist/mcp/server.js end-to-end via JSON-RPC over stdio.
# Asserts the server starts, advertises tools, and answers calls with envelope-shaped responses.
# Runs in mock mode (BIOSPY_FORCE_MOCK=1) so no real hardware is required.
#
# Run from repo root: `bash tasks/mcp-smoke.sh`

set -u
cd "$(dirname "$0")/.."

if [ ! -x dist/mcp/server.js ]; then
  echo "FAIL: dist/mcp/server.js not built — run 'npm run build' first" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED_CHECKS=()

# Helper: drive one JSON-RPC interaction against a freshly-spawned MCP server.
# Sends init handshake, then a user-supplied tools/call (or tools/list), then EOF.
# Returns the response JSON for the user's request on stdout.
mcp_call() {
  local method="$1"
  local params="$2"
  BIOSPY_FORCE_MOCK=1 node -e '
    const { spawn } = require("child_process");
    const p = spawn("node", ["dist/mcp/server.js"], { stdio: ["pipe", "pipe", "ignore"], env: process.env });
    let buf = "";
    const pending = new Map();
    let nextId = 1;
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        } catch {}
      }
    });
    function request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, resolve);
        p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        setTimeout(() => reject(new Error("timeout " + method)), 15000);
      });
    }
    (async () => {
      await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.1" } });
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
      const resp = await request(process.argv[1], JSON.parse(process.argv[2]));
      console.log(JSON.stringify(resp));
      p.kill();
    })().catch((e) => { console.error("ERR:", e.message); p.kill(); process.exit(1); });
  ' "$method" "$params"
}

# Helper: assert the response is JSON, the call succeeded (result present, no top-level error),
# and the embedded envelope.ok matches the expected value (true/false).
# Pass empty string for expected_ok if the call should be tools/list (no envelope).
expect() {
  local label="$1"
  local expected_ok="$2"
  local response="$3"

  if ! echo "$response" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{try{JSON.parse(s)}catch{process.exit(1)}})' 2>/dev/null; then
    FAIL=$((FAIL + 1)); FAILED_CHECKS+=("$label — non-JSON response")
    echo "  FAIL: $label — non-JSON: $response" >&2
    return
  fi

  if [ "$expected_ok" = "" ]; then
    # tools/list path — assert result.tools exists
    local tool_count
    tool_count=$(echo "$response" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const r=JSON.parse(s); process.stdout.write(String(r.result?.tools?.length ?? 0))})')
    if [ "$tool_count" -ge 17 ]; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1)); FAILED_CHECKS+=("$label — tool count $tool_count < 17")
      echo "  FAIL: $label — expected ≥17 tools, got $tool_count" >&2
    fi
    return
  fi

  local actual_ok
  actual_ok=$(echo "$response" | node -e '
    let s=""; process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      const r = JSON.parse(s);
      const text = r.result?.content?.[0]?.text;
      if (!text) { process.stdout.write("NO_CONTENT"); return; }
      const env = JSON.parse(text);
      process.stdout.write(String(env.ok));
    })')
  if [ "$actual_ok" = "$expected_ok" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1)); FAILED_CHECKS+=("$label — envelope.ok=$actual_ok (expected $expected_ok)")
    echo "  FAIL: $label — envelope.ok=$actual_ok (expected $expected_ok)" >&2
  fi
}

# ── Tools list ─────────────────────────────────────────────
expect "tools/list returns ≥17 tools" "" "$(mcp_call tools/list '{}')"

# ── Read-only / database tools (expect envelope.ok=true) ───
expect "search_chips W25Q64JV" "true" "$(mcp_call tools/call '{"name":"search_chips","arguments":{"query":"W25Q64JV"}}')"
expect "chip_info ef4017"      "true" "$(mcp_call tools/call '{"name":"chip_info","arguments":{"query":"ef4017"}}')"
expect "post_decode 00"        "true" "$(mcp_call tools/call '{"name":"post_decode","arguments":{"code":"00"}}')"
expect "voltage_reference atx" "true" "$(mcp_call tools/call '{"name":"voltage_reference","arguments":{"connector":"atx"}}')"
expect "failure_search power"  "true" "$(mcp_call tools/call '{"name":"failure_search","arguments":{"category":"power"}}')"
expect "detect (mock)"         "true" "$(mcp_call tools/call '{"name":"detect","arguments":{}}')"
expect "identify (mock)"       "true" "$(mcp_call tools/call '{"name":"identify","arguments":{}}')"
expect "sfdp (mock)"           "true" "$(mcp_call tools/call '{"name":"sfdp","arguments":{}}')"
expect "wp_status (mock)"      "true" "$(mcp_call tools/call '{"name":"wp_status","arguments":{}}')"

# ── Safety-gated destructive tools without confirm (expect envelope.ok=false) ───
expect "write_chip without confirm fails" "false" "$(mcp_call tools/call '{"name":"write_chip","arguments":{"path":"/tmp/x","confirm":false}}')"
expect "erase_chip without confirm fails" "false" "$(mcp_call tools/call '{"name":"erase_chip","arguments":{"confirm":false}}')"
expect "region_erase without confirm fails" "false" "$(mcp_call tools/call '{"name":"region_erase","arguments":{"start_addr":0,"length":4096,"confirm":false}}')"

# ── Erase with confirm (mock backend — should succeed) ───
expect "erase_chip with confirm succeeds" "true" "$(mcp_call tools/call '{"name":"erase_chip","arguments":{"confirm":true}}')"

# ── Image analysis with synthetic 8MB image ───
TMP_BIN="$(mktemp -t biospy-mcp-smoke-XXXX.bin)"
trap 'rm -f "$TMP_BIN"' EXIT
node -e "const fs=require('fs');const b=Buffer.alloc(8*1024*1024,0xff);b.write('BIOS-TEST',0);fs.writeFileSync('$TMP_BIN',b);"
ANALYZE_PARAMS="$(node -e "process.stdout.write(JSON.stringify({name:'analyze_image',arguments:{path:'$TMP_BIN'}}))")"
expect "analyze_image synthetic" "true" "$(mcp_call tools/call "$ANALYZE_PARAMS")"

# ── Error path: missing file ───
expect "analyze_image missing file" "false" "$(mcp_call tools/call '{"name":"analyze_image","arguments":{"path":"/no/such/file.bin"}}')"
expect "chip_info miss"             "false" "$(mcp_call tools/call '{"name":"chip_info","arguments":{"query":"notarealchip0000"}}')"
expect "post_decode invalid"        "false" "$(mcp_call tools/call '{"name":"post_decode","arguments":{"code":"notahex"}}')"

# ── Summary ───
echo
echo "MCP smoke: $PASS pass, $FAIL fail"
if [ $FAIL -gt 0 ]; then
  echo "Failed checks:"
  for c in "${FAILED_CHECKS[@]}"; do echo "  - $c"; done
  exit 1
fi
exit 0
