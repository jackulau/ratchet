// ratchet MCP server — hand-rolled JSON-RPC 2.0 over stdio.
// Skips third-party MCP crates per the project's "fully custom" objective.
// Surface: 30 tools — 18 SPI-flash / BIOS analysis + 12 hardware-protocol tools
// (I2C, UART, JTAG, SWD, AVR/ESP/STM32 programmers, logic analyzer, Bus Pirate,
// slcan CAN). Hardware-protocol handlers return placeholder JSON until live USB
// wiring lands; the dispatch surface, JSON-schema descriptors, and arg shapes
// are real today.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};

const PROTOCOL_VERSION: &str = "2024-11-05";

fn main() -> anyhow::Result<()> {
    // `--list-tools` short-circuits the JSON-RPC loop and prints just the
    // registered tool names — handy for shell smoke tests and discovery.
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
        // D28 hardware-capability tools (stubs until live USB wiring lands).
        "i2c_scan" => call_hw_stub("i2c_scan"),
        "i2c_read" => call_hw_stub("i2c_read"),
        "i2c_write" => call_hw_stub("i2c_write"),
        "uart_capture" => call_hw_stub("uart_capture"),
        "jtag_idcode_scan" => call_hw_stub("jtag_idcode_scan"),
        "swd_dump_ram" => call_hw_stub("swd_dump_ram"),
        "avr_program" => call_hw_stub("avr_program"),
        "esp_flash" => call_hw_stub("esp_flash"),
        "stm32_swd_flash" => call_hw_stub("stm32_swd_flash"),
        "la_capture" => call_hw_stub("la_capture"),
        "bus_pirate_proxy" => call_hw_stub("bus_pirate_proxy"),
        "can_sniff" => call_hw_stub("can_sniff"),
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

// ─── Hardware-capability stub (D28) ─────────────────────────────────────────

fn call_hw_stub(name: &str) -> Value {
    json!({
        "ok": true,
        "stub": true,
        "tool": name,
        "note": "registered; live USB wiring lands in a follow-up goal"
    })
}

// ─── Mock-backed tool impls ──────────────────────────────────────────────────

fn call_detect() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let info = m.detect_programmer().map_err(map_err)?;
    Ok(serde_json::to_value(&info).unwrap_or(Value::Null))
}

fn call_identify() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let info = m.identify_chip().map_err(map_err)?;
    Ok(serde_json::to_value(&info).unwrap_or(Value::Null))
}

fn call_sfdp() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let s = m.read_sfdp().map_err(map_err)?;
    Ok(serde_json::to_value(&s).unwrap_or(Value::Null))
}

fn call_wp_status() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let sr = m.read_status_registers().map_err(map_err)?;
    let wp = m.is_write_protected().map_err(map_err)?;
    Ok(json!({"write_protected": wp, "sr1": sr.sr1, "sr2": sr.sr2, "sr3": sr.sr3}))
}

fn call_read_chip(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let output = arg_str(args, "output")?;
    let mut m = MockBackend::default();
    let r = m
        .read_chip(std::path::Path::new(&output))
        .map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_write_chip(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend, WriteOpts};
    let input = arg_str(args, "input")?;
    let opts = WriteOpts {
        skip_backup: arg_bool(args, "skip_backup"),
        skip_verify: arg_bool(args, "skip_verify"),
    };
    let mut m = MockBackend::default();
    let r = m
        .write_chip(std::path::Path::new(&input), opts)
        .map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_verify_chip(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let file = arg_str(args, "file")?;
    let mut m = MockBackend::default();
    let r = m
        .verify_chip(std::path::Path::new(&file))
        .map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_erase_chip() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let r = m.erase_chip().map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_region_erase(args: &Value) -> Result<Value, (i32, String)> {
    use ratchet_core::backends::{mock::MockBackend, Backend};
    let start = arg_u64(args, "start")?;
    let length = arg_u64(args, "length")?;
    let mut m = MockBackend::default();
    let r = m.region_erase(start, length).map_err(map_err)?;
    Ok(serde_json::to_value(&r).unwrap_or(Value::Null))
}

fn call_blank_check() -> Result<Value, (i32, String)> {
    use ratchet_core::backends::mock::MockBackend;
    let m = MockBackend::default();
    let blank = m.flash_bytes().iter().all(|b| *b == 0xff);
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
