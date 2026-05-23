// STM32 UART bootloader programmer (AN3155).
//
// All STM32 parts ship with a factory ROM bootloader accessible via
// USART1 (or other peripherals) when the BOOT0 pin is strapped high at
// reset. Default config 8E1 (with parity) for backward compatibility;
// some newer parts support 8N1 — we configure 8E1 to match AN3155.
//
// Each command is framed as `[cmd, ~cmd]` (1's complement check), waits
// for ACK=0x79 / NACK=0x1F. Address writes are 4 big-endian bytes + XOR
// checksum byte. Data writes use length-prefixed + XOR-checksum framing.

use crate::backends::{BackendError, Result};

pub const ACK: u8 = 0x79;
pub const NACK: u8 = 0x1F;
pub const INIT_BYTE: u8 = 0x7F;

pub const CMD_GET: u8 = 0x00;
pub const CMD_GET_VERSION: u8 = 0x01;
pub const CMD_GET_ID: u8 = 0x02;
pub const CMD_READ_MEM: u8 = 0x11;
pub const CMD_GO: u8 = 0x21;
pub const CMD_WRITE_MEM: u8 = 0x31;
pub const CMD_ERASE: u8 = 0x43;
pub const CMD_EXTENDED_ERASE: u8 = 0x44;
pub const CMD_WRITE_PROTECT: u8 = 0x63;
pub const CMD_WRITE_UNPROTECT: u8 = 0x73;
pub const CMD_READOUT_PROTECT: u8 = 0x82;
pub const CMD_READOUT_UNPROTECT: u8 = 0x92;

pub trait Stm32UartTransport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read(&mut self, len: usize) -> Result<Vec<u8>>;
}

pub struct Stm32Uart<'t, T: Stm32UartTransport> {
    t: &'t mut T,
}

impl<'t, T: Stm32UartTransport> Stm32Uart<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    fn expect_ack(&mut self) -> Result<()> {
        let r = self.t.read(1)?;
        match r.first().copied() {
            Some(ACK) => Ok(()),
            Some(NACK) => Err(BackendError::Other("STM32 NACK".into())),
            other => Err(BackendError::Other(format!(
                "STM32: unexpected response {other:?}"
            ))),
        }
    }

    /// Auto-baud init — sends 0x7F, expects ACK.
    pub fn init(&mut self) -> Result<()> {
        self.t.write(&[INIT_BYTE])?;
        self.expect_ack()
    }

    fn cmd(&mut self, cmd: u8) -> Result<()> {
        self.t.write(&[cmd, !cmd])?;
        self.expect_ack()
    }

    /// Get product ID (2-byte BCD).
    pub fn get_id(&mut self) -> Result<u16> {
        self.cmd(CMD_GET_ID)?;
        let header = self.t.read(1)?;
        let n = header[0] as usize + 1;
        let id_bytes = self.t.read(n)?;
        self.expect_ack()?;
        if id_bytes.len() < 2 {
            return Err(BackendError::Other("STM32 GetID: short ID payload".into()));
        }
        Ok(((id_bytes[0] as u16) << 8) | id_bytes[1] as u16)
    }

    pub fn get_version(&mut self) -> Result<u8> {
        self.cmd(CMD_GET_VERSION)?;
        let v = self.t.read(3)?; // version + 2 option bytes
        self.expect_ack()?;
        Ok(v[0])
    }

    fn send_address(&mut self, addr: u32) -> Result<()> {
        let b = addr.to_be_bytes();
        let xor = b[0] ^ b[1] ^ b[2] ^ b[3];
        self.t.write(&[b[0], b[1], b[2], b[3], xor])?;
        self.expect_ack()
    }

    /// Read up to 256 bytes from `addr`.
    pub fn read_memory(&mut self, addr: u32, len: u8) -> Result<Vec<u8>> {
        self.cmd(CMD_READ_MEM)?;
        self.send_address(addr)?;
        let count_byte = len.wrapping_sub(1);
        let xor = !count_byte;
        self.t.write(&[count_byte, xor])?;
        self.expect_ack()?;
        self.t.read(len as usize)
    }

    /// Write up to 256 bytes to `addr` (must be 4-byte aligned for flash).
    pub fn write_memory(&mut self, addr: u32, data: &[u8]) -> Result<()> {
        if data.len() > 256 {
            return Err(BackendError::Other(
                "STM32 write_memory: max 256 bytes".into(),
            ));
        }
        self.cmd(CMD_WRITE_MEM)?;
        self.send_address(addr)?;
        let count_byte = (data.len() - 1) as u8;
        let mut frame = Vec::with_capacity(2 + data.len());
        frame.push(count_byte);
        frame.extend_from_slice(data);
        let xor = frame.iter().fold(0u8, |a, b| a ^ b);
        frame.push(xor);
        self.t.write(&frame)?;
        self.expect_ack()
    }

    /// Extended erase: mass erase (special value 0xFFFF) or per-page list.
    pub fn extended_erase_mass(&mut self) -> Result<()> {
        self.cmd(CMD_EXTENDED_ERASE)?;
        // Mass-erase code = 0xFFFF, checksum 0x00.
        self.t.write(&[0xFF, 0xFF, 0x00])?;
        self.expect_ack()
    }

    pub fn extended_erase_pages(&mut self, pages: &[u16]) -> Result<()> {
        self.cmd(CMD_EXTENDED_ERASE)?;
        let n = (pages.len() - 1) as u16;
        let mut frame = Vec::with_capacity(2 + 2 * pages.len() + 1);
        frame.extend_from_slice(&n.to_be_bytes());
        for p in pages {
            frame.extend_from_slice(&p.to_be_bytes());
        }
        let xor = frame.iter().fold(0u8, |a, b| a ^ b);
        frame.push(xor);
        self.t.write(&frame)?;
        self.expect_ack()
    }

    /// Jump to user code at `addr`.
    pub fn go(&mut self, addr: u32) -> Result<()> {
        self.cmd(CMD_GO)?;
        self.send_address(addr)
    }
}

#[cfg(any(test, feature = "mock"))]
pub struct Stm32UartMock {
    pub tx: Vec<u8>,
    rx: std::collections::VecDeque<u8>,
}

#[cfg(any(test, feature = "mock"))]
impl Stm32UartMock {
    pub fn new() -> Self {
        Self {
            tx: Vec::new(),
            rx: std::collections::VecDeque::new(),
        }
    }
    pub fn queue(&mut self, data: &[u8]) {
        self.rx.extend(data.iter().copied());
    }
    pub fn queue_ack(&mut self) {
        self.rx.push_back(ACK);
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for Stm32UartMock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl Stm32UartTransport for Stm32UartMock {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_sends_7f_and_consumes_ack() {
        let mut t = Stm32UartMock::new();
        t.queue_ack();
        let mut s = Stm32Uart::new(&mut t);
        s.init().unwrap();
        assert_eq!(t.tx, vec![INIT_BYTE]);
    }

    #[test]
    fn cmd_framing_uses_complement() {
        let mut t = Stm32UartMock::new();
        t.queue_ack();
        t.queue(&[0x01, 0x10, 0x20]);
        t.queue_ack();
        let mut s = Stm32Uart::new(&mut t);
        let v = s.get_version().unwrap();
        assert_eq!(v, 0x01);
        assert_eq!(&t.tx[..2], &[CMD_GET_VERSION, !CMD_GET_VERSION]);
    }

    #[test]
    fn get_id_decodes_two_bytes() {
        let mut t = Stm32UartMock::new();
        t.queue_ack(); // cmd ACK
        t.queue(&[0x01, 0x04, 0x13]); // N=1, ID bytes
        t.queue_ack();
        let mut s = Stm32Uart::new(&mut t);
        let id = s.get_id().unwrap();
        assert_eq!(id, 0x0413);
    }

    #[test]
    fn nack_errors() {
        let mut t = Stm32UartMock::new();
        t.queue(&[NACK]);
        let mut s = Stm32Uart::new(&mut t);
        assert!(s.init().is_err());
    }

    #[test]
    fn read_memory_request_shape() {
        let mut t = Stm32UartMock::new();
        t.queue_ack(); // cmd
        t.queue_ack(); // addr
        t.queue_ack(); // count
        t.queue(&[0xDE, 0xAD, 0xBE, 0xEF]);
        let mut s = Stm32Uart::new(&mut t);
        let bytes = s.read_memory(0x08000000, 4).unwrap();
        assert_eq!(bytes, vec![0xDE, 0xAD, 0xBE, 0xEF]);
        // First two tx bytes after init = cmd framing.
        assert_eq!(&t.tx[..2], &[CMD_READ_MEM, !CMD_READ_MEM]);
        // Address is BE 4 bytes + XOR.
        assert_eq!(&t.tx[2..7], &[0x08, 0x00, 0x00, 0x00, 0x08]);
    }

    #[test]
    fn write_memory_xor_checksum_correct() {
        let mut t = Stm32UartMock::new();
        t.queue_ack();
        t.queue_ack();
        t.queue_ack();
        let mut s = Stm32Uart::new(&mut t);
        s.write_memory(0x08000000, &[0x11, 0x22, 0x33, 0x44])
            .unwrap();
        // Last byte of frame should be XOR of count + payload.
        let xor = 0x03 ^ 0x11 ^ 0x22 ^ 0x33 ^ 0x44;
        assert_eq!(*t.tx.last().unwrap(), xor);
    }

    #[test]
    fn extended_erase_mass_sends_ffff_pattern() {
        let mut t = Stm32UartMock::new();
        t.queue_ack();
        t.queue_ack();
        let mut s = Stm32Uart::new(&mut t);
        s.extended_erase_mass().unwrap();
        // After cmd framing, 0xFF 0xFF 0x00.
        let end = t.tx.len();
        assert_eq!(&t.tx[end - 3..], &[0xFF, 0xFF, 0x00]);
    }
}
