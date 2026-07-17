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

/// Parallel IN transfers kept in flight by `bulk_stream`. flashrom uses 32
/// (USB_IN_TRANSFERS) and reports it as the most stable value; the ring must be
/// deep enough that the host controller always has an IN queued when the device
/// answers, or throughput collapses back to one round-trip per packet.
pub const IN_RING: usize = 32;

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

    /// Un-stall the endpoints after an I/O error, then hand the error back unchanged.
    ///
    /// `LIBUSB_ERROR_IO` on a bulk endpoint is usually a STALL, and a stall is
    /// LATCHED: every later transfer fails identically until the host clears it. So
    /// one glitch turned every subsequent command into an error and killed the run,
    /// which is exactly what `ratchet monitor` kept doing at read 8 of 500. Clearing
    /// costs one control transfer and makes the next attempt possible.
    ///
    /// Deliberately does NOT retry here. Every caller is mid-CS-frame (assert, then
    /// command, then deassert), so re-issuing the transfer would splice a second SPI
    /// transaction into a frame the chip is already interpreting, and hand back bytes
    /// that look valid and are not. Clearing the stall is the whole job: the retry
    /// belongs to the caller, which re-frames CS properly.
    fn unstall_on_io_error<T>(&self, r: Result<T>) -> Result<T> {
        if matches!(r, Err(BackendError::Usb(ratchet_usb::UsbError::Io))) {
            // Both directions: we cannot tell which halted, and clearing a healthy
            // endpoint is a no-op on the device.
            let _ = self.handle.clear_halt(self.ep_in);
            let _ = self.handle.clear_halt(self.ep_out);
        }
        r
    }

    fn bulk_out_all(&self, buf: &[u8]) -> Result<()> {
        let n = self.unstall_on_io_error(
            self.handle
                .bulk_out(self.ep_out, buf, self.timeout_ms)
                .map_err(BackendError::Usb),
        )?;
        if n != buf.len() {
            return Err(BackendError::Other(format!(
                "short bulk_out: wrote {n} of {} bytes",
                buf.len()
            )));
        }
        Ok(())
    }

    fn bulk_in_exact(&self, len: usize) -> Result<Vec<u8>> {
        let mut buf = vec![0u8; len];
        self.bulk_in_exact_into(&mut buf)?;
        Ok(buf)
    }

    fn bulk_in_exact_into(&self, buf: &mut [u8]) -> Result<()> {
        let r = fill_exact_into(buf, |chunk| {
            self.handle
                .bulk_in(self.ep_in, chunk, self.timeout_ms)
                .map_err(BackendError::Usb)
        });
        self.unstall_on_io_error(r)
    }
}

/// Fill `buf` exactly by re-invoking `read` until it is full. Borrowed-buffer
/// form so hot paths (one call per 31-byte CH341A packet — ~270k per 8 MB read)
/// reuse a single caller buffer instead of allocating a Vec per packet.
/// A read that delivers 0 bytes means the device stopped responding mid-range;
/// that is a hard `ShortTransfer` error, never zero-padding — padding would
/// silently corrupt chip reads, verify passes, and pre-write backups.
fn fill_exact_into<F>(buf: &mut [u8], mut read: F) -> Result<()>
where
    F: FnMut(&mut [u8]) -> Result<usize>,
{
    let len = buf.len();
    let mut filled = 0usize;
    while filled < len {
        let n = read(&mut buf[filled..])?;
        if n == 0 {
            return Err(BackendError::Usb(ratchet_usb::UsbError::ShortTransfer {
                expected: len,
                actual: filled,
            }));
        }
        filled += n;
    }
    Ok(())
}

impl UsbBus for LibusbBus {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
        self.bulk_out_all(data)
    }

    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
        self.bulk_in_exact(len)
    }

    fn bulk_read_into(&mut self, buf: &mut [u8]) -> Result<()> {
        self.bulk_in_exact_into(buf)
    }

    fn bulk_stream(&mut self, out: &[u8], in_buf: &mut [u8], in_chunk: usize) -> Result<()> {
        // Overlap OUT with a ring of INs. The trait default alternates one packet
        // at a time (~350 us per 31 bytes); on real silicon that is the whole
        // reason a 32 MB dump takes six minutes.
        let r = self
            .handle
            .bulk_out_in_parallel(
                self.ep_out,
                out,
                self.ep_in,
                in_buf,
                in_chunk,
                IN_RING,
                self.timeout_ms,
            )
            .map_err(BackendError::Usb);
        self.unstall_on_io_error(r)
    }
}

impl Transport for LibusbBus {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.bulk_out_all(data)
    }

    fn read(&mut self, len: usize) -> Result<Vec<u8>> {
        self.bulk_in_exact(len)
    }

    fn read_into(&mut self, buf: &mut [u8]) -> Result<()> {
        self.bulk_in_exact_into(buf)
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

    #[test]
    fn fill_exact_assembles_partial_reads() {
        // Device delivers 3 bytes, then 2 — fill_exact_into must stitch them.
        let chunks: std::cell::RefCell<Vec<&[u8]>> =
            std::cell::RefCell::new(vec![&[1u8, 2, 3][..], &[4u8, 5][..]]);
        let mut out = [0u8; 5];
        fill_exact_into(&mut out, |dst| {
            let mut c = chunks.borrow_mut();
            let chunk = c.remove(0);
            dst[..chunk.len()].copy_from_slice(chunk);
            Ok(chunk.len())
        })
        .expect("two partial reads fill the request");
        assert_eq!(out, [1, 2, 3, 4, 5]);
    }

    #[test]
    fn fill_exact_short_transfer_is_hard_error_not_padding() {
        // Device delivers 2 bytes then stops (0-byte read): must be an error
        // mentioning the short transfer, never a zero-padded success.
        let reads = std::cell::Cell::new(0u32);
        let mut out = [0u8; 4];
        let err = fill_exact_into(&mut out, |dst| {
            if reads.get() == 0 {
                reads.set(1);
                dst[..2].copy_from_slice(&[0xAA, 0xBB]);
                Ok(2)
            } else {
                Ok(0)
            }
        })
        .expect_err("short transfer must fail");
        let msg = err.to_string().to_lowercase();
        assert!(msg.contains("short"), "error must mention short: {msg}");
        assert!(
            msg.contains('2') && msg.contains('4'),
            "got/expected counts: {msg}"
        );
    }

    #[test]
    fn fill_exact_propagates_read_errors() {
        let mut out = [0u8; 8];
        let err = fill_exact_into(&mut out, |_| {
            Err(BackendError::Usb(ratchet_usb::UsbError::Timeout))
        })
        .expect_err("underlying error propagates");
        assert!(err.to_string().to_lowercase().contains("timeout"));
    }

    #[test]
    fn fill_exact_zero_len_is_empty_ok() {
        fill_exact_into(&mut [], |_| panic!("read must not be called for len 0")).unwrap();
    }

    // Compile-time assertion: LibusbBus satisfies both trait bounds.
    fn _assert_traits<T: UsbBus + Transport + Send>() {}
    #[test]
    fn libusb_bus_impls_both_traits() {
        _assert_traits::<LibusbBus>();
    }
}
