// napi-rs Node-API bridge. Exposes ratchet-core's pure functions to Node
// consumers without requiring users to install Rust  -  `napi build` produces
// `index.node` (a platform-specific .so/.dylib/.dll renamed) that Node loads
// directly via `require("./index.node")`.
//
// Why napi-rs and not node-gyp directly?
//   - napi-rs handles ABI compatibility across Node versions via N-API
//   - prebuilt-binaries.yml + `napi prepublish` ships per-arch binaries to npm
//     so end users `npm install ratchet` and get the right .node file with
//     zero compiler / build-tool requirements
//   - node-gyp directly requires distutils + python on the install host
//
// This bridge is OPTIONAL  -  the primary distribution is the standalone Rust
// binaries (ratchet / ratchet-mcp). Node consumers only need this if they want
// to call ratchet from JS without spawning a subprocess.

use napi_derive::napi;
use ratchet_core::backends::{open_default, Backend};

#[napi]
pub fn version() -> String {
    ratchet_core::version().to_string()
}

fn open_dyn() -> Box<dyn Backend + Send> {
    open_default().backend
}

#[napi]
pub fn detect() -> napi::Result<String> {
    let info = open_dyn()
        .detect_programmer()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&info).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn identify() -> napi::Result<String> {
    let info = open_dyn()
        .identify_chip()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&info).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn search_chips(query: String) -> napi::Result<String> {
    let r = ratchet_core::chips::search(&query);
    serde_json::to_string(&r).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn chip_info(key: String) -> napi::Result<String> {
    let chip = ratchet_core::chips::lookup_by_jedec_id(&key)
        .or_else(|| ratchet_core::chips::lookup_by_name(&key));
    serde_json::to_string(&chip).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn post_decode(code: String, standard: Option<String>) -> napi::Result<String> {
    use ratchet_core::diagnostics::post_codes::{lookup, PostStandard};
    let std_filter = match standard.as_deref() {
        Some("ami") => Some(PostStandard::Ami),
        Some("award") => Some(PostStandard::Award),
        Some("phoenix") => Some(PostStandard::Phoenix),
        Some("uefi") => Some(PostStandard::Uefi),
        Some(other) => {
            return Err(napi::Error::from_reason(format!(
                "unknown standard: {other}"
            )))
        }
        None => None,
    };
    let hits = lookup(&code, std_filter);
    serde_json::to_string(&hits).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn analyze_image(path: String) -> napi::Result<String> {
    let data = std::fs::read(&path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let report = ratchet_core::analysis::bios::analyze_bytes(&data);
    serde_json::to_string(&report).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn checksums(path: String) -> napi::Result<String> {
    let data = std::fs::read(&path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let c = ratchet_core::analysis::bios::checksums(&data);
    serde_json::to_string(&c).map_err(|e| napi::Error::from_reason(e.to_string()))
}
