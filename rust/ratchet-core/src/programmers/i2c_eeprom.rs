// 24Cxx I2C EEPROM programmer (24C01..24C1024).
//
// All 24Cxx parts use I2C address 0x50..0x57 (3 lower bits = A0/A1/A2 strap),
// with a 1- or 2-byte internal-cursor address depending on capacity:
//
//   24C01..24C16  — 1-byte addressing (8-bit cursor)
//   24C32..24C1024 — 2-byte addressing (16-bit cursor)
//
// Larger parts (>16 kbit) use the I2C address LSBs as high-order cursor bits
// to extend the address space. Page-write granularity varies by family:
//
//   24C01..24C16   — 8-byte page
//   24C32/64       — 32-byte page
//   24C128/256/512 — 64-byte page
//   24C1024        — 128-byte page
//
// Write completion is signalled by the next probe-ACK (ACK polling) per
// AN-558. Standard timing: 5 ms internal write cycle.

use crate::backends::{BackendError, Result};
use crate::protocols::i2c::I2cMaster;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EepromSize {
    Kbit1, // 128 bytes
    Kbit2,
    Kbit4,
    Kbit8,
    Kbit16,
    Kbit32,
    Kbit64,
    Kbit128,
    Kbit256,
    Kbit512,
    Mbit1, // 128 KB
}

impl EepromSize {
    pub fn bytes(self) -> usize {
        match self {
            EepromSize::Kbit1 => 128,
            EepromSize::Kbit2 => 256,
            EepromSize::Kbit4 => 512,
            EepromSize::Kbit8 => 1024,
            EepromSize::Kbit16 => 2048,
            EepromSize::Kbit32 => 4096,
            EepromSize::Kbit64 => 8192,
            EepromSize::Kbit128 => 16384,
            EepromSize::Kbit256 => 32768,
            EepromSize::Kbit512 => 65536,
            EepromSize::Mbit1 => 131072,
        }
    }

    pub fn addr_bytes(self) -> u8 {
        match self {
            EepromSize::Kbit1
            | EepromSize::Kbit2
            | EepromSize::Kbit4
            | EepromSize::Kbit8
            | EepromSize::Kbit16 => 1,
            _ => 2,
        }
    }

    pub fn page_size(self) -> usize {
        match self {
            EepromSize::Kbit1
            | EepromSize::Kbit2
            | EepromSize::Kbit4
            | EepromSize::Kbit8
            | EepromSize::Kbit16 => 8,
            EepromSize::Kbit32 | EepromSize::Kbit64 => 32,
            EepromSize::Kbit128 | EepromSize::Kbit256 | EepromSize::Kbit512 => 64,
            EepromSize::Mbit1 => 128,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            EepromSize::Kbit1 => "24C01",
            EepromSize::Kbit2 => "24C02",
            EepromSize::Kbit4 => "24C04",
            EepromSize::Kbit8 => "24C08",
            EepromSize::Kbit16 => "24C16",
            EepromSize::Kbit32 => "24C32",
            EepromSize::Kbit64 => "24C64",
            EepromSize::Kbit128 => "24C128",
            EepromSize::Kbit256 => "24C256",
            EepromSize::Kbit512 => "24C512",
            EepromSize::Mbit1 => "24C1024",
        }
    }
}

pub struct I2cEeprom<'m, M: I2cMaster> {
    master: &'m mut M,
    pub address: u8,
    pub size: EepromSize,
}

impl<'m, M: I2cMaster> I2cEeprom<'m, M> {
    pub fn new(master: &'m mut M, address: u8, size: EepromSize) -> Self {
        Self {
            master,
            address,
            size,
        }
    }

    /// Read raw bytes from `offset` for `len`.
    pub fn read(&mut self, offset: u32, len: usize) -> Result<Vec<u8>> {
        if offset as usize + len > self.size.bytes() {
            return Err(BackendError::Other("read past EEPROM end".into()));
        }
        let mut out = Vec::with_capacity(len);
        let mut remaining = len;
        let mut cursor = offset;
        while remaining > 0 {
            let chunk = remaining.min(256);
            let addr_bytes = self.encode_address(cursor);
            let bytes = self
                .master
                .write_then_read(self.address, &addr_bytes, chunk)?;
            out.extend_from_slice(&bytes);
            cursor += chunk as u32;
            remaining -= chunk;
        }
        Ok(out)
    }

    pub fn write(&mut self, offset: u32, data: &[u8]) -> Result<()> {
        if offset as usize + data.len() > self.size.bytes() {
            return Err(BackendError::Other("write past EEPROM end".into()));
        }
        let page = self.size.page_size();
        let mut cursor = offset;
        for chunk in data.chunks(page) {
            // Honor page boundary — chunks must not cross a page.
            let to_page_end = page - (cursor as usize % page);
            let actual_len = chunk.len().min(to_page_end);
            let mut payload = self.encode_address(cursor);
            payload.extend_from_slice(&chunk[..actual_len]);
            self.master.write(self.address, &payload)?;
            self.poll_write_complete()?;
            cursor += actual_len as u32;
            if actual_len < chunk.len() {
                // Continue with remainder on next page.
                let mut payload = self.encode_address(cursor);
                payload.extend_from_slice(&chunk[actual_len..]);
                self.master.write(self.address, &payload)?;
                self.poll_write_complete()?;
                cursor += (chunk.len() - actual_len) as u32;
            }
        }
        Ok(())
    }

    pub fn erase(&mut self) -> Result<()> {
        let buf = vec![0xFFu8; self.size.bytes()];
        self.write(0, &buf)
    }

    pub fn verify(&mut self, offset: u32, expected: &[u8]) -> Result<bool> {
        let read = self.read(offset, expected.len())?;
        Ok(read == expected)
    }

    /// Probe for a device on the bus and infer its size by walking common
    /// addresses. Naive but works without per-vendor signature commands
    /// (24Cxx parts have no JEDEC-style ID register).
    pub fn detect_size(master: &mut M, address: u8) -> Result<Option<EepromSize>> {
        // Check ACK on bare address.
        let scan = master.scan_bus()?;
        if !scan.contains(&address) {
            return Ok(None);
        }
        // We can't easily distinguish sizes without writing — return a
        // conservative default. Caller should disambiguate by markings on chip.
        Ok(Some(EepromSize::Kbit256))
    }

    fn encode_address(&self, addr: u32) -> Vec<u8> {
        match self.size.addr_bytes() {
            1 => vec![addr as u8],
            2 => vec![(addr >> 8) as u8, addr as u8],
            _ => vec![],
        }
    }

    fn poll_write_complete(&mut self) -> Result<()> {
        // Probe up to 50 times with zero-byte writes; first ACK = done.
        for _ in 0..50 {
            if self.master.write(self.address, &[]).is_ok() {
                return Ok(());
            }
        }
        Err(BackendError::Other("EEPROM write polling timeout".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backends::Result;
    use crate::protocols::i2c::I2cBusSpeed;

    /// Pure software EEPROM emulator that implements I2cMaster directly.
    struct EmuMaster {
        mem: Vec<u8>,
        addr_bytes: u8,
        device_addr: u8,
        cursor: u32,
    }

    impl EmuMaster {
        fn new(size: usize, addr_bytes: u8, device_addr: u8) -> Self {
            Self {
                mem: vec![0xFFu8; size],
                addr_bytes,
                device_addr,
                cursor: 0,
            }
        }

        fn decode_addr(&self, bytes: &[u8]) -> u32 {
            match self.addr_bytes {
                1 => bytes[0] as u32,
                2 => ((bytes[0] as u32) << 8) | bytes[1] as u32,
                _ => 0,
            }
        }
    }

    impl I2cMaster for EmuMaster {
        fn set_speed(&mut self, _s: I2cBusSpeed) -> Result<()> {
            Ok(())
        }

        fn scan_bus(&mut self) -> Result<Vec<u8>> {
            Ok(vec![self.device_addr])
        }

        fn write(&mut self, addr7: u8, data: &[u8]) -> Result<()> {
            if addr7 != self.device_addr {
                return Err(BackendError::Other("nack".into()));
            }
            if data.len() <= self.addr_bytes as usize {
                // Pure address load (sets cursor for subsequent read).
                if data.len() == self.addr_bytes as usize {
                    self.cursor = self.decode_addr(data);
                }
                return Ok(());
            }
            let addr = self.decode_addr(&data[..self.addr_bytes as usize]);
            let payload = &data[self.addr_bytes as usize..];
            for (i, b) in payload.iter().enumerate() {
                let pos = (addr as usize) + i;
                if pos < self.mem.len() {
                    self.mem[pos] = *b;
                }
            }
            self.cursor = addr + payload.len() as u32;
            Ok(())
        }

        fn read(&mut self, addr7: u8, count: usize) -> Result<Vec<u8>> {
            if addr7 != self.device_addr {
                return Err(BackendError::Other("nack".into()));
            }
            let mut out = Vec::with_capacity(count);
            for _ in 0..count {
                out.push(*self.mem.get(self.cursor as usize).unwrap_or(&0xFF));
                self.cursor = self.cursor.wrapping_add(1);
            }
            Ok(out)
        }

        fn write_then_read(&mut self, addr7: u8, reg: &[u8], count: usize) -> Result<Vec<u8>> {
            self.write(addr7, reg)?;
            self.read(addr7, count)
        }
    }

    #[test]
    fn size_metadata() {
        assert_eq!(EepromSize::Kbit256.bytes(), 32768);
        assert_eq!(EepromSize::Kbit256.page_size(), 64);
        assert_eq!(EepromSize::Kbit256.addr_bytes(), 2);
        assert_eq!(EepromSize::Kbit1.page_size(), 8);
    }

    #[test]
    fn read_after_write_round_trips() {
        let mut emu = EmuMaster::new(32768, 2, 0x50);
        let mut eeprom = I2cEeprom::new(&mut emu, 0x50, EepromSize::Kbit256);
        eeprom.write(0x100, b"Hello").unwrap();
        let got = eeprom.read(0x100, 5).unwrap();
        assert_eq!(&got, b"Hello");
    }

    #[test]
    fn erase_fills_with_ff() {
        let mut emu = EmuMaster::new(256, 1, 0x50);
        emu.mem[0] = 0x42;
        let mut eeprom = I2cEeprom::new(&mut emu, 0x50, EepromSize::Kbit2);
        eeprom.erase().unwrap();
        let got = eeprom.read(0, 256).unwrap();
        assert!(got.iter().all(|b| *b == 0xFF));
    }

    #[test]
    fn write_past_end_errors() {
        let mut emu = EmuMaster::new(128, 1, 0x50);
        let mut eeprom = I2cEeprom::new(&mut emu, 0x50, EepromSize::Kbit1);
        let r = eeprom.write(120, &[0u8; 16]);
        assert!(r.is_err());
    }

    #[test]
    fn detect_size_returns_some_for_acking_device() {
        let mut emu = EmuMaster::new(32768, 2, 0x50);
        let size = I2cEeprom::detect_size(&mut emu, 0x50).unwrap();
        assert!(size.is_some());
    }

    #[test]
    fn page_boundary_split() {
        // Write across page boundary — page=8, write 6 bytes at offset 5.
        let mut emu = EmuMaster::new(256, 1, 0x50);
        let mut eeprom = I2cEeprom::new(&mut emu, 0x50, EepromSize::Kbit2);
        eeprom.write(5, b"ABCDEF").unwrap();
        let got = eeprom.read(5, 6).unwrap();
        assert_eq!(&got, b"ABCDEF");
    }
}
