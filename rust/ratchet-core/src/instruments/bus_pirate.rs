// Bus Pirate (v3 / v4) USB-CDC bridge.
//
// Bus Pirate boots into terminal mode where it accepts ASCII commands.
// Switching to binary scripting mode is a one-byte handshake:
//
//   Send 0x00 up to 20 times → BP echoes "BBIO1" once stable.
//   From BBIO1 the host selects a sub-protocol:
//     0x01 → SPI    ("SPI1")
//     0x02 → I2C    ("I2C1")
//     0x03 → UART   ("ART1")
//     0x04 → 1-Wire ("1W01")
//     0x05 → Raw    ("RAW1")
//   0x0F resets back to terminal mode (BP responds with a banner).
//
// Each sub-protocol has its own binary command opcode set; we model the
// SPI/I2C subsets here since they cover the most useful agent flows.
//
// Reference: dangerousprototypes.com Bus Pirate binary scripting wiki.

use crate::backends::{BackendError, Result};

pub const CMD_RESET_BBIO: u8 = 0x00;
pub const CMD_ENTER_SPI: u8 = 0x01;
pub const CMD_ENTER_I2C: u8 = 0x02;
pub const CMD_ENTER_UART: u8 = 0x03;
pub const CMD_ENTER_1WIRE: u8 = 0x04;
pub const CMD_ENTER_RAW: u8 = 0x05;
pub const CMD_RESET_TERMINAL: u8 = 0x0F;

// SPI sub-mode commands.
pub const SPI_CMD_CS_LOW: u8 = 0x02;
pub const SPI_CMD_CS_HIGH: u8 = 0x03;
pub const SPI_CMD_BULK_TX_BASE: u8 = 0x10; // OR'd with (count-1), count = 1..=16
pub const SPI_CMD_SET_SPEED: u8 = 0x60;
pub const SPI_CMD_CONFIG: u8 = 0x80;

// I2C sub-mode commands.
pub const I2C_CMD_START: u8 = 0x02;
pub const I2C_CMD_STOP: u8 = 0x03;
pub const I2C_CMD_READ_BYTE: u8 = 0x04;
pub const I2C_CMD_ACK: u8 = 0x06;
pub const I2C_CMD_NACK: u8 = 0x07;
pub const I2C_CMD_BULK_TX_BASE: u8 = 0x10;
pub const I2C_CMD_SET_SPEED: u8 = 0x60;

pub trait BusPirateTransport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read(&mut self, len: usize) -> Result<Vec<u8>>;
}

pub struct BusPirate<'t, T: BusPirateTransport> {
    t: &'t mut T,
    pub current_mode: BpMode,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum BpMode {
    Terminal,
    Bbio,
    Spi,
    I2c,
    Uart,
    OneWire,
    Raw,
}

impl<'t, T: BusPirateTransport> BusPirate<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self {
            t,
            current_mode: BpMode::Terminal,
        }
    }

    /// Enter BBIO scripting mode. Send 0x00 up to 20 times; expect "BBIO1".
    pub fn enter_bbio(&mut self) -> Result<()> {
        for _ in 0..20 {
            self.t.write(&[CMD_RESET_BBIO])?;
            let reply = self.t.read(5)?;
            if &reply == b"BBIO1" {
                self.current_mode = BpMode::Bbio;
                return Ok(());
            }
        }
        Err(BackendError::Other(
            "Bus Pirate: never entered BBIO mode".into(),
        ))
    }

    fn enter_mode(&mut self, cmd: u8, expected: &[u8], new_mode: BpMode) -> Result<()> {
        self.t.write(&[cmd])?;
        let reply = self.t.read(expected.len())?;
        if reply != expected {
            return Err(BackendError::Other(format!(
                "Bus Pirate: unexpected mode-switch reply {reply:?}, want {expected:?}"
            )));
        }
        self.current_mode = new_mode;
        Ok(())
    }

    pub fn enter_spi(&mut self) -> Result<()> {
        self.enter_mode(CMD_ENTER_SPI, b"SPI1", BpMode::Spi)
    }

    pub fn enter_i2c(&mut self) -> Result<()> {
        self.enter_mode(CMD_ENTER_I2C, b"I2C1", BpMode::I2c)
    }

    pub fn enter_uart(&mut self) -> Result<()> {
        self.enter_mode(CMD_ENTER_UART, b"ART1", BpMode::Uart)
    }

    pub fn enter_1wire(&mut self) -> Result<()> {
        self.enter_mode(CMD_ENTER_1WIRE, b"1W01", BpMode::OneWire)
    }

    pub fn reset_to_terminal(&mut self) -> Result<()> {
        self.t.write(&[CMD_RESET_TERMINAL])?;
        self.current_mode = BpMode::Terminal;
        Ok(())
    }

    /// SPI bulk transfer — sends 1..16 MOSI bytes; returns MISO.
    pub fn spi_bulk(&mut self, data: &[u8]) -> Result<Vec<u8>> {
        if self.current_mode != BpMode::Spi {
            return Err(BackendError::Other("Bus Pirate: not in SPI mode".into()));
        }
        if data.is_empty() || data.len() > 16 {
            return Err(BackendError::Other(
                "Bus Pirate SPI bulk: len 1..=16".into(),
            ));
        }
        let cmd = SPI_CMD_BULK_TX_BASE | ((data.len() - 1) as u8);
        let mut frame = Vec::with_capacity(1 + data.len());
        frame.push(cmd);
        frame.extend_from_slice(data);
        self.t.write(&frame)?;
        // BP echoes 0x01 ACK + N MISO bytes.
        let reply = self.t.read(1 + data.len())?;
        if reply.first().copied() != Some(0x01) {
            return Err(BackendError::Other("Bus Pirate SPI: no ACK".into()));
        }
        Ok(reply[1..].to_vec())
    }

    /// SPI CS toggle.
    pub fn spi_cs(&mut self, high: bool) -> Result<()> {
        let cmd = if high {
            SPI_CMD_CS_HIGH
        } else {
            SPI_CMD_CS_LOW
        };
        self.t.write(&[cmd])?;
        let r = self.t.read(1)?;
        if r.first().copied() != Some(0x01) {
            return Err(BackendError::Other("Bus Pirate SPI CS: no ACK".into()));
        }
        Ok(())
    }

    /// I2C START condition.
    pub fn i2c_start(&mut self) -> Result<()> {
        self.t.write(&[I2C_CMD_START])?;
        let r = self.t.read(1)?;
        if r.first().copied() != Some(0x01) {
            return Err(BackendError::Other("Bus Pirate I2C START: no ACK".into()));
        }
        Ok(())
    }

    pub fn i2c_stop(&mut self) -> Result<()> {
        self.t.write(&[I2C_CMD_STOP])?;
        let r = self.t.read(1)?;
        if r.first().copied() != Some(0x01) {
            return Err(BackendError::Other("Bus Pirate I2C STOP: no ACK".into()));
        }
        Ok(())
    }
}

#[cfg(any(test, feature = "mock"))]
pub struct BpMock {
    pub tx: Vec<u8>,
    rx: std::collections::VecDeque<u8>,
}

#[cfg(any(test, feature = "mock"))]
impl BpMock {
    pub fn new() -> Self {
        Self {
            tx: Vec::new(),
            rx: std::collections::VecDeque::new(),
        }
    }
    pub fn queue(&mut self, data: &[u8]) {
        self.rx.extend(data.iter().copied());
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for BpMock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl BusPirateTransport for BpMock {
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
    fn enter_bbio_succeeds_when_bp_replies() {
        let mut t = BpMock::new();
        t.queue(b"BBIO1");
        let mut bp = BusPirate::new(&mut t);
        bp.enter_bbio().unwrap();
        assert_eq!(bp.current_mode, BpMode::Bbio);
    }

    #[test]
    fn enter_bbio_fails_when_no_reply() {
        let mut t = BpMock::new();
        let mut bp = BusPirate::new(&mut t);
        assert!(bp.enter_bbio().is_err());
    }

    #[test]
    fn enter_spi_sets_mode() {
        let mut t = BpMock::new();
        t.queue(b"BBIO1");
        t.queue(b"SPI1");
        let mut bp = BusPirate::new(&mut t);
        bp.enter_bbio().unwrap();
        bp.enter_spi().unwrap();
        assert_eq!(bp.current_mode, BpMode::Spi);
    }

    #[test]
    fn spi_bulk_with_wrong_mode_errors() {
        let mut t = BpMock::new();
        let mut bp = BusPirate::new(&mut t);
        let r = bp.spi_bulk(&[1, 2, 3]);
        assert!(r.is_err());
    }

    #[test]
    fn spi_bulk_round_trips_miso() {
        let mut t = BpMock::new();
        t.queue(b"BBIO1");
        t.queue(b"SPI1");
        // Queue the SPI bulk reply (ACK + 3 MISO bytes) up front so we don't
        // need to mutate `t` while bp holds it.
        t.queue(&[0x01, 0xAA, 0xBB, 0xCC]);
        let miso;
        {
            let mut bp = BusPirate::new(&mut t);
            bp.enter_bbio().unwrap();
            bp.enter_spi().unwrap();
            miso = bp.spi_bulk(&[1, 2, 3]).unwrap();
        }
        assert_eq!(miso, vec![0xAA, 0xBB, 0xCC]);
        assert!(t.tx.contains(&(SPI_CMD_BULK_TX_BASE | 2)));
    }

    #[test]
    fn i2c_start_and_stop() {
        let mut t = BpMock::new();
        t.queue(b"BBIO1");
        t.queue(b"I2C1");
        t.queue(&[0x01, 0x01]);
        let mut bp = BusPirate::new(&mut t);
        bp.enter_bbio().unwrap();
        bp.enter_i2c().unwrap();
        bp.i2c_start().unwrap();
        bp.i2c_stop().unwrap();
    }

    #[test]
    fn reset_to_terminal_sets_mode() {
        let mut t = BpMock::new();
        let mut bp = BusPirate::new(&mut t);
        bp.current_mode = BpMode::Spi;
        bp.reset_to_terminal().unwrap();
        assert_eq!(bp.current_mode, BpMode::Terminal);
    }
}
