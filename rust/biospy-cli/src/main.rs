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
    }
    Ok(())
}
