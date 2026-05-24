// USB-error classifier + user-actionable messages.
// Ports src/backends/usb-errors.ts. Translates raw libusb error codes /
// strings into a stable `UsbErrorKind` enum + canonical message.
// `--json` envelopes use the enum variant name as a stable machine-readable code.

use crate::backends::BackendError;
use ratchet_usb::UsbError;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Stable error category surfaced to `--json` consumers. Variant names
/// double as the machine-readable code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsbErrorKind {
    /// Cable/clip dropped mid-transfer; programmer no longer enumerated.
    Disconnected,
    /// OS denied access (Linux: udev rule missing, macOS: entitlement, Windows: WinUSB driver).
    AccessDenied,
    /// Programmer not enumerated on the bus.
    NotFound,
    /// Endpoint busy / claimed by another process.
    Busy,
    /// Bulk transfer didn't complete in time (often loose clip, low voltage, or bad cable).
    Timeout,
    /// Endpoint reported a pipe/stall error.
    PipeStall,
    /// Driver missing  -  Windows-specific (WinUSB not bound).
    DriverMissing,
    /// 1.8V chip on 3.3V programmer or supply rail outside spec.
    VoltageMismatch,
    /// Anything else.
    Other,
}

impl UsbErrorKind {
    pub fn code(self) -> &'static str {
        match self {
            UsbErrorKind::Disconnected => "usb_disconnected",
            UsbErrorKind::AccessDenied => "usb_access_denied",
            UsbErrorKind::NotFound => "usb_not_found",
            UsbErrorKind::Busy => "usb_busy",
            UsbErrorKind::Timeout => "usb_timeout",
            UsbErrorKind::PipeStall => "usb_pipe_stall",
            UsbErrorKind::DriverMissing => "usb_driver_missing",
            UsbErrorKind::VoltageMismatch => "usb_voltage_mismatch",
            UsbErrorKind::Other => "usb_other",
        }
    }
}

#[derive(Debug, Clone, Error, Serialize, Deserialize, PartialEq)]
#[error("{message}")]
pub struct ClassifiedUsbError {
    pub kind: UsbErrorKind,
    pub message: String,
    pub original: String,
}

const DISCONNECT_PATTERNS: &[&str] = &[
    "LIBUSB_ERROR_NO_DEVICE",
    "LIBUSB_ERROR_IO",
    "LIBUSB_ERROR_PIPE",
    "LIBUSB_ERROR_OVERFLOW",
    "LIBUSB_TRANSFER_NO_DEVICE",
    "LIBUSB_TRANSFER_ERROR",
    "device has been disconnected",
    "ENODEV",
    "EIO",
];

const VOLTAGE_PATTERNS: &[&str] = &["voltage", "VOLTAGE", "1.8V", "level shift"];

/// True if the raw string contains any USB-disconnect pattern.
pub fn is_disconnect_string(s: &str) -> bool {
    DISCONNECT_PATTERNS.iter().any(|p| s.contains(p))
}

/// True if message implies a voltage-class mismatch.
pub fn is_voltage_string(s: &str) -> bool {
    VOLTAGE_PATTERNS.iter().any(|p| s.contains(p))
}

/// Classify a typed [`UsbError`] from the safe layer.
pub fn classify_usb_error(err: &UsbError) -> ClassifiedUsbError {
    let original = err.to_string();
    let (kind, message) = match err {
        UsbError::NoDevice | UsbError::Io | UsbError::Pipe => (
            UsbErrorKind::Disconnected,
            disconnect_message(&original),
        ),
        UsbError::Access => (
            UsbErrorKind::AccessDenied,
            access_message(&original),
        ),
        UsbError::NotFound { .. } => (
            UsbErrorKind::NotFound,
            format!("USB programmer not found on the bus. {original}"),
        ),
        UsbError::Busy => (
            UsbErrorKind::Busy,
            format!(
                "USB interface busy  -  another process (or kernel driver) holds the interface. {original}"
            ),
        ),
        UsbError::Timeout => (
            UsbErrorKind::Timeout,
            timeout_message(&original),
        ),
        UsbError::NotSupported => (
            UsbErrorKind::DriverMissing,
            driver_message(&original),
        ),
        UsbError::Overflow => (
            UsbErrorKind::PipeStall,
            format!("USB overflow / stall  -  endpoint reset may be needed. {original}"),
        ),
        UsbError::ShortTransfer { expected, actual } => (
            UsbErrorKind::Disconnected,
            format!(
                "USB short transfer (expected {expected} bytes, got {actual})  -  likely cable/clip issue."
            ),
        ),
        UsbError::Interrupted => (
            UsbErrorKind::Other,
            format!("USB transfer interrupted. {original}"),
        ),
        UsbError::NoMem | UsbError::InvalidParam => (
            UsbErrorKind::Other,
            original.clone(),
        ),
        UsbError::InitFailed(_) | UsbError::Other(_) => {
            (UsbErrorKind::Other, original.clone())
        }
    };
    ClassifiedUsbError {
        kind,
        message,
        original,
    }
}

/// Classify a free-form string error (from libusb-cli or runtime sources).
pub fn classify_str(s: &str) -> ClassifiedUsbError {
    let (kind, message) = if is_disconnect_string(s) {
        (UsbErrorKind::Disconnected, disconnect_message(s))
    } else if s.contains("LIBUSB_ERROR_ACCESS") || s.contains("permission") || s.contains("EACCES")
    {
        (UsbErrorKind::AccessDenied, access_message(s))
    } else if s.contains("LIBUSB_ERROR_NOT_FOUND") || s.contains("ENOENT") {
        (
            UsbErrorKind::NotFound,
            format!("USB programmer not found on the bus. {s}"),
        )
    } else if s.contains("LIBUSB_ERROR_BUSY") {
        (UsbErrorKind::Busy, format!("USB interface busy. {s}"))
    } else if s.contains("LIBUSB_ERROR_TIMEOUT") {
        (UsbErrorKind::Timeout, timeout_message(s))
    } else if s.contains("LIBUSB_ERROR_NOT_SUPPORTED")
        || s.contains("WinUSB")
        || s.contains("driver")
    {
        (UsbErrorKind::DriverMissing, driver_message(s))
    } else if is_voltage_string(s) {
        (
            UsbErrorKind::VoltageMismatch,
            format!("Voltage mismatch  -  check 3.3V vs 1.8V chip class. {s}"),
        )
    } else {
        (UsbErrorKind::Other, s.to_string())
    };
    ClassifiedUsbError {
        kind,
        message,
        original: s.to_string(),
    }
}

fn disconnect_message(original: &str) -> String {
    format!(
        "USB programmer disconnected: {original}\n\n\
         Troubleshooting:\n  \
         1. Check USB cable  -  reseat or try a different cable\n  \
         2. Try a different USB port (avoid hubs)\n  \
         3. If using SOIC clip  -  check clip is firmly seated\n  \
         4. Check for loose solder joints on programmer board\n  \
         5. Some USB ports have power limits  -  try a powered hub\n  \
         6. On Linux: check `dmesg` for USB errors"
    )
}

fn access_message(original: &str) -> String {
    format!(
        "USB access denied: {original}\n\n\
         Troubleshooting:\n  \
         - Linux: add a udev rule for VID 1a86 / PID 5512 (and 55db for CH347).\n    \
         Example: SUBSYSTEM==\"usb\", ATTRS{{idVendor}}==\"1a86\", MODE=\"0666\"\n  \
         - macOS: codesign + entitlements for newer macOS USB device access.\n    \
         As a workaround, run with sudo or grant Full Disk Access.\n  \
         - Windows: install the WinUSB driver via Zadig (https://zadig.akeo.ie/)."
    )
}

fn timeout_message(original: &str) -> String {
    format!(
        "USB transfer timed out: {original}\n\n\
         Troubleshooting:\n  \
         1. Reseat the SOIC clip  -  bad contact is the #1 cause\n  \
         2. Lower SPI speed (CH347 supports clock divisors up to 7)\n  \
         3. Check chip voltage matches programmer (3.3V vs 1.8V)\n  \
         4. Try shorter USB cable / different port"
    )
}

fn driver_message(original: &str) -> String {
    format!(
        "USB driver not bound: {original}\n\n\
         Troubleshooting:\n  \
         - Windows: install the WinUSB driver via Zadig  -  https://zadig.akeo.ie/\n  \
         - Linux: ensure the `usb` group exists and your user is in it\n  \
         - macOS: no extra driver needed; check for kext blockers"
    )
}

/// Bridge from [`BackendError`] (which contains a typed UsbError) to a classified message.
pub fn classify_backend(err: &BackendError) -> ClassifiedUsbError {
    match err {
        BackendError::Usb(u) => classify_usb_error(u),
        BackendError::Io(e) => classify_str(&e.to_string()),
        BackendError::NotConnected => ClassifiedUsbError {
            kind: UsbErrorKind::NotFound,
            message: "Backend not connected.".to_string(),
            original: err.to_string(),
        },
        BackendError::ChipNotDetected => ClassifiedUsbError {
            kind: UsbErrorKind::Other,
            message: "No SPI flash chip detected on the bus.".to_string(),
            original: err.to_string(),
        },
        BackendError::WriteProtected => ClassifiedUsbError {
            kind: UsbErrorKind::Other,
            message: "Chip is write-protected.".to_string(),
            original: err.to_string(),
        },
        BackendError::Other(s) => classify_str(s),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnect_patterns_match() {
        for p in DISCONNECT_PATTERNS {
            assert!(
                is_disconnect_string(p),
                "pattern `{p}` should be classified as disconnect"
            );
        }
    }

    #[test]
    fn classify_no_device_is_disconnected() {
        let c = classify_usb_error(&UsbError::NoDevice);
        assert_eq!(c.kind, UsbErrorKind::Disconnected);
        assert!(c.message.contains("Troubleshooting"));
        assert_eq!(c.kind.code(), "usb_disconnected");
    }

    #[test]
    fn classify_io_is_disconnected() {
        let c = classify_usb_error(&UsbError::Io);
        assert_eq!(c.kind, UsbErrorKind::Disconnected);
    }

    #[test]
    fn classify_access_is_access_denied() {
        let c = classify_usb_error(&UsbError::Access);
        assert_eq!(c.kind, UsbErrorKind::AccessDenied);
        assert!(c.message.contains("udev"));
        assert!(c.message.contains("Zadig"));
    }

    #[test]
    fn classify_not_found() {
        let c = classify_usb_error(&UsbError::NotFound {
            vid: 0x1a86,
            pid: 0x5512,
        });
        assert_eq!(c.kind, UsbErrorKind::NotFound);
    }

    #[test]
    fn classify_busy() {
        let c = classify_usb_error(&UsbError::Busy);
        assert_eq!(c.kind, UsbErrorKind::Busy);
    }

    #[test]
    fn classify_timeout_has_actionable_message() {
        let c = classify_usb_error(&UsbError::Timeout);
        assert_eq!(c.kind, UsbErrorKind::Timeout);
        assert!(c.message.contains("SOIC clip"));
    }

    #[test]
    fn classify_not_supported_is_driver_missing() {
        let c = classify_usb_error(&UsbError::NotSupported);
        assert_eq!(c.kind, UsbErrorKind::DriverMissing);
        assert!(c.message.contains("Zadig"));
    }

    #[test]
    fn classify_str_eacces_is_access_denied() {
        let c = classify_str("permission denied (EACCES)");
        assert_eq!(c.kind, UsbErrorKind::AccessDenied);
    }

    #[test]
    fn classify_str_winusb_is_driver_missing() {
        let c = classify_str("WinUSB driver not bound");
        assert_eq!(c.kind, UsbErrorKind::DriverMissing);
    }

    #[test]
    fn classify_str_voltage_flagged() {
        let c = classify_str("VOLTAGE rail dropped");
        assert_eq!(c.kind, UsbErrorKind::VoltageMismatch);
    }

    #[test]
    fn classify_str_unknown_falls_to_other() {
        let c = classify_str("random failure");
        assert_eq!(c.kind, UsbErrorKind::Other);
        assert_eq!(c.message, "random failure");
    }

    #[test]
    fn error_codes_are_stable_snake_case() {
        // These strings are part of the `--json` contract; do not change without bumping major.
        assert_eq!(UsbErrorKind::Disconnected.code(), "usb_disconnected");
        assert_eq!(UsbErrorKind::AccessDenied.code(), "usb_access_denied");
        assert_eq!(UsbErrorKind::NotFound.code(), "usb_not_found");
        assert_eq!(UsbErrorKind::Busy.code(), "usb_busy");
        assert_eq!(UsbErrorKind::Timeout.code(), "usb_timeout");
        assert_eq!(UsbErrorKind::PipeStall.code(), "usb_pipe_stall");
        assert_eq!(UsbErrorKind::DriverMissing.code(), "usb_driver_missing");
        assert_eq!(UsbErrorKind::VoltageMismatch.code(), "usb_voltage_mismatch");
        assert_eq!(UsbErrorKind::Other.code(), "usb_other");
    }

    #[test]
    fn backend_error_bridge_classifies_usb() {
        let be = BackendError::Usb(UsbError::Access);
        let c = classify_backend(&be);
        assert_eq!(c.kind, UsbErrorKind::AccessDenied);
    }

    #[test]
    fn backend_error_bridge_not_connected() {
        let c = classify_backend(&BackendError::NotConnected);
        assert_eq!(c.kind, UsbErrorKind::NotFound);
    }

    #[test]
    fn backend_error_bridge_other_string_routed_through_classify_str() {
        let be = BackendError::Other("permission denied EACCES".to_string());
        let c = classify_backend(&be);
        assert_eq!(c.kind, UsbErrorKind::AccessDenied);
    }
}
