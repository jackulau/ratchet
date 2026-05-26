// Connection quality scoring  -  produces 0-100 quality score from raw JEDEC
// reads + timings + status-register flag. Ports src/connection/quality.ts.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CategoryScore {
    pub name: String,
    pub score: u32,
    pub weight: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectionQualityResult {
    pub score: u32,
    pub grade: String,
    pub categories: Vec<CategoryScore>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RawConnectionData {
    pub jedec_readings: Vec<String>,
    pub timings_ms: Vec<u32>,
    pub status_register_ok: bool,
}

const WEIGHT_CONSISTENCY: f32 = 0.50;
const WEIGHT_JEDEC: f32 = 0.20;
const WEIGHT_TIMING: f32 = 0.15;
const WEIGHT_STATUS: f32 = 0.15;

const INVALID_JEDEC: &[&str] = &["000000", "ffffff"];

pub fn grade_from_score(score: u32) -> &'static str {
    if score >= 90 {
        "Excellent"
    } else if score >= 70 {
        "Good"
    } else if score >= 50 {
        "Fair"
    } else {
        "Poor"
    }
}

fn is_invalid_jedec(s: &str) -> bool {
    INVALID_JEDEC.contains(&s)
}

fn score_consistency(readings: &[String]) -> (u32, Option<String>) {
    let valid: Vec<&String> = readings.iter().filter(|r| !is_invalid_jedec(r)).collect();
    if valid.is_empty() {
        return (
            0,
            Some("Reseat clip or probe  -  all JEDEC reads returned invalid data".to_string()),
        );
    }
    let mut freq: HashMap<&String, u32> = HashMap::new();
    for v in &valid {
        *freq.entry(*v).or_insert(0) += 1;
    }
    let best_count = freq.values().copied().max().unwrap_or(0);
    let ratio = best_count as f32 / readings.len() as f32;
    let score = (ratio * 100.0).round() as u32;
    if score < 70 {
        let bad = readings.len() as u32 - best_count;
        return (
            score,
            Some(format!(
                "Reseat SOIC clip  -  {bad}/{} reads inconsistent",
                readings.len()
            )),
        );
    }
    (score, None)
}

fn score_jedec(readings: &[String]) -> (u32, Option<String>) {
    let valid_count = readings.iter().filter(|r| !is_invalid_jedec(r)).count();
    if valid_count == 0 {
        return (
            0,
            Some("Check chip orientation  -  JEDEC ID reads as all-zero or all-one".to_string()),
        );
    }
    let ratio = valid_count as f32 / readings.len() as f32;
    let score = (ratio * 100.0).round() as u32;
    if score < 70 {
        return (
            score,
            Some("Check chip orientation  -  some JEDEC reads returned invalid values".to_string()),
        );
    }
    (score, None)
}

fn score_timing(timings: &[u32]) -> (u32, Option<String>) {
    if timings.len() < 2 {
        return (
            0,
            Some("Insufficient timing data to assess stability".to_string()),
        );
    }
    let mean: f64 = timings.iter().map(|t| *t as f64).sum::<f64>() / timings.len() as f64;
    if mean == 0.0 {
        return (100, None);
    }
    let variance: f64 = timings
        .iter()
        .map(|t| {
            let d = *t as f64 - mean;
            d * d
        })
        .sum::<f64>()
        / timings.len() as f64;
    let std_dev = variance.sqrt();
    let cv = std_dev / mean;
    let score = ((1.0 - cv) * 100.0).clamp(0.0, 100.0).round() as u32;
    if score < 70 {
        return (
            score,
            Some("Shorten USB cable or remove hub  -  response times are unstable".to_string()),
        );
    }
    (score, None)
}

fn score_status(ok: bool) -> (u32, Option<String>) {
    if ok {
        (100, None)
    } else {
        (
            0,
            Some("Status register unreadable  -  verify VCC voltage and chip power".to_string()),
        )
    }
}

pub fn compute_quality_score(data: &RawConnectionData) -> ConnectionQualityResult {
    if data.jedec_readings.len() < 2 || data.timings_ms.len() < 2 {
        return ConnectionQualityResult {
            score: 0,
            grade: "Poor".to_string(),
            categories: vec![
                CategoryScore {
                    name: "Consistency".to_string(),
                    score: 0,
                    weight: WEIGHT_CONSISTENCY,
                    diagnostic: None,
                },
                CategoryScore {
                    name: "JEDEC Validity".to_string(),
                    score: 0,
                    weight: WEIGHT_JEDEC,
                    diagnostic: None,
                },
                CategoryScore {
                    name: "Timing Stability".to_string(),
                    score: 0,
                    weight: WEIGHT_TIMING,
                    diagnostic: None,
                },
                CategoryScore {
                    name: "Status Register".to_string(),
                    score: 0,
                    weight: WEIGHT_STATUS,
                    diagnostic: None,
                },
            ],
            diagnostics: vec!["Not enough data  -  fewer than 2 successful reads".to_string()],
        };
    }

    let (consistency_s, consistency_d) = score_consistency(&data.jedec_readings);
    let (jedec_s, jedec_d) = score_jedec(&data.jedec_readings);
    let (timing_s, timing_d) = score_timing(&data.timings_ms);
    let (status_s, status_d) = score_status(data.status_register_ok);

    let weighted = consistency_s as f32 * WEIGHT_CONSISTENCY
        + jedec_s as f32 * WEIGHT_JEDEC
        + timing_s as f32 * WEIGHT_TIMING
        + status_s as f32 * WEIGHT_STATUS;
    let score = weighted.round() as u32;
    let grade = grade_from_score(score).to_string();

    let categories = vec![
        CategoryScore {
            name: "Consistency".to_string(),
            score: consistency_s,
            weight: WEIGHT_CONSISTENCY,
            diagnostic: consistency_d,
        },
        CategoryScore {
            name: "JEDEC Validity".to_string(),
            score: jedec_s,
            weight: WEIGHT_JEDEC,
            diagnostic: jedec_d,
        },
        CategoryScore {
            name: "Timing Stability".to_string(),
            score: timing_s,
            weight: WEIGHT_TIMING,
            diagnostic: timing_d,
        },
        CategoryScore {
            name: "Status Register".to_string(),
            score: status_s,
            weight: WEIGHT_STATUS,
            diagnostic: status_d,
        },
    ];
    let diagnostics: Vec<String> = categories
        .iter()
        .filter_map(|c| c.diagnostic.clone())
        .collect();

    ConnectionQualityResult {
        score,
        grade,
        categories,
        diagnostics,
    }
}

pub const MONITOR_AUTO_EXIT_THRESHOLD: u32 = 20;

pub fn format_monitor_line(current_score: u32, previous_score: Option<u32>) -> String {
    let grade = grade_from_score(current_score);
    let score_str = format!("{current_score}/100 {grade}");
    let Some(prev) = previous_score else {
        return format!("Quality: {score_str}");
    };
    let delta = current_score as i32 - prev as i32;
    if delta > 0 {
        format!("Quality: {score_str} \x1b[32m↑+{delta}\x1b[0m")
    } else if delta < 0 {
        let mut line = format!("Quality: {score_str} \x1b[31m↓{delta}\x1b[0m");
        if current_score < MONITOR_AUTO_EXIT_THRESHOLD {
            line.push_str(&format!(
                " \x1b[31mCRITICAL  -  score below {MONITOR_AUTO_EXIT_THRESHOLD}, auto-exiting\x1b[0m"
            ));
        } else if delta.abs() >= 15 {
            line.push_str(" \x1b[33mWARNING  -  significant degradation\x1b[0m");
        }
        line
    } else {
        format!("Quality: {score_str} ↔ stable")
    }
}

pub fn should_auto_exit(score: u32) -> bool {
    score < MONITOR_AUTO_EXIT_THRESHOLD
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ten(s: &str) -> Vec<String> {
        vec![s.to_string(); 10]
    }

    #[test]
    fn perfect_run_yields_excellent_grade() {
        let data = RawConnectionData {
            jedec_readings: ten("ef4017"),
            timings_ms: vec![5; 10],
            status_register_ok: true,
        };
        let r = compute_quality_score(&data);
        assert!(r.score >= 90);
        assert_eq!(r.grade, "Excellent");
        assert!(r.diagnostics.is_empty());
    }

    #[test]
    fn all_invalid_jedec_is_poor() {
        let data = RawConnectionData {
            jedec_readings: ten("000000"),
            timings_ms: vec![5; 10],
            status_register_ok: true,
        };
        let r = compute_quality_score(&data);
        assert!(r.score < 50);
        assert_eq!(r.grade, "Poor");
        assert!(r.diagnostics.iter().any(|d| d.contains("Reseat")));
    }

    #[test]
    fn partial_consistency_drops_score() {
        let mut readings = ten("ef4017");
        readings[2] = "ab1234".to_string();
        readings[5] = "cd5678".to_string();
        readings[8] = "000000".to_string();
        let data = RawConnectionData {
            jedec_readings: readings,
            timings_ms: vec![5; 10],
            status_register_ok: true,
        };
        let r = compute_quality_score(&data);
        assert!(r.score < 90, "score should drop on partial consistency");
    }

    #[test]
    fn missing_status_register_subtracts_15() {
        let data = RawConnectionData {
            jedec_readings: ten("ef4017"),
            timings_ms: vec![5; 10],
            status_register_ok: false,
        };
        let r = compute_quality_score(&data);
        // Status weight = 0.15 → score drops by ~15 from perfect.
        assert!(r.score <= 85);
        assert!(r.diagnostics.iter().any(|d| d.contains("Status")));
    }

    #[test]
    fn unstable_timings_warn() {
        let data = RawConnectionData {
            jedec_readings: ten("ef4017"),
            timings_ms: vec![5, 500, 5, 700, 5, 800, 5, 900, 5, 1000],
            status_register_ok: true,
        };
        let r = compute_quality_score(&data);
        assert!(r.diagnostics.iter().any(|d| d.contains("response times")));
    }

    #[test]
    fn empty_data_returns_zero_score() {
        let data = RawConnectionData {
            jedec_readings: vec!["ef4017".to_string()],
            timings_ms: vec![5],
            status_register_ok: true,
        };
        let r = compute_quality_score(&data);
        assert_eq!(r.score, 0);
        assert_eq!(r.grade, "Poor");
    }

    #[test]
    fn grade_thresholds() {
        assert_eq!(grade_from_score(95), "Excellent");
        assert_eq!(grade_from_score(75), "Good");
        assert_eq!(grade_from_score(60), "Fair");
        assert_eq!(grade_from_score(30), "Poor");
    }

    #[test]
    fn monitor_first_reading_no_arrow() {
        let s = format_monitor_line(85, None);
        assert!(s.contains("85/100"));
        assert!(!s.contains("↑"));
        assert!(!s.contains("↓"));
    }

    #[test]
    fn monitor_improvement_shows_up_arrow() {
        let s = format_monitor_line(80, Some(60));
        assert!(s.contains("↑+20"));
    }

    #[test]
    fn monitor_critical_drop_warns() {
        let s = format_monitor_line(10, Some(80));
        assert!(s.contains("CRITICAL"));
    }

    #[test]
    fn monitor_significant_degradation_warns() {
        let s = format_monitor_line(50, Some(80));
        assert!(s.contains("WARNING"));
    }

    #[test]
    fn auto_exit_threshold() {
        assert!(should_auto_exit(10));
        assert!(!should_auto_exit(30));
    }
}
