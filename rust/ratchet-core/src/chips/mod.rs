// Chip database: 806 SPI flash chips ported from src/chips/database.ts.
// Data lives in `data/chips.json` (include_str! at compile, parsed once via OnceLock).
// JEDEC manufacturer table is inline below (24 entries  -  small enough to keep in code).

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Chip {
    pub name: String,
    pub vendor: String,
    pub jedec_id: String,
    pub size_bytes: u64,
    #[serde(rename = "type")]
    pub chip_type: ChipType,
    pub page_size: u32,
    pub sector_size: u32,
    pub block_size: u32,
    pub voltage: f32,
    pub needs4_byte_addr: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voltage_min: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voltage_max: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_clock_mhz: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub erase_opcodes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChipType {
    Spi,
    I2c,
}

const CHIPS_JSON: &str = include_str!("../../data/chips.json");

fn chips() -> &'static Vec<Chip> {
    static DB: OnceLock<Vec<Chip>> = OnceLock::new();
    DB.get_or_init(|| {
        serde_json::from_str(CHIPS_JSON)
            .expect("data/chips.json is malformed  -  regenerate from TS source")
    })
}

/// All chips in the database (806 entries as of port date).
pub fn all() -> &'static [Chip] {
    chips()
}

/// Lookup by full 6-hex-char JEDEC ID (case-insensitive).
pub fn lookup_by_jedec_id(jedec_id: &str) -> Option<&'static Chip> {
    let needle = jedec_id.to_ascii_lowercase();
    chips().iter().find(|c| c.jedec_id == needle)
}

/// Lookup by chip name (case-insensitive, trimmed).
pub fn lookup_by_name(name: &str) -> Option<&'static Chip> {
    let needle = name.trim().to_ascii_lowercase();
    chips()
        .iter()
        .find(|c| c.name.to_ascii_lowercase() == needle)
}

/// Substring search across name/vendor/jedecId/voltage. Empty query returns all chips.
pub fn search(query: &str) -> Vec<&'static Chip> {
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return chips().iter().collect();
    }
    chips()
        .iter()
        .filter(|c| {
            c.name.to_ascii_lowercase().contains(&q)
                || c.vendor.to_ascii_lowercase().contains(&q)
                || c.jedec_id.contains(&q)
                || format!("{}v", c.voltage).contains(&q)
                || format!("{}", c.voltage).contains(&q)
        })
        .collect()
}

pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{} KB", bytes / 1024)
    } else {
        format!("{} MB", bytes / (1024 * 1024))
    }
}

pub fn is_low_voltage_chip(jedec_id: &str) -> bool {
    lookup_by_jedec_id(jedec_id).is_some_and(|c| c.voltage < 2.0)
}

pub fn get_chip_voltage(jedec_id: &str) -> Option<f32> {
    lookup_by_jedec_id(jedec_id).map(|c| c.voltage)
}

/// True if the chip needs 4-byte addressing for its full range.
/// Falls back to capacity-byte heuristic (>=0x19 == >= 32MB) if not in DB.
pub fn needs_4byte_addressing(jedec_id: &str) -> bool {
    if let Some(c) = lookup_by_jedec_id(jedec_id) {
        return c.needs4_byte_addr;
    }
    if jedec_id.len() >= 6 {
        if let Ok(cap_byte) = u8::from_str_radix(&jedec_id[4..6], 16) {
            return cap_byte >= 0x19;
        }
    }
    false
}

// ═════════════════════════════════════════════════════════════════════════════
// JEDEC manufacturer table  -  keep in code, only 24 entries, never mutated.
// ═════════════════════════════════════════════════════════════════════════════

const JEDEC_MANUFACTURERS: &[(&str, &str)] = &[
    ("ef", "Winbond"),
    ("c2", "Macronix"),
    ("c8", "GigaDevice"),
    ("bf", "SST/Microchip"),
    ("1c", "EON"),
    ("01", "Spansion/Cypress/Infineon"),
    ("20", "Micron/Numonyx"),
    ("9d", "ISSI"),
    ("37", "AMIC"),
    ("f8", "Fudan"),
    ("ba", "Zetta"),
    ("0b", "XTX"),
    ("68", "Boya"),
    ("85", "PUYA"),
    ("8c", "ESMT"),
    ("7f", "PCT/Extended JEDEC"),
    ("89", "Intel"),
    ("1f", "Atmel/Adesto"),
    ("62", "Sanyo"),
    ("a1", "Fudan Micro (alt)"),
    ("e0", "Paragon"),
    ("d5", "ISSI (alt)"),
    ("52", "Alliance Memory"),
    ("54", "Douqi"),
];

pub fn get_manufacturer_name(jedec_id: &str) -> &'static str {
    if jedec_id.len() < 2 {
        return "Unknown";
    }
    let key = jedec_id[..2].to_ascii_lowercase();
    JEDEC_MANUFACTURERS
        .iter()
        .find_map(|(k, v)| if *k == key { Some(*v) } else { None })
        .unwrap_or("Unknown")
}

// ═════════════════════════════════════════════════════════════════════════════
// Fuzzy JEDEC matching
// ═════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyMatch {
    pub manufacturer: &'static str,
    pub estimated_size_bytes: u64,
    pub estimated_voltage: f32,
    pub confidence: Confidence,
    pub similar_chips: Vec<&'static Chip>,
    pub reasoning: String,
}

pub fn estimate_capacity_from_byte(capacity_byte: u8) -> u64 {
    if (0x10..=0x22).contains(&capacity_byte) {
        1u64 << capacity_byte
    } else {
        0
    }
}

pub fn fuzzy_match_jedec(jedec_id: &str) -> FuzzyMatch {
    let id = jedec_id.to_ascii_lowercase();

    if id == "000000" || id == "ffffff" || id.is_empty() || id.len() < 6 {
        let reasoning = if id == "000000" || id == "ffffff" {
            "Dead chip response  -  no SPI flash detected. Check SOIC clip connection."
        } else {
            "Invalid or incomplete JEDEC ID"
        };
        return FuzzyMatch {
            manufacturer: "None",
            estimated_size_bytes: 0,
            estimated_voltage: 0.0,
            confidence: Confidence::Low,
            similar_chips: vec![],
            reasoning: reasoning.to_string(),
        };
    }

    let mfg_byte = &id[..2];
    let type_byte = &id[2..4];
    let cap_byte = u8::from_str_radix(&id[4..6], 16).unwrap_or(0);
    let manufacturer = get_manufacturer_name(&id);
    let estimated_size = estimate_capacity_from_byte(cap_byte);

    let same_vendor: Vec<&'static Chip> = chips()
        .iter()
        .filter(|c| {
            c.jedec_id.len() >= 2
                && &c.jedec_id[..2] == mfg_byte
                && matches!(c.chip_type, ChipType::Spi)
        })
        .collect();

    let same_type: Vec<&'static Chip> = same_vendor
        .iter()
        .filter(|c| c.jedec_id.len() >= 4 && &c.jedec_id[2..4] == type_byte)
        .copied()
        .collect();

    let similar_chips: Vec<&'static Chip> = if !same_type.is_empty() {
        same_type.iter().take(5).copied().collect()
    } else {
        same_vendor.iter().take(5).copied().collect()
    };

    let estimated_voltage = similar_chips.first().map(|c| c.voltage).unwrap_or(3.3);

    let confidence;
    let mut reasons: Vec<String> = Vec::new();

    if manufacturer != "Unknown" && estimated_size > 0 && !same_type.is_empty() {
        confidence = Confidence::High;
        reasons.push(format!("Known manufacturer: {manufacturer}"));
        reasons.push(format!(
            "Capacity: {} (from byte 0x{:x})",
            format_size(estimated_size),
            cap_byte
        ));
        reasons.push(format!("{} similar chips in database", same_type.len()));
    } else if manufacturer != "Unknown" && estimated_size > 0 {
        confidence = Confidence::Medium;
        reasons.push(format!("Known manufacturer: {manufacturer}"));
        reasons.push(format!(
            "Capacity: {} (from byte 0x{:x})",
            format_size(estimated_size),
            cap_byte
        ));
        reasons.push("Exact type byte not in database  -  voltage is estimated".to_string());
    } else if manufacturer != "Unknown" {
        confidence = Confidence::Medium;
        reasons.push(format!("Known manufacturer: {manufacturer}"));
        reasons.push("Capacity byte outside standard range  -  size unknown".to_string());
    } else {
        confidence = Confidence::Low;
        reasons.push(format!("Unknown manufacturer byte: 0x{mfg_byte}"));
        if estimated_size > 0 {
            reasons.push(format!(
                "Estimated capacity: {}",
                format_size(estimated_size)
            ));
        }
    }

    FuzzyMatch {
        manufacturer,
        estimated_size_bytes: estimated_size,
        estimated_voltage,
        confidence,
        similar_chips,
        reasoning: reasons.join(". ") + ".",
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Chip recommendations
// ═════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChipRecommendation {
    pub safe_voltage: String,
    pub max_spi_clock: String,
    pub erase_strategy: String,
    pub write_page_size: u32,
    pub address_mode: String,
    pub warnings: Vec<String>,
}

pub fn get_chip_recommendations(chip: &Chip) -> ChipRecommendation {
    let mut warnings: Vec<String> = Vec::new();

    let safe_voltage = match (chip.voltage_min, chip.voltage_max) {
        (Some(min), Some(max)) => format!("{}V (range: {}-{}V)", chip.voltage, min, max),
        _ => format!("{}V", chip.voltage),
    };

    if chip.voltage < 2.0 {
        warnings.push(
            "1.8V chip  -  CH341A outputs 3.3V natively. Use a 1.8V adapter or level shifter to avoid chip damage."
                .to_string(),
        );
    }

    let max_spi_clock = match chip.max_clock_mhz {
        Some(mhz) => {
            let conservative = mhz.min(30);
            format!("{mhz}MHz max (conservative: {conservative}MHz for CH341A)")
        }
        None => "Unknown  -  use conservative 25MHz".to_string(),
    };

    let erase_strategy = if chip.size_bytes <= 1024 * 1024 {
        "Sector erase (4KB) recommended  -  chip is small enough for fast targeted erase".to_string()
    } else if chip.size_bytes <= 16 * 1024 * 1024 {
        "Block erase (64KB) for bulk operations, sector erase (4KB) for targeted updates"
            .to_string()
    } else {
        "Block erase (64KB) for bulk operations, chip erase only if full reflash needed".to_string()
    };

    let address_mode = if chip.needs4_byte_addr {
        "4-byte addressing required (chip > 16MB)".to_string()
    } else {
        "3-byte addressing".to_string()
    };

    ChipRecommendation {
        safe_voltage,
        max_spi_clock,
        erase_strategy,
        write_page_size: chip.page_size,
        address_mode,
        warnings,
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Submission validation (community chip additions)
// ═════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
}

pub fn validate_chip_submission(json: &serde_json::Value) -> ValidationResult {
    let mut errors: Vec<String> = Vec::new();
    let obj = match json.as_object() {
        Some(o) => o,
        None => {
            return ValidationResult {
                valid: false,
                errors: vec!["Submission must be an object".to_string()],
            };
        }
    };

    let required = [
        "name",
        "vendor",
        "jedecId",
        "sizeBytes",
        "type",
        "pageSize",
        "sectorSize",
        "blockSize",
        "voltage",
        "needs4ByteAddr",
    ];
    for field in required.iter() {
        if !obj.contains_key(*field) || obj.get(*field).is_some_and(|v| v.is_null()) {
            errors.push(format!("Missing required field: {field}"));
        }
    }

    if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
        if name.is_empty() {
            errors.push("name must be non-empty".to_string());
        }
    }

    if let Some(jid) = obj.get("jedecId").and_then(|v| v.as_str()) {
        if jid.len() != 6 || !jid.chars().all(|c| c.is_ascii_hexdigit()) {
            errors.push("jedecId must be exactly 6 hex characters (e.g. 'ef4017')".to_string());
        }
    }

    if let Some(sz) = obj.get("sizeBytes").and_then(|v| v.as_u64()) {
        if sz == 0 || (sz & (sz - 1)) != 0 {
            errors.push("sizeBytes must be a positive power of 2".to_string());
        }
    }

    if let Some(t) = obj.get("type") {
        let s = t.as_str().unwrap_or("");
        if s != "spi" && s != "i2c" {
            errors.push("type must be 'spi' or 'i2c'".to_string());
        }
    }

    if let Some(v) = obj.get("voltage").and_then(|v| v.as_f64()) {
        if v <= 0.0 || v > 10.0 {
            errors.push("voltage must be between 0 and 10".to_string());
        }
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_loads_806_chips() {
        let n = all().len();
        assert_eq!(n, 806, "expected 806 chips, found {n}");
    }

    #[test]
    fn lookup_winbond_w25q64() {
        let chip = lookup_by_jedec_id("ef4017").expect("ef4017 must resolve");
        assert!(chip.name.starts_with("W25Q64"));
        assert_eq!(chip.vendor, "Winbond");
        assert_eq!(chip.size_bytes, 8 * 1024 * 1024);
        assert_eq!(chip.voltage, 3.3);
        assert!(!chip.needs4_byte_addr);
    }

    #[test]
    fn lookup_case_insensitive() {
        let lower = lookup_by_jedec_id("ef4017").unwrap();
        let upper = lookup_by_jedec_id("EF4017").unwrap();
        assert_eq!(lower.name, upper.name);
    }

    #[test]
    fn lookup_by_name_finds_w25q64() {
        let chip = lookup_by_name("W25Q64JV").expect("W25Q64JV by name");
        assert_eq!(chip.jedec_id, "ef4017");
    }

    #[test]
    fn search_winbond_returns_many() {
        let results = search("winbond");
        assert!(results.len() > 10, "Winbond should have many entries");
    }

    #[test]
    fn search_empty_returns_all() {
        let results = search("");
        assert_eq!(results.len(), all().len());
    }

    #[test]
    fn format_size_buckets() {
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(4096), "4 KB");
        assert_eq!(format_size(8 * 1024 * 1024), "8 MB");
    }

    #[test]
    fn low_voltage_detection() {
        // W25Q80DL is 1.8V (jedec ef6014).
        assert!(is_low_voltage_chip("ef6014"));
        // W25Q64JV is 3.3V (jedec ef4017).
        assert!(!is_low_voltage_chip("ef4017"));
    }

    #[test]
    fn voltage_lookup() {
        assert_eq!(get_chip_voltage("ef4017"), Some(3.3));
        assert_eq!(get_chip_voltage("ef6014"), Some(1.8));
        assert_eq!(get_chip_voltage("zzzzzz"), None);
    }

    #[test]
    fn needs_4byte_for_large_chip() {
        // 32MB W25Q256 chips need 4-byte.
        assert!(needs_4byte_addressing("ef4019"));
        // 8MB W25Q64 does not.
        assert!(!needs_4byte_addressing("ef4017"));
        // Fallback: unknown capacity-byte 0x19 means >=32MB → true.
        assert!(needs_4byte_addressing("zz1119"));
        // Fallback: 0x17 = 8MB → false.
        assert!(!needs_4byte_addressing("zz1117"));
    }

    #[test]
    fn manufacturer_name_lookup() {
        assert_eq!(get_manufacturer_name("ef4017"), "Winbond");
        assert_eq!(get_manufacturer_name("c22018"), "Macronix");
        assert_eq!(get_manufacturer_name("c84017"), "GigaDevice");
        assert_eq!(get_manufacturer_name("zz1234"), "Unknown");
        assert_eq!(get_manufacturer_name("x"), "Unknown");
    }

    #[test]
    fn fuzzy_match_dead_chip() {
        let m = fuzzy_match_jedec("000000");
        assert!(matches!(m.confidence, Confidence::Low));
        assert!(m.reasoning.contains("Dead chip"));
    }

    #[test]
    fn fuzzy_match_high_confidence_for_known() {
        let m = fuzzy_match_jedec("ef4017");
        assert!(matches!(m.confidence, Confidence::High));
        assert_eq!(m.manufacturer, "Winbond");
        assert_eq!(m.estimated_size_bytes, 8 * 1024 * 1024);
    }

    #[test]
    fn capacity_byte_estimation() {
        assert_eq!(estimate_capacity_from_byte(0x17), 8 * 1024 * 1024);
        assert_eq!(estimate_capacity_from_byte(0x18), 16 * 1024 * 1024);
        assert_eq!(estimate_capacity_from_byte(0x05), 0);
    }

    #[test]
    fn recommendations_warn_on_low_voltage() {
        let chip = lookup_by_jedec_id("ef6014").unwrap();
        let rec = get_chip_recommendations(chip);
        assert!(!rec.warnings.is_empty(), "1.8V chip should warn");
    }

    #[test]
    fn submission_validation_accepts_valid() {
        let v = serde_json::json!({
            "name": "W25Q64JV",
            "vendor": "Winbond",
            "jedecId": "ef4017",
            "sizeBytes": 8388608,
            "type": "spi",
            "pageSize": 256,
            "sectorSize": 4096,
            "blockSize": 65536,
            "voltage": 3.3,
            "needs4ByteAddr": false,
        });
        let res = validate_chip_submission(&v);
        assert!(
            res.valid,
            "validation should pass; errors: {:?}",
            res.errors
        );
    }

    #[test]
    fn submission_validation_rejects_bad_jedec() {
        let v = serde_json::json!({
            "name": "X",
            "vendor": "Y",
            "jedecId": "nothex",
            "sizeBytes": 8388608,
            "type": "spi",
            "pageSize": 256,
            "sectorSize": 4096,
            "blockSize": 65536,
            "voltage": 3.3,
            "needs4ByteAddr": false,
        });
        let res = validate_chip_submission(&v);
        assert!(!res.valid);
        assert!(res.errors.iter().any(|e| e.contains("jedecId")));
    }

    #[test]
    fn submission_validation_rejects_non_power_of_two_size() {
        let v = serde_json::json!({
            "name": "X",
            "vendor": "Y",
            "jedecId": "ef4017",
            "sizeBytes": 12345,
            "type": "spi",
            "pageSize": 256,
            "sectorSize": 4096,
            "blockSize": 65536,
            "voltage": 3.3,
            "needs4ByteAddr": false,
        });
        let res = validate_chip_submission(&v);
        assert!(!res.valid);
        assert!(res.errors.iter().any(|e| e.contains("power of 2")));
    }

    /// Parity test  -  sample 10 well-known JEDEC IDs and assert key fields match the TS impl.
    #[test]
    fn parity_with_ts_for_known_ids() {
        let cases = [
            ("ef4017", "W25Q64JV", 8 * 1024 * 1024, 3.3, false),
            ("ef4018", "W25Q128JV", 16 * 1024 * 1024, 3.3, false),
            ("ef4019", "W25Q256JV", 32 * 1024 * 1024, 3.3, true),
            ("ef6014", "W25Q80DL", 1024 * 1024, 1.8, false),
            ("c22018", "MX25L12835F", 16 * 1024 * 1024, 3.3, false),
            ("c84017", "GD25Q64C", 8 * 1024 * 1024, 3.3, false),
            ("c84018", "GD25Q128C", 16 * 1024 * 1024, 3.3, false),
            ("bf2541", "SST25VF016B", 2 * 1024 * 1024, 3.3, false),
            ("1c7017", "EN25QH64A", 8 * 1024 * 1024, 3.3, false),
            ("c22538", "MX25U12835F", 16 * 1024 * 1024, 1.8, false),
        ];
        for (jid, name, size, voltage, needs4) in cases {
            let chip = lookup_by_jedec_id(jid).unwrap_or_else(|| panic!("missing chip {jid}"));
            assert_eq!(chip.name, name, "name mismatch for {jid}");
            assert_eq!(chip.size_bytes, size as u64, "size mismatch for {jid}");
            assert!(
                (chip.voltage - voltage).abs() < 0.001,
                "voltage mismatch for {jid}"
            );
            assert_eq!(chip.needs4_byte_addr, needs4, "needs4 mismatch for {jid}");
        }
    }
}
