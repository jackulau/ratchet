// slcan ASCII CAN adapter (USBtin / CANable / Lawicel CAN232).
//
// The slcan protocol is a simple line-oriented text framing over USB-CDC:
//
//   Sxx\r        — set bit rate (S0..S8 = 10k..1M)
//   O\r          — open channel  (replies '\r' on success, 0x07 on error)
//   C\r          — close channel
//   t<id><dlc><d>\r  — TX standard frame (11-bit id, 3 hex chars)
//   T<id><dlc><d>\r  — TX extended frame (29-bit id, 8 hex chars)
//   r<id><dlc>\r     — TX standard remote-request frame
//   R<id><dlc>\r     — TX extended remote-request frame
//
// Async RX frames arrive in the same form, terminated with '\r'.

use crate::backends::{BackendError, Result};

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum SlcanBitrate {
    K10,
    K20,
    K50,
    K100,
    K125,
    K250,
    K500,
    K800,
    M1,
}

impl SlcanBitrate {
    pub fn code(self) -> char {
        match self {
            SlcanBitrate::K10 => '0',
            SlcanBitrate::K20 => '1',
            SlcanBitrate::K50 => '2',
            SlcanBitrate::K100 => '3',
            SlcanBitrate::K125 => '4',
            SlcanBitrate::K250 => '5',
            SlcanBitrate::K500 => '6',
            SlcanBitrate::K800 => '7',
            SlcanBitrate::M1 => '8',
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CanFrame {
    pub id: u32,
    pub extended: bool,
    pub rtr: bool,
    pub data: Vec<u8>,
}

pub trait SlcanTransport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read_until_cr(&mut self) -> Result<Vec<u8>>;
}

pub struct Slcan<'t, T: SlcanTransport> {
    t: &'t mut T,
}

impl<'t, T: SlcanTransport> Slcan<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    fn cmd(&mut self, s: &[u8]) -> Result<Vec<u8>> {
        self.t.write(s)?;
        let reply = self.t.read_until_cr()?;
        if reply.first().copied() == Some(0x07) {
            return Err(BackendError::Other("slcan: BELL error".into()));
        }
        Ok(reply)
    }

    pub fn set_bitrate(&mut self, rate: SlcanBitrate) -> Result<()> {
        let cmd = [b'S', rate.code() as u8, b'\r'];
        self.cmd(&cmd).map(|_| ())
    }

    pub fn open(&mut self) -> Result<()> {
        self.cmd(b"O\r").map(|_| ())
    }

    pub fn close(&mut self) -> Result<()> {
        self.cmd(b"C\r").map(|_| ())
    }

    pub fn send(&mut self, frame: &CanFrame) -> Result<()> {
        let mut s = String::new();
        let cmd_char = match (frame.extended, frame.rtr) {
            (false, false) => 't',
            (true, false) => 'T',
            (false, true) => 'r',
            (true, true) => 'R',
        };
        s.push(cmd_char);
        if frame.extended {
            s.push_str(&format!("{:08X}", frame.id & 0x1FFF_FFFF));
        } else {
            s.push_str(&format!("{:03X}", frame.id & 0x7FF));
        }
        s.push_str(&format!("{:X}", frame.data.len().min(8)));
        if !frame.rtr {
            for b in &frame.data {
                s.push_str(&format!("{b:02X}"));
            }
        }
        s.push('\r');
        self.cmd(s.as_bytes()).map(|_| ())
    }

    /// Parse one incoming frame line (without the trailing '\r').
    pub fn parse_frame(line: &[u8]) -> Result<CanFrame> {
        if line.is_empty() {
            return Err(BackendError::Other("slcan: empty frame line".into()));
        }
        let (extended, rtr, id_hex_len) = match line[0] as char {
            't' => (false, false, 3),
            'T' => (true, false, 8),
            'r' => (false, true, 3),
            'R' => (true, true, 8),
            other => {
                return Err(BackendError::Other(format!(
                    "slcan: bad frame prefix {other}"
                )))
            }
        };
        if line.len() < 1 + id_hex_len + 1 {
            return Err(BackendError::Other("slcan: frame line truncated".into()));
        }
        let id_str = std::str::from_utf8(&line[1..1 + id_hex_len])
            .map_err(|e| BackendError::Other(format!("slcan: id utf8: {e}")))?;
        let id = u32::from_str_radix(id_str, 16)
            .map_err(|e| BackendError::Other(format!("slcan: id parse: {e}")))?;
        let dlc = (line[1 + id_hex_len] as char)
            .to_digit(16)
            .ok_or_else(|| BackendError::Other("slcan: bad DLC".into()))?
            as usize;
        let mut data = Vec::with_capacity(dlc);
        if !rtr {
            let payload_start = 1 + id_hex_len + 1;
            if line.len() < payload_start + 2 * dlc {
                return Err(BackendError::Other("slcan: frame payload truncated".into()));
            }
            for i in 0..dlc {
                let pair =
                    std::str::from_utf8(&line[payload_start + 2 * i..payload_start + 2 * i + 2])
                        .map_err(|e| BackendError::Other(format!("slcan: data utf8: {e}")))?;
                data.push(
                    u8::from_str_radix(pair, 16)
                        .map_err(|e| BackendError::Other(format!("slcan: data hex: {e}")))?,
                );
            }
        }
        Ok(CanFrame {
            id,
            extended,
            rtr,
            data,
        })
    }

    /// Read the next async frame.
    pub fn read_frame(&mut self) -> Result<CanFrame> {
        let line = self.t.read_until_cr()?;
        Self::parse_frame(&line)
    }
}

#[cfg(any(test, feature = "mock"))]
pub struct SlcanMock {
    pub tx: Vec<u8>,
    rx: std::collections::VecDeque<Vec<u8>>,
}

#[cfg(any(test, feature = "mock"))]
impl SlcanMock {
    pub fn new() -> Self {
        Self {
            tx: Vec::new(),
            rx: std::collections::VecDeque::new(),
        }
    }
    pub fn queue_line(&mut self, line: &[u8]) {
        self.rx.push_back(line.to_vec());
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for SlcanMock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl SlcanTransport for SlcanMock {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.tx.extend_from_slice(data);
        Ok(())
    }
    fn read_until_cr(&mut self) -> Result<Vec<u8>> {
        Ok(self.rx.pop_front().unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bitrate_codes() {
        assert_eq!(SlcanBitrate::K500.code(), '6');
        assert_eq!(SlcanBitrate::M1.code(), '8');
    }

    #[test]
    fn open_and_close_round_trip() {
        let mut t = SlcanMock::new();
        t.queue_line(b"\r");
        t.queue_line(b"\r");
        let mut sl = Slcan::new(&mut t);
        sl.open().unwrap();
        sl.close().unwrap();
        assert!(t.tx.windows(2).any(|w| w == b"O\r"));
        assert!(t.tx.windows(2).any(|w| w == b"C\r"));
    }

    #[test]
    fn send_standard_frame_encodes_correctly() {
        let mut t = SlcanMock::new();
        t.queue_line(b"\r");
        let mut sl = Slcan::new(&mut t);
        sl.send(&CanFrame {
            id: 0x123,
            extended: false,
            rtr: false,
            data: vec![0xAB, 0xCD],
        })
        .unwrap();
        // Expect: t1232ABCD\r
        let s = std::str::from_utf8(&t.tx).unwrap();
        assert!(s.starts_with("t1232ABCD"));
    }

    #[test]
    fn send_extended_frame_uses_8_hex_id() {
        let mut t = SlcanMock::new();
        t.queue_line(b"\r");
        let mut sl = Slcan::new(&mut t);
        sl.send(&CanFrame {
            id: 0x1FFFFFFF,
            extended: true,
            rtr: false,
            data: vec![0x00],
        })
        .unwrap();
        let s = std::str::from_utf8(&t.tx).unwrap();
        assert!(s.starts_with("T1FFFFFFF1"));
    }

    #[test]
    fn parse_standard_frame() {
        let f = Slcan::<SlcanMock>::parse_frame(b"t1232ABCD").unwrap();
        assert_eq!(f.id, 0x123);
        assert!(!f.extended);
        assert!(!f.rtr);
        assert_eq!(f.data, vec![0xAB, 0xCD]);
    }

    #[test]
    fn parse_extended_remote_frame() {
        let f = Slcan::<SlcanMock>::parse_frame(b"R1FFFFFFF0").unwrap();
        assert_eq!(f.id, 0x1FFFFFFF);
        assert!(f.extended);
        assert!(f.rtr);
        assert!(f.data.is_empty());
    }

    #[test]
    fn bell_response_errors() {
        let mut t = SlcanMock::new();
        t.queue_line(&[0x07]);
        let mut sl = Slcan::new(&mut t);
        assert!(sl.open().is_err());
    }
}
