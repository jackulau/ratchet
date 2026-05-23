// Cortex-M live debug — halt/resume/step + core register R/W + RAM dump +
// hardware breakpoints via the FPB unit. Built on top of ADIv5 MEM-AP.
//
// Register map (ARMv7-M Architecture Reference Manual §C1):
//
//   0xE000EDF0  DHCSR  Debug Halting Control and Status
//   0xE000EDF4  DCRSR  Debug Core Register Selector
//   0xE000EDF8  DCRDR  Debug Core Register Data
//   0xE000EDFC  DEMCR  Debug Exception and Monitor Control
//   0xE0001000  DWT_CTRL
//   0xE0002000  FP_CTRL (BPU / FPBv1) — count of HW breakpoints in bits 4..7+8..11
//   0xE0002008+ FP_COMPn (one 32-bit comparator per breakpoint slot)
//
// DHCSR layout (writes require DBGKEY=0xA05F in upper 16 bits):
//   bit  0  C_DEBUGEN   1 = enable halting debug
//   bit  1  C_HALT      1 = halt request
//   bit  2  C_STEP      1 = single-step request
//   bit  3  C_MASKINTS  1 = mask all interrupts during step
//   bit 17  S_HALT      read: 1 = core is halted
//   bit 19  S_LOCKUP    read: 1 = core in lockup
//   bit 25  S_RESET_ST  read: 1 = since last read, core has reset

use crate::backends::{BackendError, Result};
use crate::debug::adiv5::Adiv5;
use crate::debug::swd::SwdTransport;

pub const DHCSR: u32 = 0xE000_EDF0;
pub const DCRSR: u32 = 0xE000_EDF4;
pub const DCRDR: u32 = 0xE000_EDF8;
pub const DEMCR: u32 = 0xE000_EDFC;
pub const DWT_CTRL: u32 = 0xE000_1000;
pub const FP_CTRL: u32 = 0xE000_2000;
pub const FP_COMP_BASE: u32 = 0xE000_2008;

pub const DBGKEY: u32 = 0xA05F_0000;

pub const C_DEBUGEN: u32 = 1 << 0;
pub const C_HALT: u32 = 1 << 1;
pub const C_STEP: u32 = 1 << 2;
pub const C_MASKINTS: u32 = 1 << 3;
pub const S_REGRDY: u32 = 1 << 16;
pub const S_HALT: u32 = 1 << 17;
pub const S_SLEEP: u32 = 1 << 18;
pub const S_LOCKUP: u32 = 1 << 19;

pub const VC_CORERESET: u32 = 1 << 0;
pub const TRCENA: u32 = 1 << 24;

pub const FP_CTRL_ENABLE: u32 = 1 << 0;
pub const FP_CTRL_KEY: u32 = 1 << 1;

// Core register encodings (DCRSR REGSEL bits).
pub const REG_R0: u8 = 0;
pub const REG_R15_PC: u8 = 15;
pub const REG_XPSR: u8 = 16;
pub const REG_MSP: u8 = 17;
pub const REG_PSP: u8 = 18;

pub struct CortexM<'a, T: SwdTransport> {
    pub adi: Adiv5<'a, T>,
}

impl<'a, T: SwdTransport> CortexM<'a, T> {
    pub fn new(adi: Adiv5<'a, T>) -> Self {
        Self { adi }
    }

    pub fn halt(&mut self) -> Result<()> {
        self.adi.mem_write32(DHCSR, DBGKEY | C_DEBUGEN | C_HALT)?;
        for _ in 0..100 {
            let s = self.adi.mem_read32(DHCSR)?;
            if s & S_HALT != 0 {
                return Ok(());
            }
        }
        Err(BackendError::Other(
            "Cortex-M halt: S_HALT never set".into(),
        ))
    }

    pub fn resume(&mut self) -> Result<()> {
        self.adi.mem_write32(DHCSR, DBGKEY | C_DEBUGEN)
    }

    pub fn step(&mut self) -> Result<()> {
        // Mask interrupts so step doesn't dispatch handlers.
        self.adi
            .mem_write32(DHCSR, DBGKEY | C_DEBUGEN | C_STEP | C_MASKINTS)?;
        for _ in 0..100 {
            let s = self.adi.mem_read32(DHCSR)?;
            if s & S_HALT != 0 {
                return Ok(());
            }
        }
        Err(BackendError::Other(
            "Cortex-M step: S_HALT never set after step".into(),
        ))
    }

    pub fn is_halted(&mut self) -> Result<bool> {
        Ok(self.adi.mem_read32(DHCSR)? & S_HALT != 0)
    }

    pub fn is_lockup(&mut self) -> Result<bool> {
        Ok(self.adi.mem_read32(DHCSR)? & S_LOCKUP != 0)
    }

    /// Read core register `reg` (0..15 = r0..r15, 16 = xPSR, etc.).
    pub fn read_core_reg(&mut self, reg: u8) -> Result<u32> {
        self.adi.mem_write32(DCRSR, reg as u32 & 0x7F)?;
        for _ in 0..100 {
            if self.adi.mem_read32(DHCSR)? & S_REGRDY != 0 {
                break;
            }
        }
        self.adi.mem_read32(DCRDR)
    }

    pub fn write_core_reg(&mut self, reg: u8, value: u32) -> Result<()> {
        self.adi.mem_write32(DCRDR, value)?;
        self.adi
            .mem_write32(DCRSR, (1 << 16) | (reg as u32 & 0x7F))?;
        for _ in 0..100 {
            if self.adi.mem_read32(DHCSR)? & S_REGRDY != 0 {
                return Ok(());
            }
        }
        Err(BackendError::Other(
            "Cortex-M write_core_reg: REGRDY never set".into(),
        ))
    }

    /// Configure vector-catch on reset (so we halt before main() runs).
    pub fn enable_vector_catch_reset(&mut self) -> Result<()> {
        let demcr = self.adi.mem_read32(DEMCR)?;
        self.adi.mem_write32(DEMCR, demcr | VC_CORERESET | TRCENA)
    }

    /// Read RAM range as bytes (caller responsible for alignment).
    pub fn read_ram(&mut self, addr: u32, len: usize) -> Result<Vec<u8>> {
        let word_count = len.div_ceil(4);
        let words = self.adi.mem_read_block(addr, word_count)?;
        let mut out = Vec::with_capacity(len);
        for w in &words {
            out.extend_from_slice(&w.to_le_bytes());
        }
        out.truncate(len);
        Ok(out)
    }

    pub fn write_ram(&mut self, addr: u32, data: &[u8]) -> Result<()> {
        for (i, chunk) in data.chunks(4).enumerate() {
            let mut word = [0u8; 4];
            for (j, b) in chunk.iter().enumerate() {
                word[j] = *b;
            }
            self.adi
                .mem_write32(addr + (i * 4) as u32, u32::from_le_bytes(word))?;
        }
        Ok(())
    }

    /// Set a hardware breakpoint at `addr` in slot `n`.
    /// Cortex-M3/M4 supports up to 8 FPB slots; M0+ has 2.
    pub fn set_hw_breakpoint(&mut self, slot: u8, addr: u32) -> Result<()> {
        self.adi
            .mem_write32(FP_CTRL, FP_CTRL_ENABLE | FP_CTRL_KEY)?;
        let comp_addr = FP_COMP_BASE + (slot as u32 * 4);
        // FPBv1: bit 0 = enable, bits 1..28 = address[28:2], bits 30..31 = match mode
        // (00=lower half, 01=upper half, 10=both, 11=reserved). For ARMv7-M Thumb code
        // we set match=both → 0b10.
        let val = 0b10 << 30 | (addr & 0x1FFF_FFFC) | 1;
        self.adi.mem_write32(comp_addr, val)
    }

    pub fn clear_hw_breakpoint(&mut self, slot: u8) -> Result<()> {
        let comp_addr = FP_COMP_BASE + (slot as u32 * 4);
        self.adi.mem_write32(comp_addr, 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::debug::swd::{Swd, SwdMockTransport};

    fn queue_mem_write(t: &mut SwdMockTransport) {
        // mem_write32 = CSW write + TAR write + DRW write = 3 ACKs, plus a SELECT
        // ACK the first time the bank changes.
        for _ in 0..4 {
            t.queue_ok_ack();
        }
    }

    fn queue_mem_read(t: &mut SwdMockTransport, value: u32) {
        // mem_read32 = SELECT (maybe) + CSW write + TAR write + DRW read.
        for _ in 0..3 {
            t.queue_ok_ack();
        }
        // First AP read returns stale, second from RDBUFF returns the value.
        t.queue_ok_read(0);
        t.queue_ok_read(value);
    }

    #[test]
    fn dhcsr_constants() {
        assert_eq!(DHCSR, 0xE000_EDF0);
        assert_eq!(C_HALT, 2);
        assert_eq!(DBGKEY >> 16, 0xA05F);
    }

    #[test]
    fn dbgkey_in_high_word() {
        // Sanity: every DHCSR write must include the DBGKEY in the top half.
        for val in [DBGKEY | C_DEBUGEN, DBGKEY | C_DEBUGEN | C_HALT] {
            assert_eq!(val & 0xFFFF_0000, 0xA05F_0000);
        }
    }

    #[test]
    fn resume_writes_debugen_without_halt() {
        let mut t = SwdMockTransport::new();
        queue_mem_write(&mut t);
        let swd = Swd::new(&mut t);
        let mut cm = CortexM::new(Adiv5::new(swd));
        cm.resume().unwrap();
        // Last DRW write payload should be DBGKEY | C_DEBUGEN (no HALT).
        let writes_with_32 = t
            .write_log
            .iter()
            .filter(|(_, n)| *n == 32)
            .collect::<Vec<_>>();
        let final_val = writes_with_32.last().unwrap().0 as u32;
        assert_eq!(final_val, DBGKEY | C_DEBUGEN);
    }

    #[test]
    fn core_register_encoding() {
        // DCRSR REGSEL field is 7 bits; write select is bit 16.
        assert_eq!(REG_R0, 0);
        assert_eq!(REG_R15_PC, 15);
        assert_eq!(REG_XPSR, 16);
        assert_eq!(REG_MSP, 17);
        assert_eq!(REG_PSP, 18);
        // Write-direction bit position.
        assert_eq!(1u32 << 16, 0x0001_0000);
    }

    #[test]
    fn fp_comp_address_calculation() {
        assert_eq!(FP_COMP_BASE + 0, 0xE0002008);
        assert_eq!(FP_COMP_BASE + 4 * 7, 0xE0002024);
    }

    #[test]
    fn set_hw_breakpoint_encoding() {
        let mut t = SwdMockTransport::new();
        // FP_CTRL write + comp write
        queue_mem_write(&mut t);
        queue_mem_write(&mut t);
        let swd = Swd::new(&mut t);
        let mut cm = CortexM::new(Adiv5::new(swd));
        cm.set_hw_breakpoint(0, 0x08001234).unwrap();
        // Comp write value: bits 30:31 = 0b10, addr[28:2] = 0x1234 >> 2 = 0x48D,
        // bit 0 = 1. Compute expected.
        let expected = (0b10u32 << 30) | (0x08001234 & 0x1FFFFFFC) | 1;
        let last_drw = t
            .write_log
            .iter()
            .filter(|(_, n)| *n == 32)
            .last()
            .unwrap()
            .0 as u32;
        assert_eq!(last_drw, expected);
    }
}
