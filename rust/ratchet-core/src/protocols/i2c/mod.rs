// I2C protocol: active master (drives bus) + passive sniffer (decodes traces).

pub mod master;
pub mod sniff;

pub use master::{Ch341aI2c, Ch347I2c, I2cBusSpeed, I2cMaster};
pub use sniff::{decode_trace, I2cDecoder, I2cEvent, LineSample};
