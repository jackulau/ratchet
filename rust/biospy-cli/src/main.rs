// biospy CLI — clap-based entry point. D18 wires up the full command tree.
// D3 added: `search` so chip-db can be exercised from the CLI.

use clap::{Parser, Subcommand};

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
    /// Search the chip database (matches name, vendor, JEDEC ID, voltage).
    Search {
        /// Query string. Empty string returns the full database.
        query: String,
        /// Emit JSON instead of human-readable rows.
        #[arg(long)]
        json: bool,
    },
    /// Decode a BIOS POST code across AMI / Award / Phoenix / UEFI tables.
    PostDecode {
        /// POST code (hex, with or without `0x` prefix).
        code: String,
        /// Restrict to a single BIOS standard (ami|award|phoenix|uefi).
        #[arg(long)]
        standard: Option<String>,
        /// Emit JSON instead of human-readable text.
        #[arg(long)]
        json: bool,
    },
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
        Some(Command::Search { query, json }) => {
            let results = biospy_core::chips::search(&query);
            if json {
                let owned: Vec<&biospy_core::chips::Chip> = results;
                println!("{}", serde_json::to_string(&owned)?);
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
        }
        Some(Command::PostDecode {
            code,
            standard,
            json,
        }) => {
            use biospy_core::diagnostics::post_codes::{lookup, PostStandard};
            let std_filter = match standard.as_deref() {
                Some("ami") => Some(PostStandard::Ami),
                Some("award") => Some(PostStandard::Award),
                Some("phoenix") => Some(PostStandard::Phoenix),
                Some("uefi") => Some(PostStandard::Uefi),
                Some(other) => {
                    anyhow::bail!("unknown --standard `{other}` (ami|award|phoenix|uefi)")
                }
                None => None,
            };
            let hits = lookup(&code, std_filter);
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
        }
    }
    Ok(())
}
