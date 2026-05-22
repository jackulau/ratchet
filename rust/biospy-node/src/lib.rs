// napi-rs Node-API bridge. D21 wires up the actual exported functions.

pub fn version() -> &'static str {
    biospy_core::version()
}
