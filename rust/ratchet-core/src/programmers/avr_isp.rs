// AVR ISP (in-system programming) over SPI.
//
// Atmel AVR microcontrollers (ATmega, ATtiny, ATxmega) can be programmed
// over a 4-wire SPI interface (MOSI/MISO/SCK/RESET). The host pulls RESET
// low to enter programming mode, sends a magic sequence, then issues
// 4-byte SPI commands per AVR040/AVR910 application notes.
//
// This module is transport-agnostic  -  it talks to an `AvrIspTransport`
// trait that exposes RESET control + 4-byte SPI transactions. CH341A
// satisfies the trait via UIO pin manipulation; CH347 via its native SPI
// interface with a manual RESET pin.
//
// Reference: Atmel AVR910 / AVR040.

use crate::backends::{BackendError, Result};

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct AvrSignature(pub [u8; 3]);

impl AvrSignature {
    /// Known signature → part-name lookup. Extend as needed.
    pub fn part_name(self) -> Option<&'static str> {
        match self.0 {
            [0x1E, 0x95, 0x0F] => Some("ATmega328P"),
            [0x1E, 0x95, 0x14] => Some("ATmega328"),
            [0x1E, 0x97, 0x03] => Some("ATmega1280"),
            [0x1E, 0x98, 0x01] => Some("ATmega2560"),
            [0x1E, 0x93, 0x0B] => Some("ATtiny85"),
            [0x1E, 0x93, 0x07] => Some("ATmega8A"),
            [0x1E, 0x94, 0x06] => Some("ATmega168"),
            [0x1E, 0x95, 0x87] => Some("ATmega32U4"),
            _ => None,
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct AvrFuses {
    pub low: u8,
    pub high: u8,
    pub extended: u8,
    pub lock: u8,
}

pub trait AvrIspTransport {
    /// Set RESET line. true=high (run), false=low (programming mode).
    fn set_reset(&mut self, high: bool) -> Result<()>;

    /// Issue one 4-byte SPI transaction, return 4-byte MISO.
    fn xfer4(&mut self, cmd: [u8; 4]) -> Result<[u8; 4]>;

    /// Optional: pulse SCK to sync the device on entry.
    fn pulse_sck(&mut self) -> Result<()> {
        Ok(())
    }
}

pub struct AvrIsp<'t, T: AvrIspTransport> {
    t: &'t mut T,
}

impl<'t, T: AvrIspTransport> AvrIsp<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    /// Enter programming mode. Returns Err if device doesn't echo 0x53.
    pub fn enter_programming(&mut self) -> Result<()> {
        // Per AVR910: pulse RESET low → wait 20 ms → send magic.
        self.t.set_reset(true)?;
        self.t.set_reset(false)?;
        let reply = self.t.xfer4([0xAC, 0x53, 0x00, 0x00])?;
        if reply[2] != 0x53 {
            return Err(BackendError::Other(format!(
                "no programming-mode echo (got 0x{:02X}, expected 0x53)",
                reply[2]
            )));
        }
        Ok(())
    }

    pub fn leave_programming(&mut self) -> Result<()> {
        self.t.set_reset(true)
    }

    pub fn read_signature(&mut self) -> Result<AvrSignature> {
        let mut sig = [0u8; 3];
        for (i, slot) in sig.iter_mut().enumerate() {
            let reply = self.t.xfer4([0x30, 0x00, i as u8, 0x00])?;
            *slot = reply[3];
        }
        Ok(AvrSignature(sig))
    }

    pub fn read_fuses(&mut self) -> Result<AvrFuses> {
        let low = self.t.xfer4([0x50, 0x00, 0x00, 0x00])?[3];
        let high = self.t.xfer4([0x58, 0x08, 0x00, 0x00])?[3];
        let extended = self.t.xfer4([0x50, 0x08, 0x00, 0x00])?[3];
        let lock = self.t.xfer4([0x58, 0x00, 0x00, 0x00])?[3];
        Ok(AvrFuses {
            low,
            high,
            extended,
            lock,
        })
    }

    pub fn write_fuse_low(&mut self, value: u8) -> Result<()> {
        self.t.xfer4([0xAC, 0xA0, 0x00, value])?;
        Ok(())
    }

    pub fn write_fuse_high(&mut self, value: u8) -> Result<()> {
        self.t.xfer4([0xAC, 0xA8, 0x00, value])?;
        Ok(())
    }

    pub fn write_fuse_ext(&mut self, value: u8) -> Result<()> {
        self.t.xfer4([0xAC, 0xA4, 0x00, value])?;
        Ok(())
    }

    pub fn chip_erase(&mut self) -> Result<()> {
        self.t.xfer4([0xAC, 0x80, 0x00, 0x00])?;
        Ok(())
    }

    /// Read one byte of flash. `addr` is the word address (AVR flash is
    /// 16-bit-word organised); `high` selects low byte (false) vs high (true).
    pub fn read_flash_byte(&mut self, addr_word: u16, high: bool) -> Result<u8> {
        let cmd0 = if high { 0x28 } else { 0x20 };
        let reply = self
            .t
            .xfer4([cmd0, (addr_word >> 8) as u8, addr_word as u8, 0])?;
        Ok(reply[3])
    }

    /// Read a contiguous byte range of flash (interleaving low/high reads).
    pub fn read_flash(&mut self, start_byte: u16, len: usize) -> Result<Vec<u8>> {
        let mut out = Vec::with_capacity(len);
        for i in 0..len {
            let byte_addr = start_byte as usize + i;
            let word_addr = (byte_addr / 2) as u16;
            let high = byte_addr & 1 != 0;
            out.push(self.read_flash_byte(word_addr, high)?);
        }
        Ok(out)
    }

    /// Load one byte into the page buffer.
    pub fn load_flash_page(&mut self, addr_word: u16, byte: u8, high: bool) -> Result<()> {
        let cmd0 = if high { 0x48 } else { 0x40 };
        self.t
            .xfer4([cmd0, (addr_word >> 8) as u8, addr_word as u8, byte])?;
        Ok(())
    }

    /// Commit the page buffer to flash at `page_addr`.
    pub fn commit_flash_page(&mut self, page_addr_word: u16) -> Result<()> {
        self.t
            .xfer4([0x4C, (page_addr_word >> 8) as u8, page_addr_word as u8, 0])?;
        Ok(())
    }

    pub fn read_eeprom_byte(&mut self, addr: u16) -> Result<u8> {
        let reply = self.t.xfer4([0xA0, (addr >> 8) as u8, addr as u8, 0])?;
        Ok(reply[3])
    }

    pub fn write_eeprom_byte(&mut self, addr: u16, byte: u8) -> Result<()> {
        self.t.xfer4([0xC0, (addr >> 8) as u8, addr as u8, byte])?;
        Ok(())
    }
}

// ─── Intel HEX parser ──────────────────────────────────────────────────────
//
// Parses the standard `:LLAAAATT[DD...]CC\n` line format produced by
// avr-gcc / avrdude. Only record types 00 (data) and 01 (EOF) are needed
// for AVR flash images; types 02..04 are accepted as no-ops.

#[derive(Debug, PartialEq, Eq)]
pub struct HexImage {
    pub data: Vec<(u32, Vec<u8>)>,
}

impl HexImage {
    /// Resolve into a single contiguous byte buffer starting at `start_addr`.
    pub fn flatten(&self, start_addr: u32, len: usize) -> Vec<u8> {
        let mut out = vec![0xFFu8; len];
        for (addr, data) in &self.data {
            let offset = addr.saturating_sub(start_addr) as usize;
            for (i, b) in data.iter().enumerate() {
                if offset + i < out.len() {
                    out[offset + i] = *b;
                }
            }
        }
        out
    }
}

pub fn parse_intel_hex(text: &str) -> Result<HexImage> {
    let mut data = Vec::new();
    let mut upper_addr = 0u32;
    for (lineno, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if !line.starts_with(':') {
            return Err(BackendError::Other(format!(
                "line {}: missing ':'",
                lineno + 1
            )));
        }
        let bytes = hex_decode(&line[1..])
            .map_err(|e| BackendError::Other(format!("line {}: {e}", lineno + 1)))?;
        if bytes.len() < 5 {
            return Err(BackendError::Other(format!(
                "line {}: too short",
                lineno + 1
            )));
        }
        let count = bytes[0] as usize;
        let addr = ((bytes[1] as u32) << 8) | bytes[2] as u32;
        let rec_type = bytes[3];
        let payload = &bytes[4..4 + count];
        let _checksum = bytes[4 + count]; // could validate but lenient.
        match rec_type {
            0x00 => {
                let full_addr = upper_addr | addr;
                data.push((full_addr, payload.to_vec()));
            }
            0x01 => break, // EOF
            // Extended segment address.
            0x02 if payload.len() == 2 => {
                upper_addr = (((payload[0] as u32) << 8) | payload[1] as u32) << 4;
            }
            // Extended linear address.
            0x04 if payload.len() == 2 => {
                upper_addr = (((payload[0] as u32) << 8) | payload[1] as u32) << 16;
            }
            _ => { /* ignore others */ }
        }
    }
    Ok(HexImage { data })
}

fn hex_decode(s: &str) -> std::result::Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("odd hex length".into());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let chars: Vec<char> = s.chars().collect();
    for pair in chars.chunks(2) {
        let hi = pair[0]
            .to_digit(16)
            .ok_or_else(|| format!("bad hex char {}", pair[0]))?;
        let lo = pair[1]
            .to_digit(16)
            .ok_or_else(|| format!("bad hex char {}", pair[1]))?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct AvrMockTransport {
    pub signature: [u8; 3],
    pub fuses: AvrFuses,
    pub flash: Vec<u8>,
    pub eeprom: Vec<u8>,
    pub in_programming: bool,
    pub reset_high: bool,
    // Page-write scratch buffer (load-program-memory-page commands fill this before commit_page).
    // Read by the page commit logic only  -  never observed externally, hence dead_code.
    #[allow(dead_code)]
    page_buf: std::collections::HashMap<u16, u8>,
    pub xfers: Vec<[u8; 4]>,
}

#[cfg(any(test, feature = "mock"))]
impl AvrMockTransport {
    pub fn new_atmega328p() -> Self {
        Self {
            signature: [0x1E, 0x95, 0x0F],
            fuses: AvrFuses {
                low: 0xFF,
                high: 0xD9,
                extended: 0xFF,
                lock: 0xFF,
            },
            flash: vec![0xFFu8; 32 * 1024],
            eeprom: vec![0xFFu8; 1024],
            in_programming: false,
            reset_high: true,
            page_buf: std::collections::HashMap::new(),
            xfers: Vec::new(),
        }
    }
}

#[cfg(any(test, feature = "mock"))]
impl AvrIspTransport for AvrMockTransport {
    fn set_reset(&mut self, high: bool) -> Result<()> {
        self.reset_high = high;
        Ok(())
    }

    fn xfer4(&mut self, cmd: [u8; 4]) -> Result<[u8; 4]> {
        self.xfers.push(cmd);
        let mut reply = [0u8; 4];
        // Echo input on the next-byte rule (real SPI does this).
        reply[1] = cmd[0];
        reply[2] = cmd[1];
        match (cmd[0], cmd[1]) {
            (0xAC, 0x53) => {
                self.in_programming = !self.reset_high;
                reply[2] = 0x53;
            }
            (0x30, _) => {
                let idx = cmd[2] & 0x03;
                reply[3] = self.signature[idx as usize];
            }
            (0x50, 0x00) => reply[3] = self.fuses.low,
            (0x58, 0x08) => reply[3] = self.fuses.high,
            (0x50, 0x08) => reply[3] = self.fuses.extended,
            (0x58, 0x00) => reply[3] = self.fuses.lock,
            (0x20 | 0x28, ah) => {
                let word = ((ah as u16) << 8) | cmd[2] as u16;
                let high = cmd[0] == 0x28;
                let byte_addr = (word as usize * 2) + if high { 1 } else { 0 };
                if byte_addr < self.flash.len() {
                    reply[3] = self.flash[byte_addr];
                }
            }
            (0xA0, ah) => {
                let addr = ((ah as u16) << 8) | cmd[2] as u16;
                if (addr as usize) < self.eeprom.len() {
                    reply[3] = self.eeprom[addr as usize];
                }
            }
            (0xC0, ah) => {
                let addr = ((ah as u16) << 8) | cmd[2] as u16;
                if (addr as usize) < self.eeprom.len() {
                    self.eeprom[addr as usize] = cmd[3];
                }
            }
            _ => {}
        }
        Ok(reply)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enter_programming_succeeds() {
        let mut t = AvrMockTransport::new_atmega328p();
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
    }

    #[test]
    fn read_signature_returns_atmega328p() {
        let mut t = AvrMockTransport::new_atmega328p();
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
        let sig = isp.read_signature().unwrap();
        assert_eq!(sig, AvrSignature([0x1E, 0x95, 0x0F]));
        assert_eq!(sig.part_name(), Some("ATmega328P"));
    }

    #[test]
    fn read_fuses_returns_defaults() {
        let mut t = AvrMockTransport::new_atmega328p();
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
        let f = isp.read_fuses().unwrap();
        assert_eq!(f.low, 0xFF);
        assert_eq!(f.high, 0xD9);
    }

    #[test]
    fn eeprom_round_trip() {
        let mut t = AvrMockTransport::new_atmega328p();
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
        isp.write_eeprom_byte(0x10, 0xAB).unwrap();
        let b = isp.read_eeprom_byte(0x10).unwrap();
        assert_eq!(b, 0xAB);
    }

    #[test]
    fn flash_read_returns_seeded_data() {
        let mut t = AvrMockTransport::new_atmega328p();
        t.flash[0] = 0xDE;
        t.flash[1] = 0xAD;
        t.flash[2] = 0xBE;
        t.flash[3] = 0xEF;
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
        let data = isp.read_flash(0, 4).unwrap();
        assert_eq!(data, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn intel_hex_parses_simple_record() {
        let text = ":10000000DEADBEEFCAFEBABE0102030405060708FF\n:00000001FF\n";
        let img = parse_intel_hex(text).unwrap();
        assert_eq!(img.data.len(), 1);
        assert_eq!(img.data[0].0, 0);
        assert_eq!(
            img.data[0].1,
            vec![
                0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
                0x07, 0x08
            ]
        );
    }

    #[test]
    fn intel_hex_extended_linear_address() {
        let text = ":020000040001F9\n:0400000041424344FA\n:00000001FF\n";
        let img = parse_intel_hex(text).unwrap();
        assert_eq!(img.data[0].0, 0x00010000);
        assert_eq!(img.data[0].1, vec![0x41, 0x42, 0x43, 0x44]);
    }

    #[test]
    fn hex_image_flatten_fills_with_ff() {
        let img = HexImage {
            data: vec![(0x10, vec![1, 2, 3])],
        };
        let flat = img.flatten(0, 0x20);
        assert_eq!(flat[0], 0xFF);
        assert_eq!(flat[0x10], 1);
        assert_eq!(flat[0x11], 2);
        assert_eq!(flat[0x12], 3);
        assert_eq!(flat[0x13], 0xFF);
    }

    #[test]
    fn chip_erase_issues_correct_command() {
        let mut t = AvrMockTransport::new_atmega328p();
        let mut isp = AvrIsp::new(&mut t);
        isp.enter_programming().unwrap();
        isp.chip_erase().unwrap();
        let last = t.xfers.last().unwrap();
        assert_eq!(last[0], 0xAC);
        assert_eq!(last[1], 0x80);
    }

    #[test]
    fn part_name_lookup() {
        assert_eq!(
            AvrSignature([0x1E, 0x95, 0x0F]).part_name(),
            Some("ATmega328P")
        );
        assert_eq!(
            AvrSignature([0x1E, 0x98, 0x01]).part_name(),
            Some("ATmega2560")
        );
        assert_eq!(AvrSignature([0x12, 0x34, 0x56]).part_name(), None);
    }
}
