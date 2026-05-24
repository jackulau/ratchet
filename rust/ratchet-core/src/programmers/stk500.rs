// STK500 v1 bootloader protocol (Optiboot / Arduino UNO/Nano).
//
// Optiboot speaks a subset of Atmel STK500 v1 over UART (115200 8N1 by
// default). Host issues commands framed as `[cmd, ...args, CRC_EOP=0x20]`,
// device replies `[INSYNC=0x14, payload..., OK=0x10]`. Auto-reset:
// toggling DTR low pulses the AVR's RESET line, jumping into the
// bootloader, which then has a ~1 s window before falling through to
// user code.
//
// Reference: Atmel STK500 spec (doc1925) + optiboot source.

use crate::backends::{BackendError, Result};

pub const STK_OK: u8 = 0x10;
pub const STK_FAILED: u8 = 0x11;
pub const STK_INSYNC: u8 = 0x14;
pub const STK_NOSYNC: u8 = 0x15;
pub const STK_CRC_EOP: u8 = 0x20;

pub const STK_GET_SYNC: u8 = 0x30;
pub const STK_GET_PARAMETER: u8 = 0x41;
pub const STK_SET_DEVICE: u8 = 0x42;
pub const STK_ENTER_PROGMODE: u8 = 0x50;
pub const STK_LEAVE_PROGMODE: u8 = 0x51;
pub const STK_LOAD_ADDRESS: u8 = 0x55;
pub const STK_PROG_PAGE: u8 = 0x64;
pub const STK_READ_PAGE: u8 = 0x74;
pub const STK_READ_SIGN: u8 = 0x75;

pub const PARAM_HW_VER: u8 = 0x80;
pub const PARAM_SW_MAJOR: u8 = 0x81;
pub const PARAM_SW_MINOR: u8 = 0x82;

/// Transport over the AVR's UART. Caller is responsible for opening the
/// serial port (115200 8N1 typical) and managing DTR for auto-reset.
pub trait Stk500Transport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read(&mut self, len: usize) -> Result<Vec<u8>>;
    fn set_dtr(&mut self, high: bool) -> Result<()>;
}

pub struct Stk500<'t, T: Stk500Transport> {
    t: &'t mut T,
}

impl<'t, T: Stk500Transport> Stk500<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    /// Pulse DTR low → high to reset the AVR into its bootloader.
    pub fn auto_reset(&mut self) -> Result<()> {
        self.t.set_dtr(true)?;
        self.t.set_dtr(false)?;
        self.t.set_dtr(true)
    }

    /// Send a framed command and check for INSYNC/OK envelope.
    fn cmd(&mut self, body: &[u8], reply_payload_len: usize) -> Result<Vec<u8>> {
        let mut framed = Vec::with_capacity(body.len() + 1);
        framed.extend_from_slice(body);
        framed.push(STK_CRC_EOP);
        self.t.write(&framed)?;
        let reply = self.t.read(2 + reply_payload_len)?;
        if reply.first().copied() != Some(STK_INSYNC) {
            return Err(BackendError::Other("STK500: no INSYNC".into()));
        }
        if reply.last().copied() != Some(STK_OK) {
            return Err(BackendError::Other("STK500: no OK terminator".into()));
        }
        Ok(reply[1..reply.len() - 1].to_vec())
    }

    /// Achieve sync  -  retry a few times since the bootloader window is short.
    pub fn sync(&mut self) -> Result<()> {
        for _ in 0..5 {
            if self.cmd(&[STK_GET_SYNC], 0).is_ok() {
                return Ok(());
            }
        }
        Err(BackendError::Other("STK500: no sync after retries".into()))
    }

    pub fn get_parameter(&mut self, id: u8) -> Result<u8> {
        let r = self.cmd(&[STK_GET_PARAMETER, id], 1)?;
        Ok(r[0])
    }

    pub fn read_signature(&mut self) -> Result<[u8; 3]> {
        let r = self.cmd(&[STK_READ_SIGN], 3)?;
        let mut sig = [0u8; 3];
        sig.copy_from_slice(&r);
        Ok(sig)
    }

    pub fn enter_progmode(&mut self) -> Result<()> {
        self.cmd(&[STK_ENTER_PROGMODE], 0).map(|_| ())
    }

    pub fn leave_progmode(&mut self) -> Result<()> {
        self.cmd(&[STK_LEAVE_PROGMODE], 0).map(|_| ())
    }

    pub fn load_address(&mut self, word_addr: u16) -> Result<()> {
        self.cmd(
            &[STK_LOAD_ADDRESS, word_addr as u8, (word_addr >> 8) as u8],
            0,
        )
        .map(|_| ())
    }

    /// Program a flash page (typically 128 bytes for ATmega328P).
    pub fn prog_page(&mut self, data: &[u8]) -> Result<()> {
        let len = data.len() as u16;
        let mut body = Vec::with_capacity(4 + data.len());
        body.push(STK_PROG_PAGE);
        body.push((len >> 8) as u8);
        body.push(len as u8);
        body.push(b'F'); // 'F' = flash, 'E' = EEPROM
        body.extend_from_slice(data);
        self.cmd(&body, 0).map(|_| ())
    }

    pub fn read_page(&mut self, len: u16) -> Result<Vec<u8>> {
        self.cmd(
            &[STK_READ_PAGE, (len >> 8) as u8, len as u8, b'F'],
            len as usize,
        )
    }

    /// Convenience: flash an Intel-HEX-derived byte image to the AVR.
    pub fn flash_image(&mut self, image: &[u8], page_size: usize) -> Result<()> {
        self.enter_progmode()?;
        for (chunk_idx, chunk) in image.chunks(page_size).enumerate() {
            let word_addr = (chunk_idx * page_size / 2) as u16;
            self.load_address(word_addr)?;
            self.prog_page(chunk)?;
        }
        self.leave_progmode()
    }
}

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct Stk500MockTransport {
    pub tx: Vec<u8>,
    rx: std::collections::VecDeque<u8>,
    pub dtr_history: Vec<bool>,
}

#[cfg(any(test, feature = "mock"))]
impl Stk500MockTransport {
    pub fn new() -> Self {
        Self {
            tx: Vec::new(),
            rx: std::collections::VecDeque::new(),
            dtr_history: Vec::new(),
        }
    }

    /// Queue a happy-path INSYNC + OK reply (no payload).
    pub fn queue_ok(&mut self) {
        self.rx.push_back(STK_INSYNC);
        self.rx.push_back(STK_OK);
    }

    pub fn queue_ok_with(&mut self, payload: &[u8]) {
        self.rx.push_back(STK_INSYNC);
        self.rx.extend(payload.iter().copied());
        self.rx.push_back(STK_OK);
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for Stk500MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl Stk500Transport for Stk500MockTransport {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.tx.extend_from_slice(data);
        Ok(())
    }

    fn read(&mut self, len: usize) -> Result<Vec<u8>> {
        let mut out = Vec::with_capacity(len);
        for _ in 0..len {
            out.push(self.rx.pop_front().unwrap_or(0));
        }
        Ok(out)
    }

    fn set_dtr(&mut self, high: bool) -> Result<()> {
        self.dtr_history.push(high);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_succeeds_on_insync_ok_reply() {
        let mut t = Stk500MockTransport::new();
        t.queue_ok();
        let mut stk = Stk500::new(&mut t);
        stk.sync().unwrap();
    }

    #[test]
    fn sync_fails_when_no_response() {
        let mut t = Stk500MockTransport::new();
        let mut stk = Stk500::new(&mut t);
        assert!(stk.sync().is_err());
    }

    #[test]
    fn get_parameter_returns_payload() {
        let mut t = Stk500MockTransport::new();
        t.queue_ok_with(&[0x05]);
        let mut stk = Stk500::new(&mut t);
        let v = stk.get_parameter(PARAM_SW_MAJOR).unwrap();
        assert_eq!(v, 0x05);
    }

    #[test]
    fn read_signature_returns_three_bytes() {
        let mut t = Stk500MockTransport::new();
        t.queue_ok_with(&[0x1E, 0x95, 0x0F]);
        let mut stk = Stk500::new(&mut t);
        let sig = stk.read_signature().unwrap();
        assert_eq!(sig, [0x1E, 0x95, 0x0F]);
    }

    #[test]
    fn load_address_sends_lsb_first() {
        let mut t = Stk500MockTransport::new();
        t.queue_ok();
        let mut stk = Stk500::new(&mut t);
        stk.load_address(0x1234).unwrap();
        assert_eq!(&t.tx[..3], &[STK_LOAD_ADDRESS, 0x34, 0x12]);
        assert_eq!(t.tx[3], STK_CRC_EOP);
    }

    #[test]
    fn prog_page_frames_with_length_and_type() {
        let mut t = Stk500MockTransport::new();
        t.queue_ok();
        let mut stk = Stk500::new(&mut t);
        stk.prog_page(&[0xAA; 128]).unwrap();
        assert_eq!(t.tx[0], STK_PROG_PAGE);
        assert_eq!(t.tx[1], 0x00); // length high
        assert_eq!(t.tx[2], 0x80); // length low
        assert_eq!(t.tx[3], b'F');
    }

    #[test]
    fn auto_reset_pulses_dtr() {
        let mut t = Stk500MockTransport::new();
        let mut stk = Stk500::new(&mut t);
        stk.auto_reset().unwrap();
        assert_eq!(t.dtr_history, vec![true, false, true]);
    }

    #[test]
    fn flash_image_chunks_into_pages() {
        let mut t = Stk500MockTransport::new();
        let pages = 4;
        for _ in 0..(1 + pages * 2 + 1) {
            t.queue_ok();
        }
        let mut stk = Stk500::new(&mut t);
        let img = vec![0xAAu8; 4 * 128]; // 0xAA avoids collision with STK_LOAD_ADDRESS (0x55) in payload data.
        stk.flash_image(&img, 128).unwrap();
        let load_count = t.tx.iter().filter(|b| **b == STK_LOAD_ADDRESS).count();
        assert_eq!(load_count, 4);
    }
}
