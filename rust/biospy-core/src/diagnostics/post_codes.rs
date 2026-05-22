// AMI / Award / Phoenix / UEFI BIOS POST code knowledge base.
// Ported from src/diagnostics/post-codes.ts via embedded JSON
// (data/diagnostics-post-codes.json, generated one-time from dist/).

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum PostStandard {
    Ami,
    Award,
    Phoenix,
    Uefi,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PostCode {
    pub code: String,
    pub standard: PostStandard,
    pub phase: String,
    pub description: String,
    pub causes: Vec<String>,
}

const POST_CODES_JSON: &str = include_str!("../../data/diagnostics-post-codes.json");

fn codes() -> &'static Vec<PostCode> {
    static DB: OnceLock<Vec<PostCode>> = OnceLock::new();
    DB.get_or_init(|| {
        serde_json::from_str(POST_CODES_JSON).expect("data/diagnostics-post-codes.json malformed")
    })
}

pub fn all() -> &'static [PostCode] {
    codes()
}

fn normalize(code: &str) -> String {
    let stripped = code.trim_start_matches("0x").trim_start_matches("0X");
    let upper = stripped.to_ascii_uppercase();
    if upper.len() < 2 {
        format!("{upper:0>2}")
    } else {
        upper
    }
}

pub fn lookup(code: &str, standard: Option<PostStandard>) -> Vec<&'static PostCode> {
    let needle = normalize(code);
    codes()
        .iter()
        .filter(|p| p.code.to_ascii_uppercase() == needle)
        .filter(|p| standard.is_none_or(|s| p.standard == s))
        .collect()
}

pub fn search(query: &str) -> Vec<&'static PostCode> {
    let q = query.to_ascii_lowercase();
    codes()
        .iter()
        .filter(|p| {
            p.description.to_ascii_lowercase().contains(&q)
                || p.phase.to_ascii_lowercase().contains(&q)
                || p.causes.iter().any(|c| c.to_ascii_lowercase().contains(&q))
        })
        .collect()
}

const PHASE_DESCRIPTIONS: &[(&str, &str)] = &[
    ("SEC", "Security Phase — first code executed from flash. CPU cache-as-RAM mode, no main memory yet."),
    ("PEI", "Pre-EFI Initialization — memory training, chipset config. Board is waking up but has no display."),
    ("MEM_INIT", "Memory Initialization — DRAM detection, timing configuration, and testing."),
    ("DXE", "Driver Execution Environment — PCI enumeration, device drivers, console output, ACPI."),
    ("BDS", "Boot Device Selection — finding and loading the OS boot loader."),
    ("BOOT", "Boot Phase — OS hand-off, option ROMs, boot device preparation."),
    ("EARLY", "Early initialization — CPU and chipset basic setup before memory."),
    ("INIT", "System initialization — testing core hardware components."),
    ("MEM", "Memory testing — RAM detection, sizing, and pattern verification."),
    ("PCI", "PCI initialization — bus enumeration and device setup."),
    ("DEVICE", "Device initialization — storage, keyboard, USB, and peripheral setup."),
    ("ERROR", "Error condition — something failed. Check causes."),
];

pub fn get_phase_description(phase: &str) -> String {
    let upper = phase.to_ascii_uppercase();
    PHASE_DESCRIPTIONS
        .iter()
        .find(|(k, _)| *k == upper)
        .map(|(_, v)| v.to_string())
        .unwrap_or_else(|| format!("POST phase: {phase}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_loads_known_count() {
        let n = all().len();
        // We extracted 200+ codes from TS; just sanity-check it's non-trivial.
        assert!(n > 100, "expected > 100 POST codes, found {n}");
    }

    #[test]
    fn lookup_ami_d4_returns_pci_resource_error() {
        let hits = lookup("D4", Some(PostStandard::Ami));
        assert!(!hits.is_empty());
        assert!(hits
            .iter()
            .any(|p| p.description.contains("PCI resource allocation")));
    }

    #[test]
    fn lookup_with_0x_prefix() {
        let hits = lookup("0xD4", Some(PostStandard::Ami));
        assert!(!hits.is_empty());
    }

    #[test]
    fn lookup_case_insensitive() {
        let lower = lookup("d4", Some(PostStandard::Ami));
        let upper = lookup("D4", Some(PostStandard::Ami));
        assert_eq!(lower.len(), upper.len());
    }

    #[test]
    fn lookup_single_byte_pads_to_two() {
        let hits = lookup("1", Some(PostStandard::Award));
        // Normalized to "01" → Award has 0x01 = processor test
        assert!(hits.iter().any(|p| p.code == "01"));
    }

    #[test]
    fn lookup_returns_all_standards_when_none_specified() {
        let hits = lookup("FF", None);
        // FF appears in award + phoenix at minimum
        let std_set: std::collections::HashSet<PostStandard> =
            hits.iter().map(|p| p.standard).collect();
        assert!(std_set.len() >= 2);
    }

    #[test]
    fn search_finds_pci_codes() {
        let r = search("PCI resource");
        assert!(!r.is_empty());
    }

    #[test]
    fn phase_description_lookup() {
        assert!(get_phase_description("SEC").contains("Security"));
        assert!(get_phase_description("PEI").contains("Pre-EFI"));
        assert!(get_phase_description("UNKNOWN").contains("UNKNOWN"));
    }

    #[test]
    fn d6_error_mentions_gpu() {
        let hits = lookup("D6", Some(PostStandard::Ami));
        assert!(hits
            .iter()
            .any(|p| p.causes.iter().any(|c| c.contains("GPU"))));
    }
}
