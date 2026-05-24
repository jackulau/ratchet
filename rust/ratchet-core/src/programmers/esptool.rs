// ESP32 / ESP8266 ROM-bootloader programmer ("esptool" protocol).
//
// SLIP-framed UART protocol talking to the on-chip ROM loader. Commands
// share a fixed 8-byte header: direction(1) | cmd(1) | size_LE16 | checksum_LE32
// followed by `size` payload bytes. Replies start with the same 8-byte
// header (direction=1) then payload (often 4 bytes of "value") then a
// status byte (0=OK, 1=ERR).
//
// Reset to bootloader: pull GPIO0 low and pulse RESET (EN). On most ESP
// dev boards both lines are wired to RTS+DTR so the host can sequence:
//   DTR=high, RTS=low  → EN low, GPIO0 high
//   DTR=low,  RTS=high → EN high, GPIO0 low
//   DTR=high, RTS=high → EN released, GPIO0 released → boots into ROM loader
//
// Chip identification: read register 0x40001000 (UART_DATE) for ESP8266
// or 0x60000078 for ESP32 — distinct values per chip family.
//
// Reference: github.com/espressif/esptool (esptool.py).

use crate::backends::{BackendError, Result};

// ─── SLIP framing ──────────────────────────────────────────────────────────

pub const SLIP_END: u8 = 0xC0;
pub const SLIP_ESC: u8 = 0xDB;
pub const SLIP_ESC_END: u8 = 0xDC;
pub const SLIP_ESC_ESC: u8 = 0xDD;

pub fn slip_encode(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() + 4);
    out.push(SLIP_END);
    for b in data {
        match *b {
            SLIP_END => {
                out.push(SLIP_ESC);
                out.push(SLIP_ESC_END);
            }
            SLIP_ESC => {
                out.push(SLIP_ESC);
                out.push(SLIP_ESC_ESC);
            }
            _ => out.push(*b),
        }
    }
    out.push(SLIP_END);
    out
}

pub fn slip_decode_one(buf: &[u8]) -> Option<(Vec<u8>, usize)> {
    let mut iter = buf.iter().enumerate();
    let mut start = None;
    for (i, b) in iter.by_ref() {
        if *b == SLIP_END {
            start = Some(i + 1);
            break;
        }
    }
    let start = start?;
    let mut out = Vec::new();
    let mut i = start;
    while i < buf.len() {
        let b = buf[i];
        if b == SLIP_END {
            return Some((out, i + 1));
        }
        if b == SLIP_ESC && i + 1 < buf.len() {
            match buf[i + 1] {
                SLIP_ESC_END => out.push(SLIP_END),
                SLIP_ESC_ESC => out.push(SLIP_ESC),
                _ => out.push(buf[i + 1]),
            }
            i += 2;
            continue;
        }
        out.push(b);
        i += 1;
    }
    None
}

// ─── Commands ──────────────────────────────────────────────────────────────

pub const CMD_FLASH_BEGIN: u8 = 0x02;
pub const CMD_FLASH_DATA: u8 = 0x03;
pub const CMD_FLASH_END: u8 = 0x04;
pub const CMD_MEM_BEGIN: u8 = 0x05;
pub const CMD_MEM_END: u8 = 0x06;
pub const CMD_MEM_DATA: u8 = 0x07;
pub const CMD_SYNC: u8 = 0x08;
pub const CMD_WRITE_REG: u8 = 0x09;
pub const CMD_READ_REG: u8 = 0x0A;
pub const CMD_SPI_SET_PARAMS: u8 = 0x0B;
pub const CMD_SPI_ATTACH: u8 = 0x0D;
pub const CMD_CHANGE_BAUDRATE: u8 = 0x0F;
pub const CMD_FLASH_DEFL_BEGIN: u8 = 0x10;
pub const CMD_FLASH_DEFL_DATA: u8 = 0x11;
pub const CMD_FLASH_DEFL_END: u8 = 0x12;
pub const CMD_SPI_FLASH_MD5: u8 = 0x13;

// ─── Chip families ─────────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EspChip {
    Esp8266,
    Esp32,
    Esp32S2,
    Esp32S3,
    Esp32C3,
    Esp32C6,
}

impl EspChip {
    pub fn name(self) -> &'static str {
        match self {
            EspChip::Esp8266 => "ESP8266",
            EspChip::Esp32 => "ESP32",
            EspChip::Esp32S2 => "ESP32-S2",
            EspChip::Esp32S3 => "ESP32-S3",
            EspChip::Esp32C3 => "ESP32-C3",
            EspChip::Esp32C6 => "ESP32-C6",
        }
    }

    pub fn from_magic(magic: u32) -> Option<EspChip> {
        match magic {
            0xfff0c101 => Some(EspChip::Esp8266),
            0x00f01d83 => Some(EspChip::Esp32),
            0x000007c6 => Some(EspChip::Esp32S2),
            0x00000009 => Some(EspChip::Esp32S3),
            0x6921506f | 0x1b31506f => Some(EspChip::Esp32C3),
            0x0da1806f => Some(EspChip::Esp32C6),
            _ => None,
        }
    }
}

// ─── Packet builders ───────────────────────────────────────────────────────

pub fn build_command(direction: u8, cmd: u8, payload: &[u8], checksum: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + payload.len());
    out.push(direction);
    out.push(cmd);
    out.extend_from_slice(&(payload.len() as u16).to_le_bytes());
    out.extend_from_slice(&checksum.to_le_bytes());
    out.extend_from_slice(payload);
    out
}

/// Sync packet payload: 0x07 0x07 0x12 0x20 + 32 × 0x55.
pub fn sync_payload() -> Vec<u8> {
    let mut p = vec![0x07, 0x07, 0x12, 0x20];
    p.extend(std::iter::repeat_n(0x55, 32));
    p
}

pub fn build_read_reg(addr: u32) -> Vec<u8> {
    build_command(0x00, CMD_READ_REG, &addr.to_le_bytes(), 0)
}

pub fn build_write_reg(addr: u32, value: u32, mask: u32, delay_us: u32) -> Vec<u8> {
    let mut payload = Vec::with_capacity(16);
    payload.extend_from_slice(&addr.to_le_bytes());
    payload.extend_from_slice(&value.to_le_bytes());
    payload.extend_from_slice(&mask.to_le_bytes());
    payload.extend_from_slice(&delay_us.to_le_bytes());
    build_command(0x00, CMD_WRITE_REG, &payload, 0)
}

pub fn build_flash_begin(size: u32, blocks: u32, block_size: u32, offset: u32) -> Vec<u8> {
    let mut payload = Vec::with_capacity(16);
    payload.extend_from_slice(&size.to_le_bytes());
    payload.extend_from_slice(&blocks.to_le_bytes());
    payload.extend_from_slice(&block_size.to_le_bytes());
    payload.extend_from_slice(&offset.to_le_bytes());
    build_command(0x00, CMD_FLASH_BEGIN, &payload, 0)
}

pub fn build_flash_data(data: &[u8], seq: u32) -> Vec<u8> {
    let checksum = data.iter().fold(0xEFu32, |acc, b| acc ^ (*b as u32));
    let mut payload = Vec::with_capacity(16 + data.len());
    payload.extend_from_slice(&(data.len() as u32).to_le_bytes());
    payload.extend_from_slice(&seq.to_le_bytes());
    payload.extend_from_slice(&0u32.to_le_bytes());
    payload.extend_from_slice(&0u32.to_le_bytes());
    payload.extend_from_slice(data);
    build_command(0x00, CMD_FLASH_DATA, &payload, checksum)
}

// ─── Transport + driver ────────────────────────────────────────────────────

pub trait EspTransport {
    fn write(&mut self, data: &[u8]) -> Result<()>;
    fn read_until_slip_end(&mut self) -> Result<Vec<u8>>;
    fn set_dtr(&mut self, high: bool) -> Result<()>;
    fn set_rts(&mut self, high: bool) -> Result<()>;
}

pub struct EspBootloader<'t, T: EspTransport> {
    t: &'t mut T,
}

impl<'t, T: EspTransport> EspBootloader<'t, T> {
    pub fn new(t: &'t mut T) -> Self {
        Self { t }
    }

    /// Pulse DTR/RTS to reset target into ROM loader.
    pub fn reset_to_bootloader(&mut self) -> Result<()> {
        self.t.set_dtr(true)?;
        self.t.set_rts(false)?;
        self.t.set_dtr(false)?;
        self.t.set_rts(true)?;
        self.t.set_dtr(true)?;
        self.t.set_rts(true)
    }

    /// Send SYNC and expect any non-error reply.
    pub fn sync(&mut self) -> Result<()> {
        let frame = slip_encode(&build_command(0x00, CMD_SYNC, &sync_payload(), 0));
        self.t.write(&frame)?;
        let _ = self.t.read_until_slip_end()?;
        Ok(())
    }

    pub fn read_reg(&mut self, addr: u32) -> Result<u32> {
        let frame = slip_encode(&build_read_reg(addr));
        self.t.write(&frame)?;
        let reply = self.t.read_until_slip_end()?;
        if reply.len() < 8 {
            return Err(BackendError::Other("esp read_reg: short reply".into()));
        }
        // ROM loader places the read value in the response header's "checksum"
        // field (bytes 4..8 of the 8-byte command header).
        let value = u32::from_le_bytes([reply[4], reply[5], reply[6], reply[7]]);
        Ok(value)
    }

    pub fn detect_chip(&mut self) -> Result<EspChip> {
        // CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000.
        let magic = self.read_reg(0x40001000)?;
        EspChip::from_magic(magic)
            .ok_or_else(|| BackendError::Other(format!("unknown ESP chip magic 0x{magic:08x}")))
    }

    pub fn flash_image(&mut self, offset: u32, image: &[u8]) -> Result<()> {
        const BLOCK: usize = 4096;
        let blocks = image.len().div_ceil(BLOCK) as u32;
        self.t.write(&slip_encode(&build_flash_begin(
            image.len() as u32,
            blocks,
            BLOCK as u32,
            offset,
        )))?;
        let _ = self.t.read_until_slip_end()?;
        for (i, chunk) in image.chunks(BLOCK).enumerate() {
            let mut padded = chunk.to_vec();
            padded.resize(BLOCK, 0xFF);
            self.t
                .write(&slip_encode(&build_flash_data(&padded, i as u32)))?;
            let _ = self.t.read_until_slip_end()?;
        }
        // FLASH_END with reboot=0.
        let frame = slip_encode(&build_command(0x00, CMD_FLASH_END, &0u32.to_le_bytes(), 0));
        self.t.write(&frame)?;
        Ok(())
    }
}

// ─── Mock transport for tests ──────────────────────────────────────────────

#[cfg(any(test, feature = "mock"))]
pub struct EspMockTransport {
    pub tx_log: Vec<Vec<u8>>,
    rx_queue: std::collections::VecDeque<Vec<u8>>,
    pub dtr: Vec<bool>,
    pub rts: Vec<bool>,
}

#[cfg(any(test, feature = "mock"))]
impl EspMockTransport {
    pub fn new() -> Self {
        Self {
            tx_log: Vec::new(),
            rx_queue: std::collections::VecDeque::new(),
            dtr: Vec::new(),
            rts: Vec::new(),
        }
    }

    pub fn queue_read_reg_reply(&mut self, value: u32) {
        // ESP ROM responses encode the read value in the header's checksum
        // field (bytes [4..8]), not in the payload — payload carries the
        // 1-byte status terminator (0=OK, 1=ERR) for stub loader replies.
        let resp = build_command(0x01, CMD_READ_REG, &[0u8, 0u8], value);
        self.rx_queue.push_back(slip_encode(&resp));
    }

    pub fn queue_simple_ok(&mut self) {
        // Empty 0x01-direction reply.
        let resp = build_command(0x01, 0, &[], 0);
        self.rx_queue.push_back(slip_encode(&resp));
    }
}

#[cfg(any(test, feature = "mock"))]
impl Default for EspMockTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "mock"))]
impl EspTransport for EspMockTransport {
    fn write(&mut self, data: &[u8]) -> Result<()> {
        self.tx_log.push(data.to_vec());
        Ok(())
    }

    fn read_until_slip_end(&mut self) -> Result<Vec<u8>> {
        let pkt = self.rx_queue.pop_front().unwrap_or_default();
        let (decoded, _) = slip_decode_one(&pkt).unwrap_or((vec![], 0));
        Ok(decoded)
    }

    fn set_dtr(&mut self, high: bool) -> Result<()> {
        self.dtr.push(high);
        Ok(())
    }

    fn set_rts(&mut self, high: bool) -> Result<()> {
        self.rts.push(high);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slip_round_trip_plain_bytes() {
        let payload = vec![1, 2, 3, 4, 5];
        let enc = slip_encode(&payload);
        let (dec, _) = slip_decode_one(&enc).unwrap();
        assert_eq!(dec, payload);
    }

    #[test]
    fn slip_escapes_end_byte() {
        let payload = vec![0xC0, 0x42];
        let enc = slip_encode(&payload);
        // Must contain SLIP_ESC + SLIP_ESC_END for the 0xC0.
        assert!(enc.windows(2).any(|w| w == [SLIP_ESC, SLIP_ESC_END]));
        let (dec, _) = slip_decode_one(&enc).unwrap();
        assert_eq!(dec, payload);
    }

    #[test]
    fn slip_escapes_esc_byte() {
        let payload = vec![0xDB, 0x42];
        let enc = slip_encode(&payload);
        let (dec, _) = slip_decode_one(&enc).unwrap();
        assert_eq!(dec, payload);
    }

    #[test]
    fn sync_payload_shape() {
        let p = sync_payload();
        assert_eq!(p.len(), 36);
        assert_eq!(&p[..4], &[0x07, 0x07, 0x12, 0x20]);
        assert!(p[4..].iter().all(|b| *b == 0x55));
    }

    #[test]
    fn chip_magic_lookup() {
        assert_eq!(EspChip::from_magic(0x00f01d83), Some(EspChip::Esp32));
        assert_eq!(EspChip::from_magic(0xfff0c101), Some(EspChip::Esp8266));
        assert_eq!(EspChip::from_magic(0xDEADBEEF), None);
    }

    #[test]
    fn detect_chip_returns_chip_from_reg() {
        let mut t = EspMockTransport::new();
        t.queue_read_reg_reply(0x00f01d83); // ESP32
        let mut esp = EspBootloader::new(&mut t);
        let chip = esp.detect_chip().unwrap();
        assert_eq!(chip, EspChip::Esp32);
    }

    #[test]
    fn reset_to_bootloader_drives_lines() {
        let mut t = EspMockTransport::new();
        let mut esp = EspBootloader::new(&mut t);
        esp.reset_to_bootloader().unwrap();
        // Expect at least 3 DTR + 3 RTS line state changes.
        assert!(t.dtr.len() >= 3);
        assert!(t.rts.len() >= 3);
    }

    #[test]
    fn flash_image_chunks_into_blocks() {
        let mut t = EspMockTransport::new();
        // FLASH_BEGIN + N FLASH_DATA replies.
        let n = 3;
        for _ in 0..(1 + n) {
            t.queue_simple_ok();
        }
        let mut esp = EspBootloader::new(&mut t);
        let img = vec![0xAA; 4096 * 3];
        esp.flash_image(0x1000, &img).unwrap();
        // Verify FLASH_BEGIN + 3 FLASH_DATA + FLASH_END = 5 writes.
        assert_eq!(t.tx_log.len(), 1 + 3 + 1);
    }

    #[test]
    fn read_reg_decodes_le_value() {
        let mut t = EspMockTransport::new();
        t.queue_read_reg_reply(0xCAFEBABE);
        let mut esp = EspBootloader::new(&mut t);
        assert_eq!(esp.read_reg(0x40001000).unwrap(), 0xCAFEBABE);
    }
}
