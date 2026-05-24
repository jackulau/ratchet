// Serial debug surface (CH343 UART streaming). Hardware-side I/O is abstracted
// behind a `SerialPort` trait so tests use an in-memory port. Per goal D15,
// we deliberately do NOT depend on `serialport-rs`  -  the "fully custom from
// FFI up" objective extends to UART as well. A POSIX-termios impl is added by
// the live CLI in D18; this module owns the platform-agnostic Debug surface.

pub mod debug;
