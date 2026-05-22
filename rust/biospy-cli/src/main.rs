// biospy CLI — clap-based entry point. D18 wires up the full command tree.

use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "biospy",
    version,
    about = "Modern BIOS chip programmer and debugger (CH341A / CH347) — fully native Rust"
)]
struct Cli {
    // Subcommands land in D18.
}

fn main() -> anyhow::Result<()> {
    let _cli = Cli::parse();
    println!(
        "biospy {} (core {})",
        env!("CARGO_PKG_VERSION"),
        biospy_core::version()
    );
    Ok(())
}
