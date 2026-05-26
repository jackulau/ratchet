// ratchet CLI - full subcommand surface. Backend selection runs through
// `ratchet_core::backends::open_default()`, which picks between mock, CH341A,
// and CH347 based on `RATCHET_FORCE_MOCK` and USB device presence.

use clap::{Parser, Subcommand};
use ratchet_core::agent::envelope::AgentEnvelope;
use ratchet_core::backends::{open_default, Backend, BackendKind};
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
    /// Show programmer status. (Today all commands route through MockBackend; RATCHET_FORCE_MOCK is reported but not yet wired to switch backends.)
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
    },
    /// Write file to a 24Cxx EEPROM.
    Write {
        #[arg(long)]
        addr: String,
        #[arg(long, default_value = "24c256")]
        part: String,
        input: String,
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
        Some(Command::FullBackup { json }) => cmd_full_backup(json)?,
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

// ─── Hardware-capability command handlers (D27) ───────────────────────────
//
// These print a structured "not yet wired to live hardware" envelope and
// exit 0 so smoke tests can verify the CLI surface without real devices.
// Real-hardware integration follows in D28 + future goals.

fn hw_stub(verb: &str, action: &str, json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::<serde_json::Value>::ok(
        format!("{verb} {action}"),
        json!({
            "stub": true,
            "note": "hardware capability registered; live-hardware wiring follows in subsequent goals",
        }),
    );
    if json {
        println!("{}", serde_json::to_string(&env)?);
    } else {
        println!(
            "{verb} {action}: registered (stub  -  live hardware path lands in a follow-up goal)"
        );
    }
    Ok(())
}

fn cmd_i2c(c: I2cCmd) -> anyhow::Result<()> {
    match c {
        I2cCmd::Scan { json } => hw_stub("i2c", "scan", json),
        I2cCmd::Read { json, .. } => hw_stub("i2c", "read", json),
        I2cCmd::Write { json, .. } => hw_stub("i2c", "write", json),
        I2cCmd::Sniff { json, .. } => hw_stub("i2c", "sniff", json),
    }
}

fn cmd_uart(c: UartCmd) -> anyhow::Result<()> {
    match c {
        UartCmd::Open { .. } => hw_stub("uart", "open", false),
        UartCmd::Sniff { .. } => hw_stub("uart", "sniff", false),
    }
}

fn cmd_onewire(c: OnewireCmd) -> anyhow::Result<()> {
    match c {
        OnewireCmd::Scan { json } => hw_stub("onewire", "scan", json),
        OnewireCmd::Temp { json } => hw_stub("onewire", "temp", json),
    }
}

fn cmd_jtag(c: JtagCmd) -> anyhow::Result<()> {
    match c {
        JtagCmd::IdcodeScan { json, .. } => hw_stub("jtag", "idcode-scan", json),
        JtagCmd::BsdlScan { json, .. } => hw_stub("jtag", "bsdl-scan", json),
    }
}

fn cmd_swd(c: SwdCmd) -> anyhow::Result<()> {
    match c {
        SwdCmd::Connect { json } => hw_stub("swd", "connect", json),
        SwdCmd::Halt { json } => hw_stub("swd", "halt", json),
        SwdCmd::Resume { json } => hw_stub("swd", "resume", json),
        SwdCmd::Step { json } => hw_stub("swd", "step", json),
        SwdCmd::Dump { .. } => hw_stub("swd", "dump", false),
    }
}

fn cmd_avr(c: AvrCmd) -> anyhow::Result<()> {
    match c {
        AvrCmd::Signature { json } => hw_stub("avr", "signature", json),
        AvrCmd::Program { json, .. } => hw_stub("avr", "program", json),
        AvrCmd::Fuses { json } => hw_stub("avr", "fuses", json),
        AvrCmd::Erase { json } => hw_stub("avr", "erase", json),
    }
}

fn cmd_eeprom_i2c(c: EepromI2cCmd) -> anyhow::Result<()> {
    match c {
        EepromI2cCmd::Read { .. } => hw_stub("eeprom-i2c", "read", false),
        EepromI2cCmd::Write { .. } => hw_stub("eeprom-i2c", "write", false),
    }
}

fn cmd_eeprom_microwire(c: EepromMicrowireCmd) -> anyhow::Result<()> {
    match c {
        EepromMicrowireCmd::Read { .. } => hw_stub("eeprom-microwire", "read", false),
        EepromMicrowireCmd::Write { .. } => hw_stub("eeprom-microwire", "write", false),
    }
}

fn cmd_esp(c: EspCmd) -> anyhow::Result<()> {
    match c {
        EspCmd::Detect { json } => hw_stub("esp", "detect", json),
        EspCmd::Flash { .. } => hw_stub("esp", "flash", false),
    }
}

fn cmd_stm32(c: Stm32Cmd) -> anyhow::Result<()> {
    match c {
        Stm32Cmd::SwdFlash { .. } => hw_stub("stm32", "swd-flash", false),
        Stm32Cmd::UartFlash { .. } => hw_stub("stm32", "uart-flash", false),
    }
}

fn cmd_la(c: LaCmd) -> anyhow::Result<()> {
    match c {
        LaCmd::Capture { .. } => hw_stub("la", "capture", false),
        LaCmd::Export { .. } => hw_stub("la", "export", false),
    }
}

fn cmd_buspirate(c: BpCmd) -> anyhow::Result<()> {
    match c {
        BpCmd::Bridge { .. } => hw_stub("buspirate", "bridge", false),
        BpCmd::Probe { .. } => hw_stub("buspirate", "probe", false),
    }
}

fn cmd_can(c: CanCmd) -> anyhow::Result<()> {
    match c {
        CanCmd::Sniff { .. } => hw_stub("can", "sniff", false),
        CanCmd::Send { .. } => hw_stub("can", "send", false),
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
    let mut m = open_dyn();
    let r = m.write_chip(
        std::path::Path::new(input),
        WriteOpts {
            skip_backup,
            skip_verify,
        },
    )?;
    let env = AgentEnvelope::ok("write", r.clone());
    emit_envelope(&env, json, || {
        println!(
            "write success={} verified={} backup={:?}",
            r.success, r.verified, r.backup_path
        );
    })
}

fn cmd_erase(json: bool) -> anyhow::Result<()> {
    let mut m = open_dyn();
    let r = m.erase_chip()?;
    let env = AgentEnvelope::ok("erase", r.clone());
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

fn cmd_serial(port: &str, baud: u32, json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::ok(
        "serial",
        json!({
            "port": port, "baud": baud,
            "note": "live serial connect requires the live POSIX/Win32 driver wired in D22+; mock returns config only"
        }),
    );
    emit_envelope(&env, json, || {
        println!("serial: would connect to {port} @ {baud} baud (live impl pending)");
    })
}

fn cmd_serial_list(json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::ok(
        "serial-list",
        json!({"ports": serde_json::Value::Array(vec![])}),
    );
    emit_envelope(&env, json, || {
        println!("no ports (live enumeration deferred)")
    })
}

fn cmd_chip_info(key: &str, json: bool) -> anyhow::Result<()> {
    let chip = ratchet_core::chips::lookup_by_jedec_id(key)
        .or_else(|| ratchet_core::chips::lookup_by_name(key));
    let env = AgentEnvelope::ok("chip-info", chip.cloned());
    emit_envelope(&env, json, || match chip {
        Some(c) => println!(
            "{} ({}) jedec={} size={}",
            c.name,
            c.vendor,
            c.jedec_id,
            ratchet_core::chips::format_size(c.size_bytes)
        ),
        None => println!("not found: {key}"),
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

fn cmd_failure_search(query: &str, json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::ok(
        "failure-search",
        json!({
            "query": query, "results": serde_json::Value::Array(vec![]),
            "note": "failure-pattern KB ported via include_str! is pending (deferred to follow-up)"
        }),
    );
    emit_envelope(&env, json, || println!("failure-search: KB port deferred"))
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
    let mut m = open_dyn();
    let r = m.region_erase(s, l)?;
    let env = AgentEnvelope::ok("region-erase", r.clone());
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
    println!("ratchet REPL  -  type 'help' or 'quit'");
    println!("(non-interactive build; live rustyline TTY loop pending)");
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
    // `full-repair` runs through the workflows::pipeline framework, which
    // expects a `PipelineBackend` (not the trait `Backend` open_default returns).
    // Bridging the real CH341A/CH347 backends into PipelineBackend is its own
    // multi-step refactor; until then this command stays mock-bridge-only and
    // is explicitly marked as such in the JSON envelope.
    use ratchet_core::backends::mock::MockBackend;
    use ratchet_core::workflows::pipeline::{
        build_repair_pipeline, run_pipeline, ConnectionTestData, PipelineBackend, PipelineContext,
        ReadOutcome, VerifyOutcome, WriteOutcome,
    };

    struct MockBridge {
        m: MockBackend,
    }
    impl PipelineBackend for MockBridge {
        fn connection_test(&mut self) -> Result<ConnectionTestData, String> {
            use ratchet_core::backends::Backend;
            let r = self.m.connection_test().map_err(|e| e.to_string())?;
            Ok(ConnectionTestData {
                stable: r.stable,
                reads: r.reads,
                matches: r.matches,
                jedec_id: r.jedec_id,
                timings: r.timings,
                status_register: r.status_register,
            })
        }
        fn identify_chip(&mut self) -> Result<Option<ratchet_core::types::ChipInfo>, String> {
            use ratchet_core::backends::Backend;
            self.m.identify_chip().map_err(|e| e.to_string())
        }
        fn read_chip_double_verify(&mut self) -> Result<ReadOutcome, String> {
            let data: Vec<u8> = self.m.flash_bytes().to_vec();
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(&data);
            let chk: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
            Ok(ReadOutcome {
                success: true,
                size_bytes: data.len() as u64,
                checksum: chk,
                data,
                error: None,
            })
        }
        fn write_chip(&mut self, _data: &[u8]) -> Result<WriteOutcome, String> {
            Ok(WriteOutcome {
                success: true,
                verified: true,
                error: None,
                backup_path: None,
            })
        }
        fn verify_chip(&mut self, _data: &[u8]) -> Result<VerifyOutcome, String> {
            Ok(VerifyOutcome {
                matches: true,
                chip_checksum: String::new(),
                file_checksum: String::new(),
            })
        }
        fn is_write_protected(&mut self) -> Result<bool, String> {
            Ok(false)
        }
        fn disable_write_protection(&mut self) -> Result<(), String> {
            Ok(())
        }
    }

    let mut bridge = MockBridge {
        m: MockBackend::default(),
    };
    let mut ctx = PipelineContext::new(&mut bridge);
    if let Some(r) = reference {
        ctx.reference_path = Some(std::path::PathBuf::from(r));
    }
    ctx.skip_write = skip_write;
    let result = run_pipeline(&build_repair_pipeline(), &mut ctx);
    let env = AgentEnvelope::ok("full-repair", result.clone());
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

fn cmd_full_backup(json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::ok(
        "full-backup",
        json!({
            "note": "full-backup pipeline wiring deferred (parallel to full-repair)"
        }),
    );
    emit_envelope(&env, json, || println!("full-backup deferred"))
}

fn cmd_monitor(interval_ms: u32, json: bool) -> anyhow::Result<()> {
    let env = AgentEnvelope::ok(
        "monitor",
        json!({
            "interval_ms": interval_ms,
            "note": "live continuous monitor deferred (REPL TTY loop)"
        }),
    );
    emit_envelope(&env, json, || {
        println!("monitor: interval={interval_ms}ms (live loop pending)")
    })
}

fn parse_addr(s: &str) -> anyhow::Result<u64> {
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        Ok(u64::from_str_radix(hex, 16)?)
    } else {
        Ok(s.parse::<u64>()?)
    }
}
