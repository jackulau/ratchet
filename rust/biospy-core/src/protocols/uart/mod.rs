// UART protocol: master driver (drives TX, samples RX) + passive sniffer.

pub mod master;
pub mod sniff;

pub use master::{Ch341aUart, Ch347Uart, UartConfig};
pub use sniff::{decode_channel, UartChannel, UartDecoder, UartEvent};
