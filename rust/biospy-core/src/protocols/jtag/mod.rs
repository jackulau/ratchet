// JTAG: TAP controller + chain scan utilities.

pub mod scan;
pub mod tap;

pub use scan::{IdcodeChain, IdcodeEntry, scan_idcode_chain};
pub use tap::{
    bits_to_u32, tms_path, JtagTap, JtagTransport, TapState, IR_BYPASS, IR_EXTEST, IR_IDCODE,
    IR_SAMPLE_PRELOAD,
};

#[cfg(any(test, feature = "mock"))]
pub use tap::JtagMockTransport;
