// SPI integrity analysis — pattern classification + recommendation.
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
            recommendation: "No readings — check programmer connection".to_string(),
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

    let recommendation: String = match pattern {
        SpiPattern::Dead => "All reads return 0x000000 or 0xFFFFFF — no chip detected. Check: (1) SOIC clip seating on chip, (2) pin 1 alignment, (3) programmer is powered, (4) chip is a valid SPI flash.".to_string(),
        _ if score >= 95 => "Connection is solid. Safe to proceed with read/write operations.".to_string(),
        _ if score >= 80 => "Connection is marginal — some reads are inconsistent. Reseat the SOIC clip and ensure firm pressure on all 8 pins. Avoid touching the clip during operations.".to_string(),
        _ if score >= 50 => "Connection is unreliable — too many inconsistent reads. Do NOT attempt write operations. Fix the physical connection first: clean chip pads, check clip spring tension, try a different clip or use a ZIF socket.".to_string(),
        _ => "Connection is very poor or no chip present. Check all physical connections, verify chip is correct type, and ensure programmer is working (try 'biospy test-connection').".to_string(),
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
        assert!(r.recommendation.contains("no chip detected"));
    }

    #[test]
    fn all_ff_yields_dead() {
        let r = analyze_spi_readings(vec![reading("ffffff"); 10]);
        assert_eq!(r.pattern, SpiPattern::Dead);
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
