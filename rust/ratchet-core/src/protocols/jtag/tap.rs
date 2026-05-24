// JTAG TAP controller (IEEE 1149.1).
//
// 16-state TAP state machine; transitions selected by TMS on each TCK rising
// edge. Backend-agnostic: drives a `JtagTransport` trait that pumps TMS/TDI
// transitions and returns TDO samples. The CH341A UIO and CH347 backends
// both satisfy the trait  -  CH341A via raw bit-bang packets, CH347 via the
// native JTAG-bit-bang command (0xD1) exposed in `hw::ch347_raw`.

use crate::backends::Result;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum TapState {
    TestLogicReset,
    RunTestIdle,
    SelectDrScan,
    CaptureDr,
    ShiftDr,
    Exit1Dr,
    PauseDr,
    Exit2Dr,
    UpdateDr,
    SelectIrScan,
    CaptureIr,
    ShiftIr,
    Exit1Ir,
    PauseIr,
    Exit2Ir,
    UpdateIr,
}

impl TapState {
    /// Next state given current state and TMS value.
    pub fn next(self, tms: bool) -> TapState {
        use TapState::*;
        match (self, tms) {
            (TestLogicReset, false) => RunTestIdle,
            (TestLogicReset, true) => TestLogicReset,
            (RunTestIdle, false) => RunTestIdle,
            (RunTestIdle, true) => SelectDrScan,
            (SelectDrScan, false) => CaptureDr,
            (SelectDrScan, true) => SelectIrScan,
            (CaptureDr, false) => ShiftDr,
            (CaptureDr, true) => Exit1Dr,
            (ShiftDr, false) => ShiftDr,
            (ShiftDr, true) => Exit1Dr,
            (Exit1Dr, false) => PauseDr,
            (Exit1Dr, true) => UpdateDr,
            (PauseDr, false) => PauseDr,
            (PauseDr, true) => Exit2Dr,
            (Exit2Dr, false) => ShiftDr,
            (Exit2Dr, true) => UpdateDr,
            (UpdateDr, false) => RunTestIdle,
            (UpdateDr, true) => SelectDrScan,
            (SelectIrScan, false) => CaptureIr,
            (SelectIrScan, true) => TestLogicReset,
            (CaptureIr, false) => ShiftIr,
            (CaptureIr, true) => Exit1Ir,
            (ShiftIr, false) => ShiftIr,
            (ShiftIr, true) => Exit1Ir,
            (Exit1Ir, false) => PauseIr,
            (Exit1Ir, true) => UpdateIr,
            (PauseIr, false) => PauseIr,
            (PauseIr, true) => Exit2Ir,
            (Exit2Ir, false) => ShiftIr,
            (Exit2Ir, true) => UpdateIr,
            (UpdateIr, false) => RunTestIdle,
            (UpdateIr, true) => SelectDrScan,
        }
    }
}

/// Shortest TMS sequence to go from `from` to `to` (BFS-derived table).
/// Returned as a vec of TMS values (one per TCK).
pub fn tms_path(from: TapState, to: TapState) -> Vec<bool> {
    use std::collections::{HashMap, VecDeque};
    let mut visited: HashMap<TapState, (TapState, bool)> = HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back(from);
    while let Some(s) = queue.pop_front() {
        if s == to {
            break;
        }
        for tms in [false, true] {
            let n = s.next(tms);
            if !visited.contains_key(&n) && n != from {
                visited.insert(n, (s, tms));
                queue.push_back(n);
            }
        }
    }
    if from == to {
        return Vec::new();
    }
    let mut path = Vec::new();
    let mut cur = to;
    while cur != from {
        let (prev, tms) = visited[&cur];
        path.push(tms);
        cur = prev;
    }
    path.reverse();
    path
}

/// Transport: drives one TCK cycle with given TMS+TDI, returns TDO.
pub trait JtagTransport {
    fn pulse(&mut self, tms: bool, tdi: bool) -> Result<bool>;

    /// Default batch impl in terms of `pulse`  -  backends can override for
    /// efficiency. Returns sampled TDO per cycle.
    fn pulses(&mut self, ops: &[(bool, bool)]) -> Result<Vec<bool>> {
        let mut out = Vec::with_capacity(ops.len());
        for (tms, tdi) in ops {
            out.push(self.pulse(*tms, *tdi)?);
        }
        Ok(out)
    }
}

pub struct JtagTap<'t, T: JtagTransport> {
    transport: &'t mut T,
    state: TapState,
}

impl<'t, T: JtagTransport> JtagTap<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self {
            transport: t,
            state: TapState::TestLogicReset,
        }
    }

    pub fn state(&self) -> TapState {
        self.state
    }

    /// Force TestLogicReset by clocking 5 cycles with TMS=1.
    pub fn reset(&mut self) -> Result<()> {
        for _ in 0..5 {
            self.transport.pulse(true, false)?;
        }
        self.state = TapState::TestLogicReset;
        Ok(())
    }

    pub fn goto(&mut self, target: TapState) -> Result<()> {
        let path = tms_path(self.state, target);
        for tms in path {
            self.transport.pulse(tms, false)?;
            self.state = self.state.next(tms);
        }
        Ok(())
    }

    /// Shift `bits` data through the instruction register.
    /// Returns the captured TDO bits (same length).
    pub fn shift_ir(&mut self, bits: &[bool]) -> Result<Vec<bool>> {
        self.goto(TapState::ShiftIr)?;
        self.shift_bits(bits, TapState::Exit1Ir)
    }

    /// Shift `bits` through the data register.
    pub fn shift_dr(&mut self, bits: &[bool]) -> Result<Vec<bool>> {
        self.goto(TapState::ShiftDr)?;
        self.shift_bits(bits, TapState::Exit1Ir.next(true) /* placeholder */)
    }

    fn shift_bits(&mut self, bits: &[bool], _exit: TapState) -> Result<Vec<bool>> {
        let n = bits.len();
        if n == 0 {
            return Ok(Vec::new());
        }
        let mut tdo = Vec::with_capacity(n);
        for (i, b) in bits.iter().enumerate() {
            let last = i + 1 == n;
            let tms = last; // TMS=1 on last bit transitions Shift → Exit1.
            tdo.push(self.transport.pulse(tms, *b)?);
            self.state = self.state.next(tms);
        }
        Ok(tdo)
    }

    /// Shift `width`-bit value through IR. Convenience.
    pub fn shift_ir_u32(&mut self, value: u32, width: u8) -> Result<u32> {
        let bits: Vec<bool> = (0..width).map(|i| (value >> i) & 1 != 0).collect();
        let tdo = self.shift_ir(&bits)?;
        Ok(bits_to_u32(&tdo))
    }

    pub fn shift_dr_u32(&mut self, value: u32, width: u8) -> Result<u32> {
        let bits: Vec<bool> = (0..width).map(|i| (value >> i) & 1 != 0).collect();
        let tdo = self.shift_dr(&bits)?;
        Ok(bits_to_u32(&tdo))
    }
}

/// Pack bits (LSB first) into u32.
pub fn bits_to_u32(bits: &[bool]) -> u32 {
    let mut v = 0u32;
    for (i, b) in bits.iter().enumerate().take(32) {
        if *b {
            v |= 1u32 << i;
        }
    }
    v
}

// ─── Standard JTAG instructions ─────────────────────────────────────────────

pub const IR_EXTEST: u8 = 0x00;
pub const IR_SAMPLE_PRELOAD: u8 = 0x01;
pub const IR_IDCODE: u8 = 0x0E;
pub const IR_BYPASS: u8 = 0xFF;

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct JtagMockTransport {
    pub pulses: Vec<(bool, bool)>,
    pub tdo_queue: std::collections::VecDeque<bool>,
}

#[cfg(any(test, feature = "mock"))]
impl JtagMockTransport {
    pub fn new() -> Self {
        Self {
            pulses: Vec::new(),
            tdo_queue: std::collections::VecDeque::new(),
        }
    }

    pub fn queue_tdo(&mut self, bits: &[bool]) {
        self.tdo_queue.extend(bits.iter().copied());
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for JtagMockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl JtagTransport for JtagMockTransport {
    fn pulse(&mut self, tms: bool, tdi: bool) -> Result<bool> {
        self.pulses.push((tms, tdi));
        Ok(self.tdo_queue.pop_front().unwrap_or(false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_machine_transitions() {
        use TapState::*;
        assert_eq!(TestLogicReset.next(false), RunTestIdle);
        assert_eq!(RunTestIdle.next(true), SelectDrScan);
        assert_eq!(ShiftDr.next(false), ShiftDr);
        assert_eq!(ShiftDr.next(true), Exit1Dr);
    }

    #[test]
    fn tms_path_to_shift_dr_from_reset() {
        let p = tms_path(TapState::TestLogicReset, TapState::ShiftDr);
        // TestLogicReset → RunTestIdle → SelectDrScan → CaptureDr → ShiftDr
        assert_eq!(p, vec![false, true, false, false]);
    }

    #[test]
    fn reset_drives_five_tms_high() {
        let mut t = JtagMockTransport::new();
        let mut tap = JtagTap::new(&mut t);
        tap.reset().unwrap();
        assert_eq!(t.pulses.len(), 5);
        for (tms, tdi) in &t.pulses {
            assert!(*tms);
            assert!(!*tdi);
        }
    }

    #[test]
    fn shift_ir_clocks_data_then_exits() {
        let mut t = JtagMockTransport::new();
        t.queue_tdo(&[false; 50]);
        let pulses_before;
        let last4: Vec<(bool, bool)>;
        let total_after;
        {
            let mut tap = JtagTap::new(&mut t);
            tap.reset().unwrap();
            pulses_before = tap.transport.pulses.len();
            let bits = vec![true, false, true, true];
            tap.shift_ir(&bits).unwrap();
            total_after = tap.transport.pulses.len();
            last4 = tap.transport.pulses[total_after - 4..].to_vec();
        }
        assert!(last4[0].1);
        assert!(!last4[1].1);
        assert!(last4[2].1);
        assert!(last4[3].1);
        assert!(last4.last().unwrap().0);
        assert!(total_after > pulses_before);
    }

    #[test]
    fn bits_to_u32_packs_lsb_first() {
        let bits = vec![true, false, true, true]; // 1011 LSB first = 0b1101 = 13
        assert_eq!(bits_to_u32(&bits), 0b1101);
    }

    #[test]
    fn idcode_constant() {
        assert_eq!(IR_IDCODE, 0x0E);
        assert_eq!(IR_BYPASS, 0xFF);
    }
}
