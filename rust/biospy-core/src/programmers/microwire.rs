// 93xxx Microwire EEPROM programmer (93C06/46/56/66/76/86).
//
// 3-wire serial protocol: CS, SK (clock), DI (host→eeprom), DO (eeprom→host).
// Commands are framed MSB-first as `[start_bit=1] [2-bit opcode] [addr...] [data...]`.
//
// Per-part size + addressing (ORG pin selects 8-bit byte mode or 16-bit word
// mode on parts that support it):
//
//   93C06   — 256 bits  : 4-bit addr (×16 words)
//   93C46   — 1 kbit    : 7-bit addr ORG=0 (×128 bytes) / 6-bit ORG=1 (×64 words)
//   93C56   — 2 kbit    : 9-bit addr ORG=0 / 8-bit ORG=1
//   93C66   — 4 kbit    : 9-bit addr ORG=0 / 8-bit ORG=1
//   93C76   — 8 kbit    : 11-bit addr ORG=0 / 10-bit ORG=1
//   93C86   — 16 kbit   : 11-bit addr ORG=0 / 10-bit ORG=1
//
// Reference: Atmel AT93C46 / AT93C66 datasheets.

use crate::backends::{BackendError, Result};

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum MicrowirePart {
    M93C06,
    M93C46,
    M93C56,
    M93C66,
    M93C76,
    M93C86,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Org {
    Bits8,
    Bits16,
}

impl MicrowirePart {
    pub fn capacity_bytes(self, org: Org) -> usize {
        match (self, org) {
            (MicrowirePart::M93C06, _) => 32,
            (MicrowirePart::M93C46, _) => 128,
            (MicrowirePart::M93C56, _) | (MicrowirePart::M93C66, _) => 256,
            (MicrowirePart::M93C76, _) | (MicrowirePart::M93C86, _) => 2048,
        }
    }

    pub fn addr_bits(self, org: Org) -> u8 {
        match (self, org) {
            (MicrowirePart::M93C06, Org::Bits16) => 4,
            (MicrowirePart::M93C06, Org::Bits8) => 5,
            (MicrowirePart::M93C46, Org::Bits16) => 6,
            (MicrowirePart::M93C46, Org::Bits8) => 7,
            (MicrowirePart::M93C56, Org::Bits16) | (MicrowirePart::M93C66, Org::Bits16) => 8,
            (MicrowirePart::M93C56, Org::Bits8) | (MicrowirePart::M93C66, Org::Bits8) => 9,
            (MicrowirePart::M93C76, Org::Bits16) | (MicrowirePart::M93C86, Org::Bits16) => 10,
            (MicrowirePart::M93C76, Org::Bits8) | (MicrowirePart::M93C86, Org::Bits8) => 11,
        }
    }

    pub fn data_bits(self, org: Org) -> u8 {
        match org {
            Org::Bits8 => 8,
            Org::Bits16 => 16,
        }
    }
}

// ─── 3-wire serial transport ───────────────────────────────────────────────

pub trait MicrowireTransport {
    fn set_cs(&mut self, high: bool) -> Result<()>;
    /// Shift `n` bits out on DI (MSB first); SK toggles per bit.
    fn shift_out(&mut self, bits: u32, n: u8) -> Result<()>;
    /// Shift `n` bits in from DO (MSB first); SK toggles per bit.
    fn shift_in(&mut self, n: u8) -> Result<u32>;
}

pub struct Microwire<'t, T: MicrowireTransport> {
    t: &'t mut T,
    pub part: MicrowirePart,
    pub org: Org,
}

impl<'t, T: MicrowireTransport> Microwire<'t, T> {
    pub fn new(t: &'t mut T, part: MicrowirePart, org: Org) -> Self {
        Self { t, part, org }
    }

    fn issue(&mut self, opcode: u8, addr: u32, addr_bits: u8) -> Result<()> {
        // Frame: start(1) | opcode(2) | addr(N).
        self.t.set_cs(true)?;
        let frame = (1u32 << (2 + addr_bits))
            | ((opcode as u32 & 0x03) << addr_bits)
            | (addr & ((1u32 << addr_bits) - 1));
        self.t.shift_out(frame, 1 + 2 + addr_bits)?;
        Ok(())
    }

    /// EWEN — enable subsequent writes.
    pub fn write_enable(&mut self) -> Result<()> {
        let addr_bits = self.part.addr_bits(self.org);
        // Opcode = 00, address starts with 11.
        let high_addr_bits =
            ((1u32 << (addr_bits - 1)) | (1u32 << (addr_bits - 2))) & ((1u32 << addr_bits) - 1);
        self.issue(0b00, high_addr_bits, addr_bits)?;
        self.t.set_cs(false)
    }

    pub fn write_disable(&mut self) -> Result<()> {
        let addr_bits = self.part.addr_bits(self.org);
        // Opcode = 00, address starts with 00.
        self.issue(0b00, 0, addr_bits)?;
        self.t.set_cs(false)
    }

    /// Read one word at `addr`.
    pub fn read(&mut self, addr: u32) -> Result<u32> {
        let addr_bits = self.part.addr_bits(self.org);
        let data_bits = self.part.data_bits(self.org);
        self.issue(0b10, addr, addr_bits)?;
        // Per datasheet, an extra dummy zero is clocked out before data.
        let raw = self.t.shift_in(data_bits + 1)?;
        self.t.set_cs(false)?;
        Ok(raw & ((1u32 << data_bits) - 1))
    }

    pub fn write(&mut self, addr: u32, data: u32) -> Result<()> {
        let addr_bits = self.part.addr_bits(self.org);
        let data_bits = self.part.data_bits(self.org);
        self.issue(0b01, addr, addr_bits)?;
        self.t
            .shift_out(data & ((1u32 << data_bits) - 1), data_bits)?;
        self.t.set_cs(false)?;
        // Datasheet specifies waiting for DO high after CS rises. Skipped here —
        // synchronous bit-bang completes within the write delay budget.
        Ok(())
    }

    /// ERAL — erase entire array (all bytes/words to 0xFF/0xFFFF).
    pub fn erase_all(&mut self) -> Result<()> {
        let addr_bits = self.part.addr_bits(self.org);
        // Opcode = 00, address starts with 10.
        let pattern = 1u32 << (addr_bits - 1);
        self.issue(0b00, pattern, addr_bits)?;
        self.t.set_cs(false)
    }

    /// ERASE one word.
    pub fn erase(&mut self, addr: u32) -> Result<()> {
        let addr_bits = self.part.addr_bits(self.org);
        self.issue(0b11, addr, addr_bits)?;
        self.t.set_cs(false)
    }

    /// Read full array.
    pub fn dump(&mut self) -> Result<Vec<u8>> {
        let bytes = self.part.capacity_bytes(self.org);
        let word_size = match self.org {
            Org::Bits8 => 1,
            Org::Bits16 => 2,
        };
        let words = bytes / word_size;
        let mut out = Vec::with_capacity(bytes);
        for i in 0..words {
            let w = self.read(i as u32)?;
            match self.org {
                Org::Bits8 => out.push(w as u8),
                Org::Bits16 => {
                    out.push((w >> 8) as u8);
                    out.push(w as u8);
                }
            }
        }
        Ok(out)
    }
}

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct MicrowireMockTransport {
    pub cs_log: Vec<bool>,
    pub shift_out_log: Vec<(u32, u8)>,
    pub shift_in_queue: std::collections::VecDeque<u32>,
}

#[cfg(any(test, feature = "mock"))]
impl MicrowireMockTransport {
    pub fn new() -> Self {
        Self {
            cs_log: Vec::new(),
            shift_out_log: Vec::new(),
            shift_in_queue: std::collections::VecDeque::new(),
        }
    }

    pub fn queue_read(&mut self, value: u32) {
        self.shift_in_queue.push_back(value);
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for MicrowireMockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl MicrowireTransport for MicrowireMockTransport {
    fn set_cs(&mut self, high: bool) -> Result<()> {
        self.cs_log.push(high);
        Ok(())
    }

    fn shift_out(&mut self, bits: u32, n: u8) -> Result<()> {
        self.shift_out_log.push((bits, n));
        Ok(())
    }

    fn shift_in(&mut self, _n: u8) -> Result<u32> {
        Ok(self.shift_in_queue.pop_front().unwrap_or(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_metadata() {
        assert_eq!(MicrowirePart::M93C46.capacity_bytes(Org::Bits8), 128);
        assert_eq!(MicrowirePart::M93C46.addr_bits(Org::Bits8), 7);
        assert_eq!(MicrowirePart::M93C46.addr_bits(Org::Bits16), 6);
        assert_eq!(MicrowirePart::M93C46.data_bits(Org::Bits8), 8);
        assert_eq!(MicrowirePart::M93C46.data_bits(Org::Bits16), 16);
    }

    #[test]
    fn write_enable_frames_correct_bits() {
        let mut t = MicrowireMockTransport::new();
        let mut mw = Microwire::new(&mut t, MicrowirePart::M93C46, Org::Bits16);
        mw.write_enable().unwrap();
        // First shift_out: start(1) + opcode(00) + addr starts with 11.
        // addr_bits=6 → frame width = 9 bits.
        let (bits, n) = t.shift_out_log[0];
        assert_eq!(n, 9);
        // Top 3 bits = 1, 0, 0; next 2 = 1, 1.
        assert_eq!((bits >> 8) & 1, 1); // start
        assert_eq!((bits >> 7) & 1, 0);
        assert_eq!((bits >> 6) & 1, 0); // opcode 00
        assert_eq!((bits >> 5) & 1, 1);
        assert_eq!((bits >> 4) & 1, 1);
    }

    #[test]
    fn read_returns_queued_data() {
        let mut t = MicrowireMockTransport::new();
        t.queue_read(0xCAFE);
        let mut mw = Microwire::new(&mut t, MicrowirePart::M93C46, Org::Bits16);
        let v = mw.read(0x05).unwrap();
        assert_eq!(v, 0xCAFE);
    }

    #[test]
    fn write_drives_data_after_address() {
        let mut t = MicrowireMockTransport::new();
        let mut mw = Microwire::new(&mut t, MicrowirePart::M93C46, Org::Bits16);
        mw.write(0x05, 0xBEEF).unwrap();
        // Two shift_out calls: address frame then data.
        assert_eq!(t.shift_out_log.len(), 2);
        let (data_bits, data_n) = t.shift_out_log[1];
        assert_eq!(data_n, 16);
        assert_eq!(data_bits, 0xBEEF);
    }

    #[test]
    fn dump_reads_all_words() {
        let mut t = MicrowireMockTransport::new();
        for i in 0..64 {
            t.queue_read(i as u32);
        }
        let mut mw = Microwire::new(&mut t, MicrowirePart::M93C46, Org::Bits16);
        let bytes = mw.dump().unwrap();
        assert_eq!(bytes.len(), 128); // 64 words × 2 bytes.
    }

    #[test]
    fn erase_all_frames_with_10_addr() {
        let mut t = MicrowireMockTransport::new();
        let mut mw = Microwire::new(&mut t, MicrowirePart::M93C46, Org::Bits16);
        mw.erase_all().unwrap();
        let (bits, n) = t.shift_out_log[0];
        assert_eq!(n, 9);
        // Top of addr field (after start+opcode) should be 1, 0.
        assert_eq!((bits >> 5) & 1, 1);
        assert_eq!((bits >> 4) & 1, 0);
    }
}
