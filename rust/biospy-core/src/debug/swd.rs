// ARM Serial Wire Debug (SWD) bit-bang transport.
//
// 2-wire protocol on SWDIO (bidirectional data) + SWCLK (clock).
//
// Packet request frame (8 bits, LSB-first on the wire):
//   bit 0: start (always 1)
//   bit 1: APnDP (0 = DP, 1 = AP)
//   bit 2: RnW   (0 = write, 1 = read)
//   bits 3-4: A[2:3] (register address bits)
//   bit 5: parity (XOR of bits 1..4)
//   bit 6: stop (always 0)
//   bit 7: park (always 1)
//
// Followed by a 1-cycle turnaround, then:
//   * Read: 3-bit ACK + 32-bit data + 1-bit parity (all LSB first)
//   * Write: 3-bit ACK + 1-bit turnaround + 32-bit data + 1-bit parity
//
// ACK codes (LSB first): OK=0b001, WAIT=0b010, FAULT=0b100, no-reply=0b111.
//
// Reference: ARM IHI 0031 (ADIv5).

use crate::backends::{BackendError, Result};

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum SwdAck {
    Ok,
    Wait,
    Fault,
    NoReply,
}

impl SwdAck {
    pub fn decode(bits: u8) -> SwdAck {
        match bits & 0x07 {
            0b001 => SwdAck::Ok,
            0b010 => SwdAck::Wait,
            0b100 => SwdAck::Fault,
            _ => SwdAck::NoReply,
        }
    }
}

/// Low-level bit-bang transport for SWD. Backends implement these
/// primitives; the protocol layer above sequences them.
pub trait SwdTransport {
    /// Drive `n` clock cycles, sending the low `n` bits of `bits` (LSB first)
    /// on SWDIO with SWDIO configured as host-output. Returns Ok.
    fn write_bits(&mut self, bits: u64, n: u8) -> Result<()>;

    /// Sample `n` clock cycles with SWDIO configured as host-input. Returns
    /// the captured value LSB-aligned.
    fn read_bits(&mut self, n: u8) -> Result<u64>;

    /// Turn around (1 clock cycle, both lines released).
    fn turnaround(&mut self) -> Result<()>;
}

pub struct Swd<'t, T: SwdTransport> {
    t: &'t mut T,
}

impl<'t, T: SwdTransport> Swd<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    /// Drive 50+ clocks with SWDIO high to ensure line reset state.
    pub fn line_reset(&mut self) -> Result<()> {
        for _ in 0..2 {
            self.t.write_bits(u64::MAX, 56)?;
        }
        // 2+ low cycles to leave reset.
        self.t.write_bits(0, 8)
    }

    /// JTAG→SWD switch sequence: 16-bit 0xE79E (LSB first), bracketed by
    /// two line-resets.
    pub fn jtag_to_swd(&mut self) -> Result<()> {
        self.line_reset()?;
        self.t.write_bits(0xE79E, 16)?;
        self.line_reset()
    }

    /// Build the 8-bit packet request byte.
    pub fn build_request(ap_n_dp: bool, read: bool, addr: u8) -> u8 {
        let apndp = ap_n_dp as u8;
        let rnw = read as u8;
        let a = (addr >> 2) & 0x03;
        let parity = (apndp ^ rnw ^ (a & 1) ^ ((a >> 1) & 1)) & 1;
        // bit0: start(1)
        // bit1: APnDP
        // bit2: RnW
        // bit3..4: A[2:3]
        // bit5: parity
        // bit6: stop(0)
        // bit7: park(1)
        1u8 | (apndp << 1) | (rnw << 2) | (a << 3) | (parity << 5) | (1 << 7)
    }

    /// Read a DP/AP register.
    pub fn read_register(&mut self, ap_n_dp: bool, addr: u8) -> Result<u32> {
        let req = Self::build_request(ap_n_dp, true, addr);
        self.t.write_bits(req as u64, 8)?;
        self.t.turnaround()?;
        let ack = SwdAck::decode(self.t.read_bits(3)? as u8);
        match ack {
            SwdAck::Ok => {}
            SwdAck::Wait => return Err(BackendError::Other("SWD WAIT".into())),
            SwdAck::Fault => return Err(BackendError::Other("SWD FAULT".into())),
            SwdAck::NoReply => return Err(BackendError::Other("SWD no reply".into())),
        }
        let data = self.t.read_bits(32)? as u32;
        let parity = (self.t.read_bits(1)? & 1) as u8;
        let calc = (data.count_ones() & 1) as u8;
        if parity != calc {
            return Err(BackendError::Other("SWD read parity mismatch".into()));
        }
        self.t.turnaround()?;
        Ok(data)
    }

    pub fn write_register(&mut self, ap_n_dp: bool, addr: u8, value: u32) -> Result<()> {
        let req = Self::build_request(ap_n_dp, false, addr);
        self.t.write_bits(req as u64, 8)?;
        self.t.turnaround()?;
        let ack = SwdAck::decode(self.t.read_bits(3)? as u8);
        match ack {
            SwdAck::Ok => {}
            SwdAck::Wait => return Err(BackendError::Other("SWD WAIT".into())),
            SwdAck::Fault => return Err(BackendError::Other("SWD FAULT".into())),
            SwdAck::NoReply => return Err(BackendError::Other("SWD no reply".into())),
        }
        self.t.turnaround()?;
        let parity = (value.count_ones() & 1) as u64;
        self.t.write_bits(value as u64, 32)?;
        self.t.write_bits(parity, 1)
    }

    /// Read DPIDR (the only DP register readable before SELECT is set).
    pub fn read_dpidr(&mut self) -> Result<u32> {
        self.read_register(false, 0x00)
    }
}

// ─── Standard DP register addresses ────────────────────────────────────────
pub const DP_DPIDR: u8 = 0x00;
pub const DP_ABORT: u8 = 0x00;
pub const DP_CTRLSTAT: u8 = 0x04;
pub const DP_SELECT: u8 = 0x08;
pub const DP_RDBUFF: u8 = 0x0C;

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct SwdMockTransport {
    pub write_log: Vec<(u64, u8)>,
    pub turnarounds: u32,
    read_queue: std::collections::VecDeque<(u64, u8)>,
}

#[cfg(any(test, feature = "mock"))]
impl SwdMockTransport {
    pub fn new() -> Self {
        Self {
            write_log: Vec::new(),
            turnarounds: 0,
            read_queue: std::collections::VecDeque::new(),
        }
    }

    pub fn queue_read(&mut self, value: u64, n: u8) {
        self.read_queue.push_back((value, n));
    }

    /// Convenience: queue an ACK=OK plus a 32-bit value plus correct parity.
    pub fn queue_ok_read(&mut self, value: u32) {
        self.queue_read(0b001, 3); // OK ACK
        self.queue_read(value as u64, 32);
        self.queue_read((value.count_ones() & 1) as u64, 1);
    }

    pub fn queue_ok_ack(&mut self) {
        self.queue_read(0b001, 3);
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for SwdMockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl SwdTransport for SwdMockTransport {
    fn write_bits(&mut self, bits: u64, n: u8) -> Result<()> {
        self.write_log.push((bits, n));
        Ok(())
    }

    fn read_bits(&mut self, n: u8) -> Result<u64> {
        let (val, expected_n) = self.read_queue.pop_front().unwrap_or((0, n));
        if expected_n != n {
            return Err(BackendError::Other(format!(
                "mock SWD read mismatch: expected {expected_n}, requested {n}"
            )));
        }
        Ok(val)
    }

    fn turnaround(&mut self) -> Result<()> {
        self.turnarounds += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_request_dpidr_read() {
        // APnDP=0, RnW=1, addr=0x00 → A[2:3]=0
        // parity = 0^1^0^0 = 1
        // byte = start(1) | apndp(0)<<1 | rnw(1)<<2 | a(0)<<3 | parity(1)<<5 | park(1)<<7
        //      = 0b10100101 = 0xA5
        let r = Swd::<SwdMockTransport>::build_request(false, true, 0x00);
        assert_eq!(r, 0xA5);
    }

    #[test]
    fn build_request_ap_write() {
        // APnDP=1, RnW=0, addr=0x0C (A[2:3]=0b11)
        let r = Swd::<SwdMockTransport>::build_request(true, false, 0x0C);
        // start | apndp=1<<1 | rnw=0 | a=3<<3 | parity | park=1<<7
        // parity = 1 ^ 0 ^ 1 ^ 1 = 1
        // = 1 | 2 | 0 | 24 | 32 | 128 = 187 = 0xBB
        assert_eq!(r, 0xBB);
    }

    #[test]
    fn ack_decode() {
        assert_eq!(SwdAck::decode(0b001), SwdAck::Ok);
        assert_eq!(SwdAck::decode(0b010), SwdAck::Wait);
        assert_eq!(SwdAck::decode(0b100), SwdAck::Fault);
        assert_eq!(SwdAck::decode(0b111), SwdAck::NoReply);
    }

    #[test]
    fn line_reset_sends_at_least_fifty_clocks() {
        let mut t = SwdMockTransport::new();
        let mut swd = Swd::new(&mut t);
        swd.line_reset().unwrap();
        let total: u32 = t.write_log.iter().map(|(_, n)| *n as u32).sum();
        assert!(total >= 50);
    }

    #[test]
    fn jtag_to_swd_includes_magic() {
        let mut t = SwdMockTransport::new();
        let mut swd = Swd::new(&mut t);
        swd.jtag_to_swd().unwrap();
        // Should contain a write of 0xE79E (16 bits).
        assert!(t.write_log.iter().any(|(v, n)| *n == 16 && *v == 0xE79E));
    }

    #[test]
    fn read_dpidr_round_trip() {
        let mut t = SwdMockTransport::new();
        t.queue_ok_read(0x2BA01477); // Cortex-M3/M4 DPIDR
        let mut swd = Swd::new(&mut t);
        let dpidr = swd.read_dpidr().unwrap();
        assert_eq!(dpidr, 0x2BA01477);
    }

    #[test]
    fn write_register_emits_data_then_parity() {
        let mut t = SwdMockTransport::new();
        t.queue_ok_ack();
        let mut swd = Swd::new(&mut t);
        swd.write_register(false, DP_CTRLSTAT, 0x50000000).unwrap();
        // Last two writes should be value(32) then parity(1).
        let len = t.write_log.len();
        assert_eq!(t.write_log[len - 2], (0x50000000, 32));
        assert_eq!(t.write_log[len - 1].1, 1);
    }

    #[test]
    fn fault_ack_errors() {
        let mut t = SwdMockTransport::new();
        t.queue_read(0b100, 3); // FAULT ACK
        let mut swd = Swd::new(&mut t);
        let r = swd.read_dpidr();
        assert!(r.is_err());
    }
}
