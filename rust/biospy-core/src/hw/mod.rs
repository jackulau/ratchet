// Low-level hardware primitive layer.
//
// Modules here expose raw bit-bang / packet-level control of CH341A and CH347
// programmers, independent of any specific protocol. Higher layers (protocols::*,
// programmers::*, debug::*, instruments::*) build on these primitives to
// implement I2C, UART, JTAG, SWD, etc.

pub mod ch347_raw;
pub mod uio;
