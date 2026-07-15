// SPI integrity analysis  -  pattern classification + recommendation.
// Ports src/diagnostics/spi-integrity.ts.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpiReading {
    pub jedec_id: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpiPattern {
    Stable,
    Intermittent,
    Noisy,
    Dead,
    NoChip,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpiIntegrityReport {
    pub score: u32,
    pub pattern: SpiPattern,
    pub readings: Vec<SpiReading>,
    #[serde(rename = "uniqueIds")]
    pub unique_ids: Vec<String>,
    #[serde(rename = "dominantId")]
    pub dominant_id: String,
    #[serde(rename = "dominantCount")]
    pub dominant_count: u32,
    #[serde(rename = "totalReads")]
    pub total_reads: u32,
    pub recommendation: String,
    #[serde(rename = "statusRegisterConsistent")]
    pub status_register_consistent: bool,
}

/// How a dead SPI bus is failing — distinguished by what MISO returns when the
/// JEDEC ID (0x9F) command gets no real answer from a chip.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeadBusKind {
    /// Every byte reads 0x00 — MISO stuck low.
    StuckLow,
    /// Every byte reads 0xFF — MISO floating / pulled high.
    FloatingHigh,
}

/// Classify a single JEDEC read: `Some(kind)` when the bus is electrically dead
/// (no chip answered), `None` when the ID looks like a live response.
pub fn classify_dead_bus(jedec_hex: &str) -> Option<DeadBusKind> {
    match jedec_hex {
        "000000" => Some(DeadBusKind::StuckLow),
        "ffffff" | "FFFFFF" => Some(DeadBusKind::FloatingHigh),
        _ => None,
    }
}

/// Physical-layer guidance for a dead bus — what to check, in likelihood order.
/// Written for the SOIC-clip / in-circuit case, the way this failure is
/// actually hit in the field.
pub fn dead_bus_hint(kind: DeadBusKind) -> &'static str {
    match kind {
        DeadBusKind::StuckLow => {
            "SPI bus reads all-zero (MISO stuck low). Check, in order: (1) PACKAGE vs TOOL — a \
             leadless chip (WSON / QFN / USON / DFN: flat pads on the underside, no gull-wing \
             legs) CANNOT be contacted by a SOIC spring clip; it needs a WSON/QFN socket or a \
             soldered breakout board. A SOIC clip only grips the legs of an SOP/SOIC package; \
             (2) chip has no power — if reading in-circuit, the board must be fully unplugged \
             (PSU off + CMOS battery out) so the programmer's supply isn't drained by the rest \
             of the board; measure VCC at the chip (0V = adapter not powering it); (3) SOIC clip \
             misaligned or loose — reseat square, verify pin-1 (red wire) on the chip's dot; \
             (4) 1.8V-family chip on a 3.3V programmer — needs a 1.8V adapter (and ~3.3V measured \
             on a 1.8V part is over-voltage, unplug now); (5) another device holding the bus — \
             try 'ratchet monitor' to watch stability while adjusting. \
             Discriminator: a PERFECTLY STABLE all-zero (same value every read) is no contact / \
             no power / wrong package, NOT a loose clip — a loose clip gives VARYING reads. If \
             it stays all-zero even with NO chip attached, the MISO path itself is broken in the \
             adapter/clip/ZIF stack — test each junction before blaming the chip"
        }
        DeadBusKind::FloatingHigh => {
            "SPI bus reads all-ones (MISO floating high). Check: (1) clip not making contact — \
             reseat it; (2) clip rotated 180° — pin-1 (red wire) must sit on the chip's dot; \
             (3) chip unpowered; run 'ratchet monitor' to watch stability while adjusting"
        }
    }
}

pub fn analyze_spi_readings(readings: Vec<SpiReading>) -> SpiIntegrityReport {
    if readings.is_empty() {
        return SpiIntegrityReport {
            score: 0,
            pattern: SpiPattern::NoChip,
            readings: vec![],
            unique_ids: vec![],
            dominant_id: String::new(),
            dominant_count: 0,
            total_reads: 0,
            recommendation: "No readings  -  check programmer connection".to_string(),
            status_register_consistent: false,
        };
    }

    let mut counts: HashMap<String, u32> = HashMap::new();
    for r in &readings {
        *counts.entry(r.jedec_id.clone()).or_insert(0) += 1;
    }
    let unique_ids: Vec<String> = counts.keys().cloned().collect();
    let (dominant_id, dominant_count) = counts
        .iter()
        .max_by_key(|(_, c)| **c)
        .map(|(k, c)| (k.clone(), *c))
        .unwrap_or_default();

    let total_reads = readings.len() as u32;
    let score = ((dominant_count as f64 / total_reads as f64) * 100.0).round() as u32;

    let pattern = if dominant_id == "000000" || dominant_id == "ffffff" {
        SpiPattern::Dead
    } else if score == 100 {
        SpiPattern::Stable
    } else if score >= 80 {
        SpiPattern::Intermittent
    } else {
        SpiPattern::Noisy
    };
    // Score means connection QUALITY, not read consistency: a dead bus reads
    // 0x000000 with perfect consistency, but 100% next to "Dead" is a lie.
    let score = if pattern == SpiPattern::Dead {
        0
    } else {
        score
    };

    let recommendation: String = match pattern {
        SpiPattern::Dead => "All reads identical (0x000000 or 0xFFFFFF)  -  no chip responding. \
             A PERFECTLY STABLE dead value is not a loose clip (that gives varying reads): it means \
             no contact at all, no power, or a package/tool mismatch. Check: \
             (1) PACKAGE vs TOOL  -  a leadless chip (WSON/QFN/USON/DFN: flat pads underneath, no legs) \
             CANNOT be read with a SOIC spring clip; it needs a WSON/QFN socket or a soldered breakout board; \
             (2) chip power  -  measure VCC at the chip (want the chip's rated voltage, e.g. 1.8V for a JW/JV-W part); \
             0V means the adapter isn't delivering power, ~3.3V on a 1.8V part is over-voltage, unplug now; \
             (3) SOIC clip seating and pin-1 (red wire) alignment through EVERY layer of the stack; \
             (4) programmer is powered and the right voltage adapter is fitted."
            .to_string(),
        _ if score >= 95 => "Connection is solid. Safe to proceed with read/write operations.".to_string(),
        _ if score >= 80 => "Connection is marginal  -  some reads are inconsistent. Reseat the SOIC clip and ensure firm pressure on all 8 pins. Avoid touching the clip during operations.".to_string(),
        _ if score >= 50 => "Connection is unreliable  -  too many inconsistent reads. Do NOT attempt write operations. Fix the physical connection first: clean chip pads, check clip spring tension, try a different clip or use a ZIF socket.".to_string(),
        _ => "Connection is very poor or no chip present. Check all physical connections, verify chip is correct type, and ensure programmer is working (try 'ratchet monitor').".to_string(),
    };

    SpiIntegrityReport {
        score,
        pattern,
        readings,
        unique_ids,
        dominant_id,
        dominant_count,
        total_reads,
        recommendation,
        status_register_consistent: true,
    }
}

pub fn format_score_bar(score: u32) -> String {
    let filled = ((score as f64) / 5.0).round() as usize;
    let empty = 20usize.saturating_sub(filled);
    format!("[{}{}] {score}%", "█".repeat(filled), "░".repeat(empty))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(id: &str) -> SpiReading {
        SpiReading {
            jedec_id: id.to_string(),
            timestamp: 0,
        }
    }

    #[test]
    fn classify_dead_bus_distinguishes_stuck_low_and_floating_high() {
        assert_eq!(classify_dead_bus("000000"), Some(DeadBusKind::StuckLow));
        assert_eq!(classify_dead_bus("ffffff"), Some(DeadBusKind::FloatingHigh));
        assert_eq!(classify_dead_bus("FFFFFF"), Some(DeadBusKind::FloatingHigh));
        assert_eq!(classify_dead_bus("ef4017"), None);
        assert_eq!(classify_dead_bus("c22016"), None);
    }

    #[test]
    fn dead_bus_hints_are_actionable_and_distinct() {
        let low = dead_bus_hint(DeadBusKind::StuckLow);
        let high = dead_bus_hint(DeadBusKind::FloatingHigh);
        assert!(low.contains("all-zero"));
        assert!(low.contains("CMOS battery"));
        assert!(low.contains("1.8V"));
        // Leadless-package mismatch is the class of failure the hint silently
        // omitted; a SOIC clip cannot read a WSON/QFN part. Keep it named.
        assert!(low.contains("WSON"));
        assert!(low.contains("leadless"));
        // Stable-vs-varying is the discriminator that actually separates
        // no-contact from a loose clip.
        assert!(low.contains("VARYING"));
        assert!(high.contains("all-ones"));
        assert!(high.contains("pin-1"));
        assert_ne!(low, high);
    }

    #[test]
    fn empty_readings_report_no_chip() {
        let r = analyze_spi_readings(vec![]);
        assert_eq!(r.pattern, SpiPattern::NoChip);
        assert_eq!(r.score, 0);
    }

    #[test]
    fn all_matching_reads_yield_stable() {
        let r = analyze_spi_readings(vec![reading("ef4017"); 10]);
        assert_eq!(r.pattern, SpiPattern::Stable);
        assert_eq!(r.score, 100);
        assert!(r.recommendation.contains("Connection is solid"));
    }

    #[test]
    fn mostly_matching_yields_intermittent() {
        let mut v = vec![reading("ef4017"); 9];
        v.push(reading("ab1234"));
        let r = analyze_spi_readings(v);
        assert_eq!(r.pattern, SpiPattern::Intermittent);
        assert_eq!(r.score, 90);
    }

    #[test]
    fn mixed_reads_yield_noisy() {
        let mut v = vec![reading("ef4017"); 5];
        v.extend(vec![reading("ab1234"); 5]);
        let r = analyze_spi_readings(v);
        assert_eq!(r.pattern, SpiPattern::Noisy);
        assert_eq!(r.score, 50);
    }

    #[test]
    fn all_zero_yields_dead() {
        let r = analyze_spi_readings(vec![reading("000000"); 10]);
        assert_eq!(r.pattern, SpiPattern::Dead);
        assert!(r.recommendation.contains("no chip responding"));
        // The dead-bus advice must name the leadless-package trap and the
        // stable-vs-varying discriminator, not just say "reseat the clip".
        assert!(r.recommendation.contains("WSON"));
        assert!(r.recommendation.contains("STABLE"));
        // Dead bus = zero connection quality, even though reads are consistent.
        assert_eq!(r.score, 0);
    }

    #[test]
    fn all_ff_yields_dead() {
        let r = analyze_spi_readings(vec![reading("ffffff"); 10]);
        assert_eq!(r.pattern, SpiPattern::Dead);
        assert_eq!(r.score, 0);
    }

    #[test]
    fn dominant_id_is_most_common() {
        let mut v = vec![reading("ef4017"); 7];
        v.extend(vec![reading("ab1234"); 3]);
        let r = analyze_spi_readings(v);
        assert_eq!(r.dominant_id, "ef4017");
        assert_eq!(r.dominant_count, 7);
        assert_eq!(r.unique_ids.len(), 2);
    }

    #[test]
    fn score_bar_renders_filled_and_empty() {
        let s = format_score_bar(50);
        assert!(s.contains("50%"));
        // 50% → 10 filled + 10 empty out of 20.
        assert_eq!(s.matches('█').count(), 10);
        assert_eq!(s.matches('░').count(), 10);
    }

    #[test]
    fn score_bar_at_extremes() {
        let zero = format_score_bar(0);
        assert!(zero.contains("0%"));
        let hundred = format_score_bar(100);
        assert!(hundred.contains("100%"));
    }
}
