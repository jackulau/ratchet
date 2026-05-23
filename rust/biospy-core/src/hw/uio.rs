// CH341A UIO/GPIO primitive layer.
//
// The CH341A exposes a "UIO stream" command (0xAB) that lets host software
// drive up to 6 GPIO pins (D0..D5) and sample their state. SPI mode in the
// existing flash programmer is one specialised use of UIO; this module
// exposes UIO as a generic GPIO + bit-bang substrate that I2C, JTAG, 1-Wire,
// logic-analyzer and arbitrary protocol modules build on top of.
//
// Pin map (UIO mode, D0..D5 — physical CH341A pin numbers in comments):
//   D0  = SCL / TCK / SCK (pin 18)
//   D1  = unused           (pin 19)
//   D2  = unused           (pin 20)  -- D2 is the legacy CS line in SPI mode
//   D3  = SDA / TMS        (pin 21)
//   D4  = TDI / MISO IN    (pin 22)  -- input only on real silicon
//   D5  = TDO / MOSI       (pin 23)
//
// USB-latency floor: ~1 ms per packet round-trip on USB-FS. Effective bit-bang
// rate is therefore roughly 1 kHz per packet if every bit needs a round trip,
// up to ~6 MHz when a packet contains many pre-computed transitions (no
// per-bit feedback). For protocols that need feedback per bit (I2C ACK, JTAG
// TDO sampling) use `read_after_write` to batch a transition then capture the
// input nibble in one round trip.

use crate::backends::ch341a::{
    UsbBus, CMD_UIO_STREAM, UIO_STM_DIR, UIO_STM_END, UIO_STM_IN, UIO_STM_OUT,
};

/// All six UIO pins as a bitmask (bits 0..5 = D0..D5).
pub const PIN_MASK_ALL: u8 = 0x3F;

/// Pin index → bitmask.
pub const fn pin(idx: u8) -> u8 {
    1u8 << idx
}

/// Build a UIO packet that sets pin directions.
///
/// `dir_mask` bit=1 → output, bit=0 → input. Only the low 6 bits are honored.
pub fn set_direction_packet(dir_mask: u8) -> [u8; 3] {
    [
        CMD_UIO_STREAM,
        UIO_STM_DIR | (dir_mask & PIN_MASK_ALL),
        UIO_STM_END,
    ]
}

/// Build a UIO packet that drives output pins to `out_mask`.
///
/// Only pins currently configured as outputs (via `set_direction_packet`)
/// will actually drive; bits targeting input pins are ignored by the chip.
pub fn set_pins_packet(out_mask: u8) -> [u8; 3] {
    [
        CMD_UIO_STREAM,
        UIO_STM_OUT | (out_mask & PIN_MASK_ALL),
        UIO_STM_END,
    ]
}

/// Build a UIO packet that samples input pins.
///
/// Reply byte (1 byte over EP_IN) is `0bxxAABBBB` where the low 6 bits give
/// the present level of D0..D5.
pub fn read_pins_packet() -> [u8; 2] {
    [CMD_UIO_STREAM, UIO_STM_IN | UIO_STM_END]
}

/// Build a UIO packet sequence that performs multiple OUT transitions
/// in one USB round trip. Each transition is a fresh `UIO_STM_OUT` byte;
/// the chip drives each transition for one internal tick (~166 ns on the
/// CH341A's internal clock).
///
/// Returns a single packet capped at the UIO packet limit (~30 transitions
/// per packet — the chip silently truncates beyond that).
pub fn multi_out_packet(out_states: &[u8]) -> Vec<u8> {
    let mut pkt = Vec::with_capacity(2 + out_states.len());
    pkt.push(CMD_UIO_STREAM);
    for st in out_states.iter().take(MAX_TRANSITIONS_PER_PACKET) {
        pkt.push(UIO_STM_OUT | (*st & PIN_MASK_ALL));
    }
    pkt.push(UIO_STM_END);
    pkt
}

/// Maximum number of OUT/IN transitions the chip will emit per packet
/// before silently truncating. Conservative ceiling vs. observed silicon.
pub const MAX_TRANSITIONS_PER_PACKET: usize = 28;

/// A combined "drive outputs, then sample inputs" packet — exactly one USB
/// round trip captures the state after the drive completes. Used by I2C ACK
/// sampling and JTAG TDO capture.
///
/// Returns a packet ending with both an OUT byte and an IN byte (chip pushes
/// 1 reply byte to EP_IN per IN in the stream).
pub fn drive_then_sample_packet(out_state: u8) -> [u8; 4] {
    [
        CMD_UIO_STREAM,
        UIO_STM_OUT | (out_state & PIN_MASK_ALL),
        UIO_STM_IN,
        UIO_STM_END,
    ]
}

/// High-level safe handle over a `UsbBus` that tracks pin state in software
/// and exposes ergonomic GPIO operations. Cloning is intentionally NOT
/// derived — the underlying bus is exclusive.
pub struct UioPort<'b, B: UsbBus> {
    bus: &'b mut B,
    dir_cache: u8,
    out_cache: u8,
}

impl<'b, B: UsbBus> UioPort<'b, B> {
    pub fn new(bus: &'b mut B) -> Self {
        Self {
            bus,
            dir_cache: 0,
            out_cache: 0,
        }
    }

    /// Configure pin directions. `out_pins` bit=1 → output.
    pub fn set_direction(&mut self, out_pins: u8) -> crate::backends::Result<()> {
        let masked = out_pins & PIN_MASK_ALL;
        if masked == self.dir_cache {
            return Ok(());
        }
        let pkt = set_direction_packet(masked);
        self.bus.bulk_write(&pkt)?;
        self.dir_cache = masked;
        Ok(())
    }

    /// Drive the output pins to `levels`. Bits corresponding to pins
    /// configured as input are ignored by the chip.
    pub fn set_pins(&mut self, levels: u8) -> crate::backends::Result<()> {
        let masked = levels & PIN_MASK_ALL;
        let pkt = set_pins_packet(masked);
        self.bus.bulk_write(&pkt)?;
        self.out_cache = masked;
        Ok(())
    }

    /// Set a single pin high or low (preserves other pin states from cache).
    pub fn set_pin(&mut self, idx: u8, high: bool) -> crate::backends::Result<()> {
        let bit = pin(idx);
        let next = if high {
            self.out_cache | bit
        } else {
            self.out_cache & !bit
        };
        self.set_pins(next)
    }

    /// Sample the low 6 bits of the UIO input port. Returns the mask.
    pub fn read_pins(&mut self) -> crate::backends::Result<u8> {
        let pkt = read_pins_packet();
        self.bus.bulk_write(&pkt)?;
        let reply = self.bus.bulk_read(1)?;
        Ok(reply.first().copied().unwrap_or(0) & PIN_MASK_ALL)
    }

    /// Sample a single input pin.
    pub fn read_pin(&mut self, idx: u8) -> crate::backends::Result<bool> {
        Ok(self.read_pins()? & pin(idx) != 0)
    }

    /// Drive a transition then immediately sample. One USB round trip.
    /// Used by I2C ACK and JTAG TDO capture loops.
    pub fn drive_then_sample(&mut self, levels: u8) -> crate::backends::Result<u8> {
        let pkt = drive_then_sample_packet(levels);
        self.bus.bulk_write(&pkt)?;
        let reply = self.bus.bulk_read(1)?;
        self.out_cache = levels & PIN_MASK_ALL;
        Ok(reply.first().copied().unwrap_or(0) & PIN_MASK_ALL)
    }

    /// Stream a precomputed sequence of OUT transitions in batches that
    /// respect the per-packet transition cap. No per-bit feedback.
    pub fn stream_out(&mut self, states: &[u8]) -> crate::backends::Result<()> {
        for chunk in states.chunks(MAX_TRANSITIONS_PER_PACKET) {
            let pkt = multi_out_packet(chunk);
            self.bus.bulk_write(&pkt)?;
        }
        if let Some(last) = states.last() {
            self.out_cache = *last & PIN_MASK_ALL;
        }
        Ok(())
    }

    /// Generate a clock pulse on `clk_pin`: low then high then low,
    /// preserving the rest of the output pin state. Useful as a JTAG/SPI
    /// clock primitive.
    pub fn pulse_clock(&mut self, clk_pin: u8) -> crate::backends::Result<()> {
        let base = self.out_cache & !pin(clk_pin);
        self.stream_out(&[base, base | pin(clk_pin), base])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backends::ch341a::MockBus;

    #[test]
    fn pin_index_helper() {
        assert_eq!(pin(0), 0x01);
        assert_eq!(pin(3), 0x08);
        assert_eq!(pin(5), 0x20);
    }

    #[test]
    fn set_direction_packet_shape() {
        let pkt = set_direction_packet(0x29);
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_DIR | 0x29);
        assert_eq!(pkt[2], UIO_STM_END);
    }

    #[test]
    fn set_direction_masks_to_six_bits() {
        let pkt = set_direction_packet(0xFF);
        assert_eq!(pkt[1] & 0xC0, UIO_STM_DIR);
        assert_eq!(pkt[1] & 0x3F, PIN_MASK_ALL);
    }

    #[test]
    fn set_pins_packet_shape() {
        let pkt = set_pins_packet(0x14);
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_OUT | 0x14);
        assert_eq!(pkt[2], UIO_STM_END);
    }

    #[test]
    fn read_pins_packet_shape() {
        let pkt = read_pins_packet();
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_IN | UIO_STM_END);
    }

    #[test]
    fn multi_out_packet_caps_transitions() {
        let many: Vec<u8> = (0..40).map(|i| (i as u8) & PIN_MASK_ALL).collect();
        let pkt = multi_out_packet(&many);
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[pkt.len() - 1], UIO_STM_END);
        assert!(pkt.len() <= 2 + MAX_TRANSITIONS_PER_PACKET);
    }

    #[test]
    fn drive_then_sample_packet_shape() {
        let pkt = drive_then_sample_packet(0x05);
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_OUT | 0x05);
        assert_eq!(pkt[2], UIO_STM_IN);
        assert_eq!(pkt[3], UIO_STM_END);
    }

    #[test]
    fn uio_port_set_direction_writes_packet() {
        let mut bus = MockBus::new();
        let mut port = UioPort::new(&mut bus);
        port.set_direction(0x09).unwrap();
        assert_eq!(bus.writes.len(), 1);
        assert_eq!(bus.writes[0], set_direction_packet(0x09));
    }

    #[test]
    fn uio_port_set_direction_caches_no_repeat_write() {
        let mut bus = MockBus::new();
        let mut port = UioPort::new(&mut bus);
        port.set_direction(0x09).unwrap();
        port.set_direction(0x09).unwrap();
        assert_eq!(
            bus.writes.len(),
            1,
            "should de-duplicate identical dir writes"
        );
    }

    #[test]
    fn uio_port_set_pin_preserves_others() {
        let mut bus = MockBus::new();
        let mut port = UioPort::new(&mut bus);
        port.set_direction(PIN_MASK_ALL).unwrap();
        port.set_pins(0x05).unwrap();
        port.set_pin(3, true).unwrap();
        let last = bus.writes.last().unwrap();
        assert_eq!(last[1] & 0x3F, 0x0D, "pin 3 set should preserve bits 0+2");
    }

    #[test]
    fn uio_port_read_pins_consumes_reply() {
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x2A]);
        let mut port = UioPort::new(&mut bus);
        let r = port.read_pins().unwrap();
        assert_eq!(r, 0x2A & PIN_MASK_ALL);
    }

    #[test]
    fn uio_port_drive_then_sample_round_trips() {
        let mut bus = MockBus::new();
        bus.queue_read(vec![0x11]);
        let mut port = UioPort::new(&mut bus);
        let r = port.drive_then_sample(0x06).unwrap();
        assert_eq!(r, 0x11);
        let pkt = bus.writes.last().unwrap();
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_OUT | 0x06);
        assert_eq!(pkt[2], UIO_STM_IN);
    }

    #[test]
    fn uio_port_stream_out_splits_oversized() {
        let mut bus = MockBus::new();
        let mut port = UioPort::new(&mut bus);
        let states: Vec<u8> = (0..70).map(|i| (i & 0x3F) as u8).collect();
        port.stream_out(&states).unwrap();
        // 70 transitions / 28-per-packet = 3 packets
        assert_eq!(bus.writes.len(), 3);
    }

    #[test]
    fn uio_port_pulse_clock_emits_low_high_low() {
        let mut bus = MockBus::new();
        let mut port = UioPort::new(&mut bus);
        port.set_direction(PIN_MASK_ALL).unwrap();
        port.set_pins(0x00).unwrap();
        port.pulse_clock(0).unwrap();
        // Last write should be a multi_out_packet of 3 transitions:
        // low (0x00), high (0x01), low (0x00)
        let pkt = bus.writes.last().unwrap();
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1] & 0x3F, 0x00);
        assert_eq!(pkt[2] & 0x3F, 0x01);
        assert_eq!(pkt[3] & 0x3F, 0x00);
    }
}
