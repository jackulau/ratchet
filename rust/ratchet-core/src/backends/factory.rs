// Backend selection. One entry point - `open_default()` - that picks between
// mock and the two live USB backends (CH341A, CH347) based on env + device probe.
//
// Selection order:
//   1. RATCHET_FORCE_MOCK=1|true  -> Mock (no USB probe)
//   2. CH347 plugged in (vid=1a86, pid=55db)  -> Ch347Backend<LibusbBus>
//   3. CH341A plugged in (vid=1a86, pid=5512) -> CH341ABackend<LibusbBus>
//   4. neither found -> Mock + warning so caller can tell the user it isn't real silicon
//
// Library code never writes to stderr - the warning is returned in `OpenResult`
// and the caller (CLI / MCP) decides how to surface it.

use crate::backends::{
    ch341a::{CH341ABackend, CH341A_PID, CH341A_VID},
    ch347::{Ch347Backend, CH347_EP_IN, CH347_EP_OUT, CH347_PID, CH347_SPI_INTERFACE, CH347_VID},
    libusb_bus::LibusbBus,
    mock::MockBackend,
    Backend,
};
use ratchet_usb::Context;

// CH341A constants matching the existing backend module. EPs aren't re-exported
// from ch341a so we declare them here; values must stay in lockstep with
// `backends::ch341a::USB_EP_OUT` / `USB_EP_IN`.
const CH341A_EP_OUT: u8 = 0x02;
const CH341A_EP_IN: u8 = 0x82;
const CH341A_INTERFACE: u8 = 0;

const FORCE_MOCK_ENV: &str = "RATCHET_FORCE_MOCK";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendKind {
    Mock,
    Ch341a,
    Ch347,
}

impl BackendKind {
    pub fn as_str(self) -> &'static str {
        match self {
            BackendKind::Mock => "mock",
            BackendKind::Ch341a => "ch341a",
            BackendKind::Ch347 => "ch347",
        }
    }
}

pub struct OpenResult {
    pub backend: Box<dyn Backend + Send>,
    pub kind: BackendKind,
    /// Non-fatal note for the caller to surface. Populated when:
    ///   * libusb init failed
    ///   * a device was detected but its interface couldn't be claimed
    ///   * no device was detected and we fell back to mock
    pub warning: Option<String>,
    /// True iff `RATCHET_FORCE_MOCK` was set in the environment.
    pub force_mock_env: bool,
}

pub fn force_mock_env_set() -> bool {
    std::env::var(FORCE_MOCK_ENV)
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

pub fn open_default() -> OpenResult {
    let force_mock = force_mock_env_set();

    if force_mock {
        return OpenResult {
            backend: Box::new(MockBackend::default()),
            kind: BackendKind::Mock,
            warning: None,
            force_mock_env: true,
        };
    }

    let ctx = match Context::new() {
        Ok(c) => c,
        Err(e) => {
            return OpenResult {
                backend: Box::new(MockBackend::default()),
                kind: BackendKind::Mock,
                warning: Some(format!(
                    "libusb init failed ({e}); falling back to mock backend"
                )),
                force_mock_env: false,
            };
        }
    };

    if let Some(res) = try_open_ch347(&ctx) {
        return res;
    }
    if let Some(res) = try_open_ch341a(&ctx) {
        return res;
    }

    OpenResult {
        backend: Box::new(MockBackend::default()),
        kind: BackendKind::Mock,
        warning: Some(
            "no CH341A or CH347 USB device detected; using mock backend. \
             Plug in a programmer or set RATCHET_FORCE_MOCK=1 to silence this warning."
                .into(),
        ),
        force_mock_env: false,
    }
}

fn try_open_ch347(ctx: &Context) -> Option<OpenResult> {
    let handle = ctx.find_by_ids(CH347_VID, CH347_PID).ok()?;
    if let Err(e) = handle.claim_interface(CH347_SPI_INTERFACE) {
        return Some(OpenResult {
            backend: Box::new(MockBackend::default()),
            kind: BackendKind::Mock,
            warning: Some(format!(
                "CH347 detected but interface {CH347_SPI_INTERFACE} claim failed ({e}); using mock"
            )),
            force_mock_env: false,
        });
    }
    let bus = LibusbBus::new(handle, CH347_EP_IN, CH347_EP_OUT);
    Some(OpenResult {
        backend: Box::new(Ch347Backend::new(bus)),
        kind: BackendKind::Ch347,
        warning: None,
        force_mock_env: false,
    })
}

fn try_open_ch341a(ctx: &Context) -> Option<OpenResult> {
    let handle = ctx.find_by_ids(CH341A_VID, CH341A_PID).ok()?;
    if let Err(e) = handle.claim_interface(CH341A_INTERFACE) {
        return Some(OpenResult {
            backend: Box::new(MockBackend::default()),
            kind: BackendKind::Mock,
            warning: Some(format!(
                "CH341A detected but interface {CH341A_INTERFACE} claim failed ({e}); using mock"
            )),
            force_mock_env: false,
        });
    }
    let bus = LibusbBus::new(handle, CH341A_EP_IN, CH341A_EP_OUT);
    Some(OpenResult {
        backend: Box::new(CH341ABackend::with_bus(bus)),
        kind: BackendKind::Ch341a,
        warning: None,
        force_mock_env: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn force_mock_env_returns_mock() {
        // SAFETY: env var manipulation in tests - serialize with a guard.
        // We use a value that any sane CI will not have already set.
        let prev = std::env::var(FORCE_MOCK_ENV).ok();
        std::env::set_var(FORCE_MOCK_ENV, "1");
        let r = open_default();
        assert_eq!(r.kind, BackendKind::Mock);
        assert!(r.force_mock_env);
        assert!(r.warning.is_none(), "no warning when force-mock is set");
        match prev {
            Some(v) => std::env::set_var(FORCE_MOCK_ENV, v),
            None => std::env::remove_var(FORCE_MOCK_ENV),
        }
    }

    #[test]
    fn backend_kind_as_str() {
        assert_eq!(BackendKind::Mock.as_str(), "mock");
        assert_eq!(BackendKind::Ch341a.as_str(), "ch341a");
        assert_eq!(BackendKind::Ch347.as_str(), "ch347");
    }

    #[test]
    fn force_mock_env_helper_detects_truthy_values() {
        let prev = std::env::var(FORCE_MOCK_ENV).ok();

        std::env::set_var(FORCE_MOCK_ENV, "1");
        assert!(force_mock_env_set());

        std::env::set_var(FORCE_MOCK_ENV, "true");
        assert!(force_mock_env_set());

        std::env::set_var(FORCE_MOCK_ENV, "TRUE");
        assert!(force_mock_env_set());

        std::env::set_var(FORCE_MOCK_ENV, "0");
        assert!(!force_mock_env_set());

        std::env::set_var(FORCE_MOCK_ENV, "");
        assert!(!force_mock_env_set());

        std::env::remove_var(FORCE_MOCK_ENV);
        assert!(!force_mock_env_set());

        match prev {
            Some(v) => std::env::set_var(FORCE_MOCK_ENV, v),
            None => std::env::remove_var(FORCE_MOCK_ENV),
        }
    }
}
