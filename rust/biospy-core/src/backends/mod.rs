// Backend trait — every programmer (mock, ch341a, ch347) implements it.
// Keep surface minimal: anything specific to one programmer (e.g. CH341A SPI mode)
// stays in that backend's module.

pub mod mock;

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
    Usb(#[from] biospy_usb::UsbError),
    #[error("chip not detected")]
    ChipNotDetected,
    #[error("write protected")]
    WriteProtected,
    #[error("backend: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, BackendError>;

pub trait Backend: Send {
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
    fn connection_test(&mut self) -> Result<ConnectionTestResult>;
    fn reset_chip(&mut self) -> Result<()>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct WriteOpts {
    pub skip_backup: bool,
    pub skip_verify: bool,
}
