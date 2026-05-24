// CH347 raw / MPSSE-like primitive layer.
//
// The CH347 exposes three independent USB interfaces:
//   - Interface 0 (UART): VCP/CDC class — handled by the OS serial driver,
//     so we mostly bypass it and talk via the standard tty path.
//   - Interface 2 (SPI):  used by the existing `backends::ch347` flash backend.
//   - Interface 1 (I2C / GPIO / JTAG bit-bang): exposed here.
//
// All commands share a 3-byte header: `[cmd, len_lo, len_hi]` followed by
// `len` payload bytes. Replies are framed identically. Opcodes below are
// cross-referenced against WCH's `CH347EVT` package and the open-source
// `ch347-utility` / `libusb-CH347` projects.
//
// Unlike the CH341A UIO layer (which is bit-bang only), the CH347's I2C and
// UART engines run in dedicated firmware on the chip — host sends a logical
// "transfer this byte stream" command and the chip clocks it out at the
// requested speed (up to 1 MHz I2C / 6 Mbaud UART).

use crate::backends::ch347::Transport;
use crate::backends::Result;

// ─── Command opcodes (interface 1: I2C / GPIO) ─────────────────────────────

/// I2C stream — a sequence of inline sub-commands (start/stop/write/read).
pub const CMD_I2C_STREAM: u8 = 0xAA;

/// GPIO get/set — reads or writes the 8 free GPIO pins on the CH347.
pub const CMD_GPIO: u8 = 0xCC;

/// JTAG bit-bang stream — TCK/TMS/TDI per-byte transitions, TDO returned.
pub const CMD_JTAG_BITBANG: u8 = 0xD1;

/// UART config (interface 0). Sub-fields: baud (u32 LE), data bits (u8),
/// parity (u8), stop bits (u8), flow control (u8).
pub const CMD_UART_INIT: u8 = 0xC0;
pub const CMD_UART_XFER: u8 = 0xC1;

// ─── I2C inline sub-commands ───────────────────────────────────────────────
//
// These appear in the payload of a CMD_I2C_STREAM packet:
//
//   0x74              SET_START      — drive START condition
//   0x75              SET_STOP       — drive STOP condition
//   0x76              SET_ACK        — drive ACK on next read byte
//   0x77              SET_NACK       — drive NACK on next read byte
//   0x80..=0xBF       WRITE_N_BYTES  — N = (code & 0x3F) +1; payload N bytes
//   0xC0..=0xCF       READ_N_ACK     — N = (code & 0x0F); ACK each, last NACK
//   0xE0              SET_SPEED      — next byte = divisor (0..3 → 20/100/400/750 kHz)

pub const I2C_SET_START: u8 = 0x74;
pub const I2C_SET_STOP: u8 = 0x75;
pub const I2C_SET_ACK: u8 = 0x76;
pub const I2C_SET_NACK: u8 = 0x77;
pub const I2C_WRITE_BASE: u8 = 0x80; // OR'd with (count-1), max 0x3F
pub const I2C_READ_BASE: u8 = 0xC0; // OR'd with count, max 0x0F
pub const I2C_SET_SPEED: u8 = 0xE0;

/// I2C bus speed divisors per CH347 firmware.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum I2cSpeed {
    Low20kHz,
    Std100kHz,
    Fast400kHz,
    FastPlus750kHz,
}

impl I2cSpeed {
    pub fn divisor(self) -> u8 {
        match self {
            I2cSpeed::Low20kHz => 0,
            I2cSpeed::Std100kHz => 1,
            I2cSpeed::Fast400kHz => 2,
            I2cSpeed::FastPlus750kHz => 3,
        }
    }
}

// ─── Packet header helpers ─────────────────────────────────────────────────

/// Wrap a payload in the standard 3-byte CH347 command header
/// `[cmd, len_lo, len_hi]`.
pub fn frame(cmd: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(3 + payload.len());
    out.push(cmd);
    let len = payload.len() as u16;
    out.push(len as u8);
    out.push((len >> 8) as u8);
    out.extend_from_slice(payload);
    out
}

// ─── I2C packet builders ───────────────────────────────────────────────────

/// Build an I2C-stream packet that sets the bus speed (issued once at open).
pub fn build_i2c_set_speed(speed: I2cSpeed) -> Vec<u8> {
    frame(CMD_I2C_STREAM, &[I2C_SET_SPEED, speed.divisor()])
}

/// Build an I2C-stream packet for a single write transaction:
/// START, address byte (addr<<1, write bit), data..., STOP.
pub fn build_i2c_write(addr7: u8, data: &[u8]) -> Vec<u8> {
    assert!(data.len() < 0x40, "max 63 bytes per CH347 I2C write packet");
    let mut payload = vec![I2C_SET_START, I2C_WRITE_BASE | (data.len() as u8)];
    payload.push((addr7 & 0x7F) << 1);
    payload.extend_from_slice(data);
    payload.push(I2C_SET_STOP);
    frame(CMD_I2C_STREAM, &payload)
}

/// Build an I2C-stream packet for a single read transaction:
/// START, address byte (addr<<1 | 1, read), READ_N, STOP.
pub fn build_i2c_read(addr7: u8, count: u8) -> Vec<u8> {
    assert!(count < 0x10, "max 15 bytes per CH347 I2C read packet");
    let payload = vec![
        I2C_SET_START,
        I2C_WRITE_BASE, // 1 byte = address
        ((addr7 & 0x7F) << 1) | 0x01,
        I2C_READ_BASE | count,
        I2C_SET_STOP,
    ];
    frame(CMD_I2C_STREAM, &payload)
}

/// Build a combined-format I2C read (write register address, repeated start,
/// read N bytes). Equivalent to `i2c_smbus_read_block` on Linux.
pub fn build_i2c_write_then_read(addr7: u8, reg: &[u8], read_count: u8) -> Vec<u8> {
    assert!(reg.len() < 0x40, "max 63 bytes of register addressing");
    assert!(read_count < 0x10, "max 15 bytes per read");
    let mut payload = vec![I2C_SET_START, I2C_WRITE_BASE | (reg.len() as u8)];
    payload.push((addr7 & 0x7F) << 1);
    payload.extend_from_slice(reg);
    payload.extend_from_slice(&[
        I2C_SET_START, // repeated start
        I2C_WRITE_BASE,
        ((addr7 & 0x7F) << 1) | 0x01,
        I2C_READ_BASE | read_count,
        I2C_SET_STOP,
    ]);
    frame(CMD_I2C_STREAM, &payload)
}

// ─── GPIO packet builders ──────────────────────────────────────────────────
//
// CH347 has 8 GPIO pins (GP0..GP7). Each pin has a configuration byte in the
// GPIO packet payload: bit0 = enable, bit4 = direction (1=out), bit7 = value.
// Payload is 8 bytes (one per pin) in order GP0..GP7. Reply mirrors the
// payload with bit7 updated to the *current* level on each pin.

pub const GPIO_PIN_COUNT: usize = 8;
pub const GPIO_BIT_ENABLE: u8 = 0x01;
pub const GPIO_BIT_DIR_OUT: u8 = 0x10;
pub const GPIO_BIT_VALUE_HIGH: u8 = 0x80;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Default)]
pub struct GpioPinConfig {
    pub enabled: bool,
    pub output: bool,
    pub high: bool,
}

impl GpioPinConfig {
    pub fn to_byte(self) -> u8 {
        let mut b = 0u8;
        if self.enabled {
            b |= GPIO_BIT_ENABLE;
        }
        if self.output {
            b |= GPIO_BIT_DIR_OUT;
        }
        if self.high {
            b |= GPIO_BIT_VALUE_HIGH;
        }
        b
    }

    pub fn from_byte(b: u8) -> Self {
        Self {
            enabled: b & GPIO_BIT_ENABLE != 0,
            output: b & GPIO_BIT_DIR_OUT != 0,
            high: b & GPIO_BIT_VALUE_HIGH != 0,
        }
    }
}

/// Build a GPIO config + drive packet for all 8 pins.
pub fn build_gpio_set(pins: [GpioPinConfig; GPIO_PIN_COUNT]) -> Vec<u8> {
    let payload: Vec<u8> = pins.iter().map(|p| p.to_byte()).collect();
    frame(CMD_GPIO, &payload)
}

/// Build a GPIO read-only packet (all pins set to "enabled+input", chip
/// returns current sampled levels).
pub fn build_gpio_read() -> Vec<u8> {
    let mut pins = [GpioPinConfig::default(); GPIO_PIN_COUNT];
    for p in &mut pins {
        p.enabled = true;
        p.output = false;
    }
    build_gpio_set(pins)
}

// ─── JTAG bit-bang packet (TMS/TDI byte → TDO byte) ────────────────────────
//
// Each byte in the payload encodes one TCK cycle's worth of TMS+TDI:
//   bit0 = TMS   bit1 = TDI   bit2 = TCK (toggled by firmware automatically)
// The chip clocks TCK, samples TDO, packs it into the reply byte's bit0.

pub fn build_jtag_pulses(tms_tdi: &[(bool, bool)]) -> Vec<u8> {
    let payload: Vec<u8> = tms_tdi
        .iter()
        .map(|(tms, tdi)| {
            let mut b = 0u8;
            if *tms {
                b |= 0x01;
            }
            if *tdi {
                b |= 0x02;
            }
            b
        })
        .collect();
    frame(CMD_JTAG_BITBANG, &payload)
}

/// Decode a JTAG reply: bit0 of each byte is TDO sampled on the rising edge.
pub fn decode_jtag_tdo(reply: &[u8]) -> Vec<bool> {
    reply.iter().map(|b| b & 0x01 != 0).collect()
}

// ─── UART init packet ──────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Parity {
    None,
    Odd,
    Even,
    Mark,
    Space,
}

impl Parity {
    pub fn code(self) -> u8 {
        match self {
            Parity::None => 0,
            Parity::Odd => 1,
            Parity::Even => 2,
            Parity::Mark => 3,
            Parity::Space => 4,
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum StopBits {
    One,
    OnePointFive,
    Two,
}

impl StopBits {
    pub fn code(self) -> u8 {
        match self {
            StopBits::One => 0,
            StopBits::OnePointFive => 1,
            StopBits::Two => 2,
        }
    }
}

pub fn build_uart_init(
    baud: u32,
    data_bits: u8,
    parity: Parity,
    stop_bits: StopBits,
    flow_rts_cts: bool,
) -> Vec<u8> {
    let mut payload = Vec::with_capacity(8);
    payload.extend_from_slice(&baud.to_le_bytes());
    payload.push(data_bits);
    payload.push(parity.code());
    payload.push(stop_bits.code());
    payload.push(if flow_rts_cts { 1 } else { 0 });
    frame(CMD_UART_INIT, &payload)
}

// ─── Safe handle over `Transport` for ergonomic high-level use ─────────────

pub struct Ch347Raw<'t, T: Transport> {
    transport: &'t mut T,
}

impl<'t, T: Transport> Ch347Raw<'t, T> {
    pub fn new(transport: &'t mut T) -> Self {
        Self { transport }
    }

    pub fn i2c_set_speed(&mut self, speed: I2cSpeed) -> Result<()> {
        self.transport.write(&build_i2c_set_speed(speed))
    }

    pub fn i2c_write(&mut self, addr7: u8, data: &[u8]) -> Result<()> {
        self.transport.write(&build_i2c_write(addr7, data))?;
        let _ack = self.transport.read(1)?;
        Ok(())
    }

    pub fn i2c_read(&mut self, addr7: u8, count: u8) -> Result<Vec<u8>> {
        self.transport.write(&build_i2c_read(addr7, count))?;
        let reply = self.transport.read(3 + count as usize)?;
        // Skip 3-byte response header.
        Ok(reply.into_iter().skip(3).collect())
    }

    pub fn i2c_write_then_read(
        &mut self,
        addr7: u8,
        reg: &[u8],
        read_count: u8,
    ) -> Result<Vec<u8>> {
        self.transport
            .write(&build_i2c_write_then_read(addr7, reg, read_count))?;
        let reply = self.transport.read(3 + read_count as usize)?;
        Ok(reply.into_iter().skip(3).collect())
    }

    pub fn gpio_set(&mut self, pins: [GpioPinConfig; GPIO_PIN_COUNT]) -> Result<()> {
        self.transport.write(&build_gpio_set(pins))
    }

    pub fn gpio_read(&mut self) -> Result<[GpioPinConfig; GPIO_PIN_COUNT]> {
        self.transport.write(&build_gpio_read())?;
        let reply = self.transport.read(3 + GPIO_PIN_COUNT)?;
        let mut out = [GpioPinConfig::default(); GPIO_PIN_COUNT];
        for (i, slot) in out.iter_mut().enumerate() {
            *slot = GpioPinConfig::from_byte(reply.get(3 + i).copied().unwrap_or(0));
        }
        Ok(out)
    }

    pub fn jtag_pulses(&mut self, tms_tdi: &[(bool, bool)]) -> Result<Vec<bool>> {
        self.transport.write(&build_jtag_pulses(tms_tdi))?;
        let reply = self.transport.read(3 + tms_tdi.len())?;
        Ok(decode_jtag_tdo(&reply[3..]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backends::ch347::CapturingTransport;

    #[test]
    fn frame_header_shape() {
        let f = frame(0xAA, &[1, 2, 3]);
        assert_eq!(f, vec![0xAA, 0x03, 0x00, 1, 2, 3]);
    }

    #[test]
    fn frame_large_payload_two_byte_length() {
        let payload = vec![0xFFu8; 300];
        let f = frame(0xAA, &payload);
        assert_eq!(f[0], 0xAA);
        assert_eq!(f[1], 0x2C);
        assert_eq!(f[2], 0x01);
        assert_eq!(f.len(), 303);
    }

    #[test]
    fn i2c_set_speed_packet() {
        let pkt = build_i2c_set_speed(I2cSpeed::Fast400kHz);
        assert_eq!(pkt[0], CMD_I2C_STREAM);
        assert_eq!(pkt[3], I2C_SET_SPEED);
        assert_eq!(pkt[4], 2);
    }

    #[test]
    fn i2c_write_packet_contains_start_addr_stop() {
        let pkt = build_i2c_write(0x50, &[0xAB, 0xCD]);
        assert_eq!(pkt[0], CMD_I2C_STREAM);
        // After 3-byte header: START, WRITE_N (N=2), addr_w, data..., STOP
        assert_eq!(pkt[3], I2C_SET_START);
        assert_eq!(pkt[4], I2C_WRITE_BASE | 2);
        assert_eq!(pkt[5], 0x50 << 1);
        assert_eq!(pkt[6], 0xAB);
        assert_eq!(pkt[7], 0xCD);
        assert_eq!(pkt[8], I2C_SET_STOP);
    }

    #[test]
    fn i2c_read_packet_sets_read_bit_on_addr() {
        let pkt = build_i2c_read(0x50, 4);
        assert_eq!(pkt[5], (0x50 << 1) | 0x01);
        assert_eq!(pkt[6], I2C_READ_BASE | 4);
    }

    #[test]
    fn i2c_write_then_read_has_repeated_start() {
        let pkt = build_i2c_write_then_read(0x50, &[0x10], 4);
        assert_eq!(pkt[3], I2C_SET_START);
        // After first write phase comes a second START (repeated).
        let second_start = pkt
            .iter()
            .enumerate()
            .filter(|(_, b)| **b == I2C_SET_START)
            .count();
        assert_eq!(second_start, 2);
    }

    #[test]
    fn gpio_pin_config_round_trip() {
        let p = GpioPinConfig {
            enabled: true,
            output: true,
            high: true,
        };
        let b = p.to_byte();
        assert_eq!(b, GPIO_BIT_ENABLE | GPIO_BIT_DIR_OUT | GPIO_BIT_VALUE_HIGH);
        let p2 = GpioPinConfig::from_byte(b);
        assert_eq!(p, p2);
    }

    #[test]
    fn gpio_set_packet_has_eight_bytes() {
        let mut pins = [GpioPinConfig::default(); GPIO_PIN_COUNT];
        for p in &mut pins {
            p.enabled = true;
            p.output = true;
            p.high = true;
        }
        let pkt = build_gpio_set(pins);
        assert_eq!(pkt[0], CMD_GPIO);
        assert_eq!(pkt[1], GPIO_PIN_COUNT as u8);
        assert_eq!(pkt.len(), 3 + GPIO_PIN_COUNT);
    }

    #[test]
    fn jtag_pulse_encoding() {
        let pkt = build_jtag_pulses(&[(true, false), (false, true), (true, true)]);
        assert_eq!(pkt[0], CMD_JTAG_BITBANG);
        assert_eq!(pkt[3], 0x01); // TMS only
        assert_eq!(pkt[4], 0x02); // TDI only
        assert_eq!(pkt[5], 0x03); // both
    }

    #[test]
    fn jtag_tdo_decode() {
        let tdo = decode_jtag_tdo(&[0x01, 0x00, 0x03, 0x02]);
        assert_eq!(tdo, vec![true, false, true, false]);
    }

    #[test]
    fn uart_init_packet_shape() {
        let pkt = build_uart_init(115200, 8, Parity::None, StopBits::One, false);
        assert_eq!(pkt[0], CMD_UART_INIT);
        // baud in little-endian
        let baud = u32::from_le_bytes([pkt[3], pkt[4], pkt[5], pkt[6]]);
        assert_eq!(baud, 115200);
        assert_eq!(pkt[7], 8); // data bits
        assert_eq!(pkt[8], 0); // parity none
        assert_eq!(pkt[9], 0); // stop bits = 1
        assert_eq!(pkt[10], 0); // flow none
    }

    #[test]
    fn ch347_raw_i2c_write_uses_transport() {
        let mut t = CapturingTransport::new();
        t.queue_read(vec![0u8]); // mock ack
        let mut raw = Ch347Raw::new(&mut t);
        raw.i2c_write(0x50, &[1, 2, 3]).unwrap();
        assert_eq!(t.writes.len(), 1);
        assert_eq!(t.writes[0][0], CMD_I2C_STREAM);
    }

    #[test]
    fn ch347_raw_i2c_read_strips_header() {
        let mut t = CapturingTransport::new();
        let mut header = vec![CMD_I2C_STREAM, 0x04, 0x00];
        header.extend_from_slice(&[0xDE, 0xAD, 0xBE, 0xEF]);
        t.queue_read(header);
        let mut raw = Ch347Raw::new(&mut t);
        let data = raw.i2c_read(0x50, 4).unwrap();
        assert_eq!(data, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn ch347_raw_gpio_round_trip() {
        let mut t = CapturingTransport::new();
        let mut reply = vec![CMD_GPIO, 0x08, 0x00];
        for i in 0..8u8 {
            // alt high/low pattern
            let val = GPIO_BIT_ENABLE | (if i % 2 == 0 { GPIO_BIT_VALUE_HIGH } else { 0 });
            reply.push(val);
        }
        t.queue_read(reply);
        let mut raw = Ch347Raw::new(&mut t);
        let pins = raw.gpio_read().unwrap();
        assert!(pins[0].high);
        assert!(!pins[1].high);
        assert!(pins[2].high);
        assert!(!pins[3].high);
    }
}
