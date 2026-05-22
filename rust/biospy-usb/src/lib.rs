// Safe wrapper over the raw libusb FFI in `biospy-usb-sys`.
// D1: skeleton only. D2 fills in RAII handles, error mapping, bulk I/O.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum UsbError {
    #[error("libusb init failed: code {0}")]
    InitFailed(i32),
    #[error("device not found: vid={vid:#06x} pid={pid:#06x}")]
    NotFound { vid: u16, pid: u16 },
    #[error("permission denied — check udev rules / Info.plist entitlements")]
    PermissionDenied,
    #[error("transfer failed: code {0}")]
    TransferFailed(i32),
    #[error("unsupported on this platform")]
    Unsupported,
}

pub type Result<T> = std::result::Result<T, UsbError>;

/// Placeholder — D2 implements actual device enumeration.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
