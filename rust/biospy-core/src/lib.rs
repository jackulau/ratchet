// biospy-core: chip db, backends, analysis, workflows. Filled in by D3–D17.

pub mod analysis;
pub mod backends;
pub mod chips;
pub mod connection;
pub mod diagnostics;
pub mod sfdp;
pub mod types;
pub mod workflows;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
