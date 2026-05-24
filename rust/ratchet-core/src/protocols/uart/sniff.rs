// Passive UART sniffer.
//
// Decodes a captured line trace into framed byte events. Supports two
// channels concurrently (typical use: tap TX from device-A and TX from
// device-B simultaneously, time-correlated).
//
// Decoder is sample-rate-agnostic; caller supplies samples-per-bit so the
// decoder knows how many samples constitute one bit period.

use super::master::{Parity, StopBits, UartConfig};
use serde::Serialize;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum UartChannel {
    A,
    B,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct UartEvent {
    pub t_us: u64,
    pub channel: UartChannel,
    pub byte: u8,
    pub parity_ok: bool,
    pub framing_ok: bool,
}

// Need to make UartChannel Serialize-able too.
impl Serialize for UartChannel {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        match self {
            UartChannel::A => s.serialize_str("A"),
            UartChannel::B => s.serialize_str("B"),
        }
    }
}

/// One sample of one channel: the line level at `t_us`.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct UartSample {
    pub t_us: u64,
    pub level: bool,
}

pub struct UartDecoder {
    cfg: UartConfig,
    samples_per_bit: u32,
    channel: UartChannel,
    pub events: Vec<UartEvent>,
}

impl UartDecoder {
    pub fn new(cfg: UartConfig, samples_per_bit: u32, channel: UartChannel) -> Self {
        Self {
            cfg,
            samples_per_bit,
            channel,
            events: Vec::new(),
        }
    }

    /// Decode an entire channel trace. Caller passes pre-sampled levels at
    /// uniform `samples_per_bit` granularity. Decoder walks the trace
    /// looking for falling edges (start bit) and frames data thereafter.
    pub fn decode(&mut self, samples: &[UartSample]) {
        if samples.is_empty() {
            return;
        }
        let mid_offset = self.samples_per_bit / 2;
        let mut i = 0;
        while i < samples.len() {
            // Find next falling edge (idle high → start bit low).
            if i > 0 && samples[i - 1].level && !samples[i].level {
                let start_t = samples[i].t_us;
                let mid_start = i as u32 + mid_offset;

                // Sample mid-start-bit  -  should still be low.
                let s = mid_start as usize;
                if s >= samples.len() || samples[s].level {
                    i += 1;
                    continue; // glitch, not a real start.
                }

                let parity_present = !matches!(self.cfg.parity, Parity::None);
                let frame_bits = 1
                    + self.cfg.data_bits as u32
                    + parity_present as u32
                    + match self.cfg.stop_bits {
                        StopBits::One => 1,
                        StopBits::OnePointFive => 1,
                        StopBits::Two => 2,
                    };
                let last_sample_idx =
                    i as u32 + mid_offset + (frame_bits - 1) * self.samples_per_bit;
                if last_sample_idx as usize >= samples.len() {
                    break;
                }

                // Read data bits (LSB first).
                let mut byte = 0u8;
                for b in 0..self.cfg.data_bits {
                    let pos =
                        (i as u32 + mid_offset + (1 + b as u32) * self.samples_per_bit) as usize;
                    if samples[pos].level {
                        byte |= 1u8 << b;
                    }
                }

                // Parity check.
                let parity_ok = if let Parity::None = self.cfg.parity {
                    true
                } else {
                    let pos = (i as u32
                        + mid_offset
                        + (1 + self.cfg.data_bits as u32) * self.samples_per_bit)
                        as usize;
                    let got = samples[pos].level;
                    let expected = self.cfg.parity.bit_for(byte, self.cfg.data_bits).unwrap();
                    got == expected
                };

                // Stop bit check (first stop must be high).
                let stop_pos = (i as u32
                    + mid_offset
                    + (1 + self.cfg.data_bits as u32 + parity_present as u32)
                        * self.samples_per_bit) as usize;
                let framing_ok = samples[stop_pos].level;

                self.events.push(UartEvent {
                    t_us: start_t,
                    channel: self.channel,
                    byte,
                    parity_ok,
                    framing_ok,
                });

                // Skip past the whole frame.
                i += (frame_bits * self.samples_per_bit) as usize;
                continue;
            }
            i += 1;
        }
    }
}

/// Convenience: decode one channel in one call.
pub fn decode_channel(
    cfg: UartConfig,
    samples_per_bit: u32,
    channel: UartChannel,
    samples: &[UartSample],
) -> Vec<UartEvent> {
    let mut d = UartDecoder::new(cfg, samples_per_bit, channel);
    d.decode(samples);
    d.events
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocols::uart::master::encode_frame;

    /// Synthesize a UART line trace at `samples_per_bit` granularity for a
    /// known byte stream.
    fn synth(bytes: &[u8], cfg: UartConfig, samples_per_bit: u32) -> Vec<UartSample> {
        let mut out = Vec::new();
        let mut t = 0u64;
        // Idle high for some samples.
        for _ in 0..samples_per_bit {
            out.push(UartSample {
                t_us: t,
                level: true,
            });
            t += 1;
        }
        for &b in bytes {
            let bits = encode_frame(b, cfg);
            for bit in bits {
                for _ in 0..samples_per_bit {
                    out.push(UartSample {
                        t_us: t,
                        level: bit,
                    });
                    t += 1;
                }
            }
            // Inter-byte idle.
            for _ in 0..samples_per_bit {
                out.push(UartSample {
                    t_us: t,
                    level: true,
                });
                t += 1;
            }
        }
        out
    }

    #[test]
    fn decode_single_byte_8n1() {
        let cfg = UartConfig::standard_8n1(9600);
        let trace = synth(&[0x55], cfg, 4);
        let events = decode_channel(cfg, 4, UartChannel::A, &trace);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].byte, 0x55);
        assert!(events[0].parity_ok);
        assert!(events[0].framing_ok);
    }

    #[test]
    fn decode_multi_byte_stream() {
        let cfg = UartConfig::standard_8n1(9600);
        let bytes = b"Hello";
        let trace = synth(bytes, cfg, 4);
        let events = decode_channel(cfg, 4, UartChannel::A, &trace);
        assert_eq!(events.len(), bytes.len());
        for (i, b) in bytes.iter().enumerate() {
            assert_eq!(events[i].byte, *b);
        }
    }

    #[test]
    fn decode_with_even_parity() {
        let mut cfg = UartConfig::standard_8n1(9600);
        cfg.parity = Parity::Even;
        let trace = synth(&[0x42], cfg, 4);
        let events = decode_channel(cfg, 4, UartChannel::A, &trace);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].byte, 0x42);
        assert!(events[0].parity_ok);
    }

    #[test]
    fn channel_tag_round_trips() {
        let cfg = UartConfig::standard_8n1(9600);
        let trace = synth(&[0x01], cfg, 4);
        let events = decode_channel(cfg, 4, UartChannel::B, &trace);
        assert_eq!(events[0].channel, UartChannel::B);
    }

    #[test]
    fn idle_line_emits_nothing() {
        let cfg = UartConfig::standard_8n1(9600);
        let trace: Vec<_> = (0..100u64)
            .map(|t| UartSample {
                t_us: t,
                level: true,
            })
            .collect();
        let events = decode_channel(cfg, 4, UartChannel::A, &trace);
        assert!(events.is_empty());
    }
}
