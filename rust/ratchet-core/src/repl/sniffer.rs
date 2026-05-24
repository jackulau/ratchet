// SPI bus sniffer state machine  -  generates events from polled JEDEC IDs.
// The TTY loop driving this state lives in the CLI binary (D18).
// Ports src/repl/sniffer.ts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SnifferEvent {
    Initial {
        id: String,
        formatted: String,
    },
    Change {
        from: String,
        to: String,
        formatted: String,
    },
    Stable {
        id: String,
        poll_count: u32,
    },
    None,
}

#[derive(Debug)]
pub struct SpiSnifferState {
    pub last_id: String,
    pub poll_count: u32,
    pub change_count: u32,
    pub heartbeat_every: u32,
}

impl SpiSnifferState {
    pub fn new(heartbeat_every: u32) -> Self {
        Self {
            last_id: String::new(),
            poll_count: 0,
            change_count: 0,
            heartbeat_every: heartbeat_every.max(1),
        }
    }

    /// Process one JEDEC reading. Returns the event that should be logged.
    pub fn on_poll(&mut self, id: &str) -> SnifferEvent {
        self.poll_count += 1;
        if id != self.last_id {
            self.change_count += 1;
            let event = if self.last_id.is_empty() {
                SnifferEvent::Initial {
                    id: id.to_string(),
                    formatted: format_id(id),
                }
            } else {
                SnifferEvent::Change {
                    from: self.last_id.clone(),
                    to: id.to_string(),
                    formatted: format_id(id),
                }
            };
            self.last_id = id.to_string();
            event
        } else if self.poll_count % self.heartbeat_every == 0 {
            SnifferEvent::Stable {
                id: id.to_string(),
                poll_count: self.poll_count,
            }
        } else {
            SnifferEvent::None
        }
    }
}

pub fn format_id(id: &str) -> String {
    if id == "000000" || id == "ffffff" {
        "no chip".to_string()
    } else {
        id.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_poll_is_initial_event() {
        let mut s = SpiSnifferState::new(10);
        let e = s.on_poll("ef4017");
        assert!(matches!(e, SnifferEvent::Initial { .. }));
        assert_eq!(s.poll_count, 1);
        assert_eq!(s.change_count, 1);
    }

    #[test]
    fn unchanged_poll_returns_none_until_heartbeat() {
        let mut s = SpiSnifferState::new(5);
        s.on_poll("ef4017"); // initial
        for _ in 0..3 {
            assert!(matches!(s.on_poll("ef4017"), SnifferEvent::None));
        }
        // 5th total poll fires heartbeat.
        assert!(matches!(s.on_poll("ef4017"), SnifferEvent::Stable { .. }));
    }

    #[test]
    fn change_emits_change_event_and_increments_counter() {
        let mut s = SpiSnifferState::new(100);
        s.on_poll("ef4017");
        let e = s.on_poll("000000");
        match e {
            SnifferEvent::Change {
                from,
                to,
                formatted,
            } => {
                assert_eq!(from, "ef4017");
                assert_eq!(to, "000000");
                assert_eq!(formatted, "no chip");
            }
            _ => panic!("expected Change"),
        }
        assert_eq!(s.change_count, 2);
    }

    #[test]
    fn format_id_no_chip_for_invalid() {
        assert_eq!(format_id("000000"), "no chip");
        assert_eq!(format_id("ffffff"), "no chip");
        assert_eq!(format_id("ef4017"), "ef4017");
    }

    #[test]
    fn heartbeat_every_clamped_above_zero() {
        let s = SpiSnifferState::new(0);
        assert!(s.heartbeat_every >= 1);
    }
}
