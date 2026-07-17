// Safe Rust wrapper over ratchet-usb-sys. RAII handles, typed errors, blocking I/O surface.
// Used by every backend in ratchet-core::backends.

#![deny(unsafe_op_in_unsafe_fn)]

use ratchet_usb_sys as sys;
use std::ffi::{c_int, c_uchar, c_uint, c_void};
use std::ptr::{self, NonNull};
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UsbError {
    #[error("libusb_init failed: code {0}")]
    InitFailed(i32),
    #[error("device not found: vid={vid:#06x} pid={pid:#06x}")]
    NotFound { vid: u16, pid: u16 },
    #[error("access denied  -  check udev rules (Linux) / WinUSB driver (Windows) / Info.plist entitlements (macOS)")]
    Access,
    #[error("I/O error")]
    Io,
    #[error("invalid parameter")]
    InvalidParam,
    #[error("device disconnected")]
    NoDevice,
    #[error("interface busy  -  another process or driver may hold it")]
    Busy,
    #[error("transfer timeout")]
    Timeout,
    #[error("transfer overflow")]
    Overflow,
    #[error("endpoint stalled (pipe error)")]
    Pipe,
    #[error("operation interrupted")]
    Interrupted,
    #[error("out of memory")]
    NoMem,
    #[error("operation not supported on this platform")]
    NotSupported,
    #[error("short transfer: expected {expected}, got {actual}")]
    ShortTransfer { expected: usize, actual: usize },
    #[error("libusb error: code {0}")]
    Other(i32),
}

pub type Result<T> = std::result::Result<T, UsbError>;

/// Map a libusb negative error code to a typed UsbError.
/// libusb returns 0 or a positive byte count on success, negative on error.
fn map_err(code: c_int) -> UsbError {
    match code {
        sys::LIBUSB_ERROR_IO => UsbError::Io,
        sys::LIBUSB_ERROR_INVALID_PARAM => UsbError::InvalidParam,
        sys::LIBUSB_ERROR_ACCESS => UsbError::Access,
        sys::LIBUSB_ERROR_NO_DEVICE => UsbError::NoDevice,
        sys::LIBUSB_ERROR_NOT_FOUND => UsbError::NotFound { vid: 0, pid: 0 },
        sys::LIBUSB_ERROR_BUSY => UsbError::Busy,
        sys::LIBUSB_ERROR_TIMEOUT => UsbError::Timeout,
        sys::LIBUSB_ERROR_OVERFLOW => UsbError::Overflow,
        sys::LIBUSB_ERROR_PIPE => UsbError::Pipe,
        sys::LIBUSB_ERROR_INTERRUPTED => UsbError::Interrupted,
        sys::LIBUSB_ERROR_NO_MEM => UsbError::NoMem,
        sys::LIBUSB_ERROR_NOT_SUPPORTED => UsbError::NotSupported,
        other => UsbError::Other(other),
    }
}

/// RAII libusb context. Created with `Context::new()`, exits libusb on drop.
/// `Arc<ContextInner>` lets device handles outlive the original `Context` binding safely.
pub struct Context {
    inner: Arc<ContextInner>,
}

struct ContextInner {
    ptr: NonNull<sys::libusb_context>,
}

// libusb contexts are thread-safe for read access; libusb itself synchronizes internally.
unsafe impl Send for ContextInner {}
unsafe impl Sync for ContextInner {}

impl Context {
    pub fn new() -> Result<Self> {
        let mut ctx: *mut sys::libusb_context = ptr::null_mut();
        // SAFETY: libusb_init accepts a null-or-pointer-to-pointer and returns 0/negative.
        let code = unsafe { sys::libusb_init(&mut ctx) };
        if code != sys::LIBUSB_SUCCESS {
            return Err(UsbError::InitFailed(code));
        }
        let nn = NonNull::new(ctx).ok_or(UsbError::InitFailed(0))?;
        Ok(Self {
            inner: Arc::new(ContextInner { ptr: nn }),
        })
    }

    /// Open the first attached device matching (vid, pid).
    /// Returns NotFound if no matching device is plugged in.
    pub fn find_by_ids(&self, vid: u16, pid: u16) -> Result<DeviceHandle> {
        // SAFETY: ctx pointer is valid for ContextInner's lifetime.
        let raw =
            unsafe { sys::libusb_open_device_with_vid_pid(self.inner.ptr.as_ptr(), vid, pid) };
        let nn = NonNull::new(raw).ok_or(UsbError::NotFound { vid, pid })?;
        Ok(DeviceHandle {
            ptr: nn,
            _ctx: Arc::clone(&self.inner),
        })
    }

    /// Enumerate every attached device. Caller can inspect descriptors to find non-VID/PID matches.
    pub fn devices(&self) -> Result<Vec<DeviceDescriptor>> {
        let mut list: *mut *mut sys::libusb_device = ptr::null_mut();
        // SAFETY: ctx valid; we pass a writable pointer-to-pointer.
        let count = unsafe { sys::libusb_get_device_list(self.inner.ptr.as_ptr(), &mut list) };
        if count < 0 {
            return Err(map_err(count as c_int));
        }
        let mut out = Vec::with_capacity(count as usize);
        for i in 0..count as isize {
            // SAFETY: list contains `count` valid device pointers.
            let dev = unsafe { *list.offset(i) };
            if dev.is_null() {
                continue;
            }
            let mut desc: sys::libusb_device_descriptor = unsafe { std::mem::zeroed() };
            // SAFETY: dev is a valid libusb_device*; desc is owned local storage.
            let rc = unsafe { sys::libusb_get_device_descriptor(dev, &mut desc) };
            if rc == 0 {
                out.push(DeviceDescriptor {
                    vendor_id: desc.idVendor,
                    product_id: desc.idProduct,
                    bcd_device: desc.bcdDevice,
                    class: desc.bDeviceClass,
                });
            }
        }
        // SAFETY: list came from libusb_get_device_list; free unrefs all devices.
        unsafe { sys::libusb_free_device_list(list, 1) };
        Ok(out)
    }
}

impl Drop for ContextInner {
    fn drop(&mut self) {
        // SAFETY: ptr was initialized by libusb_init; exit accepts non-null.
        unsafe { sys::libusb_exit(self.ptr.as_ptr()) };
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DeviceDescriptor {
    pub vendor_id: u16,
    pub product_id: u16,
    pub bcd_device: u16,
    pub class: u8,
}

/// Open USB device handle. Closes on drop. Holds an Arc to the parent context so
/// the context outlives any open handle.
pub struct DeviceHandle {
    ptr: NonNull<sys::libusb_device_handle>,
    _ctx: Arc<ContextInner>,
}

impl std::fmt::Debug for DeviceHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceHandle")
            .field("ptr", &self.ptr.as_ptr())
            .finish()
    }
}

unsafe impl Send for DeviceHandle {}

// ─── Async bulk pipelining ──────────────────────────────────────────────────

// Bookkeeping for in-flight transfers, mirroring flashrom's `enum trans_state`.
// A completed transfer stores its own actual_length (positive), so the sentinels
// must be zero or negative.
const TRANS_ACTIVE: c_int = -2;
const TRANS_ERR: c_int = -1;
const TRANS_IDLE: c_int = 0;

/// libusb completion callback. Runs on whichever thread sits inside
/// `libusb_handle_events_timeout` -- always the submitting thread here.
///
/// Must never unwind into C, so it does nothing but store an int.
extern "C" fn bulk_ring_cb(transfer: *mut sys::libusb_transfer) {
    // SAFETY: libusb hands back a transfer we allocated and submitted, whose
    // user_data we set to a *mut c_int that outlives the transfer.
    unsafe {
        let t = &*transfer;
        let state = t.user_data as *mut c_int;
        if state.is_null() {
            return;
        }
        *state = match t.status {
            sys::LIBUSB_TRANSFER_CANCELLED => TRANS_IDLE,
            sys::LIBUSB_TRANSFER_COMPLETED => t.actual_length,
            _ => TRANS_ERR,
        };
    }
}

/// Owns one OUT transfer plus a ring of IN transfers and frees them on drop.
struct TransferRing {
    out: *mut sys::libusb_transfer,
    ins: Vec<*mut sys::libusb_transfer>,
}

impl TransferRing {
    fn alloc(ring: usize) -> Result<Self> {
        // SAFETY: libusb_alloc_transfer(0) allocates a zeroed non-iso transfer.
        let out = unsafe { sys::libusb_alloc_transfer(0) };
        if out.is_null() {
            return Err(UsbError::NoMem);
        }
        let mut me = TransferRing {
            out,
            ins: Vec::with_capacity(ring),
        };
        for _ in 0..ring {
            // SAFETY: as above; Drop frees whatever we managed to allocate.
            let t = unsafe { sys::libusb_alloc_transfer(0) };
            if t.is_null() {
                return Err(UsbError::NoMem);
            }
            me.ins.push(t);
        }
        Ok(me)
    }

    /// Cancel anything still in flight and pump events until every transfer has
    /// come back. Freeing a submitted transfer is a use-after-free inside libusb,
    /// so this must run before drop on both the success and error paths.
    ///
    /// Returns false if libusb STILL owns a transfer when the wait deadline
    /// expires. It may run the callback afterwards, so on false the caller must
    /// keep the state storage alive forever rather than let a freed Box be
    /// written into.
    ///
    /// # Safety
    /// `state_out`/`state_in` must point to live storage covering `ring` slots,
    /// and must be the same pointers handed to the submitted transfers.
    unsafe fn reap(
        &mut self,
        ctx: *mut sys::libusb_context,
        state_out: *mut c_int,
        state_in: *mut c_int,
        ring: usize,
        writecnt: usize,
        readcnt: usize,
    ) -> bool {
        unsafe {
            // A failed cancel is NOT a reason to stop tracking a transfer. Whatever
            // the reason (already completed, device gone), libusb still owns it and
            // will still run the callback, so it stays ACTIVE and we keep waiting.
            // Marking it ERR here would make the wait skip it and the leak check
            // below miss it, and Drop would then free memory libusb still owns.
            if writecnt > 0 && *state_out == TRANS_ACTIVE {
                let _ = sys::libusb_cancel_transfer(self.out);
            }
            if readcnt > 0 {
                for i in 0..ring {
                    if *state_in.add(i) == TRANS_ACTIVE {
                        let _ = sys::libusb_cancel_transfer(self.ins[i]);
                    }
                }
            }
            // Bounded wait: a wedged device must not hang the caller forever.
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            loop {
                let mut pending = writecnt > 0 && *state_out == TRANS_ACTIVE;
                if readcnt > 0 {
                    for i in 0..ring {
                        pending |= *state_in.add(i) == TRANS_ACTIVE;
                    }
                }
                if !pending || std::time::Instant::now() >= deadline {
                    break;
                }
                let mut tv = sys::timeval {
                    tv_sec: 0,
                    tv_usec: 100_000,
                };
                sys::libusb_handle_events_timeout(ctx, &mut tv);
            }
            // Anything still ACTIVE is still owned by libusb. Drop it from the free
            // list so Drop cannot free an in-flight transfer, and report that we
            // could not reap so the caller keeps the state storage alive.
            let mut all_reaped = true;
            if writecnt > 0 && *state_out == TRANS_ACTIVE {
                self.out = ptr::null_mut();
                all_reaped = false;
            }
            for i in (0..ring).rev() {
                if readcnt > 0 && *state_in.add(i) == TRANS_ACTIVE {
                    self.ins.remove(i);
                    all_reaped = false;
                }
            }
            all_reaped
        }
    }
}

impl Drop for TransferRing {
    fn drop(&mut self) {
        // SAFETY: reap() removed any transfer libusb may still own, so every
        // pointer left here is completed or was never submitted.
        unsafe {
            if !self.out.is_null() {
                sys::libusb_free_transfer(self.out);
            }
            for &t in &self.ins {
                if !t.is_null() {
                    sys::libusb_free_transfer(t);
                }
            }
        }
    }
}

impl DeviceHandle {
    /// Claim an interface for I/O. Required before bulk/control transfers.
    /// On Linux, also auto-detaches kernel drivers (best-effort).
    pub fn claim_interface(&self, iface: u8) -> Result<()> {
        // Best-effort kernel-driver detach (Linux only; no-op on macOS/Windows).
        // SAFETY: ptr valid for lifetime of self.
        unsafe {
            let _ = sys::libusb_set_auto_detach_kernel_driver(self.ptr.as_ptr(), 1);
        }
        // SAFETY: ptr valid; iface is a u8 we pass as c_int.
        let rc = unsafe { sys::libusb_claim_interface(self.ptr.as_ptr(), iface as c_int) };
        if rc == 0 {
            Ok(())
        } else {
            Err(map_err(rc))
        }
    }

    pub fn release_interface(&self, iface: u8) -> Result<()> {
        // SAFETY: ptr valid.
        let rc = unsafe { sys::libusb_release_interface(self.ptr.as_ptr(), iface as c_int) };
        if rc == 0 {
            Ok(())
        } else {
            Err(map_err(rc))
        }
    }

    /// Reset device  -  re-enumerates on the bus. Use after an unrecoverable error.
    pub fn reset(&self) -> Result<()> {
        // SAFETY: ptr valid.
        let rc = unsafe { sys::libusb_reset_device(self.ptr.as_ptr()) };
        if rc == 0 {
            Ok(())
        } else {
            Err(map_err(rc))
        }
    }

    /// Clear a halted (stalled) endpoint, via CLEAR_FEATURE(ENDPOINT_HALT).
    ///
    /// A stall is LATCHED, not transient: once an endpoint halts, every subsequent
    /// transfer on it fails with the same `LIBUSB_ERROR_IO` until the host clears
    /// the condition. That makes retrying-without-clearing pure noise, and makes an
    /// unrecoverable-looking error out of one that costs a single control transfer
    /// to fix. Also resets the endpoint's data toggle, which is exactly what a
    /// device that lost sync needs.
    pub fn clear_halt(&self, endpoint: u8) -> Result<()> {
        // SAFETY: ptr valid; libusb issues a synchronous control transfer.
        let rc = unsafe { sys::libusb_clear_halt(self.ptr.as_ptr(), endpoint as c_uchar) };
        if rc == 0 {
            Ok(())
        } else {
            Err(map_err(rc))
        }
    }

    /// Bulk IN transfer. Returns number of bytes read into `buf` (≤ `buf.len()`).
    pub fn bulk_in(&self, endpoint: u8, buf: &mut [u8], timeout_ms: u32) -> Result<usize> {
        debug_assert!(
            endpoint & sys::LIBUSB_ENDPOINT_IN as u8 != 0,
            "bulk_in needs IN endpoint"
        );
        let mut transferred: c_int = 0;
        // SAFETY: buf is exclusively borrowed; libusb writes up to buf.len() bytes.
        let rc = unsafe {
            sys::libusb_bulk_transfer(
                self.ptr.as_ptr(),
                endpoint,
                buf.as_mut_ptr() as *mut c_uchar,
                buf.len() as c_int,
                &mut transferred,
                timeout_ms as c_uint,
            )
        };
        if rc == 0 {
            Ok(transferred as usize)
        } else {
            Err(map_err(rc))
        }
    }

    /// Bulk OUT transfer. Returns number of bytes successfully written.
    /// Errors if not all bytes went out (callers can compare).
    pub fn bulk_out(&self, endpoint: u8, buf: &[u8], timeout_ms: u32) -> Result<usize> {
        debug_assert!(
            endpoint & sys::LIBUSB_ENDPOINT_IN as u8 == 0,
            "bulk_out needs OUT endpoint"
        );
        let mut transferred: c_int = 0;
        // SAFETY: buf is shared-borrowed; libusb reads up to buf.len() bytes.
        let rc = unsafe {
            sys::libusb_bulk_transfer(
                self.ptr.as_ptr(),
                endpoint,
                buf.as_ptr() as *mut c_uchar,
                buf.len() as c_int,
                &mut transferred,
                timeout_ms as c_uint,
            )
        };
        if rc == 0 {
            Ok(transferred as usize)
        } else {
            Err(map_err(rc))
        }
    }

    /// Stream `out` to `ep_out` while concurrently draining `in_buf` from `ep_in`
    /// through a ring of `ring` overlapping IN transfers of `in_chunk` bytes each.
    ///
    /// This exists because half-duplex synchronous I/O deadlocks on stream devices.
    /// The CH341A replies with one short packet per command packet and its bulk
    /// endpoints are only 32 bytes wide, so once its IN FIFO backs up it NAKs the
    /// OUT. A caller blocked inside a large `bulk_out` can never drain IN to
    /// unblock it. Measured on real silicon: a batched OUT succeeds up to 4 packets
    /// (~124 B) and hard-deadlocks at 6. Only overlapping both directions streams.
    ///
    /// `in_chunk` must match the device's reply packet size (31 for the CH341A):
    /// a short packet terminates a bulk transfer, so one oversized IN would return
    /// only the first reply. Modelled on flashrom's ch341a_spi.c `usb_transfer()`.
    #[allow(clippy::too_many_arguments)]
    pub fn bulk_out_in_parallel(
        &self,
        ep_out: u8,
        out: &[u8],
        ep_in: u8,
        in_buf: &mut [u8],
        in_chunk: usize,
        ring: usize,
        timeout_ms: u32,
    ) -> Result<()> {
        if in_chunk == 0 || ring == 0 {
            return Err(UsbError::InvalidParam);
        }
        let writecnt = out.len();
        let readcnt = in_buf.len();
        if writecnt == 0 && readcnt == 0 {
            return Ok(());
        }

        let ctx = self._ctx.ptr.as_ptr();
        let mut ring_guard = TransferRing::alloc(ring)?;

        // States live behind raw pointers for their whole lifetime: the libusb
        // callback writes through them, so forming a Rust reference to the same
        // storage while a transfer is in flight would alias a live &mut.
        let mut state_out_box: Box<c_int> = Box::new(TRANS_IDLE);
        let state_out: *mut c_int = &mut *state_out_box;
        let mut state_in_box: Box<[c_int]> = vec![TRANS_IDLE; ring].into_boxed_slice();
        let state_in: *mut c_int = state_in_box.as_mut_ptr();

        // SAFETY: alloc() returned non-null transfers; libusb_alloc_transfer
        // calloc's them, so only the fields we care about need setting.
        unsafe {
            let t = &mut *ring_guard.out;
            t.dev_handle = self.ptr.as_ptr();
            t.endpoint = ep_out as c_uchar;
            t.type_ = sys::LIBUSB_TRANSFER_TYPE_BULK as c_uchar;
            t.timeout = timeout_ms as c_uint;
            t.buffer = out.as_ptr() as *mut c_uchar;
            t.length = writecnt as c_int;
            t.callback = Some(bulk_ring_cb);
            t.user_data = state_out as *mut c_void;
            for (i, &tin) in ring_guard.ins.iter().enumerate() {
                let t = &mut *tin;
                t.dev_handle = self.ptr.as_ptr();
                t.endpoint = ep_in as c_uchar;
                t.type_ = sys::LIBUSB_TRANSFER_TYPE_BULK as c_uchar;
                t.timeout = timeout_ms as c_uint;
                t.callback = Some(bulk_ring_cb);
                t.user_data = state_in.add(i) as *mut c_void;
            }
        }

        // Schedule the write first so the device has work while INs queue up.
        if writecnt > 0 {
            // SAFETY: transfer is filled and not currently submitted.
            unsafe {
                *state_out = TRANS_ACTIVE;
                let rc = sys::libusb_submit_transfer(ring_guard.out);
                if rc != 0 {
                    *state_out = TRANS_ERR;
                    if !ring_guard.reap(ctx, state_out, state_in, ring, writecnt, readcnt) {
                        std::mem::forget(state_out_box);
                        std::mem::forget(state_in_box);
                    }
                    return Err(map_err(rc));
                }
            }
        }

        let mut free_idx = 0usize; // next IN transfer expected to be free
        let mut in_idx = 0usize; // next IN transfer expected to complete
        let mut in_done = 0usize;
        let mut in_active = 0usize;
        let mut out_done = 0usize;
        let in_base = in_buf.as_mut_ptr();

        // Wall-clock backstop. A device that completes a transfer with
        // actual_length 0 would otherwise be indistinguishable from an unsubmitted
        // slot and spin forever (a latent hang in flashrom's version of this loop).
        let deadline =
            std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms as u64 + 5_000);

        let result = 'pump: loop {
            // SAFETY: every raw access below targets storage we own and that is
            // only mutated by our callback on this same thread inside
            // libusb_handle_events_timeout.
            unsafe {
                // Keep the pipe full: submit INs while slots are free and bytes remain.
                while (in_done + in_active) < readcnt && *state_in.add(free_idx) == TRANS_IDLE {
                    let cur = in_chunk.min(readcnt - in_done - in_active);
                    let t = &mut *ring_guard.ins[free_idx];
                    t.length = cur as c_int;
                    t.buffer = in_base.add(in_done + in_active);
                    *state_in.add(free_idx) = TRANS_ACTIVE;
                    let rc = sys::libusb_submit_transfer(ring_guard.ins[free_idx]);
                    if rc != 0 {
                        *state_in.add(free_idx) = TRANS_ERR;
                        break 'pump Err(map_err(rc));
                    }
                    in_active += cur;
                    free_idx = (free_idx + 1) % ring;
                }

                let mut tv = sys::timeval {
                    tv_sec: 1,
                    tv_usec: 0,
                };
                sys::libusb_handle_events_timeout(ctx, &mut tv);

                if out_done < writecnt {
                    if *state_out == TRANS_ERR {
                        break 'pump Err(UsbError::Io);
                    } else if *state_out > 0 {
                        out_done += *state_out as usize;
                        *state_out = TRANS_IDLE;
                    }
                }

                while *state_in.add(in_idx) != TRANS_IDLE && *state_in.add(in_idx) != TRANS_ACTIVE {
                    if *state_in.add(in_idx) == TRANS_ERR {
                        break;
                    }
                    let n = *state_in.add(in_idx) as usize;
                    in_done += n;
                    in_active -= n;
                    *state_in.add(in_idx) = TRANS_IDLE;
                    in_idx = (in_idx + 1) % ring;
                }
                if *state_in.add(in_idx) == TRANS_ERR {
                    break 'pump Err(UsbError::Io);
                }

                if out_done >= writecnt && in_done >= readcnt {
                    break 'pump Ok(());
                }
                if std::time::Instant::now() >= deadline {
                    break 'pump Err(UsbError::Timeout);
                }
            }
        };

        // Every submitted transfer must be reaped before the ring is freed:
        // libusb_free_transfer on an in-flight transfer is use-after-free.
        // SAFETY: states and ring are still alive and owned here.
        let all_reaped =
            unsafe { ring_guard.reap(ctx, state_out, state_in, ring, writecnt, readcnt) };
        if !all_reaped {
            // libusb still owns a transfer and may invoke bulk_ring_cb after we
            // return. The callback writes through these pointers, so the storage
            // has to outlive this stack frame -- leak it rather than hand libusb a
            // dangling Box to scribble on.
            std::mem::forget(state_out_box);
            std::mem::forget(state_in_box);
        }
        result
    }

    /// Synchronous control transfer. `request_type` per USB spec (dir|type|recipient).
    /// `data` is read or written depending on direction bit of `request_type`.
    /// Returns bytes transferred.
    #[allow(clippy::too_many_arguments)]
    pub fn control_transfer(
        &self,
        request_type: u8,
        request: u8,
        value: u16,
        index: u16,
        data: &mut [u8],
        timeout_ms: u32,
    ) -> Result<usize> {
        // SAFETY: data exclusively borrowed; libusb reads or writes per direction bit.
        let rc = unsafe {
            sys::libusb_control_transfer(
                self.ptr.as_ptr(),
                request_type,
                request,
                value,
                index,
                data.as_mut_ptr() as *mut c_uchar,
                data.len() as u16,
                timeout_ms as c_uint,
            )
        };
        if rc >= 0 {
            Ok(rc as usize)
        } else {
            Err(map_err(rc))
        }
    }

    /// Read a string descriptor as ASCII.
    pub fn read_string_descriptor_ascii(&self, index: u8) -> Result<String> {
        let mut buf = [0u8; 256];
        // SAFETY: buf is writable, length matches.
        let rc = unsafe {
            sys::libusb_get_string_descriptor_ascii(
                self.ptr.as_ptr(),
                index,
                buf.as_mut_ptr() as *mut c_uchar,
                buf.len() as c_int,
            )
        };
        if rc < 0 {
            return Err(map_err(rc));
        }
        let s = String::from_utf8_lossy(&buf[..rc as usize]).into_owned();
        Ok(s)
    }
}

impl Drop for DeviceHandle {
    fn drop(&mut self) {
        // SAFETY: ptr came from libusb_open*; close is safe to call once.
        unsafe { sys::libusb_close(self.ptr.as_ptr()) };
    }
}

/// Build the standard USB control-request-type byte.
pub mod request_type {
    pub const VENDOR_OUT: u8 = 0x40;
    pub const VENDOR_IN: u8 = 0xC0;
    pub const CLASS_OUT: u8 = 0x21;
    pub const CLASS_IN: u8 = 0xA1;
    pub const STANDARD_OUT: u8 = 0x00;
    pub const STANDARD_IN: u8 = 0x80;
}

/// Endpoint helper  -  OR with endpoint number for IN direction.
pub const ENDPOINT_IN: u8 = 0x80;
pub const ENDPOINT_OUT: u8 = 0x00;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_init_and_drop() {
        let ctx = Context::new().expect("libusb_init must succeed with a libusb runtime");
        // Listing devices should at least return a (possibly empty) vector without erroring.
        let devs = ctx.devices().expect("device enumeration");
        // Don't assert a specific count  -  host may have 0 USB devices in CI sandboxes.
        let _ = devs.len();
    }

    #[test]
    fn find_by_ids_returns_not_found_for_bogus_vid() {
        let ctx = Context::new().unwrap();
        // VID 0xDEAD is not allocated to any vendor; PID arbitrary.
        let err = ctx.find_by_ids(0xDEAD, 0xBEEF).unwrap_err();
        assert!(
            matches!(
                err,
                UsbError::NotFound {
                    vid: 0xDEAD,
                    pid: 0xBEEF
                }
            ),
            "expected NotFound, got: {err:?}"
        );
    }

    #[test]
    fn error_mapping_covers_known_codes() {
        assert!(matches!(map_err(sys::LIBUSB_ERROR_IO), UsbError::Io));
        assert!(matches!(
            map_err(sys::LIBUSB_ERROR_ACCESS),
            UsbError::Access
        ));
        assert!(matches!(
            map_err(sys::LIBUSB_ERROR_NO_DEVICE),
            UsbError::NoDevice
        ));
        assert!(matches!(map_err(sys::LIBUSB_ERROR_BUSY), UsbError::Busy));
        assert!(matches!(
            map_err(sys::LIBUSB_ERROR_TIMEOUT),
            UsbError::Timeout
        ));
        assert!(matches!(map_err(sys::LIBUSB_ERROR_PIPE), UsbError::Pipe));
        assert!(matches!(
            map_err(sys::LIBUSB_ERROR_NOT_SUPPORTED),
            UsbError::NotSupported
        ));
        // Unknown code maps to Other.
        assert!(matches!(map_err(-77), UsbError::Other(-77)));
    }

    #[test]
    fn request_type_constants_match_usb_spec() {
        assert_eq!(request_type::VENDOR_OUT, 0x40);
        assert_eq!(request_type::VENDOR_IN, 0xC0);
        assert_eq!(ENDPOINT_IN, 0x80);
        assert_eq!(ENDPOINT_OUT, 0x00);
    }

    #[test]
    fn version_is_non_empty() {
        assert!(!version().is_empty());
    }
}
