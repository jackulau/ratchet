// biospy-core: chip db, backends, analysis, workflows. Filled in by D3–D17.

pub mod chips;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
