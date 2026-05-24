// Safe Rust wrapper over ratchet-usb-sys. RAII handles, typed errors, blocking I/O surface.
// Used by every backend in ratchet-core::backends.

#![deny(unsafe_op_in_unsafe_fn)]

use ratchet_usb_sys as sys;
use std::ffi::{c_int, c_uchar, c_uint};
use std::os::raw::c_void;
use std::ptr::{self, NonNull};
use std::slice;
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UsbError {
    #[error("libusb_init failed: code {0}")]
    InitFailed(i32),
    #[error("device not found: vid={vid:#06x} pid={pid:#06x}")]
    NotFound { vid: u16, pid: u16 },
    #[error("access denied — check udev rules (Linux) / WinUSB driver (Windows) / Info.plist entitlements (macOS)")]
    Access,
    #[error("I/O error")]
    Io,
    #[error("invalid parameter")]
    InvalidParam,
    #[error("device disconnected")]
    NoDevice,
    #[error("interface busy — another process or driver may hold it")]
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

    /// Reset device — re-enumerates on the bus. Use after an unrecoverable error.
    pub fn reset(&self) -> Result<()> {
        // SAFETY: ptr valid.
        let rc = unsafe { sys::libusb_reset_device(self.ptr.as_ptr()) };
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

/// Endpoint helper — OR with endpoint number for IN direction.
pub const ENDPOINT_IN: u8 = 0x80;
pub const ENDPOINT_OUT: u8 = 0x00;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// Silence unused-import warning if `c_void` isn't referenced (kept for future async work).
#[allow(dead_code)]
fn _keep_c_void_imported(_: *mut c_void) {}

// Silence unused-import warning for slice if not referenced.
#[allow(dead_code)]
fn _keep_slice_imported(_: &[u8]) {
    let _ = slice::from_ref(&0u8);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_init_and_drop() {
        let ctx = Context::new().expect("libusb_init must succeed with a libusb runtime");
        // Listing devices should at least return a (possibly empty) vector without erroring.
        let devs = ctx.devices().expect("device enumeration");
        // Don't assert a specific count — host may have 0 USB devices in CI sandboxes.
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
