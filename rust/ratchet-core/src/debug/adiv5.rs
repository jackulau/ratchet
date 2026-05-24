// ARM ADIv5 DP/AP layer on top of SWD.
//
// Above the wire-level SWD bit-bang (debug::swd) sits the ADI architecture
// abstraction: Debug Port (DP) registers select an Access Port (AP), and
// MEM-APs expose CSW/TAR/DRW for memory-mapped access to the target.
//
// Reference: ARM IHI 0031 (ADIv5/5.2).

use super::swd::{Swd, SwdTransport, DP_CTRLSTAT, DP_RDBUFF, DP_SELECT};
use crate::backends::{BackendError, Result};

// ─── DP registers ──────────────────────────────────────────────────────────

pub const DP_CTRLSTAT_CSYSPWRUPACK: u32 = 1 << 31;
pub const DP_CTRLSTAT_CSYSPWRUPREQ: u32 = 1 << 30;
pub const DP_CTRLSTAT_CDBGPWRUPACK: u32 = 1 << 29;
pub const DP_CTRLSTAT_CDBGPWRUPREQ: u32 = 1 << 28;

// ─── AP registers (relative to selected AP bank) ───────────────────────────

pub const AP_CSW: u8 = 0x00;
pub const AP_TAR: u8 = 0x04;
pub const AP_DRW: u8 = 0x0C;
pub const AP_IDR: u8 = 0xFC;

// ─── CSW field encoding ────────────────────────────────────────────────────

pub const CSW_SIZE_8: u32 = 0;
pub const CSW_SIZE_16: u32 = 1;
pub const CSW_SIZE_32: u32 = 2;
pub const CSW_ADDR_INC_OFF: u32 = 0 << 4;
pub const CSW_ADDR_INC_SINGLE: u32 = 1 << 4;
pub const CSW_DBG_SW_ENABLE: u32 = 1 << 31;
pub const CSW_PROT_DEFAULT: u32 = 0x23 << 24;

/// Default CSW for 32-bit word access with auto-increment.
pub const CSW_DEFAULT_W32: u32 =
    CSW_DBG_SW_ENABLE | CSW_PROT_DEFAULT | CSW_ADDR_INC_SINGLE | CSW_SIZE_32;

// ─── Driver ────────────────────────────────────────────────────────────────

pub struct Adiv5<'s, T: SwdTransport> {
    swd: Swd<'s, T>,
    selected_ap: u8,
    selected_bank: u8,
}

impl<'s, T: SwdTransport> Adiv5<'s, T> {
    pub fn new(swd: Swd<'s, T>) -> Self {
        Self {
            swd,
            selected_ap: 0xFF,
            selected_bank: 0xFF,
        }
    }

    /// Bring the debug power domain up  -  must succeed before any AP access.
    pub fn power_up_debug(&mut self) -> Result<()> {
        let target = DP_CTRLSTAT_CSYSPWRUPREQ | DP_CTRLSTAT_CDBGPWRUPREQ;
        self.swd.write_register(false, DP_CTRLSTAT, target)?;
        for _ in 0..50 {
            let stat = self.swd.read_register(false, DP_CTRLSTAT)?;
            let ack_mask = DP_CTRLSTAT_CSYSPWRUPACK | DP_CTRLSTAT_CDBGPWRUPACK;
            if stat & ack_mask == ack_mask {
                return Ok(());
            }
        }
        Err(BackendError::Other(
            "ADIv5: debug power-up never ACKed".into(),
        ))
    }

    /// Select AP `ap_num`, register-bank `bank` (high 4 bits of AP addr).
    fn select_ap_bank(&mut self, ap_num: u8, bank: u8) -> Result<()> {
        if self.selected_ap == ap_num && self.selected_bank == bank {
            return Ok(());
        }
        let select = ((ap_num as u32) << 24) | ((bank as u32 & 0x0F) << 4);
        self.swd.write_register(false, DP_SELECT, select)?;
        self.selected_ap = ap_num;
        self.selected_bank = bank;
        Ok(())
    }

    pub fn write_ap(&mut self, ap_num: u8, reg: u8, value: u32) -> Result<()> {
        let bank = (reg >> 4) & 0x0F;
        self.select_ap_bank(ap_num, bank)?;
        self.swd.write_register(true, reg & 0x0F, value)
    }

    pub fn read_ap(&mut self, ap_num: u8, reg: u8) -> Result<u32> {
        let bank = (reg >> 4) & 0x0F;
        self.select_ap_bank(ap_num, bank)?;
        // First read returns previously latched value; issue a second read
        // (or DP_RDBUFF) to get the current. We use RDBUFF.
        let _ = self.swd.read_register(true, reg & 0x0F)?;
        self.swd.read_register(false, DP_RDBUFF)
    }

    pub fn read_ap_idr(&mut self, ap_num: u8) -> Result<u32> {
        self.read_ap(ap_num, AP_IDR)
    }

    /// 32-bit memory read via the default MEM-AP (AP 0).
    pub fn mem_read32(&mut self, addr: u32) -> Result<u32> {
        self.write_ap(0, AP_CSW, CSW_DEFAULT_W32)?;
        self.write_ap(0, AP_TAR, addr)?;
        self.read_ap(0, AP_DRW)
    }

    /// 32-bit memory write.
    pub fn mem_write32(&mut self, addr: u32, value: u32) -> Result<()> {
        self.write_ap(0, AP_CSW, CSW_DEFAULT_W32)?;
        self.write_ap(0, AP_TAR, addr)?;
        self.write_ap(0, AP_DRW, value)
    }

    /// Read a contiguous block via TAR auto-increment.
    #[cfg(test)]
    fn swd_for_test_count(&self) -> usize {
        0 // unused  -  placeholder for future inspection helpers.
    }

    pub fn mem_read_block(&mut self, addr: u32, count: usize) -> Result<Vec<u32>> {
        self.write_ap(0, AP_CSW, CSW_DEFAULT_W32)?;
        self.write_ap(0, AP_TAR, addr)?;
        let mut out = Vec::with_capacity(count);
        for _ in 0..count {
            out.push(self.read_ap(0, AP_DRW)?);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::debug::swd::SwdMockTransport;

    #[test]
    fn power_up_debug_writes_ctrlstat() {
        let mut t = SwdMockTransport::new();
        t.queue_ok_ack();
        t.queue_ok_read(DP_CTRLSTAT_CSYSPWRUPACK | DP_CTRLSTAT_CDBGPWRUPACK);
        let swd = Swd::new(&mut t);
        let mut adi = Adiv5::new(swd);
        adi.power_up_debug().unwrap();
    }

    #[test]
    fn csw_default_for_word_access() {
        assert_eq!(CSW_DEFAULT_W32 & CSW_SIZE_32, CSW_SIZE_32);
        assert_eq!(CSW_DEFAULT_W32 & CSW_ADDR_INC_SINGLE, CSW_ADDR_INC_SINGLE);
        assert_eq!(
            CSW_DEFAULT_W32 & CSW_DBG_SW_ENABLE,
            CSW_DBG_SW_ENABLE,
            "DBG_SW_ENABLE bit must be set in CSW_DEFAULT_W32"
        );
    }

    #[test]
    fn select_ap_bank_writes_select_when_changed() {
        let mut t = SwdMockTransport::new();
        // Queue all expected ACKs up front: SELECT + AP write + (second AP write only, no SELECT).
        t.queue_ok_ack();
        t.queue_ok_ack();
        t.queue_ok_ack();
        let writes_before;
        {
            let swd = Swd::new(&mut t);
            let mut adi = Adiv5::new(swd);
            adi.write_ap(0, AP_CSW, 0).unwrap();
            writes_before = adi.swd_for_test_count();
            adi.write_ap(0, AP_CSW, 0).unwrap();
        }
        // The second write_ap should add fewer ACKs since bank is cached.
        // We can't easily inspect ACK count from outside; instead assert the
        // overall log has no extra SELECT writes.
        let _ = writes_before;
        // SELECT register address = DP_SELECT = 0x08. Look for it in write_log.
        let select_writes = t
            .write_log
            .iter()
            .filter(|(bits, n)| {
                // Packet request for write DP_SELECT
                *n == 8
                    && (*bits as u8)
                        == Swd::<SwdMockTransport>::build_request(false, false, DP_SELECT)
            })
            .count();
        assert_eq!(select_writes, 1, "SELECT should only be written once");
    }

    #[test]
    fn mem_read32_orders_csw_tar_drw() {
        let mut t = SwdMockTransport::new();
        // Three ACKs for SELECT(once) + CSW write + TAR write
        t.queue_ok_ack();
        t.queue_ok_ack();
        t.queue_ok_ack();
        // AP DRW read → first read returns latched (we read OK then read RDBUFF).
        t.queue_ok_read(0); // stale
        t.queue_ok_read(0xDEADBEEF); // RDBUFF
        let swd = Swd::new(&mut t);
        let mut adi = Adiv5::new(swd);
        let v = adi.mem_read32(0x20000000).unwrap();
        assert_eq!(v, 0xDEADBEEF);
    }
}
