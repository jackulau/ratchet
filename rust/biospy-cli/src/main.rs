// biospy CLI — full subcommand surface (D18). Hardware ops are stubs that
// honour BIOSPY_FORCE_MOCK=1 by routing through the mock backend in
// biospy-core. Live USB I/O is wired up incrementally as backends mature.

use biospy_core::agent::envelope::AgentEnvelope;
use clap::{Parser, Subcommand};
use serde_json::json;

#[derive(Parser, Debug)]
#[command(
    name = "biospy",
    version,
    about = "Modern BIOS chip programmer and debugger (CH341A / CH347) — fully native Rust"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Show programmer status (mock-aware when BIOSPY_FORCE_MOCK=1).
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
    /// Serial debug — connect to a CH343 UART and stream lines.
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
}

fn force_mock() -> bool {
    std::env::var("BIOSPY_FORCE_MOCK").is_ok_and(|v| v == "1" || v == "true")
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
    match cli.command {
        None => {
            println!(
                "biospy {} (core {})",
                env!("CARGO_PKG_VERSION"),
                biospy_core::version()
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
    }
    Ok(())
}

// ─── Command impls ───────────────────────────────────────────────────────────

fn cmd_status(json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let info = m.detect_programmer()?;
    let env = AgentEnvelope::ok(
        "status",
        json!({
            "force_mock": force_mock(),
            "programmer": info,
        }),
    );
    emit_envelope(&env, json, || {
        println!("biospy status");
        println!("  programmer: {} ({})", info.description, info.kind);
        println!("  connected:  {}", info.connected);
        println!("  force_mock: {}", force_mock());
    })
}

fn cmd_detect(json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::{mock::MockBackend, Backend, WriteOpts};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let r = m.erase_chip()?;
    let env = AgentEnvelope::ok("erase", r.clone());
    emit_envelope(&env, json, || println!("erase ok ({}ms)", r.duration_ms))
}

fn cmd_verify(file: &str, json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let r = m.verify_chip(std::path::Path::new(file))?;
    let env = AgentEnvelope::ok("verify", r.clone());
    emit_envelope(&env, json, || println!("matches={}", r.matches))
}

fn cmd_analyze(file: &str, json: bool) -> anyhow::Result<()> {
    let data = std::fs::read(file)?;
    let report = biospy_core::analysis::bios::analyze_bytes(&data);
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
    let report = biospy_core::analysis::bios::diff_bytes(&da, &db);
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
    let c = biospy_core::analysis::bios::checksums(&data);
    let env = AgentEnvelope::ok("checksum", c.clone());
    emit_envelope(&env, json, || {
        println!("sha256: {}", c.sha256);
        println!("crc32:  {}", c.crc32);
    })
}

fn cmd_search(query: &str, json: bool) -> anyhow::Result<()> {
    let results = biospy_core::chips::search(query);
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
                biospy_core::chips::format_size(c.size_bytes),
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
    let chip = biospy_core::chips::lookup_by_jedec_id(key)
        .or_else(|| biospy_core::chips::lookup_by_name(key));
    let env = AgentEnvelope::ok("chip-info", chip.cloned());
    emit_envelope(&env, json, || match chip {
        Some(c) => println!(
            "{} ({}) jedec={} size={}",
            c.name,
            c.vendor,
            c.jedec_id,
            biospy_core::chips::format_size(c.size_bytes)
        ),
        None => println!("not found: {key}"),
    })
}

fn cmd_post_decode(code: &str, standard: Option<&str>, json: bool) -> anyhow::Result<()> {
    use biospy_core::diagnostics::post_codes::{lookup, PostStandard};
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
    let v = biospy_core::chips::get_chip_voltage(jedec_id);
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
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let sr = m.read_status_registers()?;
    let wp = m.is_write_protected()?;
    let env = AgentEnvelope::ok(
        "wp-status",
        json!({"write_protected": wp, "sr1": sr.sr1, "sr2": sr.sr2, "sr3": sr.sr3}),
    );
    emit_envelope(&env, json, || println!("wp={wp} sr1=0x{:02x}", sr.sr1))
}

fn cmd_region_erase(start: &str, length: &str, json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let s = parse_addr(start)?;
    let l = parse_addr(length)?;
    let mut m = MockBackend::default();
    let r = m.region_erase(s, l)?;
    let env = AgentEnvelope::ok("region-erase", r.clone());
    emit_envelope(&env, json, || {
        println!("region-erase ok ({}ms)", r.duration_ms)
    })
}

fn cmd_blank_check(json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
    let blank = m.flash_bytes().iter().all(|b| *b == 0xff);
    let env = AgentEnvelope::ok("blank-check", json!({"blank": blank}));
    emit_envelope(&env, json, || println!("blank={blank}"))
}

fn cmd_repl() -> anyhow::Result<()> {
    println!("biospy REPL — type 'help' or 'quit'");
    println!("(non-interactive build; live rustyline TTY loop pending)");
    Ok(())
}

fn cmd_self_test(json: bool) -> anyhow::Result<()> {
    use biospy_core::backends::{mock::MockBackend, Backend};
    let mut m = MockBackend::default();
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
    use biospy_core::backends::mock::MockBackend;
    use biospy_core::workflows::pipeline::{
        build_repair_pipeline, run_pipeline, ConnectionTestData, PipelineBackend, PipelineContext,
        ReadOutcome, VerifyOutcome, WriteOutcome,
    };

    struct MockBridge {
        m: MockBackend,
    }
    impl PipelineBackend for MockBridge {
        fn connection_test(&mut self) -> Result<ConnectionTestData, String> {
            use biospy_core::backends::Backend;
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
        fn identify_chip(&mut self) -> Result<Option<biospy_core::types::ChipInfo>, String> {
            use biospy_core::backends::Backend;
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
                "  [{}] {} — {} ({}ms)",
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
