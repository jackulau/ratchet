// Backend trait  -  every programmer (mock, ch341a, ch347) implements it.
// Keep surface minimal: anything specific to one programmer (e.g. CH341A SPI mode)
// stays in that backend's module.

pub mod backup;
pub mod ch341a;
pub mod ch347;
pub mod errors;
pub mod factory;
pub mod libusb_bus;
pub mod mock;
pub mod resume;

pub use factory::{open_default, open_raw_bus, BackendKind, OpenResult, RawBus, RawBusError};

use crate::types::*;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BackendError {
    #[error("backend not connected")]
    NotConnected,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("usb error: {0}")]
    Usb(#[from] ratchet_usb::UsbError),
    #[error("chip not detected")]
    ChipNotDetected,
    #[error("write protected")]
    WriteProtected,
    #[error("backend: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, BackendError>;

/// Progress observer for long hardware operations: called with
/// `(bytes_done, bytes_total)` at chunk granularity. Installed via
/// [`Backend::set_progress_callback`]; consumers (the CLI ticker) throttle
/// their own output.
pub type ProgressFn = Box<dyn FnMut(u64, u64) + Send>;

pub trait Backend: Send {
    /// Install a progress observer for long read/write/erase operations. The
    /// default ignores it, so mocks and adapters are unaffected; the live
    /// backends report per-chunk progress through it.
    fn set_progress_callback(&mut self, _cb: ProgressFn) {}
    /// How long a long read waits for a flickering probe to come back before it
    /// gives up on a chunk. The default ignores it (mocks have no contact to
    /// lose); the live backends honour it. See `ch341a::CHUNK_PATIENCE`.
    fn set_chunk_patience(&mut self, _d: std::time::Duration) {}
    /// Bytes per read transaction. On a marginal probe this is the number that
    /// decides whether a read progresses at all: a chunk only counts if it finishes
    /// inside one unbroken contact window. See `ch341a::READ_CHUNK`.
    fn set_read_chunk(&mut self, _bytes: usize) {}
    fn detect_programmer(&mut self) -> Result<ProgrammerInfo>;
    fn open(&mut self) -> Result<()>;
    fn close(&mut self) -> Result<()>;
    fn read_jedec_id(&mut self) -> Result<JedecId>;
    fn identify_chip(&mut self) -> Result<Option<ChipInfo>>;
    fn read_status_registers(&mut self) -> Result<StatusRegisters>;
    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>>;
    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult>;
    fn write_chip(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult>;
    fn verify_chip(&mut self, file_path: &Path) -> Result<VerifyResult>;
    fn erase_chip(&mut self) -> Result<EraseResult>;
    fn sector_erase(&mut self, address: u64) -> Result<EraseResult>;
    fn block_erase(&mut self, address: u64) -> Result<EraseResult>;
    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult>;
    fn is_write_protected(&mut self) -> Result<bool>;
    fn disable_write_protection(&mut self) -> Result<()>;
    /// Re-apply previously saved SR1 block-protect bits (the counterpart of
    /// `disable_write_protection`, used by full-repair to leave the chip as
    /// protected as it found it). Default refuses rather than fake-succeeding.
    fn restore_write_protection(&mut self, _sr1: u8) -> Result<()> {
        Err(BackendError::Other(
            "write-protection restore not supported by this backend".into(),
        ))
    }
    fn connection_test(&mut self) -> Result<ConnectionTestResult>;
    fn reset_chip(&mut self) -> Result<()>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct WriteOpts {
    pub skip_backup: bool,
    pub skip_verify: bool,
}

/// Reject an image that is entirely 0xFF or 0x00. Flashing one is almost always a mistake —
/// a blank or failed dump — and would wipe a working BIOS. To intentionally blank a chip,
/// use `erase`. Called at the top of every backend's `write_chip`.
pub fn reject_blank_image(firmware: &[u8]) -> Result<()> {
    if firmware.is_empty() {
        return Err(BackendError::Other(
            "refusing to write an empty file".into(),
        ));
    }
    if firmware.iter().all(|&b| b == 0xff) {
        return Err(BackendError::Other(
            "refusing to write an all-0xFF (blank) image — this would erase your BIOS; \
             pass a real image, or use `erase` to intentionally blank the chip"
                .into(),
        ));
    }
    if firmware.iter().all(|&b| b == 0x00) {
        return Err(BackendError::Other(
            "refusing to write an all-0x00 image — almost certainly a failed or empty dump".into(),
        ));
    }
    Ok(())
}

/// Crate-wide lock for tests that mutate process environment variables.
/// The libtest harness runs a crate's tests on parallel threads; two modules
/// each holding their OWN env guard still race each other's set/remove/restore
/// sequences (this bit backup.rs vs factory.rs under concurrent audit load).
/// Every env-mutating test must hold THIS lock.
#[cfg(test)]
pub(crate) mod test_env {
    pub(crate) fn lock() -> std::sync::MutexGuard<'static, ()> {
        static ENV_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());
        ENV_GUARD.lock().unwrap_or_else(|p| p.into_inner())
    }
}
