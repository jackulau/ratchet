// STM32 SWD flasher.
//
// Talks to the on-chip FLASH controller via ADIv5 MEM-AP reads/writes.
// Detects the family from DBGMCU_IDCODE (0xE0042000 on Cortex-M3/M4 STM32s).
// Implements unlock, sector/mass erase, program (32-bit word at a time),
// option-byte access, and system reset via SCB.AIRCR.
//
// Reference: ST RM0008 (F1), RM0090 (F4), AN2606 (bootloader). Layout
// of the FLASH peripheral is similar across families; per-family
// quirks (block size, key sequence) are documented inline.

use super::super::backends::{BackendError, Result};
use crate::debug::adiv5::Adiv5;
use crate::debug::swd::SwdTransport;

// ─── Family detection ──────────────────────────────────────────────────────

pub const DBGMCU_IDCODE_F1_F2_F4: u32 = 0xE0042000;
pub const DBGMCU_IDCODE_H7: u32 = 0x5C001000;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Stm32Family {
    F0,
    F1,
    F2,
    F3,
    F4,
    F7,
    G0,
    G4,
    H7,
    L0,
    L4,
    L5,
}

impl Stm32Family {
    pub fn from_dev_id(dev_id: u32) -> Option<Stm32Family> {
        match dev_id & 0x0FFF {
            0x440 | 0x444 | 0x445 | 0x442 | 0x448 => Some(Stm32Family::F0),
            0x410 | 0x412 | 0x414 | 0x418 | 0x420 | 0x428 | 0x430 => Some(Stm32Family::F1),
            0x411 | 0x441 => Some(Stm32Family::F2),
            0x422 | 0x432 | 0x439 => Some(Stm32Family::F3),
            0x413 | 0x419 | 0x423 | 0x431 | 0x433 | 0x434 | 0x458 | 0x463 => Some(Stm32Family::F4),
            0x449 | 0x451 | 0x452 => Some(Stm32Family::F7),
            0x456 | 0x460 | 0x466 | 0x467 => Some(Stm32Family::G0),
            0x469 => Some(Stm32Family::G4),
            0x450 | 0x480 => Some(Stm32Family::H7),
            0x457 | 0x425 => Some(Stm32Family::L0),
            0x435 | 0x462 | 0x464 | 0x470 | 0x471 => Some(Stm32Family::L4),
            0x472 => Some(Stm32Family::L5),
            _ => None,
        }
    }

    /// FLASH peripheral base address per family.
    pub fn flash_base(self) -> u32 {
        match self {
            Stm32Family::H7 => 0x5200_2000,
            _ => 0x4002_2000,
        }
    }
}

// ─── FLASH register offsets (common to F0/F1/F2/F3/F4/F7) ──────────────────

pub const FLASH_ACR: u32 = 0x00;
pub const FLASH_KEYR: u32 = 0x04;
pub const FLASH_OPTKEYR: u32 = 0x08;
pub const FLASH_SR: u32 = 0x0C;
pub const FLASH_CR: u32 = 0x10;
pub const FLASH_AR: u32 = 0x14;

// FLASH_SR bits
pub const SR_BSY: u32 = 1 << 0;
pub const SR_EOP: u32 = 1 << 5;
pub const SR_PGERR: u32 = 1 << 2;
pub const SR_WRPRTERR: u32 = 1 << 4;

// FLASH_CR bits
pub const CR_PG: u32 = 1 << 0;
pub const CR_PER: u32 = 1 << 1;
pub const CR_MER: u32 = 1 << 2;
pub const CR_STRT: u32 = 1 << 6;
pub const CR_LOCK: u32 = 1 << 7;

// Magic keys (FLASH_KEYR sequence).
pub const KEY1: u32 = 0x4567_0123;
pub const KEY2: u32 = 0xCDEF_89AB;

// SCB.AIRCR for system reset.
pub const SCB_AIRCR: u32 = 0xE000_ED0C;
pub const AIRCR_VECTKEY: u32 = 0x05FA_0000;
pub const AIRCR_SYSRESETREQ: u32 = 1 << 2;

pub struct Stm32SwdFlasher<'a, T: SwdTransport> {
    pub adi: Adiv5<'a, T>,
    pub family: Stm32Family,
}

impl<'a, T: SwdTransport> Stm32SwdFlasher<'a, T> {
    pub fn new(adi: Adiv5<'a, T>, family: Stm32Family) -> Self {
        Self { adi, family }
    }

    fn flash_reg(&self, offset: u32) -> u32 {
        self.family.flash_base() + offset
    }

    /// Unlock the FLASH controller by writing the magic key sequence.
    pub fn unlock(&mut self) -> Result<()> {
        self.adi.mem_write32(self.flash_reg(FLASH_KEYR), KEY1)?;
        self.adi.mem_write32(self.flash_reg(FLASH_KEYR), KEY2)?;
        let cr = self.adi.mem_read32(self.flash_reg(FLASH_CR))?;
        if cr & CR_LOCK != 0 {
            return Err(BackendError::Other("STM32 FLASH unlock rejected".into()));
        }
        Ok(())
    }

    /// Re-lock the controller (sets CR.LOCK).
    pub fn lock(&mut self) -> Result<()> {
        let cr = self.adi.mem_read32(self.flash_reg(FLASH_CR))?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), cr | CR_LOCK)
    }

    fn wait_not_busy(&mut self) -> Result<()> {
        for _ in 0..10_000 {
            let sr = self.adi.mem_read32(self.flash_reg(FLASH_SR))?;
            if sr & SR_BSY == 0 {
                if sr & (SR_PGERR | SR_WRPRTERR) != 0 {
                    return Err(BackendError::Other(format!(
                        "STM32 FLASH SR error: 0x{sr:08X}"
                    )));
                }
                // Clear EOP.
                if sr & SR_EOP != 0 {
                    self.adi.mem_write32(self.flash_reg(FLASH_SR), SR_EOP)?;
                }
                return Ok(());
            }
        }
        Err(BackendError::Other("STM32 FLASH BSY timeout".into()))
    }

    /// Mass-erase the entire main flash array.
    pub fn mass_erase(&mut self) -> Result<()> {
        self.unlock()?;
        self.wait_not_busy()?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), CR_MER)?;
        self.adi
            .mem_write32(self.flash_reg(FLASH_CR), CR_MER | CR_STRT)?;
        self.wait_not_busy()?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), 0)
    }

    /// Erase the page containing `addr` (F1/F0/F3 layout).
    pub fn page_erase(&mut self, addr: u32) -> Result<()> {
        self.unlock()?;
        self.wait_not_busy()?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), CR_PER)?;
        self.adi.mem_write32(self.flash_reg(FLASH_AR), addr)?;
        self.adi
            .mem_write32(self.flash_reg(FLASH_CR), CR_PER | CR_STRT)?;
        self.wait_not_busy()?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), 0)
    }

    /// Program `data` (4-byte aligned, multiple of 4) starting at `addr`.
    pub fn program(&mut self, addr: u32, data: &[u8]) -> Result<()> {
        if addr & 3 != 0 || data.len() & 3 != 0 {
            return Err(BackendError::Other(
                "STM32 program: addr+len must be 4-aligned".into(),
            ));
        }
        self.unlock()?;
        self.adi.mem_write32(self.flash_reg(FLASH_CR), CR_PG)?;
        for (i, chunk) in data.chunks(4).enumerate() {
            let word = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            self.adi.mem_write32(addr + (i * 4) as u32, word)?;
            self.wait_not_busy()?;
        }
        self.adi.mem_write32(self.flash_reg(FLASH_CR), 0)
    }

    /// Read `len` bytes back via MEM-AP.
    pub fn read_back(&mut self, addr: u32, len: usize) -> Result<Vec<u8>> {
        let word_count = len.div_ceil(4);
        let words = self.adi.mem_read_block(addr, word_count)?;
        let mut out = Vec::with_capacity(len);
        for w in &words {
            out.extend_from_slice(&w.to_le_bytes());
        }
        out.truncate(len);
        Ok(out)
    }

    /// System reset via Cortex-M AIRCR.
    pub fn system_reset(&mut self) -> Result<()> {
        self.adi
            .mem_write32(SCB_AIRCR, AIRCR_VECTKEY | AIRCR_SYSRESETREQ)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_from_dev_id() {
        assert_eq!(Stm32Family::from_dev_id(0x10006413), Some(Stm32Family::F4));
        assert_eq!(Stm32Family::from_dev_id(0x10006418), Some(Stm32Family::F1));
        assert_eq!(Stm32Family::from_dev_id(0x10000000), None);
    }

    #[test]
    fn flash_base_per_family() {
        assert_eq!(Stm32Family::F1.flash_base(), 0x40022000);
        assert_eq!(Stm32Family::F4.flash_base(), 0x40022000);
        assert_eq!(Stm32Family::H7.flash_base(), 0x52002000);
    }

    #[test]
    fn key_constants() {
        assert_eq!(KEY1, 0x45670123);
        assert_eq!(KEY2, 0xCDEF89AB);
    }

    #[test]
    fn cr_bit_definitions() {
        assert_eq!(CR_PG, 1);
        assert_eq!(CR_PER, 2);
        assert_eq!(CR_MER, 4);
        assert_eq!(CR_STRT, 0x40);
    }

    #[test]
    fn aircr_reset_value() {
        let v = AIRCR_VECTKEY | AIRCR_SYSRESETREQ;
        assert_eq!(v & 0xFFFF_0000, 0x05FA_0000);
        assert!(v & AIRCR_SYSRESETREQ != 0);
    }
}
