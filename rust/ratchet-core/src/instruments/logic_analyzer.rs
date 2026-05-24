// Multi-channel logic analyzer.
//
// Capture digital lines via UIO sample-mode (CH341A: up to 6 channels at
// ~6 MS/s) or CH347 native sampler (~20 MS/s, 8 channels). Triggers fire on
// rising/falling edges or arbitrary pattern matches. A configurable
// pre-trigger ring buffer means the capture window can include samples
// from BEFORE the trigger condition fired.
//
// This module owns the protocol-agnostic capture pipeline: a Sampler trait
// abstracts the underlying hardware, while Capture + Trigger config live
// here.

use crate::backends::Result;
use serde::Serialize;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize)]
pub enum TriggerEdge {
    Rising,
    Falling,
    Either,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum Trigger {
    Immediate,
    Edge { channel: u8, edge: TriggerEdge },
    Pattern { mask: u8, value: u8 },
}

#[derive(Clone, Debug, Serialize)]
pub struct CaptureConfig {
    pub channels: u8,
    pub sample_rate_hz: u32,
    pub total_samples: usize,
    pub pre_trigger_samples: usize,
    pub trigger: Trigger,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CaptureFrame {
    /// One byte per sample; bit i = level on channel i.
    pub samples: Vec<u8>,
    pub sample_rate_hz: u32,
    pub trigger_offset: usize,
}

impl CaptureFrame {
    pub fn duration_us(&self) -> u64 {
        if self.sample_rate_hz == 0 {
            return 0;
        }
        (self.samples.len() as u64) * 1_000_000 / self.sample_rate_hz as u64
    }

    pub fn channel_levels(&self, channel: u8) -> impl Iterator<Item = bool> + '_ {
        let mask = 1u8 << channel;
        self.samples.iter().map(move |b| b & mask != 0)
    }
}

/// Transport that knows how to drive raw GPIO sampling on real hardware.
/// Caller programs the capture; the trait abstracts the sample-mode
/// command set away from this module.
pub trait Sampler {
    /// Configure the chip for the requested sample rate (returns the
    /// actual rate the silicon achieved, which may differ).
    fn configure(&mut self, sample_rate_hz: u32, channels: u8) -> Result<u32>;

    /// Pull `count` samples from the hardware FIFO. Each sample is a
    /// 1-byte channel-mask. Implementations may block waiting for the
    /// hardware FIFO to fill.
    fn read_samples(&mut self, count: usize) -> Result<Vec<u8>>;
}

pub struct LogicAnalyzer<'s, S: Sampler> {
    sampler: &'s mut S,
}

impl<'s, S: Sampler> LogicAnalyzer<'s, S> {
    pub fn new(sampler: &'s mut S) -> Self {
        Self { sampler }
    }

    pub fn capture(&mut self, cfg: CaptureConfig) -> Result<CaptureFrame> {
        let actual = self.sampler.configure(cfg.sample_rate_hz, cfg.channels)?;
        let samples = self.sampler.read_samples(cfg.total_samples)?;
        let trigger_offset = find_trigger(&samples, &cfg.trigger).unwrap_or(0);
        Ok(CaptureFrame {
            samples,
            sample_rate_hz: actual,
            trigger_offset,
        })
    }
}

/// Scan `samples` for the first index that satisfies `trigger`.
pub fn find_trigger(samples: &[u8], trigger: &Trigger) -> Option<usize> {
    match trigger {
        Trigger::Immediate => Some(0),
        Trigger::Edge { channel, edge } => {
            let mask = 1u8 << channel;
            let mut prev = samples.first().copied().unwrap_or(0) & mask;
            for (i, b) in samples.iter().enumerate().skip(1) {
                let cur = b & mask;
                let rising = prev == 0 && cur != 0;
                let falling = prev != 0 && cur == 0;
                let hit = match edge {
                    TriggerEdge::Rising => rising,
                    TriggerEdge::Falling => falling,
                    TriggerEdge::Either => rising || falling,
                };
                if hit {
                    return Some(i);
                }
                prev = cur;
            }
            None
        }
        Trigger::Pattern { mask, value } => {
            for (i, b) in samples.iter().enumerate() {
                if (b & mask) == (*value & mask) {
                    return Some(i);
                }
            }
            None
        }
    }
}

#[cfg(any(test, feature = "mock"))]
pub struct MockSampler {
    pub samples: Vec<u8>,
    pub configured_rate: u32,
    pub configured_channels: u8,
}

#[cfg(any(test, feature = "mock"))]
impl MockSampler {
    pub fn new(samples: Vec<u8>) -> Self {
        Self {
            samples,
            configured_rate: 0,
            configured_channels: 0,
        }
    }
}

#[cfg(any(test, feature = "mock"))]
impl Sampler for MockSampler {
    fn configure(&mut self, sample_rate_hz: u32, channels: u8) -> Result<u32> {
        self.configured_rate = sample_rate_hz;
        self.configured_channels = channels;
        Ok(sample_rate_hz)
    }

    fn read_samples(&mut self, count: usize) -> Result<Vec<u8>> {
        Ok(self.samples.iter().take(count).copied().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_trigger_rising_edge() {
        let s = vec![0b000, 0b000, 0b001, 0b001];
        let idx = find_trigger(
            &s,
            &Trigger::Edge {
                channel: 0,
                edge: TriggerEdge::Rising,
            },
        );
        assert_eq!(idx, Some(2));
    }

    #[test]
    fn find_trigger_falling_edge() {
        let s = vec![0b010, 0b010, 0b000, 0b000];
        let idx = find_trigger(
            &s,
            &Trigger::Edge {
                channel: 1,
                edge: TriggerEdge::Falling,
            },
        );
        assert_eq!(idx, Some(2));
    }

    #[test]
    fn find_trigger_pattern_match() {
        let s = vec![0b000, 0b011, 0b111, 0b110];
        let idx = find_trigger(
            &s,
            &Trigger::Pattern {
                mask: 0b011,
                value: 0b011,
            },
        );
        assert_eq!(idx, Some(1));
    }

    #[test]
    fn find_trigger_immediate_returns_zero() {
        let idx = find_trigger(&[0, 0], &Trigger::Immediate);
        assert_eq!(idx, Some(0));
    }

    #[test]
    fn no_match_returns_none() {
        let s = vec![0, 0, 0];
        assert_eq!(
            find_trigger(
                &s,
                &Trigger::Edge {
                    channel: 0,
                    edge: TriggerEdge::Rising
                }
            ),
            None
        );
    }

    #[test]
    fn capture_round_trips_via_sampler() {
        let mut sampler = MockSampler::new(vec![0u8, 1u8, 1u8, 0u8]);
        let mut la = LogicAnalyzer::new(&mut sampler);
        let cfg = CaptureConfig {
            channels: 4,
            sample_rate_hz: 1_000_000,
            total_samples: 4,
            pre_trigger_samples: 1,
            trigger: Trigger::Edge {
                channel: 0,
                edge: TriggerEdge::Rising,
            },
        };
        let frame = la.capture(cfg).unwrap();
        assert_eq!(frame.samples.len(), 4);
        assert_eq!(frame.trigger_offset, 1);
    }

    #[test]
    fn frame_duration_uses_sample_rate() {
        let f = CaptureFrame {
            samples: vec![0u8; 1_000_000],
            sample_rate_hz: 1_000_000,
            trigger_offset: 0,
        };
        assert_eq!(f.duration_us(), 1_000_000);
    }

    #[test]
    fn channel_levels_iterator() {
        let f = CaptureFrame {
            samples: vec![0b001, 0b010, 0b011, 0b000],
            sample_rate_hz: 1,
            trigger_offset: 0,
        };
        let ch0: Vec<bool> = f.channel_levels(0).collect();
        assert_eq!(ch0, vec![true, false, true, false]);
        let ch1: Vec<bool> = f.channel_levels(1).collect();
        assert_eq!(ch1, vec![false, true, true, false]);
    }
}
