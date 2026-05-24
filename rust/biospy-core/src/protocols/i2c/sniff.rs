// Passive I2C bus sniffer (listen-only).
//
// Decodes a captured (timestamp, SCL, SDA) line trace into I2C transactions:
//   * START condition  (SDA falls while SCL is high)
//   * STOP condition   (SDA rises while SCL is high)
//   * Byte             (8 bits clocked on rising SCL edges) + ACK/NACK bit
//   * Repeated START   (START without an intervening STOP)
//
// This is pure decoder logic — no I/O. Capture-side code (logic analyzer in
// D23) supplies the trace; the decoder is also reusable against external
// captures (Saleae CSV, sigrok exports, etc.).
//
// Sample-rate caveat: the trace must sample faster than 2× the bus clock to
// reliably detect both edges. At CH341A's ~6 MS/s ceiling that gives clean
// decode up to ~400 kHz I2C.

use serde::Serialize;

/// Single SCL/SDA sample captured at a known timestamp.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct LineSample {
    pub t_us: u64,
    pub scl: bool,
    pub sda: bool,
}

/// One decoded I2C-bus event.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum I2cEvent {
    Start {
        t_us: u64,
    },
    RepeatedStart {
        t_us: u64,
    },
    Stop {
        t_us: u64,
    },
    /// Address byte (7-bit + R/W bit) + ACK polarity.
    Address {
        t_us: u64,
        addr7: u8,
        read: bool,
        acked: bool,
    },
    /// Data byte + ACK polarity.
    Data {
        t_us: u64,
        byte: u8,
        acked: bool,
    },
    /// Decoder hit something unexpected mid-transaction.
    Error {
        t_us: u64,
        msg: String,
    },
}

/// Stateful decoder. Feed it samples chronologically.
pub struct I2cDecoder {
    last: Option<LineSample>,
    in_transaction: bool,
    bit_buf: u8,
    bit_count: u8,
    is_address_phase: bool,
    pending_byte: Option<(u8, u64)>,
    pub events: Vec<I2cEvent>,
}

impl Default for I2cDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl I2cDecoder {
    pub fn new() -> Self {
        Self {
            last: None,
            in_transaction: false,
            bit_buf: 0,
            bit_count: 0,
            is_address_phase: false,
            pending_byte: None,
            events: Vec::new(),
        }
    }

    /// Feed one sample. Decoder emits zero or more events into `self.events`.
    pub fn push(&mut self, s: LineSample) {
        let Some(prev) = self.last else {
            self.last = Some(s);
            return;
        };

        // START / STOP detection: SDA transitions while SCL is high.
        if s.scl && prev.scl {
            if prev.sda && !s.sda {
                // SDA fell while SCL high → START or repeated START.
                if self.in_transaction {
                    self.events.push(I2cEvent::RepeatedStart { t_us: s.t_us });
                } else {
                    self.events.push(I2cEvent::Start { t_us: s.t_us });
                }
                self.in_transaction = true;
                self.bit_buf = 0;
                self.bit_count = 0;
                self.is_address_phase = true;
                self.pending_byte = None;
                self.last = Some(s);
                return;
            } else if !prev.sda && s.sda {
                self.events.push(I2cEvent::Stop { t_us: s.t_us });
                self.in_transaction = false;
                self.bit_buf = 0;
                self.bit_count = 0;
                self.pending_byte = None;
                self.last = Some(s);
                return;
            }
        }

        // Bit sampling: SCL rising edge captures SDA.
        if !prev.scl && s.scl && self.in_transaction {
            if let Some((byte, byte_t)) = self.pending_byte.take() {
                // This rising edge is the ACK/NACK bit (9th edge of the byte).
                let acked = !s.sda; // SDA low = ACK.
                if self.is_address_phase {
                    let addr7 = byte >> 1;
                    let read = byte & 0x01 != 0;
                    self.events.push(I2cEvent::Address {
                        t_us: byte_t,
                        addr7,
                        read,
                        acked,
                    });
                    self.is_address_phase = false;
                } else {
                    self.events.push(I2cEvent::Data {
                        t_us: byte_t,
                        byte,
                        acked,
                    });
                }
            } else {
                self.bit_buf = (self.bit_buf << 1) | (s.sda as u8);
                self.bit_count += 1;
                if self.bit_count == 8 {
                    self.pending_byte = Some((self.bit_buf, s.t_us));
                    self.bit_buf = 0;
                    self.bit_count = 0;
                }
            }
        }

        self.last = Some(s);
    }

    pub fn finish(mut self) -> Vec<I2cEvent> {
        if self.in_transaction {
            let t = self.last.map(|s| s.t_us).unwrap_or(0);
            self.events.push(I2cEvent::Error {
                t_us: t,
                msg: "trace ended mid-transaction (no STOP)".into(),
            });
        }
        self.events
    }
}

/// Convenience: decode an entire trace in one call.
pub fn decode_trace(samples: &[LineSample]) -> Vec<I2cEvent> {
    let mut d = I2cDecoder::new();
    for s in samples {
        d.push(*s);
    }
    d.finish()
}

// ─── Synthesizer for tests + future replay ─────────────────────────────────

/// Build a synthesized line-trace that emits a write transaction to `addr7`
/// with `data` payload, followed by STOP. Uses simplified 4-sample-per-bit
/// resolution: (clock low+SDA prep, clock low+SDA settle, clock rises, clock falls).
pub fn synth_write(addr7: u8, data: &[u8]) -> Vec<LineSample> {
    let mut out = Vec::new();
    let mut t = 0u64;

    let sample = |t: u64, scl, sda, out: &mut Vec<LineSample>| {
        out.push(LineSample { t_us: t, scl, sda });
    };

    // Idle high.
    sample(t, true, true, &mut out);
    t += 1;
    // START: SDA falls while SCL high.
    sample(t, true, false, &mut out);
    t += 1;
    // SCL falls.
    sample(t, false, false, &mut out);
    t += 1;

    let send_byte = |byte: u8, t: &mut u64, out: &mut Vec<LineSample>| {
        for i in 0..8 {
            let bit = (byte >> (7 - i)) & 1 != 0;
            // SCL low, SDA = bit
            sample(*t, false, bit, out);
            *t += 1;
            // SCL rises (this is where decoder samples).
            sample(*t, true, bit, out);
            *t += 1;
            // SCL falls.
            sample(*t, false, bit, out);
            *t += 1;
        }
        // ACK bit (slave pulls SDA low).
        sample(*t, false, false, out);
        *t += 1;
        sample(*t, true, false, out);
        *t += 1;
        sample(*t, false, false, out);
        *t += 1;
    };

    send_byte(addr7 << 1, &mut t, &mut out);
    for b in data {
        send_byte(*b, &mut t, &mut out);
    }

    // STOP: SCL high, then SDA rises.
    sample(t, false, false, &mut out);
    t += 1;
    sample(t, true, false, &mut out);
    t += 1;
    sample(t, true, true, &mut out);

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_simple_write() {
        let trace = synth_write(0x50, &[0xAB]);
        let events = decode_trace(&trace);
        // Expect: Start, Address(0x50, write, acked), Data(0xAB, acked), Stop.
        assert!(matches!(events[0], I2cEvent::Start { .. }));
        match &events[1] {
            I2cEvent::Address {
                addr7, read, acked, ..
            } => {
                assert_eq!(*addr7, 0x50);
                assert!(!*read);
                assert!(*acked);
            }
            other => panic!("expected address, got {other:?}"),
        }
        match &events[2] {
            I2cEvent::Data { byte, acked, .. } => {
                assert_eq!(*byte, 0xAB);
                assert!(*acked);
            }
            other => panic!("expected data, got {other:?}"),
        }
        assert!(matches!(events.last().unwrap(), I2cEvent::Stop { .. }));
    }

    #[test]
    fn decode_multi_byte_write() {
        let trace = synth_write(0x68, &[0x10, 0x20, 0x30]);
        let events = decode_trace(&trace);
        let data_count = events
            .iter()
            .filter(|e| matches!(e, I2cEvent::Data { .. }))
            .count();
        assert_eq!(data_count, 3);
    }

    #[test]
    fn unterminated_trace_emits_error() {
        let mut trace = synth_write(0x50, &[0xAB]);
        // Truncate to remove the trailing STOP samples.
        trace.truncate(trace.len() - 3);
        let events = decode_trace(&trace);
        assert!(events.iter().any(|e| matches!(e, I2cEvent::Error { .. })));
    }

    #[test]
    fn idle_bus_produces_no_events() {
        let trace = vec![
            LineSample {
                t_us: 0,
                scl: true,
                sda: true,
            },
            LineSample {
                t_us: 1,
                scl: true,
                sda: true,
            },
            LineSample {
                t_us: 2,
                scl: true,
                sda: true,
            },
        ];
        let events = decode_trace(&trace);
        assert!(events.is_empty());
    }

    #[test]
    fn read_bit_in_address_is_decoded() {
        // Manually craft a read transaction (addr | 1).
        let mut trace = vec![LineSample {
            t_us: 0,
            scl: true,
            sda: true,
        }];
        let mut t = 1u64;
        // START
        trace.push(LineSample {
            t_us: t,
            scl: true,
            sda: false,
        });
        t += 1;
        trace.push(LineSample {
            t_us: t,
            scl: false,
            sda: false,
        });
        t += 1;
        // Send address byte: 0x50<<1 | 1 = 0xA1
        let byte = 0xA1u8;
        for i in 0..8 {
            let bit = (byte >> (7 - i)) & 1 != 0;
            trace.push(LineSample {
                t_us: t,
                scl: false,
                sda: bit,
            });
            t += 1;
            trace.push(LineSample {
                t_us: t,
                scl: true,
                sda: bit,
            });
            t += 1;
            trace.push(LineSample {
                t_us: t,
                scl: false,
                sda: bit,
            });
            t += 1;
        }
        // ACK = low
        trace.push(LineSample {
            t_us: t,
            scl: false,
            sda: false,
        });
        t += 1;
        trace.push(LineSample {
            t_us: t,
            scl: true,
            sda: false,
        });
        t += 1;
        trace.push(LineSample {
            t_us: t,
            scl: false,
            sda: false,
        });
        t += 1;
        // STOP
        trace.push(LineSample {
            t_us: t,
            scl: false,
            sda: false,
        });
        t += 1;
        trace.push(LineSample {
            t_us: t,
            scl: true,
            sda: false,
        });
        t += 1;
        trace.push(LineSample {
            t_us: t,
            scl: true,
            sda: true,
        });

        let events = decode_trace(&trace);
        match &events[1] {
            I2cEvent::Address { addr7, read, .. } => {
                assert_eq!(*addr7, 0x50);
                assert!(*read);
            }
            other => panic!("expected read address, got {other:?}"),
        }
    }
}
