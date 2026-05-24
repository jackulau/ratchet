// Serial debug surface  -  ports src/serial/debug.ts.
// Hardware I/O is hidden behind `SerialPort` trait → unit tests use InMemorySerialPort.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_ENTRIES: usize = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Rx,
    Tx,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SerialMessage {
    pub timestamp: u128,
    pub data: String,
    pub direction: Direction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Parity {
    None,
    Even,
    Odd,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub stop_bits: u8,
    pub parity: Parity,
}

impl SerialConfig {
    pub fn new(port: impl Into<String>, baud: u32) -> Self {
        Self {
            port: port.into(),
            baud_rate: baud,
            data_bits: 8,
            stop_bits: 1,
            parity: Parity::None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortInfo {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manufacturer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial_number: Option<String>,
}

// ─── Trait ───────────────────────────────────────────────────────────────────

/// Abstracts an open serial port. Real impl will plug in POSIX termios / Win32 COM in D18.
pub trait SerialPort {
    fn write(&mut self, data: &[u8]) -> Result<(), String>;
    fn poll(&mut self) -> Result<Vec<u8>, String>;
    fn is_open(&self) -> bool;
    fn close(&mut self);
}

/// In-memory test transport  -  queues bytes for poll() and records writes.
#[derive(Default)]
pub struct InMemorySerialPort {
    pub writes: Vec<Vec<u8>>,
    pub rx_queue: VecDeque<Vec<u8>>,
    pub open: bool,
}

impl InMemorySerialPort {
    pub fn new_open() -> Self {
        Self {
            writes: vec![],
            rx_queue: VecDeque::new(),
            open: true,
        }
    }

    pub fn queue_rx(&mut self, bytes: Vec<u8>) {
        self.rx_queue.push_back(bytes);
    }
}

impl SerialPort for InMemorySerialPort {
    fn write(&mut self, data: &[u8]) -> Result<(), String> {
        if !self.open {
            return Err("port not open".to_string());
        }
        self.writes.push(data.to_vec());
        Ok(())
    }

    fn poll(&mut self) -> Result<Vec<u8>, String> {
        if !self.open {
            return Err("port not open".to_string());
        }
        Ok(self.rx_queue.pop_front().unwrap_or_default())
    }

    fn is_open(&self) -> bool {
        self.open
    }

    fn close(&mut self) {
        self.open = false;
    }
}

// ─── SerialDebug  -  the public driver ─────────────────────────────────────────

pub struct SerialDebug<T: SerialPort> {
    port: Option<T>,
    log: VecDeque<SerialMessage>,
    connected: bool,
}

impl<T: SerialPort> SerialDebug<T> {
    pub fn new() -> Self {
        Self {
            port: None,
            log: VecDeque::new(),
            connected: false,
        }
    }

    /// Connect using a pre-constructed port. (Plumbing convenience for tests.)
    pub fn connect_with(&mut self, port: T) -> Result<(), String> {
        if self.connected {
            return Err("Already connected".to_string());
        }
        if !port.is_open() {
            return Err("Port is not open".to_string());
        }
        self.port = Some(port);
        self.connected = true;
        Ok(())
    }

    pub fn disconnect(&mut self) {
        if let Some(p) = self.port.as_mut() {
            p.close();
        }
        self.port = None;
        self.connected = false;
    }

    pub fn send(&mut self, data: &str) -> Result<(), String> {
        let port = self
            .port
            .as_mut()
            .ok_or_else(|| "Not connected".to_string())?;
        port.write(data.as_bytes())?;
        self.append(SerialMessage {
            timestamp: now_ms(),
            data: data.to_string(),
            direction: Direction::Tx,
        });
        Ok(())
    }

    /// Poll the port for newly-received bytes and append to the log as RX.
    /// Returns the bytes read for the convenience of CLI / monitor loops.
    pub fn poll(&mut self) -> Result<Vec<u8>, String> {
        let port = self
            .port
            .as_mut()
            .ok_or_else(|| "Not connected".to_string())?;
        let bytes = port.poll()?;
        if !bytes.is_empty() {
            let text = String::from_utf8_lossy(&bytes).into_owned();
            self.append(SerialMessage {
                timestamp: now_ms(),
                data: text,
                direction: Direction::Rx,
            });
        }
        Ok(bytes)
    }

    fn append(&mut self, m: SerialMessage) {
        self.log.push_back(m);
        while self.log.len() > MAX_LOG_ENTRIES {
            self.log.pop_front();
        }
    }

    pub fn log(&self) -> Vec<SerialMessage> {
        self.log.iter().cloned().collect()
    }

    pub fn log_since(&self, since_ms: u128) -> Vec<SerialMessage> {
        self.log
            .iter()
            .filter(|m| m.timestamp >= since_ms)
            .cloned()
            .collect()
    }

    pub fn clear_log(&mut self) {
        self.log.clear();
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }
}

impl<T: SerialPort> Default for SerialDebug<T> {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Filter a list of `(path, manufacturer, vendorId)` candidates down to CH34x-style ports.
/// Caller is responsible for enumerating the platform  -  this is pure logic.
pub fn looks_like_ch34x(path: &str, manufacturer: Option<&str>, vendor_id: Option<&str>) -> bool {
    let m = manufacturer.unwrap_or("");
    let v = vendor_id.unwrap_or("").to_ascii_lowercase();
    let path_lower = path.to_ascii_lowercase();

    m.contains("WCH")
        || m.contains("1a86")
        || v == "1a86"
        || path_lower.contains("wch")
        || path_lower.contains("ch34")
        || path_lower.contains("usbserial")
        || path_lower.contains("ttyusb")
        || path_lower.contains("ttyacm")
        || path.to_ascii_uppercase().as_bytes().starts_with(b"COM")
            && path[3..].chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults_8n1() {
        let c = SerialConfig::new("/dev/ttyUSB0", 115200);
        assert_eq!(c.data_bits, 8);
        assert_eq!(c.stop_bits, 1);
        assert_eq!(c.parity, Parity::None);
    }

    #[test]
    fn connect_requires_open_port() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        let mut p = InMemorySerialPort::new_open();
        p.close();
        let err = d.connect_with(p).unwrap_err();
        assert!(err.contains("not open"));
    }

    #[test]
    fn double_connect_rejected() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        let err = d.connect_with(InMemorySerialPort::new_open()).unwrap_err();
        assert!(err.contains("Already connected"));
    }

    #[test]
    fn send_records_tx_in_log() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        d.send("AT\r\n").unwrap();
        let log = d.log();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].direction, Direction::Tx);
        assert_eq!(log[0].data, "AT\r\n");
    }

    #[test]
    fn poll_records_rx_in_log() {
        let mut port = InMemorySerialPort::new_open();
        port.queue_rx(b"OK\r\n".to_vec());
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(port).unwrap();
        let bytes = d.poll().unwrap();
        assert_eq!(bytes, b"OK\r\n");
        let log = d.log();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].direction, Direction::Rx);
        assert_eq!(log[0].data, "OK\r\n");
    }

    #[test]
    fn send_when_not_connected_errors() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        let err = d.send("test").unwrap_err();
        assert!(err.contains("Not connected"));
    }

    #[test]
    fn log_capped_at_max_entries() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        for i in 0..MAX_LOG_ENTRIES + 100 {
            d.send(&format!("msg-{i}")).unwrap();
        }
        assert_eq!(d.log().len(), MAX_LOG_ENTRIES);
    }

    #[test]
    fn log_since_filters_old_entries() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        d.send("a").unwrap();
        let cutoff = now_ms() + 10_000_000;
        let after = d.log_since(cutoff);
        assert!(
            after.is_empty(),
            "no entries should be after far-future cutoff"
        );
    }

    #[test]
    fn disconnect_clears_connection_state() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        assert!(d.is_connected());
        d.disconnect();
        assert!(!d.is_connected());
    }

    #[test]
    fn ch34x_detection_matches_common_paths() {
        assert!(looks_like_ch34x("/dev/ttyUSB0", None, None));
        assert!(looks_like_ch34x("/dev/ttyACM0", None, None));
        assert!(looks_like_ch34x("COM3", None, None));
        assert!(looks_like_ch34x("COM12", None, None));
        assert!(looks_like_ch34x("/dev/cu.usbserial-1234", None, None));
        assert!(looks_like_ch34x("/dev/random", Some("WCH.CN"), None));
        assert!(looks_like_ch34x("/dev/random", None, Some("1A86")));
    }

    #[test]
    fn ch34x_detection_rejects_unrelated() {
        assert!(!looks_like_ch34x("/dev/null", None, None));
        assert!(!looks_like_ch34x("/dev/random", Some("Apple"), None));
        assert!(!looks_like_ch34x("LPT1", None, None));
    }

    #[test]
    fn parity_serialization_lowercase() {
        let p = Parity::None;
        let s = serde_json::to_string(&p).unwrap();
        assert_eq!(s, "\"none\"");
    }

    #[test]
    fn clear_log_empties_log() {
        let mut d = SerialDebug::<InMemorySerialPort>::new();
        d.connect_with(InMemorySerialPort::new_open()).unwrap();
        d.send("x").unwrap();
        d.clear_log();
        assert!(d.log().is_empty());
    }
}
