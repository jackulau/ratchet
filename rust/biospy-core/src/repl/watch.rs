// SPI status-register watch state machine. Ports src/repl/watch.ts (state portion).
// The TTY rendering loop is the CLI's job (D18).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct StatusBits {
    pub sr1: u8,
    pub sr2: u8,
    pub sr3: u8,
}

/// Annotated bit layout for SR1. The bit numbering matches Winbond W25Q-family chips.
pub const SR1_BITS: &[(u8, &str, &str)] = &[
    (0, "WIP", "Write In Progress"),
    (1, "WEL", "Write Enable Latch"),
    (2, "BP0", "Block Protect 0"),
    (3, "BP1", "Block Protect 1"),
    (4, "BP2", "Block Protect 2"),
    (5, "TB", "Top/Bottom"),
    (6, "SEC", "Sector/Block"),
    (7, "SRP0", "Status Reg Protect"),
];

#[derive(Debug)]
pub struct RegisterWatchState {
    pub prev: Option<StatusBits>,
    pub poll_count: u32,
    pub change_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WatchEvent {
    Initial(StatusBits),
    Changed {
        from: StatusBits,
        to: StatusBits,
        changed_bits_sr1: Vec<u8>,
    },
    Unchanged(StatusBits),
}

impl RegisterWatchState {
    pub fn new() -> Self {
        Self {
            prev: None,
            poll_count: 0,
            change_count: 0,
        }
    }

    pub fn on_poll(&mut self, sr: StatusBits) -> WatchEvent {
        self.poll_count += 1;
        let event = match self.prev {
            None => WatchEvent::Initial(sr),
            Some(p) if p == sr => WatchEvent::Unchanged(sr),
            Some(p) => {
                self.change_count += 1;
                let mut changed: Vec<u8> = Vec::new();
                for bit in 0..8u8 {
                    if (p.sr1 >> bit) & 1 != (sr.sr1 >> bit) & 1 {
                        changed.push(bit);
                    }
                }
                WatchEvent::Changed {
                    from: p,
                    to: sr,
                    changed_bits_sr1: changed,
                }
            }
        };
        self.prev = Some(sr);
        event
    }
}

impl Default for RegisterWatchState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_poll_is_initial_event() {
        let mut w = RegisterWatchState::new();
        let e = w.on_poll(StatusBits {
            sr1: 0,
            sr2: 0,
            sr3: 0,
        });
        assert!(matches!(e, WatchEvent::Initial(_)));
        assert_eq!(w.change_count, 0);
        assert_eq!(w.poll_count, 1);
    }

    #[test]
    fn unchanged_returns_unchanged_event() {
        let mut w = RegisterWatchState::new();
        w.on_poll(StatusBits {
            sr1: 1,
            sr2: 0,
            sr3: 0,
        });
        let e = w.on_poll(StatusBits {
            sr1: 1,
            sr2: 0,
            sr3: 0,
        });
        assert!(matches!(e, WatchEvent::Unchanged(_)));
        assert_eq!(w.change_count, 0);
    }

    #[test]
    fn change_reports_diff_bits() {
        let mut w = RegisterWatchState::new();
        w.on_poll(StatusBits {
            sr1: 0b0000_0001,
            sr2: 0,
            sr3: 0,
        }); // WIP
        let e = w.on_poll(StatusBits {
            sr1: 0b0000_0011,
            sr2: 0,
            sr3: 0,
        }); // WIP+WEL
        match e {
            WatchEvent::Changed {
                changed_bits_sr1, ..
            } => {
                assert_eq!(changed_bits_sr1, vec![1]); // bit 1 = WEL flipped
            }
            _ => panic!("expected Changed"),
        }
        assert_eq!(w.change_count, 1);
    }

    #[test]
    fn change_reports_multiple_bits() {
        let mut w = RegisterWatchState::new();
        w.on_poll(StatusBits {
            sr1: 0x00,
            sr2: 0,
            sr3: 0,
        });
        let e = w.on_poll(StatusBits {
            sr1: 0b1100_0001,
            sr2: 0,
            sr3: 0,
        });
        match e {
            WatchEvent::Changed {
                changed_bits_sr1, ..
            } => {
                assert_eq!(changed_bits_sr1, vec![0, 6, 7]);
            }
            _ => panic!("expected Changed"),
        }
    }

    #[test]
    fn bit_table_covers_all_8_bits() {
        assert_eq!(SR1_BITS.len(), 8);
        let names: Vec<&str> = SR1_BITS.iter().map(|(_, n, _)| *n).collect();
        assert!(names.contains(&"WIP"));
        assert!(names.contains(&"SRP0"));
    }
}
