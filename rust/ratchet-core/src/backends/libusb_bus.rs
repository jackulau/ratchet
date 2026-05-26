// Libusb-backed UsbBus / Transport adapter.
//
// Wraps a ratchet_usb::DeviceHandle and a pair of bulk endpoints so the
// existing CH341A / CH347 backends can talk to real silicon without each
// backend re-implementing the same FFI plumbing.
//
// Adapter holds:
//   * `handle`       - RAII libusb device handle (closes on drop)
//   * `ep_in` / `ep_out` - bulk endpoint addresses (CH341A: 0x82 / 0x02, CH347: 0x86 / 0x06)
//   * `timeout_ms`   - per-transfer timeout
//
// Implements both `backends::ch341a::UsbBus` (bulk_write / bulk_read) and
// `backends::ch347::Transport` (write / read) - same data, two trait surfaces.

use crate::backends::{ch341a::UsbBus, ch347::Transport, BackendError, Result};
use ratchet_usb::DeviceHandle;

pub const DEFAULT_TIMEOUT_MS: u32 = 5_000;
const MAX_BULK_IN: usize = 4096;

pub struct LibusbBus {
    handle: DeviceHandle,
    ep_in: u8,
    ep_out: u8,
    timeout_ms: u32,
}

impl LibusbBus {
    pub fn new(handle: DeviceHandle, ep_in: u8, ep_out: u8) -> Self {
        Self {
            handle,
            ep_in,
            ep_out,
            timeout_ms: DEFAULT_TIMEOUT_MS,
        }
    }

    pub fn with_timeout_ms(mut self, ms: u32) -> Self {
        self.timeout_ms = ms;
        self
    }

    fn bulk_out_all(&self, buf: &[u8]) -> Result<()> {
        let n = self
            .handle
            .bulk_out(self.ep_out, buf, self.timeout_ms)
            .map_err(BackendError::Usb)?;
        if n != buf.len() {
            return Err(BackendError::Other(format!(
                "short bulk_out: wrote {n} of {} bytes",
                buf.len()
            )));
        }
        Ok(())
    }

    fn bulk_in_exact(&self, len: usize) -> Result<Vec<u8>> {
        let cap = len.min(MAX_BULK_IN).max(len);
        let mut buf = vec![0u8; cap];
        let n = self
            .handle
            .bulk_in(self.ep_in, &mut buf, self.timeout_ms)
            .map_err(BackendError::Usb)?;
        buf.truncate(n);
        if n < len {
            buf.resize(len, 0);
        } else if n > len {
            buf.truncate(len);
        }
        Ok(buf)
    }
}

impl UsbBus for LibusbBus {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
        self.bulk_out_all(data)
    }

    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
        self.bulk_in_exact(len)
    }
}

impl Transport for LibusbBus {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.bulk_out_all(data)
    }

    fn read(&mut self, len: usize) -> Result<Vec<u8>> {
        self.bulk_in_exact(len)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Without real hardware we can't open a DeviceHandle, so unit tests cover
    // the trait-surface compile shape only. The factory module's integration
    // tests exercise this against MockBackend; live-device coverage requires
    // running with `--ignored` and a plugged-in CH341A or CH347.

    #[test]
    fn default_timeout_is_5s() {
        assert_eq!(DEFAULT_TIMEOUT_MS, 5_000);
    }

    // Compile-time assertion: LibusbBus satisfies both trait bounds.
    fn _assert_traits<T: UsbBus + Transport + Send>() {}
    #[test]
    fn libusb_bus_impls_both_traits() {
        _assert_traits::<LibusbBus>();
    }
}
