// ratchet MCP server  -  hand-rolled JSON-RPC 2.0 over stdio.
// Skips third-party MCP crates per the project's "fully custom" objective.
// Surface: 30 tools  -  18 SPI-flash / BIOS analysis + 12 hardware-protocol tools
// (I2C, UART, JTAG, SWD, AVR/ESP/STM32 programmers, logic analyzer, Bus Pirate,
// slcan CAN). Hardware-protocol handlers return placeholder JSON until live USB
// wiring lands; the dispatch surface, JSON-schema descriptors, and arg shapes
// are real today.

use ratchet_core::backends::{open_default, open_raw_bus, Backend, BackendKind};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::sync::OnceLock;

const PROTOCOL_VERSION: &str = "2024-11-05";

/// Open the live-or-mock backend. Warning (no-device, libusb-init failure,
/// etc.) is logged once to stderr so MCP clients see the note in their server
/// log without polluting every JSON-RPC response.
fn open_dyn() -> Box<dyn Backend + Send> {
    static WARNED: OnceLock<()> = OnceLock::new();
    let r = open_default();
    if let Some(ref msg) = r.warning {
        if WARNED.set(()).is_ok() {
            eprintln!("ratchet-mcp: {msg}");
        }
    }
    r.backend
}

/// Open the backend for a DESTRUCTIVE tool (write_chip / erase_chip /
/// region_erase). Refuses to run when the factory silently fell back to mock:
/// an agent that believes it flashed a BIOS while the bytes went to an
/// in-memory fake is a bricked board waiting to happen. Explicitly setting
/// RATCHET_FORCE_MOCK=1 remains allowed (test / smoke path).
#[allow(clippy::type_complexity)]
fn open_dyn_destructive(op: &str) -> Result<(Box<dyn Backend + Send>, BackendKind), (i32, String)> {
    let r = open_default();
    if r.kind == BackendKind::Mock && !r.force_mock_env {
        return Err((
            -32000,
            format!(
                "{op}: refusing to run against the mock fallback backend ({}). Plug in a \
                 CH341A/CH347 programmer, or set RATCHET_FORCE_MOCK=1 to target the mock \
                 explicitly.",
                r.warning
                    .as_deref()
                    .unwrap_or("no CH341A or CH347 USB device detected")
            ),
        ));
    }
    Ok((r.backend, r.kind))
}

/// Tag a destructive-op result with the backend kind so agents can tell real
/// silicon results from explicitly-mocked ones.
fn with_backend_field(v: Value, kind: BackendKind) -> Value {
    let mut v = v;
    if let Some(obj) = v.as_object_mut() {
        obj.insert("backend".to_string(), Value::String(kind.as_str().into()));
    }
    v
}

fn main() -> anyhow::Result<()> {
    // `--list-tools` short-circuits the JSON-RPC loop and prints just the
    // registered tool names  -  handy for shell smoke tests and discovery.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--list-tools") {
        for t in tool_list() {
            if let Some(name) = t.get("name").and_then(|v| v.as_str()) {
                println!("{name}");
            }
        }
        return Ok(());
    }

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    // Stream of newline-delimited JSON-RPC messages. Read until EOF.
    let reader = BufReader::new(stdin.lock());
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let response = handle_line(&line);
        if let Some(resp) = response {
            writeln!(out, "{resp}")?;
            out.flush()?;
        }
    }
    Ok(())
}

fn handle_line(line: &str) -> Option<String> {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            return Some(error_response(
                Value::Null,
                -32700,
                &format!("Parse error: {e}"),
            ));
        }
    };
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);

    let is_notification = req.get("id").is_none();

    let result = dispatch(method, &params);
    if is_notification {
        return None;
    }
    Some(match result {
        Ok(v) => success_response(id, v),
        Err((code, msg)) => error_response(id, code, &msg),
    })
}

fn dispatch(method: &str, params: &Value) -> Result<Value, (i32, String)> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "ratchet-mcp", "version": env!("CARGO_PKG_VERSION") },
        })),
        "tools/list" => Ok(json!({ "tools": tool_list() })),
        "tools/call" => tool_call(params),
        "ping" => Ok(json!({})),
        _ => Err((-32601, format!("Method not found: {method}"))),
    }
}

fn success_response(id: Value, result: Value) -> String {
    serde_json::to_string(&json!({ "jsonrpc": "2.0", "id": id, "result": result }))
        .unwrap_or_default()
}

fn error_response(id: Value, code: i32, message: &str) -> String {
    serde_json::to_string(&json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    }))
    .unwrap_or_default()
}

// ─── Tool registry ───────────────────────────────────────────────────────────

fn tool_list() -> Vec<Value> {
    vec![
        tool(
            "detect",
            "Detect attached USB programmer",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "identify",
            "Identify the connected SPI flash chip by JEDEC ID",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "sfdp",
            "Read the chip's SFDP table",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "wp_status",
            "Read write-protection status (SR1/SR2/SR3)",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "read_chip",
            "Read the entire chip into a file",
            json!({
                "type":"object","required":["output"],
                "properties":{"output":{"type":"string","description":"Output file path"}}
            }),
        ),
        tool(
            "write_chip",
            "Write a file to the chip",
            json!({
                "type":"object","required":["input"],
                "properties":{
                    "input":{"type":"string"},
                    "skip_backup":{"type":"boolean","default":false},
                    "skip_verify":{"type":"boolean","default":false}
                }
            }),
        ),
        tool(
            "verify_chip",
            "Verify chip contents against a file",
            json!({
                "type":"object","required":["file"],
                "properties":{"file":{"type":"string"}}
            }),
        ),
        tool(
            "erase_chip",
            "Erase the entire chip",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "region_erase",
            "Erase a specific byte range",
            json!({
                "type":"object","required":["start","length"],
                "properties":{
                    "start":{"type":"integer","minimum":0},
                    "length":{"type":"integer","minimum":1}
                }
            }),
        ),
        tool(
            "blank_check",
            "Check whether the chip is blank (all 0xFF)",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "analyze_image",
            "Analyze a BIOS image file (UEFI volumes, vendor, regions)",
            json!({
                "type":"object","required":["file"],
                "properties":{"file":{"type":"string"}}
            }),
        ),
        tool(
            "bios_regions",
            "List Intel FD / raw regions in a BIOS image",
            json!({
                "type":"object","required":["file"],
                "properties":{"file":{"type":"string"}}
            }),
        ),
        tool(
            "nvram_vars",
            "Enumerate NVRAM variables in a BIOS image",
            json!({
                "type":"object","required":["file"],
                "properties":{"file":{"type":"string"}}
            }),
        ),
        tool(
            "search_chips",
            "Search the 806-chip database",
            json!({
                "type":"object","required":["query"],
                "properties":{"query":{"type":"string"}}
            }),
        ),
        tool(
            "chip_info",
            "Look up a chip by name or JEDEC ID",
            json!({
                "type":"object","required":["key"],
                "properties":{"key":{"type":"string"}}
            }),
        ),
        tool(
            "post_decode",
            "Decode a BIOS POST code (AMI/Award/Phoenix/UEFI)",
            json!({
                "type":"object","required":["code"],
                "properties":{
                    "code":{"type":"string","description":"Hex code, with or without 0x prefix"},
                    "standard":{"type":"string","enum":["ami","award","phoenix","uefi"]}
                }
            }),
        ),
        tool(
            "failure_search",
            "Search the failure-pattern KB",
            json!({
                "type":"object","required":["query"],
                "properties":{"query":{"type":"string"}}
            }),
        ),
        tool(
            "voltage_reference",
            "Look up the voltage class for a chip",
            json!({
                "type":"object","required":["jedec_id"],
                "properties":{"jedec_id":{"type":"string"}}
            }),
        ),
        // ─── Hardware-capability tools (D28) ─────────────────────────────
        tool(
            "i2c_scan",
            "Probe the I2C bus for ACKing 7-bit addresses (0x08..=0x77)",
            json!({"type":"object","properties":{}}),
        ),
        tool(
            "i2c_read",
            "Read bytes from an I2C device at a register address",
            json!({
                "type":"object","required":["addr","reg","len"],
                "properties":{
                    "addr":{"type":"integer","description":"7-bit I2C address"},
                    "reg":{"type":"integer"},
                    "len":{"type":"integer","minimum":1,"maximum":256}
                }
            }),
        ),
        tool(
            "i2c_write",
            "Write hex-encoded bytes to an I2C device",
            json!({
                "type":"object","required":["addr","data_hex"],
                "properties":{
                    "addr":{"type":"integer"},
                    "data_hex":{"type":"string"}
                }
            }),
        ),
        tool(
            "uart_capture",
            "Capture from a UART port for N milliseconds",
            json!({
                "type":"object","required":["port","baud","duration_ms"],
                "properties":{
                    "port":{"type":"string"},
                    "baud":{"type":"integer"},
                    "duration_ms":{"type":"integer"}
                }
            }),
        ),
        tool(
            "jtag_idcode_scan",
            "Scan the JTAG chain for IDCODE entries",
            json!({
                "type":"object",
                "properties":{"max_devices":{"type":"integer","default":8}}
            }),
        ),
        tool(
            "swd_dump_ram",
            "Read N bytes of target RAM via SWD",
            json!({
                "type":"object","required":["addr","len"],
                "properties":{
                    "addr":{"type":"integer"},
                    "len":{"type":"integer","minimum":1}
                }
            }),
        ),
        tool(
            "avr_program",
            "Program an AVR (ATmega328P / ATtiny85 / ATmega2560) over ISP from an Intel HEX file",
            json!({
                "type":"object","required":["hex"],
                "properties":{"hex":{"type":"string","description":"Path to .hex file"}}
            }),
        ),
        tool(
            "esp_flash",
            "Flash a binary to ESP32/ESP8266 at a given offset",
            json!({
                "type":"object","required":["binary","offset"],
                "properties":{
                    "binary":{"type":"string"},
                    "offset":{"type":"integer"}
                }
            }),
        ),
        tool(
            "stm32_swd_flash",
            "Program STM32 flash via SWD",
            json!({
                "type":"object","required":["binary","offset"],
                "properties":{
                    "binary":{"type":"string"},
                    "offset":{"type":"integer"}
                }
            }),
        ),
        tool(
            "la_capture",
            "Capture a window of digital logic samples",
            json!({
                "type":"object","required":["channels","rate","samples"],
                "properties":{
                    "channels":{"type":"integer","minimum":1,"maximum":8},
                    "rate":{"type":"integer"},
                    "samples":{"type":"integer"}
                }
            }),
        ),
        tool(
            "bus_pirate_proxy",
            "Open a transparent terminal bridge to a Bus Pirate USB-CDC port",
            json!({
                "type":"object","required":["port"],
                "properties":{"port":{"type":"string"}}
            }),
        ),
        tool(
            "can_sniff",
            "Sniff a CAN bus via a slcan adapter for N milliseconds",
            json!({
                "type":"object","required":["port","bitrate_kbps","duration_ms"],
                "properties":{
                    "port":{"type":"string"},
                    "bitrate_kbps":{"type":"integer"},
                    "duration_ms":{"type":"integer"}
                }
            }),
        ),
    ]
}

fn tool(name: &str, desc: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": desc,
        "inputSchema": input_schema,
    })
}

// ─── Tool dispatch ───────────────────────────────────────────────────────────

fn tool_call(params: &Value) -> Result<Value, (i32, String)> {
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| (-32602, "tools/call missing `name` argument".to_string()))?;
    let args = params
        .get("arguments")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));

    let result_value = match name {
        "detect" => call_detect()?,
        "identify" => call_identify()?,
        "sfdp" => call_sfdp()?,
        "wp_status" => call_wp_status()?,
        "read_chip" => call_read_chip(&args)?,
        "write_chip" => call_write_chip(&args)?,
        "verify_chip" => call_verify_chip(&args)?,
        "erase_chip" => call_erase_chip()?,
        "region_erase" => call_region_erase(&args)?,
        "blank_check" => call_blank_check()?,
        "analyze_image" => call_analyze_image(&args)?,
        "bios_regions" => call_bios_regions(&args)?,
        "nvram_vars" => call_nvram_vars(&args)?,
        "search_chips" => call_search_chips(&args)?,
        "chip_info" => call_chip_info(&args)?,
        "post_decode" => call_post_decode(&args)?,
        "failure_search" => call_failure_search(&args)?,
        "voltage_reference" => call_voltage_reference(&args)?,
        // Hardware-protocol tools. i2c_* and jtag_idcode_scan run the real
        // protocol over a live CH341A/CH347 (honest error when none present);
        // the rest fail honestly until their transport adapter is wired.
        "i2c_scan" => call_i2c_scan()?,
        "i2c_read" => call_i2c_read(&args)?,
        "i2c_write" => call_i2c_write(&args)?,
        "jtag_idcode_scan" => call_jtag_idcode_scan(&args)?,
        "uart_capture" => hw_unavailable_mcp(
            "uart_capture",
            "live capture needs a sampler backend (none wired)",
        )?,
        "swd_dump_ram" => {
            hw_unavailable_mcp("swd_dump_ram", "SWD needs a SWDIO/SWCLK bit-bang adapter")?
        }
        "avr_program" => hw_unavailable_mcp("avr_program", "AVR ISP needs a SPI+RESET adapter")?,
        "esp_flash" => hw_unavailable_mcp("esp_flash", "esptool protocol needs a live UART")?,
        "stm32_swd_flash" => hw_unavailable_mcp("stm32_swd_flash", "needs a live SWD transport")?,
        "la_capture" => hw_unavailable_mcp("la_capture", "live sampling needs a sampler backend")?,
        "bus_pirate_proxy" => hw_unavailable_mcp(
            "bus_pirate_proxy",
            "needs an external USB-CDC serial transport",
        )?,
        "can_sniff" => hw_unavailable_mcp(
            "can_sniff",
            "slcan needs an external USBtin/CANable adapter",
        )?,
        other => return Err((-32601, format!("Unknown tool: {other}"))),
    };
    Ok(json!({
        "content": [{"type": "text", "text": serde_json::to_string(&result_value).unwrap_or_default()}],
        "isError": false
    }))
}

fn arg_str(args: &Value, key: &str) -> Result<String, (i32, String)> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| (-32602, format!("Missing or non-string argument: {key}")))
}

fn arg_u64(args: &Value, key: &str) -> Result<u64, (i32, String)> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .ok_or_else(|| (-32602, format!("Missing or non-integer argument: {key}")))
}

fn arg_bool(args: &Value, key: &str) -> bool {
    args.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

// ─── Hardware-protocol tools ────────────────────────────────────────────────

/// Honest failure for a tool whose protocol logic exists and is unit-tested,
/// but which has no live CH341A/CH347 transport wired yet. Returns a JSON-RPC
/// error so the client sees a failure, never a fake success.
fn hw_unavailable_mcp(tool: &str, reason: &str) -> Result<Value, (i32, String)> {
    Err((
        -32000,
        format!(
            "{tool}: not available: {reason}. The protocol is implemented and unit-tested, \
             but no live CH341A/CH347 transport is wired for it yet"
        ),
    ))
}

/// Run an I2C action against whichever live backend is present (mirrors the
/// CLI's `run_i2c`): both real masters run behind a `&mut dyn I2cMaster`.
fn run_i2c_mcp<R>(
    f: impl FnOnce(
        &mut dyn ratchet_core::protocols::i2c::I2cMaster,
    ) -> ratchet_core::backends::Result<R>,
) -> Result<R, (i32, String)> {
    use ratchet_core::protocols::i2c::{Ch341aI2c, Ch347I2c};
    let raw = open_raw_bus().map_err(map_err)?;
    let mut bus = raw.bus;
    let out = match raw.kind {
        BackendKind::Ch347 => {
            let mut m = Ch347I2c::new(&mut bus);
            f(&mut m)
        }
        BackendKind::Ch341a => {
            let mut m = Ch341aI2c::new(&mut bus).map_err(map_err)?;
            f(&mut m)
        }
        BackendKind::Mock => unreachable!("open_raw_bus never yields Mock"),
    };
    out.map_err(map_err)
}

fn call_i2c_scan() -> Result<Value, (i32, String)> {
    let addrs = run_i2c_mcp(|m| m.scan_bus())?;
    let hex: Vec<String> = addrs.iter().map(|a| format!("0x{a:02x}")).collect();
    Ok(json!({ "addresses": hex, "count": addrs.len() }))
}

fn call_i2c_read(args: &Value) -> Result<Value, (i32, String)> {
    let addr = arg_u64(args, "addr")? as u8;
    let reg = arg_u64(args, "reg")? as u8;
    let len = arg_u64(args, "len")? as usize;
    let data = run_i2c_mcp(|m| m.write_then_read(addr, &[reg], len))?;
    let hex: String = data.iter().map(|b| format!("{b:02x}")).collect();
    Ok(json!({ "addr": format!("0x{addr:02x}"), "reg": format!("0x{reg:02x}"), "data": hex }))
}

fn call_i2c_write(args: &Value) -> Result<Value, (i32, String)> {
    let addr = arg_u64(args, "addr")? as u8;
    let data_hex = arg_str(args, "data_hex")?;
    let bytes = decode_hex(&data_hex)?;
    let n = bytes.len();
    run_i2c_mcp(|m| m.write(addr, &bytes))?;
    Ok(json!({ "addr": format!("0x{addr:02x}"), "bytes_written": n }))
}

fn call_jtag_idcode_scan(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::protocols::jtag::{scan_idcode_chain, Ch347Jtag};
    let max_devices = args
        .get("max_devices")
        .and_then(|v| v.as_u64())
        .unwrap_or(8) as usize;
    let raw = open_raw_bus().map_err(map_err)?;
    if raw.kind != BackendKind::Ch347 {
        return Err((
            -32000,
            format!(
                "jtag_idcode_scan requires a CH347 (detected {}; CH341A has no JTAG engine)",
                raw.kind.as_str()
            ),
        ));
    }
    let mut bus = raw.bus;
    let mut jtag = Ch347Jtag::new(&mut bus);
    let chain = scan_idcode_chain(&mut jtag, max_devices).map_err(map_err)?;
    let entries: Vec<Value> = chain
        .entries
        .iter()
        .map(|e| {
            json!({
                "idcode": format!("0x{:08x}", e.idcode),
                "manufacturer": format!("0x{:03x}", e.manufacturer),
                "part": format!("0x{:04x}", e.part),
                "version": e.version,
            })
        })
        .collect();
    Ok(json!({ "devices": entries.len(), "chain": entries }))
}

/// Decode a hex string ("dead beef", "0xde,0xad") into bytes for tool args.
fn decode_hex(s: &str) -> Result<Vec<u8>, (i32, String)> {
    let cleaned: String = s
        .replace("0x", "")
        .replace("0X", "")
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    if cleaned.len() % 2 != 0 {
        return Err((
            -32602,
            "data_hex must have an even number of hex digits".into(),
        ));
    }
    (0..cleaned.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&cleaned[i..i + 2], 16)
                .map_err(|e| (-32602, format!("invalid hex byte: {e}")))
        })
        .collect()
}

// ─── Mock-backed tool impls ──────────────────────────────────────────────────

fn call_detect() -> Result<Value, (i32, String)> {
    let mut m = open_dyn();
    let info = m.detect_programmer().map_err(map_err)?;
    Ok(serde_json::to_value(&info).unwrap_or(Value::Null))
}

fn call_identify() -> Result<Value, (i32, String)> {
    let mut m = open_dyn();
    let info = m.identify_chip().map_err(map_err)?;
    Ok(serde_json::to_value(&info).unwrap_or(Value::Null))
}

fn call_sfdp() -> Result<Value, (i32, String)> {
    let mut m = open_dyn();
    let s = m.read_sfdp().map_err(map_err)?;
    Ok(serde_json::to_value(&s).unwrap_or(Value::Null))
}

fn call_wp_status() -> Result<Value, (i32, String)> {
    let mut m = open_dyn();
    let sr = m.read_status_registers().map_err(map_err)?;
    let wp = m.is_write_protected().map_err(map_err)?;
    Ok(json!({"write_protected": wp, "sr1": sr.sr1, "sr2": sr.sr2, "sr3": sr.sr3}))
}

fn call_read_chip(args: &Value) -> Result<Value, (i32, String)> {
    let output = arg_str(args, "output")?;
    let mut m = open_dyn();
    let r = m
        .read_chip(std::path::Path::new(&output))
        .map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_write_chip(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::backends::WriteOpts;
    let input = arg_str(args, "input")?;
    let opts = WriteOpts {
        skip_backup: arg_bool(args, "skip_backup"),
        skip_verify: arg_bool(args, "skip_verify"),
    };
    let (mut m, kind) = open_dyn_destructive("write_chip")?;
    let r = m
        .write_chip(std::path::Path::new(&input), opts)
        .map_err(map_err)?;
    Ok(with_backend_field(
        serde_json::to_value(&r).unwrap_or(Value::Null),
        kind,
    ))
}

fn call_verify_chip(args: &Value) -> Result<Value, (i32, String)> {
    let file = arg_str(args, "file")?;
    let mut m = open_dyn();
    let r = m
        .verify_chip(std::path::Path::new(&file))
        .map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_erase_chip() -> Result<Value, (i32, String)> {
    let (mut m, kind) = open_dyn_destructive("erase_chip")?;
    let r = m.erase_chip().map_err(map_err)?;
    Ok(with_backend_field(
        serde_json::to_value(&r).unwrap_or(Value::Null),
        kind,
    ))
}

fn call_region_erase(args: &Value) -> Result<Value, (i32, String)> {
    let start = arg_u64(args, "start")?;
    let length = arg_u64(args, "length")?;
    let (mut m, kind) = open_dyn_destructive("region_erase")?;
    let r = m.region_erase(start, length).map_err(map_err)?;
    Ok(with_backend_field(
        serde_json::to_value(&r).unwrap_or(Value::Null),
        kind,
    ))
}

fn call_blank_check() -> Result<Value, (i32, String)> {
    let mut m = open_dyn();
    let tmp = std::env::temp_dir().join(format!(
        "ratchet-mcp-blank-check-{}.bin",
        std::process::id()
    ));
    m.read_chip(&tmp).map_err(map_err)?;
    let data = std::fs::read(&tmp).map_err(|e| (-32000, e.to_string()))?;
    let _ = std::fs::remove_file(&tmp);
    let blank = data.iter().all(|b| *b == 0xff);
    Ok(json!({"blank": blank}))
}

fn call_analyze_image(args: &Value) -> Result<Value, (i32, String)> {
    let file = arg_str(args, "file")?;
    let data = std::fs::read(&file).map_err(|e| (-32000, e.to_string()))?;
    let report = ratchet_core::analysis::bios::analyze_bytes(&data);
    Ok(serde_json::to_value(&report).unwrap_or(Value::Null))
}

fn call_bios_regions(args: &Value) -> Result<Value, (i32, String)> {
    let file = arg_str(args, "file")?;
    let data = std::fs::read(&file).map_err(|e| (-32000, e.to_string()))?;
    let regions = ratchet_core::analysis::regions::list_regions(&data);
    Ok(serde_json::to_value(&regions).unwrap_or(Value::Null))
}

fn call_nvram_vars(args: &Value) -> Result<Value, (i32, String)> {
    let file = arg_str(args, "file")?;
    let data = std::fs::read(&file).map_err(|e| (-32000, e.to_string()))?;
    let store = ratchet_core::analysis::nvram::parse_nvram_store(&data, None);
    Ok(serde_json::to_value(&store).unwrap_or(Value::Null))
}

fn call_search_chips(args: &Value) -> Result<Value, (i32, String)> {
    let query = arg_str(args, "query")?;
    let r = ratchet_core::chips::search(&query);
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_chip_info(args: &Value) -> Result<Value, (i32, String)> {
    let key = arg_str(args, "key")?;
    let chip = ratchet_core::chips::lookup_by_jedec_id(&key)
        .or_else(|| ratchet_core::chips::lookup_by_name(&key));
    Ok(serde_json::to_value(chip).unwrap_or(Value::Null))
}

fn call_post_decode(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::diagnostics::post_codes::{lookup, PostStandard};
    let code = arg_str(args, "code")?;
    let standard = args.get("standard").and_then(|v| v.as_str());
    let std_filter = match standard {
        Some("ami") => Some(PostStandard::Ami),
        Some("award") => Some(PostStandard::Award),
        Some("phoenix") => Some(PostStandard::Phoenix),
        Some("uefi") => Some(PostStandard::Uefi),
        Some(other) => return Err((-32602, format!("unknown standard: {other}"))),
        None => None,
    };
    let hits = lookup(&code, std_filter);
    Ok(serde_json::to_value(&hits).unwrap_or(Value::Null))
}

fn call_failure_search(args: &Value) -> Result<Value, (i32, String)> {
    let q = arg_str(args, "query")?;
    Ok(json!({"query": q, "results": serde_json::Value::Array(vec![])}))
}

fn call_voltage_reference(args: &Value) -> Result<Value, (i32, String)> {
    let jedec = arg_str(args, "jedec_id")?;
    let v = ratchet_core::chips::get_chip_voltage(&jedec);
    Ok(json!({"jedec_id": jedec, "voltage_v": v}))
}

fn map_err<E: std::fmt::Display>(e: E) -> (i32, String) {
    (-32000, e.to_string())
}
