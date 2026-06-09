// ratchet CLI - full subcommand surface. Backend selection runs through
// `ratchet_core::backends::open_default()`, which picks between mock, CH341A,
// and CH347 based on `RATCHET_FORCE_MOCK` and USB device presence.

use clap::{Parser, Subcommand};
use ratchet_core::agent::envelope::AgentEnvelope;
use ratchet_core::backends::{open_default, open_raw_bus, Backend, BackendKind, RawBus};
use serde_json::json;
use std::sync::OnceLock;

#[derive(Parser, Debug)]
#[command(
    name = "ratchet",
    version,
    about = "ratchet  -  multi-protocol hardware debug + programming toolkit (CH341A / CH347): SPI flash, I2C, UART, 1-Wire, JTAG, SWD, CAN, AVR / STM32 / ESP programmers, logic analyzer. Fully native Rust."
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
    /// Top-level alias for the `self-test` subcommand (mirrors TS CLI flag form).
    #[arg(long = "self-test", global = true)]
    self_test_flag: bool,
    /// Top-level alias for `--json` (when used with `--self-test`).
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Show programmer status (backend kind, force-mock state, warnings).
    Status {
        #[arg(long)]
        json: bool,
    },
    /// Detect attached USB programmer.
    Detect {
        #[arg(long)]
        json: bool,
    },
    /// Identify the connected SPI flash chip via JEDEC ID.
    Identify {
        #[arg(long)]
        json: bool,
    },
    /// Read the entire chip into a file.
    Read {
        output: String,
        #[arg(long)]
        json: bool,
    },
    /// Write a file to the chip.
    Write {
        input: String,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        skip_backup: bool,
        #[arg(long)]
        skip_verify: bool,
    },
    /// Erase the entire chip.
    Erase {
        #[arg(long)]
        json: bool,
    },
    /// Verify the chip against a file.
    Verify {
        file: String,
        #[arg(long)]
        json: bool,
    },
    /// Analyze a BIOS image (UEFI volumes, vendor, regions, health).
    Analyze {
        file: String,
        #[arg(long)]
        json: bool,
    },
    /// Diff two BIOS images byte-by-byte.
    Diff {
        a: String,
        b: String,
        #[arg(long)]
        json: bool,
    },
    /// Compute MD5/SHA-256/CRC32 checksum of a file.
    Checksum {
        file: String,
        #[arg(long)]
        json: bool,
    },
    /// Search the chip database.
    Search {
        query: String,
        #[arg(long)]
        json: bool,
    },
    /// Serial debug  -  connect to a CH343 UART and stream lines.
    Serial {
        port: String,
        #[arg(long, default_value = "115200")]
        baud: u32,
        #[arg(long)]
        json: bool,
    },
    /// List available serial ports (CH34x family).
    SerialList {
        #[arg(long)]
        json: bool,
    },
    /// Show chip-database entry by name or JEDEC ID.
    ChipInfo {
        key: String,
        #[arg(long)]
        json: bool,
    },
    /// Decode a BIOS POST code.
    PostDecode {
        code: String,
        #[arg(long)]
        standard: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Search failure pattern KB.
    FailureSearch {
        query: String,
        #[arg(long)]
        json: bool,
    },
    /// Show voltage reference for a chip.
    VoltageReference {
        jedec_id: String,
        #[arg(long)]
        json: bool,
    },
    /// Read raw SFDP table from the chip.
    Sfdp {
        #[arg(long)]
        json: bool,
    },
    /// Read write-protection status (SR1/SR2/SR3).
    WpStatus {
        #[arg(long)]
        json: bool,
    },
    /// Erase a specific byte range.
    RegionErase {
        start: String,
        length: String,
        #[arg(long)]
        json: bool,
    },
    /// Check whether the chip is blank (all 0xFF).
    BlankCheck {
        #[arg(long)]
        json: bool,
    },
    /// Interactive REPL for chip operations.
    Repl,
    /// Run the offline self-test (mock backend; full integration check).
    SelfTest {
        #[arg(long)]
        json: bool,
    },
    /// Full repair pipeline (read → analyze → repair → write → verify).
    FullRepair {
        #[arg(long)]
        reference: Option<String>,
        #[arg(long)]
        skip_write: bool,
        #[arg(long)]
        json: bool,
    },
    /// Full backup pipeline (quality check → read → analyze → metadata).
    FullBackup {
        #[arg(long)]
        json: bool,
        /// Overwrite an existing backup file with the same name.
        #[arg(long)]
        force: bool,
    },
    /// Monitor connection quality continuously.
    Monitor {
        #[arg(long, default_value = "1000")]
        interval_ms: u32,
        #[arg(long)]
        json: bool,
    },
    /// I2C bus operations (scan / read / write / sniff).
    #[command(subcommand)]
    I2c(I2cCmd),
    /// UART operations (open / sniff).
    #[command(subcommand)]
    Uart(UartCmd),
    /// 1-Wire bus operations.
    #[command(subcommand)]
    Onewire(OnewireCmd),
    /// JTAG operations (idcode-scan, bsdl boundary-scan).
    #[command(subcommand)]
    Jtag(JtagCmd),
    /// ARM SWD operations (connect / halt / dump).
    #[command(subcommand)]
    Swd(SwdCmd),
    /// AVR ISP / Arduino bootloader programmers.
    #[command(subcommand)]
    Avr(AvrCmd),
    /// I2C EEPROM (24Cxx) read/write.
    #[command(subcommand)]
    EepromI2c(EepromI2cCmd),
    /// Microwire EEPROM (93xxx) read/write.
    #[command(subcommand)]
    EepromMicrowire(EepromMicrowireCmd),
    /// ESP32 / ESP8266 esptool subset.
    #[command(subcommand)]
    Esp(EspCmd),
    /// STM32 SWD / UART bootloader flashers.
    #[command(subcommand)]
    Stm32(Stm32Cmd),
    /// Logic analyzer capture + export.
    #[command(subcommand)]
    La(LaCmd),
    /// Bus Pirate USB-CDC bridge.
    #[command(subcommand)]
    Buspirate(BpCmd),
    /// slcan CAN adapter (USBtin / CANable).
    #[command(subcommand)]
    Can(CanCmd),
}

// ─── Hardware-capability subcommand enums (D27) ────────────────────────────

#[derive(Subcommand, Debug)]
enum I2cCmd {
    /// Probe addresses 0x08..=0x77 for ACK.
    Scan {
        #[arg(long)]
        json: bool,
    },
    /// Read N bytes from a register on a 7-bit-addressed device.
    Read {
        #[arg(long)]
        addr: String,
        #[arg(long, default_value = "0")]
        reg: String,
        #[arg(long, default_value = "1")]
        len: u16,
        #[arg(long)]
        json: bool,
    },
    /// Write bytes (hex pairs) to a 7-bit-addressed device.
    Write {
        #[arg(long)]
        addr: String,
        data: String,
        #[arg(long)]
        json: bool,
    },
    /// Passive sniff a saved trace file.
    Sniff {
        input: String,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum UartCmd {
    /// Open and pump TX/RX (line mode).
    Open {
        port: String,
        #[arg(long, default_value = "115200")]
        baud: u32,
    },
    /// Decode a captured UART trace.
    Sniff {
        input: String,
        #[arg(long, default_value = "115200")]
        baud: u32,
    },
}

#[derive(Subcommand, Debug)]
enum OnewireCmd {
    /// Search for 1-Wire ROM IDs on the bus.
    Scan {
        #[arg(long)]
        json: bool,
    },
    /// Read DS18B20 temperature(s).
    Temp {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum JtagCmd {
    /// Scan the chain for IDCODE entries.
    IdcodeScan {
        #[arg(long, default_value = "8")]
        max_devices: usize,
        #[arg(long)]
        json: bool,
    },
    /// Run EXTEST boundary scan from a BSDL file.
    BsdlScan {
        bsdl: String,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum SwdCmd {
    /// Connect + read DPIDR.
    Connect {
        #[arg(long)]
        json: bool,
    },
    /// Halt the core.
    Halt {
        #[arg(long)]
        json: bool,
    },
    /// Resume the core.
    Resume {
        #[arg(long)]
        json: bool,
    },
    /// Single-step.
    Step {
        #[arg(long)]
        json: bool,
    },
    /// Dump memory range to file.
    Dump {
        #[arg(long)]
        addr: String,
        #[arg(long)]
        len: usize,
        output: String,
    },
}

#[derive(Subcommand, Debug)]
enum AvrCmd {
    /// Read signature + part name.
    Signature {
        #[arg(long)]
        json: bool,
    },
    /// Program flash via ISP from an Intel HEX file.
    Program {
        hex: String,
        #[arg(long)]
        json: bool,
    },
    /// Read fuses (low / high / extended / lock).
    Fuses {
        #[arg(long)]
        json: bool,
    },
    /// Chip erase.
    Erase {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum EepromI2cCmd {
    /// Read a 24Cxx EEPROM to file.
    Read {
        #[arg(long)]
        addr: String,
        #[arg(long, default_value = "24c256")]
        part: String,
        output: String,
        #[arg(long)]
        json: bool,
    },
    /// Write file to a 24Cxx EEPROM.
    Write {
        #[arg(long)]
        addr: String,
        #[arg(long, default_value = "24c256")]
        part: String,
        input: String,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
enum EepromMicrowireCmd {
    /// Dump a 93xxx EEPROM to file.
    Read {
        #[arg(long, default_value = "93c46")]
        part: String,
        #[arg(long, default_value = "16")]
        org: u8,
        output: String,
    },
    /// Write a 93xxx EEPROM from file.
    Write {
        #[arg(long, default_value = "93c46")]
        part: String,
        #[arg(long, default_value = "16")]
        org: u8,
        input: String,
    },
}

#[derive(Subcommand, Debug)]
enum EspCmd {
    /// Detect chip family via the magic register.
    Detect {
        #[arg(long)]
        json: bool,
    },
    /// Flash a binary at offset.
    Flash {
        #[arg(long, default_value = "0x10000")]
        offset: String,
        binary: String,
    },
}

#[derive(Subcommand, Debug)]
enum Stm32Cmd {
    /// SWD-based flasher.
    SwdFlash {
        binary: String,
        #[arg(long, default_value = "0x08000000")]
        offset: String,
    },
    /// UART bootloader flasher (AN3155).
    UartFlash {
        binary: String,
        #[arg(long, default_value = "0x08000000")]
        offset: String,
        port: String,
    },
}

#[derive(Subcommand, Debug)]
enum LaCmd {
    /// Capture digital samples to file.
    Capture {
        #[arg(long, default_value = "8")]
        channels: u8,
        #[arg(long, default_value = "1000000")]
        rate: u32,
        #[arg(long, default_value = "1024")]
        samples: usize,
        output: String,
    },
    /// Convert a capture file into Saleae/sigrok/CSV/JSONL format.
    Export {
        input: String,
        output: String,
        #[arg(long, default_value = "csv")]
        format: String,
    },
}

#[derive(Subcommand, Debug)]
enum BpCmd {
    /// Open transparent terminal bridge to a Bus Pirate.
    Bridge { port: String },
    /// Detect / probe a Bus Pirate (enters BBIO + reports).
    Probe { port: String },
}

#[derive(Subcommand, Debug)]
enum CanCmd {
    /// Sniff incoming CAN frames.
    Sniff {
        port: String,
        #[arg(long, default_value = "500")]
        bitrate_kbps: u32,
    },
    /// Send one frame.
    Send {
        port: String,
        #[arg(long)]
        id: String,
        data: String,
    },
}

fn force_mock() -> bool {
    ratchet_core::backends::factory::force_mock_env_set()
}

/// Open the live-or-mock backend exactly once per process. Subsequent calls
/// reuse the kind/warning info but get a fresh backend instance (state-free).
/// Warning (if any) is printed to stderr on the first call only.
fn open_dyn() -> Box<dyn Backend + Send> {
    static WARNED: OnceLock<()> = OnceLock::new();
    let r = open_default();
    if let Some(ref msg) = r.warning {
        if WARNED.set(()).is_ok() {
            eprintln!("ratchet: {msg}");
        }
    }
    r.backend
}

/// Same as `open_dyn` but also returns the backend kind. Used by `status`.
fn open_dyn_with_kind() -> (Box<dyn Backend + Send>, BackendKind, Option<String>, bool) {
    let r = open_default();
    (r.backend, r.kind, r.warning, r.force_mock_env)
}

/// Open the backend for a DESTRUCTIVE verb (write / erase / region-erase /
/// full-repair). Refuses to run when the factory silently fell back to mock:
/// an agent that believes it flashed a BIOS while the bytes went to an
/// in-memory fake is a bricked board waiting to happen. Explicitly setting
/// RATCHET_FORCE_MOCK=1 remains allowed (test / smoke path).
fn open_dyn_destructive(op: &str) -> anyhow::Result<(Box<dyn Backend + Send>, BackendKind)> {
    let r = open_default();
    if let Some(msg) = mock_fallback_error(op, r.kind, r.force_mock_env, r.warning.as_deref()) {
        anyhow::bail!(msg);
    }
    Ok((r.backend, r.kind))
}

/// The refusal message for a destructive verb about to run on a silently-selected
/// mock; None when the run is allowed (real silicon, or explicit force-mock).
fn mock_fallback_error(
    op: &str,
    kind: BackendKind,
    force_mock_env: bool,
    warning: Option<&str>,
) -> Option<String> {
    (kind == BackendKind::Mock && !force_mock_env).then(|| {
        format!(
            "{op}: refusing to run against the mock fallback backend ({}). Plug in a \
             CH341A/CH347 programmer, or set RATCHET_FORCE_MOCK=1 to target the mock explicitly.",
            warning.unwrap_or("no CH341A or CH347 USB device detected")
        )
    })
}

/// Serialize `data` and tag it with the backend kind so agents can tell real
/// silicon results from explicitly-mocked ones.
fn with_backend_field<T: serde::Serialize>(
    data: &T,
    kind: BackendKind,
) -> anyhow::Result<serde_json::Value> {
    let mut v = serde_json::to_value(data)?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert(
            "backend".to_string(),
            serde_json::Value::String(kind.as_str().to_string()),
        );
    }
    Ok(v)
}

/// Convenience: emit envelope as JSON if `json=true`, otherwise print human text.
fn emit_envelope<T: serde::Serialize>(
    env: &AgentEnvelope<T>,
    json: bool,
    human: impl FnOnce(),
) -> anyhow::Result<()> {
    if json {
        println!("{}", serde_json::to_string(env)?);
    } else {
        human();
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    if cli.self_test_flag {
        return cmd_self_test(cli.json);
    }
    match cli.command {
        None => {
            println!(
                "ratchet {} (core {})",
                env!("CARGO_PKG_VERSION"),
                ratchet_core::version()
            );
        }
        Some(Command::Status { json }) => cmd_status(json)?,
        Some(Command::Detect { json }) => cmd_detect(json)?,
        Some(Command::Identify { json }) => cmd_identify(json)?,
        Some(Command::Read { output, json }) => cmd_read(&output, json)?,
        Some(Command::Write {
            input,
            json,
            skip_backup,
            skip_verify,
        }) => cmd_write(&input, json, skip_backup, skip_verify)?,
        Some(Command::Erase { json }) => cmd_erase(json)?,
        Some(Command::Verify { file, json }) => cmd_verify(&file, json)?,
        Some(Command::Analyze { file, json }) => cmd_analyze(&file, json)?,
        Some(Command::Diff { a, b, json }) => cmd_diff(&a, &b, json)?,
        Some(Command::Checksum { file, json }) => cmd_checksum(&file, json)?,
        Some(Command::Search { query, json }) => cmd_search(&query, json)?,
        Some(Command::Serial { port, baud, json }) => cmd_serial(&port, baud, json)?,
        Some(Command::SerialList { json }) => cmd_serial_list(json)?,
        Some(Command::ChipInfo { key, json }) => cmd_chip_info(&key, json)?,
        Some(Command::PostDecode {
            code,
            standard,
            json,
        }) => cmd_post_decode(&code, standard.as_deref(), json)?,
        Some(Command::FailureSearch { query, json }) => cmd_failure_search(&query, json)?,
        Some(Command::VoltageReference { jedec_id, json }) => {
            cmd_voltage_reference(&jedec_id, json)?
        }
        Some(Command::Sfdp { json }) => cmd_sfdp(json)?,
        Some(Command::WpStatus { json }) => cmd_wp_status(json)?,
        Some(Command::RegionErase {
            start,
            length,
            json,
        }) => cmd_region_erase(&start, &length, json)?,
        Some(Command::BlankCheck { json }) => cmd_blank_check(json)?,
        Some(Command::Repl) => cmd_repl()?,
        Some(Command::SelfTest { json }) => cmd_self_test(json)?,
        Some(Command::FullRepair {
            reference,
            skip_write,
            json,
        }) => cmd_full_repair(reference.as_deref(), skip_write, json)?,
        Some(Command::FullBackup { json, force }) => cmd_full_backup(json, force)?,
        Some(Command::Monitor { interval_ms, json }) => cmd_monitor(interval_ms, json)?,
        Some(Command::I2c(c)) => cmd_i2c(c)?,
        Some(Command::Uart(c)) => cmd_uart(c)?,
        Some(Command::Onewire(c)) => cmd_onewire(c)?,
        Some(Command::Jtag(c)) => cmd_jtag(c)?,
        Some(Command::Swd(c)) => cmd_swd(c)?,
        Some(Command::Avr(c)) => cmd_avr(c)?,
        Some(Command::EepromI2c(c)) => cmd_eeprom_i2c(c)?,
        Some(Command::EepromMicrowire(c)) => cmd_eeprom_microwire(c)?,
        Some(Command::Esp(c)) => cmd_esp(c)?,
        Some(Command::Stm32(c)) => cmd_stm32(c)?,
        Some(Command::La(c)) => cmd_la(c)?,
        Some(Command::Buspirate(c)) => cmd_buspirate(c)?,
        Some(Command::Can(c)) => cmd_can(c)?,
    }
    Ok(())
}

// ─── Hardware-capability command handlers ──────────────────────────────────
//
// Verbs whose protocol logic exists and is unit-tested against a mock, but
// which have no live CH341A/CH347 transport wired yet, fail HONESTLY: they exit
// non-zero with an accurate reason. They never print a fake success; a command
// that cannot perform its action must not claim it did.

fn hw_unavailable(verb: &str, action: &str, reason: &str) -> anyhow::Result<()> {
    anyhow::bail!(
        "{verb} {action}: not available: {reason}. \
         The protocol is implemented and unit-tested, but no live CH341A/CH347 \
         transport is wired for it yet"
    )
}

/// Run an I2C action against whichever live backend is present. The two real
/// masters (`Ch341aI2c` over `UsbBus`, `Ch347I2c` over the CH347 transport) are
/// different generic types, so the action runs against a `&mut dyn I2cMaster`
/// trait object to avoid duplicating the per-action logic per backend.
fn run_i2c<R>(
    raw: RawBus,
    f: impl FnOnce(
        &mut dyn ratchet_core::protocols::i2c::I2cMaster,
    ) -> ratchet_core::backends::Result<R>,
) -> anyhow::Result<R> {
    use ratchet_core::protocols::i2c::{Ch341aI2c, Ch347I2c};
    let mut bus = raw.bus;
    let out = match raw.kind {
        BackendKind::Ch347 => {
            let mut m = Ch347I2c::new(&mut bus);
            f(&mut m)
        }
        BackendKind::Ch341a => {
            let mut m = Ch341aI2c::new(&mut bus)?;
            f(&mut m)
        }
        BackendKind::Mock => unreachable!("open_raw_bus never yields Mock"),
    };
    Ok(out?)
}

fn cmd_i2c(c: I2cCmd) -> anyhow::Result<()> {
    match c {
        I2cCmd::Scan { json } => {
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            let addrs = run_i2c(raw, |m| m.scan_bus())?;
            let hex: Vec<String> = addrs.iter().map(|a| format!("0x{a:02x}")).collect();
            let env = AgentEnvelope::ok(
                "i2c scan",
                json!({ "addresses": hex, "count": addrs.len() }),
            );
            emit_envelope(&env, json, || {
                if addrs.is_empty() {
                    println!("i2c scan: no devices responded");
                } else {
                    println!("i2c devices: {}", hex.join(" "));
                }
            })
        }
        I2cCmd::Read {
            addr,
            reg,
            len,
            json,
        } => {
            let addr7 = parse_addr(&addr)? as u8;
            let reg_b = parse_addr(&reg)? as u8;
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            let data = run_i2c(raw, |m| m.write_then_read(addr7, &[reg_b], len as usize))?;
            let hex: Vec<String> = data.iter().map(|b| format!("{b:02x}")).collect();
            let env = AgentEnvelope::ok(
                "i2c read",
                json!({ "addr": format!("0x{addr7:02x}"), "reg": format!("0x{reg_b:02x}"), "data": hex.join("") }),
            );
            emit_envelope(&env, json, || println!("{}", hex.join(" ")))
        }
        I2cCmd::Write { addr, data, json } => {
            let addr7 = parse_addr(&addr)? as u8;
            let bytes = parse_hex_bytes(&data)?;
            let n = bytes.len();
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            run_i2c(raw, |m| m.write(addr7, &bytes))?;
            let env = AgentEnvelope::ok(
                "i2c write",
                json!({ "addr": format!("0x{addr7:02x}"), "bytes_written": n }),
            );
            emit_envelope(&env, json, || {
                println!("i2c write: {n} byte(s) → 0x{addr7:02x}")
            })
        }
        I2cCmd::Sniff { input, json } => {
            // Offline decode of a captured (t_us, scl, sda) trace; no hardware.
            let raw_json = std::fs::read_to_string(&input)
                .map_err(|e| anyhow::anyhow!("read trace {input}: {e}"))?;
            let samples: Vec<ratchet_core::protocols::i2c::LineSample> =
                serde_json::from_str(&raw_json)
                    .map_err(|e| anyhow::anyhow!("parse trace {input}: {e}"))?;
            let events = ratchet_core::protocols::i2c::decode_trace(&samples);
            let env = AgentEnvelope::ok(
                "i2c sniff",
                json!({ "samples": samples.len(), "events": events }),
            );
            emit_envelope(&env, json, || {
                println!(
                    "i2c sniff: {} event(s) from {} samples",
                    events.len(),
                    samples.len()
                )
            })
        }
    }
}

fn cmd_uart(c: UartCmd) -> anyhow::Result<()> {
    match c {
        UartCmd::Open { .. } => hw_unavailable(
            "uart",
            "open",
            "the CH347 native UART path is incomplete and CH341A is bit-bang TX-only",
        ),
        UartCmd::Sniff { .. } => hw_unavailable(
            "uart",
            "sniff",
            "live capture needs a sampler backend (none wired); the decoder is reachable only via library APIs",
        ),
    }
}

fn cmd_onewire(c: OnewireCmd) -> anyhow::Result<()> {
    match c {
        OnewireCmd::Scan { .. } => hw_unavailable(
            "onewire",
            "scan",
            "1-Wire needs a timed pin bit-bang adapter",
        ),
        OnewireCmd::Temp { .. } => hw_unavailable(
            "onewire",
            "temp",
            "1-Wire needs a timed pin bit-bang adapter",
        ),
    }
}

fn cmd_jtag(c: JtagCmd) -> anyhow::Result<()> {
    match c {
        JtagCmd::IdcodeScan { max_devices, json } => {
            use ratchet_core::protocols::jtag::{scan_idcode_chain, Ch347Jtag};
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            // Only the CH347 has a JTAG engine; CH341A cannot drive JTAG.
            if raw.kind != BackendKind::Ch347 {
                anyhow::bail!(
                    "jtag idcode-scan requires a CH347 (detected {}; CH341A has no JTAG engine)",
                    raw.kind.as_str()
                );
            }
            let mut bus = raw.bus;
            let mut jtag = Ch347Jtag::new(&mut bus);
            let chain = scan_idcode_chain(&mut jtag, max_devices)?;
            let entries: Vec<_> = chain
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
            let env = AgentEnvelope::ok(
                "jtag idcode-scan",
                json!({ "devices": entries.len(), "chain": entries }),
            );
            emit_envelope(&env, json, || {
                println!("jtag chain: {} device(s)", chain.entries.len());
                for e in &chain.entries {
                    println!(
                        "  idcode=0x{:08x} mfg=0x{:03x} part=0x{:04x} ver={}",
                        e.idcode, e.manufacturer, e.part, e.version
                    );
                }
            })
        }
        JtagCmd::BsdlScan { bsdl, json } => {
            // Offline BSDL parse + report. Live EXTEST drive needs a JTAG
            // transport adapter that is not yet wired; this validates the file
            // and surfaces its boundary register without claiming a live scan.
            let text =
                std::fs::read_to_string(&bsdl).map_err(|e| anyhow::anyhow!("read {bsdl}: {e}"))?;
            let desc = ratchet_core::debug::boundary_scan::parse_bsdl(&text)
                .map_err(|e| anyhow::anyhow!("parse BSDL: {e}"))?;
            let instrs: Vec<&String> = desc.instructions.keys().collect();
            let env = AgentEnvelope::ok(
                "jtag bsdl-scan",
                json!({
                    "entity": desc.entity,
                    "boundary_length": desc.boundary_length,
                    "boundary_cells": desc.boundary.len(),
                    "instructions": instrs,
                    "note": "offline BSDL parse; live EXTEST drive not yet wired",
                }),
            );
            emit_envelope(&env, json, || {
                println!(
                    "BSDL {}: boundary_length={} cells={} instructions={}",
                    desc.entity,
                    desc.boundary_length,
                    desc.boundary.len(),
                    desc.instructions.len()
                );
            })
        }
    }
}

fn cmd_swd(c: SwdCmd) -> anyhow::Result<()> {
    match c {
        SwdCmd::Connect { .. } => {
            hw_unavailable("swd", "connect", "SWD needs a SWDIO/SWCLK bit-bang adapter")
        }
        SwdCmd::Halt { .. } => {
            hw_unavailable("swd", "halt", "SWD needs a SWDIO/SWCLK bit-bang adapter")
        }
        SwdCmd::Resume { .. } => {
            hw_unavailable("swd", "resume", "SWD needs a SWDIO/SWCLK bit-bang adapter")
        }
        SwdCmd::Step { .. } => {
            hw_unavailable("swd", "step", "SWD needs a SWDIO/SWCLK bit-bang adapter")
        }
        SwdCmd::Dump { .. } => {
            hw_unavailable("swd", "dump", "SWD needs a SWDIO/SWCLK bit-bang adapter")
        }
    }
}

fn cmd_avr(c: AvrCmd) -> anyhow::Result<()> {
    match c {
        AvrCmd::Signature { .. } => {
            hw_unavailable("avr", "signature", "AVR ISP needs a SPI+RESET adapter")
        }
        AvrCmd::Program { .. } => {
            hw_unavailable("avr", "program", "AVR ISP needs a SPI+RESET adapter")
        }
        AvrCmd::Fuses { .. } => hw_unavailable("avr", "fuses", "AVR ISP needs a SPI+RESET adapter"),
        AvrCmd::Erase { .. } => hw_unavailable("avr", "erase", "AVR ISP needs a SPI+RESET adapter"),
    }
}

/// Map a 24Cxx part string ("24c256", "24C02", …) to its `EepromSize`.
fn parse_eeprom_part(s: &str) -> anyhow::Result<ratchet_core::programmers::i2c_eeprom::EepromSize> {
    use ratchet_core::programmers::i2c_eeprom::EepromSize::*;
    let k = s.trim().to_ascii_uppercase().replace('-', "");
    Ok(match k.as_str() {
        "24C01" => Kbit1,
        "24C02" => Kbit2,
        "24C04" => Kbit4,
        "24C08" => Kbit8,
        "24C16" => Kbit16,
        "24C32" => Kbit32,
        "24C64" => Kbit64,
        "24C128" => Kbit128,
        "24C256" => Kbit256,
        "24C512" => Kbit512,
        "24C1024" | "24C1025" => Mbit1,
        _ => anyhow::bail!("unknown 24Cxx part '{s}' (try 24c01 .. 24c1024)"),
    })
}

fn cmd_eeprom_i2c(c: EepromI2cCmd) -> anyhow::Result<()> {
    use ratchet_core::programmers::i2c_eeprom::I2cEeprom;
    match c {
        EepromI2cCmd::Read {
            addr,
            part,
            output,
            json,
        } => {
            let address = parse_addr(&addr)? as u8;
            let size = parse_eeprom_part(&part)?;
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            let data = run_i2c(raw, |m| {
                let mut ee = I2cEeprom::new(m, address, size);
                ee.read(0, size.bytes())
            })?;
            std::fs::write(&output, &data).map_err(|e| anyhow::anyhow!("write {output}: {e}"))?;
            let env = AgentEnvelope::ok(
                "eeprom-i2c read",
                json!({ "part": size.name(), "addr": format!("0x{address:02x}"), "bytes": data.len(), "output": output }),
            );
            emit_envelope(&env, json, || {
                println!(
                    "eeprom-i2c read {} bytes ({}) -> {}",
                    data.len(),
                    size.name(),
                    output
                )
            })
        }
        EepromI2cCmd::Write {
            addr,
            part,
            input,
            json,
        } => {
            let address = parse_addr(&addr)? as u8;
            let size = parse_eeprom_part(&part)?;
            let data = std::fs::read(&input).map_err(|e| anyhow::anyhow!("read {input}: {e}"))?;
            let raw = open_raw_bus().map_err(|e| anyhow::anyhow!("{e}"))?;
            let verified = run_i2c(raw, |m| {
                let mut ee = I2cEeprom::new(m, address, size);
                ee.write(0, &data)?;
                ee.verify(0, &data)
            })?;
            let env = AgentEnvelope::ok(
                "eeprom-i2c write",
                json!({ "part": size.name(), "addr": format!("0x{address:02x}"), "bytes": data.len(), "verified": verified }),
            );
            emit_envelope(&env, json, || {
                println!(
                    "eeprom-i2c write {} bytes ({}) verified={}",
                    data.len(),
                    size.name(),
                    verified
                )
            })
        }
    }
}

fn cmd_eeprom_microwire(c: EepromMicrowireCmd) -> anyhow::Result<()> {
    match c {
        EepromMicrowireCmd::Read { .. } => hw_unavailable(
            "eeprom-microwire",
            "read",
            "93xx Microwire needs a 3-wire bit-bang adapter",
        ),
        EepromMicrowireCmd::Write { .. } => hw_unavailable(
            "eeprom-microwire",
            "write",
            "93xx Microwire needs a 3-wire bit-bang adapter",
        ),
    }
}

fn cmd_esp(c: EspCmd) -> anyhow::Result<()> {
    match c {
        EspCmd::Detect { .. } => hw_unavailable(
            "esp",
            "detect",
            "esptool protocol needs a live UART transport",
        ),
        EspCmd::Flash { .. } => hw_unavailable(
            "esp",
            "flash",
            "esptool protocol needs a live UART transport",
        ),
    }
}

fn cmd_stm32(c: Stm32Cmd) -> anyhow::Result<()> {
    match c {
        Stm32Cmd::SwdFlash { .. } => {
            hw_unavailable("stm32", "swd-flash", "needs a live SWD transport (see swd)")
        }
        Stm32Cmd::UartFlash { .. } => {
            hw_unavailable("stm32", "uart-flash", "needs a live UART transport")
        }
    }
}

fn cmd_la(c: LaCmd) -> anyhow::Result<()> {
    match c {
        LaCmd::Capture { .. } => hw_unavailable(
            "la",
            "capture",
            "live sampling needs a sampler backend; use 'la export' to convert an existing capture",
        ),
        LaCmd::Export {
            input,
            output,
            format,
        } => {
            use ratchet_core::instruments::logic_analyzer::CaptureFrame;
            // Offline format conversion of an existing capture; no hardware.
            let raw = std::fs::read_to_string(&input)
                .map_err(|e| anyhow::anyhow!("read capture {input}: {e}"))?;
            let frame: CaptureFrame = serde_json::from_str(&raw)
                .map_err(|e| anyhow::anyhow!("parse capture {input}: {e}"))?;
            // Channel count: highest bit set across samples (1..=8).
            let used = frame.samples.iter().fold(0u8, |acc, b| acc | b);
            let channels = (8 - used.leading_zeros() as u8).max(1);
            let body = match format.to_ascii_lowercase().as_str() {
                "csv" => ratchet_core::instruments::export::write_csv(&frame, channels),
                "jsonl" => ratchet_core::instruments::export::write_jsonl(&frame, channels),
                other => {
                    anyhow::bail!("unsupported export format '{other}' (supported: csv, jsonl)")
                }
            };
            std::fs::write(&output, &body).map_err(|e| anyhow::anyhow!("write {output}: {e}"))?;
            println!(
                "la export: {} sample(s), {} channel(s) -> {} ({})",
                frame.samples.len(),
                channels,
                output,
                format
            );
            Ok(())
        }
    }
}

fn cmd_buspirate(c: BpCmd) -> anyhow::Result<()> {
    match c {
        BpCmd::Bridge { .. } => hw_unavailable(
            "buspirate",
            "bridge",
            "Bus Pirate is an external USB-CDC device; a serial transport is not wired",
        ),
        BpCmd::Probe { .. } => hw_unavailable(
            "buspirate",
            "probe",
            "Bus Pirate is an external USB-CDC device; a serial transport is not wired",
        ),
    }
}

fn cmd_can(c: CanCmd) -> anyhow::Result<()> {
    match c {
        CanCmd::Sniff { .. } => hw_unavailable(
            "can",
            "sniff",
            "slcan targets an external USBtin/CANable adapter; a serial transport is not wired",
        ),
        CanCmd::Send { .. } => hw_unavailable(
            "can",
            "send",
            "slcan targets an external USBtin/CANable adapter; a serial transport is not wired",
        ),
    }
}

// ─── Command impls ───────────────────────────────────────────────────────────

fn cmd_status(json: bool) -> anyhow::Result<()> {
    let (mut m, kind, warning, force_mock_env) = open_dyn_with_kind();
    let info = m.detect_programmer()?;
    let backend_str = kind.as_str();
    let env = AgentEnvelope::ok(
        "status",
        json!({
            "backend": backend_str,
            "force_mock_env": force_mock_env,
            "force_mock": force_mock(),
            "warning": warning,
            "programmer": info,
        }),
    );
    emit_envelope(&env, json, || {
        println!("ratchet status");
        println!("  backend:        {backend_str}");
        println!("  programmer:     {} ({})", info.description, info.kind);
        println!("  connected:      {}", info.connected);
        println!("  force_mock_env: {force_mock_env}");
        if let Some(w) = &warning {
            println!("  warning:        {w}");
        }
    })
}

fn cmd_detect(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let info = m.detect_programmer()?;
    let env = AgentEnvelope::ok("detect", info.clone());
    emit_envelope(&env, json, || {
        println!(
            "{} (vid:{} pid:{})",
            info.description, info.vendor_id, info.product_id
        );
    })
}

fn cmd_identify(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let info = m.identify_chip()?;
    let env = AgentEnvelope::ok("identify", info.clone());
    emit_envelope(&env, json, || match &info {
        Some(c) => println!(
            "{} ({}) {} jedec={}",
            c.name, c.vendor_name, c.size_human, c.jedec_id
        ),
        None => println!("no chip detected"),
    })
}

fn cmd_read(output: &str, json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let r = m.read_chip(std::path::Path::new(output))?;
    let env = AgentEnvelope::ok("read", r.clone());
    emit_envelope(&env, json, || {
        println!(
            "read {} bytes → {} ({}ms)",
            r.size_bytes, r.file_path, r.duration_ms
        );
    })
}

fn cmd_write(input: &str, json: bool, skip_backup: bool, skip_verify: bool) -> anyhow::Result<()> {
    use ratchet_core::backends::WriteOpts;
    let (mut m, kind) = open_dyn_destructive("write")?;
    let r = m.write_chip(
        std::path::Path::new(input),
        WriteOpts {
            skip_backup,
            skip_verify,
        },
    )?;
    let env = AgentEnvelope::ok("write", with_backend_field(&r, kind)?);
    emit_envelope(&env, json, || {
        println!(
            "write success={} verified={} backup={:?} backend={}",
            r.success,
            r.verified,
            r.backup_path,
            kind.as_str()
        );
    })
}

fn cmd_erase(json: bool) -> anyhow::Result<()> {
    let (mut m, kind) = open_dyn_destructive("erase")?;
    let r = m.erase_chip()?;
    let env = AgentEnvelope::ok("erase", with_backend_field(&r, kind)?);
    emit_envelope(&env, json, || println!("erase ok ({}ms)", r.duration_ms))
}

fn cmd_verify(file: &str, json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let r = m.verify_chip(std::path::Path::new(file))?;
    let env = AgentEnvelope::ok("verify", r.clone());
    emit_envelope(&env, json, || println!("matches={}", r.matches))
}

fn cmd_analyze(file: &str, json: bool) -> anyhow::Result<()> {
    let data = std::fs::read(file)?;
    let report = ratchet_core::analysis::bios::analyze_bytes(&data);
    let env = AgentEnvelope::ok("analyze", report.clone());
    emit_envelope(&env, json, || {
        println!("file_size: {} bytes", report.file_size);
        println!("uefi: {}", report.is_uefi);
        if let Some(v) = &report.bios_vendor {
            println!("vendor: {v}");
        }
        for r in &report.regions {
            println!("  {} @ 0x{:x} size={}", r.name, r.offset, r.size);
        }
    })
}

fn cmd_diff(a: &str, b: &str, json: bool) -> anyhow::Result<()> {
    let da = std::fs::read(a)?;
    let db = std::fs::read(b)?;
    let report = ratchet_core::analysis::bios::diff_bytes(&da, &db);
    let env = AgentEnvelope::ok("diff", report.clone());
    emit_envelope(&env, json, || {
        println!(
            "identical={} diffs={} sizeA={} sizeB={}",
            report.identical, report.total_differences, report.size_a, report.size_b
        );
    })
}

fn cmd_checksum(file: &str, json: bool) -> anyhow::Result<()> {
    let data = std::fs::read(file)?;
    let c = ratchet_core::analysis::bios::checksums(&data);
    let env = AgentEnvelope::ok("checksum", c.clone());
    emit_envelope(&env, json, || {
        println!("sha256: {}", c.sha256);
        println!("crc32:  {}", c.crc32);
    })
}

fn cmd_search(query: &str, json: bool) -> anyhow::Result<()> {
    let results = ratchet_core::chips::search(query);
    if json {
        println!("{}", serde_json::to_string(&results)?);
    } else if results.is_empty() {
        println!("no chips matched: {query}");
    } else {
        for c in results {
            println!(
                "{:<14} {:<14} jedec={} size={:>4} v={}V",
                c.name,
                c.vendor,
                c.jedec_id,
                ratchet_core::chips::format_size(c.size_bytes),
                c.voltage
            );
        }
    }
    Ok(())
}

fn cmd_serial(port: &str, _baud: u32, _json: bool) -> anyhow::Result<()> {
    // No live POSIX/Win32 serial driver is wired; do not pretend to connect.
    anyhow::bail!(
        "serial: live connect to {port} not implemented (no serial driver wired); \
         use 'serial-list' to enumerate ports"
    )
}

/// Best-effort serial-port enumeration. POSIX: scans /dev for the usual
/// USB-serial / tty device names. A real read-only scan, not a stub.
#[cfg(unix)]
fn enumerate_serial_ports() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir("/dev") {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with("cu.")
                || name.starts_with("tty.")
                || name.starts_with("ttyUSB")
                || name.starts_with("ttyACM")
            {
                out.push(format!("/dev/{name}"));
            }
        }
    }
    out.sort();
    out
}

#[cfg(not(unix))]
fn enumerate_serial_ports() -> Vec<String> {
    Vec::new()
}

fn cmd_serial_list(json: bool) -> anyhow::Result<()> {
    let ports = enumerate_serial_ports();
    let env = AgentEnvelope::ok(
        "serial-list",
        json!({ "ports": ports, "count": ports.len() }),
    );
    emit_envelope(&env, json, || {
        if ports.is_empty() {
            println!("no serial ports found");
        } else {
            for p in &ports {
                println!("{p}");
            }
        }
    })
}

fn cmd_chip_info(key: &str, json: bool) -> anyhow::Result<()> {
    let chip = ratchet_core::chips::lookup_by_jedec_id(key)
        .or_else(|| ratchet_core::chips::lookup_by_name(key));
    // A lookup miss is a failure, not an "ok" envelope with null data — fail honestly
    // (consistent with the other bogus-input handlers, e.g. post-decode / unknown 24Cxx part).
    let Some(c) = chip else {
        anyhow::bail!(
            "chip not found: {key} (try a JEDEC id like ef4018 or a name like W25Q128JV)"
        );
    };
    let env = AgentEnvelope::ok("chip-info", Some(c.clone()));
    emit_envelope(&env, json, || {
        println!(
            "{} ({}) jedec={} size={}",
            c.name,
            c.vendor,
            c.jedec_id,
            ratchet_core::chips::format_size(c.size_bytes)
        )
    })
}

fn cmd_post_decode(code: &str, standard: Option<&str>, json: bool) -> anyhow::Result<()> {
    use ratchet_core::diagnostics::post_codes::{lookup, PostStandard};
    let std_filter = match standard {
        Some("ami") => Some(PostStandard::Ami),
        Some("award") => Some(PostStandard::Award),
        Some("phoenix") => Some(PostStandard::Phoenix),
        Some("uefi") => Some(PostStandard::Uefi),
        Some(other) => anyhow::bail!("unknown --standard `{other}` (ami|award|phoenix|uefi)"),
        None => None,
    };
    let hits = lookup(code, std_filter);
    if json {
        println!("{}", serde_json::to_string(&hits)?);
    } else if hits.is_empty() {
        println!("no POST code matched: {code}");
    } else {
        for h in hits {
            println!(
                "{:?} {:<6} [{}] {}",
                h.standard, h.phase, h.code, h.description
            );
            for c in &h.causes {
                println!("  - {c}");
            }
        }
    }
    Ok(())
}

fn cmd_failure_search(_query: &str, _json: bool) -> anyhow::Result<()> {
    anyhow::bail!(
        "failure-search: not available: the failure-pattern knowledge base is not bundled in \
         this build"
    )
}

fn cmd_voltage_reference(jedec_id: &str, json: bool) -> anyhow::Result<()> {
    let v = ratchet_core::chips::get_chip_voltage(jedec_id);
    let env = AgentEnvelope::ok(
        "voltage-reference",
        json!({"jedec_id": jedec_id, "voltage_v": v}),
    );
    emit_envelope(&env, json, || match v {
        Some(v) => println!("{jedec_id}: {v}V"),
        None => println!("{jedec_id}: unknown chip"),
    })
}

fn cmd_sfdp(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let s = m.read_sfdp()?;
    let env = AgentEnvelope::ok("sfdp", s.clone());
    emit_envelope(&env, json, || {
        if let Some(s) = s {
            println!("density: {} bytes, page: {}", s.density_bytes, s.page_size);
        } else {
            println!("no SFDP");
        }
    })
}

fn cmd_wp_status(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let sr = m.read_status_registers()?;
    let wp = m.is_write_protected()?;
    let env = AgentEnvelope::ok(
        "wp-status",
        json!({"write_protected": wp, "sr1": sr.sr1, "sr2": sr.sr2, "sr3": sr.sr3}),
    );
    emit_envelope(&env, json, || println!("wp={wp} sr1=0x{:02x}", sr.sr1))
}

fn cmd_region_erase(start: &str, length: &str, json: bool) -> anyhow::Result<()> {
    let s = parse_addr(start)?;
    let l = parse_addr(length)?;
    let (mut m, kind) = open_dyn_destructive("region-erase")?;
    let r = m.region_erase(s, l)?;
    let env = AgentEnvelope::ok("region-erase", with_backend_field(&r, kind)?);
    emit_envelope(&env, json, || {
        println!("region-erase ok ({}ms)", r.duration_ms)
    })
}

fn cmd_blank_check(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    // Read the whole chip into a temp file and check every byte. Same path on
    // mock (instant) and real silicon (slow but accurate).
    let tmp = std::env::temp_dir().join(format!("ratchet-blank-check-{}.bin", std::process::id()));
    m.read_chip(&tmp)?;
    let data = std::fs::read(&tmp)?;
    let _ = std::fs::remove_file(&tmp);
    let blank = data.iter().all(|b| *b == 0xff);
    let env = AgentEnvelope::ok("blank-check", json!({"blank": blank}));
    emit_envelope(&env, json, || println!("blank={blank}"))
}

fn cmd_repl() -> anyhow::Result<()> {
    use ratchet_core::repl::{parse_line, ReplCommand};
    use std::io::Write as _;
    use std::path::Path;

    println!("ratchet REPL  -  type 'help' or 'quit'");
    let mut backend = open_dyn();
    let stdin = std::io::stdin();
    let mut line = String::new();
    loop {
        print!("ratchet> ");
        std::io::stdout().flush().ok();
        line.clear();
        if stdin.read_line(&mut line)? == 0 {
            break; // EOF (piped input or Ctrl-D)
        }
        match parse_line(&line) {
            ReplCommand::Quit => break,
            ReplCommand::Help => println!(
                "commands: identify jedec status read <f> write <f> erase \
                 sector-erase <addr> reset quit"
            ),
            ReplCommand::Identify => match backend.identify_chip() {
                Ok(Some(c)) => println!("{} ({}) {}", c.name, c.vendor_name, c.size_human),
                Ok(None) => println!("no chip detected"),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Jedec => match backend.read_jedec_id() {
                Ok(id) => println!("jedec={}", id.to_hex()),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Status => match backend.read_status_registers() {
                Ok(sr) => println!(
                    "sr1=0x{:02x} sr2=0x{:02x} sr3=0x{:02x}",
                    sr.sr1, sr.sr2, sr.sr3
                ),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Read { path } => match backend.read_chip(Path::new(&path)) {
                Ok(r) => println!("read {} bytes -> {}", r.size_bytes, r.file_path),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Write { path } => {
                match backend.write_chip(Path::new(&path), Default::default()) {
                    Ok(r) => println!("write success={} verified={}", r.success, r.verified),
                    Err(e) => println!("error: {e}"),
                }
            }
            ReplCommand::Erase => match backend.erase_chip() {
                Ok(r) => println!("erase success={}", r.success),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::SectorErase { address } => match backend.sector_erase(address as u64) {
                Ok(r) => println!("sector-erase success={}", r.success),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Reset => match backend.reset_chip() {
                Ok(()) => println!("reset ok"),
                Err(e) => println!("error: {e}"),
            },
            ReplCommand::Macro { .. } | ReplCommand::Plugin { .. } => {
                println!("macros/plugins are not available in this REPL")
            }
            ReplCommand::Unknown(s) if s.trim().is_empty() => {}
            ReplCommand::Unknown(s) => println!("unknown command: {s} (type 'help')"),
        }
    }
    Ok(())
}

fn cmd_self_test(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let mut errors: Vec<String> = Vec::new();
    if let Err(e) = m.detect_programmer() {
        errors.push(format!("detect: {e}"));
    }
    if let Err(e) = m.identify_chip() {
        errors.push(format!("identify: {e}"));
    }
    if let Err(e) = m.read_status_registers() {
        errors.push(format!("status: {e}"));
    }
    if let Err(e) = m.erase_chip() {
        errors.push(format!("erase: {e}"));
    }
    let ok = errors.is_empty();
    let env = AgentEnvelope::ok("self-test", json!({"ok": ok, "errors": errors}));
    emit_envelope(&env, json, || {
        if ok {
            println!("self-test: OK");
        } else {
            for e in &errors {
                println!("FAIL: {e}");
            }
        }
    })?;
    if !ok {
        std::process::exit(1);
    }
    Ok(())
}

fn cmd_full_repair(reference: Option<&str>, skip_write: bool, json: bool) -> anyhow::Result<()> {
    use ratchet_core::workflows::pipeline::{build_repair_pipeline, run_pipeline, PipelineContext};
    use ratchet_core::workflows::pipeline_adapter::BackendPipelineAdapter;

    let (mut backend, kind) = open_dyn_destructive("full-repair")?;
    let mut adapter = BackendPipelineAdapter::new(&mut *backend);
    let mut ctx = PipelineContext::new(&mut adapter);
    if let Some(r) = reference {
        ctx.reference_path = Some(std::path::PathBuf::from(r));
    }
    ctx.skip_write = skip_write;
    let result = run_pipeline(&build_repair_pipeline(), &mut ctx);
    let env = AgentEnvelope::ok("full-repair", with_backend_field(&result, kind)?);
    emit_envelope(&env, json, || {
        println!(
            "full-repair: success={} steps={}/{}",
            result.success,
            result.steps_completed,
            result.step_results.len()
        );
        for s in &result.step_results {
            println!(
                "  [{}] {}  -  {} ({}ms)",
                s.number, s.name, s.detail, s.duration_ms
            );
        }
    })
}

fn cmd_full_backup(json: bool, force: bool) -> anyhow::Result<()> {
    // A full backup is a full-chip read to a descriptively named file, using
    // the same wired SPI backend as `read`. (open_dyn warns on stderr when no
    // device is present and it falls back to mock.)
    let mut m = open_dyn();
    let chip = m.identify_chip().ok().flatten();
    let label = chip
        .as_ref()
        .map(|c| c.name.replace([' ', '/'], "_"))
        .unwrap_or_else(|| "chip".to_string());
    let path = format!("ratchet-backup-{label}.bin");
    // An existing backup may be the user's only copy of a working BIOS — never
    // clobber it implicitly.
    if !force && std::path::Path::new(&path).exists() {
        anyhow::bail!(
            "full-backup: {path} already exists; pass --force to overwrite it \
             (it may be your only copy of the old firmware)"
        );
    }
    let r = m.read_chip(std::path::Path::new(&path))?;
    let env = AgentEnvelope::ok(
        "full-backup",
        json!({ "output": r.file_path, "size_bytes": r.size_bytes, "duration_ms": r.duration_ms }),
    );
    emit_envelope(&env, json, || {
        println!("full-backup: {} bytes -> {}", r.size_bytes, r.file_path)
    })
}

fn cmd_monitor(_interval_ms: u32, _json: bool) -> anyhow::Result<()> {
    anyhow::bail!(
        "monitor: continuous live monitor not implemented; use 'status' or 'identify' for a \
         one-shot read"
    )
}

fn parse_addr(s: &str) -> anyhow::Result<u64> {
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        Ok(u64::from_str_radix(hex, 16)?)
    } else {
        Ok(s.parse::<u64>()?)
    }
}

/// Parse a string of hex byte pairs ("deadbeef", "de ad be ef", "0xde,0xad")
/// into raw bytes. Tolerates whitespace, commas, and `0x` separators.
fn parse_hex_bytes(s: &str) -> anyhow::Result<Vec<u8>> {
    let cleaned: String = s
        .replace("0x", "")
        .replace("0X", "")
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    if cleaned.len() % 2 != 0 {
        anyhow::bail!(
            "hex data must have an even number of digits, got {}",
            cleaned.len()
        );
    }
    (0..cleaned.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&cleaned[i..i + 2], 16)
                .map_err(|e| anyhow::anyhow!("invalid hex byte '{}': {e}", &cleaned[i..i + 2]))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hex_bytes_tolerant() {
        assert_eq!(
            parse_hex_bytes("deadbeef").unwrap(),
            vec![0xde, 0xad, 0xbe, 0xef]
        );
        assert_eq!(parse_hex_bytes("de ad").unwrap(), vec![0xde, 0xad]);
        assert_eq!(parse_hex_bytes("0xde,0xad").unwrap(), vec![0xde, 0xad]);
        assert!(parse_hex_bytes("abc").is_err()); // odd digit count
    }

    #[test]
    fn parse_eeprom_part_maps_known_and_rejects_unknown() {
        assert_eq!(parse_eeprom_part("24c256").unwrap().name(), "24C256");
        assert_eq!(parse_eeprom_part("24C02").unwrap().name(), "24C02");
        assert!(parse_eeprom_part("bogus").is_err());
    }

    // Transport-less verbs must fail honestly (Err / non-zero exit), never a
    // fake success. These call hw_unavailable directly (no bus open needed).
    #[test]
    fn hw_verbs_fail_honestly() {
        assert!(cmd_swd(SwdCmd::Connect { json: true }).is_err());
        assert!(cmd_avr(AvrCmd::Signature { json: true }).is_err());
        assert!(cmd_onewire(OnewireCmd::Scan { json: true }).is_err());
        assert!(cmd_esp(EspCmd::Detect { json: true }).is_err());
        assert!(cmd_monitor(1000, true).is_err());
        assert!(cmd_failure_search("x", true).is_err());
    }

    #[test]
    fn hw_unavailable_message_is_honest() {
        let e = hw_unavailable("swd", "connect", "needs adapter").unwrap_err();
        let msg = e.to_string();
        assert!(msg.contains("not available"));
        assert!(!msg.contains("stub"));
        assert!(!msg.contains("registered"));
        assert!(!msg.contains('—'), "no em-dash in honest errors");
    }

    #[test]
    fn enumerate_serial_ports_does_not_panic() {
        let _ = enumerate_serial_ports();
    }

    // Destructive verbs must refuse a silently-selected mock backend, allow an
    // explicitly forced one, and never block real silicon. Tested through the
    // pure decision fn so the suite is safe with or without hardware attached.
    #[test]
    fn mock_fallback_refused_unless_forced() {
        let refusal = mock_fallback_error("write", BackendKind::Mock, false, Some("no device"));
        let msg = refusal.expect("silent mock fallback must be refused");
        assert!(msg.contains("mock fallback"));
        assert!(msg.contains("RATCHET_FORCE_MOCK"));

        assert!(
            mock_fallback_error("write", BackendKind::Mock, true, None).is_none(),
            "explicit RATCHET_FORCE_MOCK=1 stays allowed"
        );
        assert!(mock_fallback_error("erase", BackendKind::Ch341a, false, None).is_none());
        assert!(mock_fallback_error("erase", BackendKind::Ch347, false, None).is_none());
    }

    #[test]
    fn with_backend_field_tags_objects() {
        #[derive(serde::Serialize)]
        struct R {
            success: bool,
        }
        let v = with_backend_field(&R { success: true }, BackendKind::Mock).unwrap();
        assert_eq!(v["backend"], "mock");
        assert_eq!(v["success"], true);
    }
}
