// Logic-analyzer capture export formats.
//
// * CSV  -  universal; opens in Excel/spreadsheets and most logic-analyzer
//   tools (Saleae Logic 2, PulseView, KingstVIS) accept CSV imports.
// * JSONL  -  one record per sample for streaming/scripted analysis.
// * Saleae-compatible binary digital-data dump (per-channel packed bytes)
//   plus a `meta.json` sidecar matching Saleae Logic 2's analyzer plugin
//   spec. The full `.sal` container is a zip of these; producing the zip
//   needs a zip writer crate which is intentionally out-of-scope for this
//   module (write the parts and let users assemble with `zip -j foo.sal *`
//   or import them as individual files).
// * sigrok-cli compatible `srzip` skeleton (version + metadata text files
//   + raw logic dump).

use super::logic_analyzer::CaptureFrame;
use std::fmt::Write;

/// Write a CSV with header "Time[s], CH0, CH1, ...".
pub fn write_csv(frame: &CaptureFrame, channels: u8) -> String {
    let mut out = String::new();
    out.push_str("Time[s]");
    for c in 0..channels {
        let _ = write!(out, ",CH{c}");
    }
    out.push('\n');
    let dt = 1.0 / frame.sample_rate_hz as f64;
    for (i, byte) in frame.samples.iter().enumerate() {
        let _ = write!(out, "{:.9}", i as f64 * dt);
        for c in 0..channels {
            let bit = (byte >> c) & 1;
            let _ = write!(out, ",{bit}");
        }
        out.push('\n');
    }
    out
}

/// JSON Lines export  -  one object per sample.
pub fn write_jsonl(frame: &CaptureFrame, channels: u8) -> String {
    let mut out = String::new();
    let dt_ns: u64 = 1_000_000_000 / frame.sample_rate_hz.max(1) as u64;
    for (i, byte) in frame.samples.iter().enumerate() {
        let _ = write!(out, "{{\"t_ns\":{}", i as u64 * dt_ns);
        for c in 0..channels {
            let bit = (byte >> c) & 1;
            let _ = write!(out, ",\"ch{c}\":{bit}");
        }
        out.push_str("}\n");
    }
    out
}

/// Saleae Logic 2 sidecar metadata. The `.sal` container is a zip; this
/// function emits the JSON metadata text only (caller can drop into the
/// zip if they have a zip writer).
pub fn write_saleae_meta(frame: &CaptureFrame, channels: u8) -> String {
    format!(
        "{{\"sample_rate\":{},\"num_channels\":{},\"num_samples\":{},\"format\":\"digital_v1\"}}",
        frame.sample_rate_hz,
        channels,
        frame.samples.len(),
    )
}

/// Saleae digital-data binary dump for one channel  -  1 bit per sample,
/// packed little-endian byte-by-byte (LSB = earliest sample).
pub fn write_saleae_channel_bin(frame: &CaptureFrame, channel: u8) -> Vec<u8> {
    let mask = 1u8 << channel;
    let mut out = vec![0u8; frame.samples.len().div_ceil(8)];
    for (i, b) in frame.samples.iter().enumerate() {
        if *b & mask != 0 {
            out[i / 8] |= 1u8 << (i % 8);
        }
    }
    out
}

/// sigrok `version` file contents (plain text "2" for the v2 format).
pub fn write_sigrok_version() -> &'static str {
    "2"
}

/// sigrok metadata INI for a digital-only capture.
pub fn write_sigrok_metadata(frame: &CaptureFrame, channels: u8) -> String {
    let mut out = String::new();
    out.push_str("[device 1]\n");
    let _ = writeln!(out, "samplerate={} Hz", frame.sample_rate_hz);
    let _ = writeln!(out, "total probes={channels}");
    for c in 0..channels {
        let _ = writeln!(out, "probe{}=CH{c}", c + 1);
    }
    let _ = writeln!(out, "unitsize=1");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn small_frame() -> CaptureFrame {
        CaptureFrame {
            samples: vec![0b001, 0b010, 0b011, 0b000],
            sample_rate_hz: 1_000_000,
            trigger_offset: 0,
        }
    }

    #[test]
    fn csv_has_header_and_one_row_per_sample() {
        let csv = write_csv(&small_frame(), 3);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 5); // header + 4 rows
        assert!(lines[0].contains("Time[s]"));
        assert!(lines[0].contains("CH2"));
        // First sample row: t=0, CH0=1, CH1=0, CH2=0
        assert!(lines[1].ends_with(",1,0,0"));
    }

    #[test]
    fn jsonl_has_one_object_per_sample() {
        let jsonl = write_jsonl(&small_frame(), 3);
        let lines: Vec<&str> = jsonl.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(lines[0].contains("\"ch0\":1"));
        assert!(lines[1].contains("\"ch1\":1"));
    }

    #[test]
    fn saleae_meta_contains_rate_and_count() {
        let meta = write_saleae_meta(&small_frame(), 3);
        assert!(meta.contains("1000000"));
        assert!(meta.contains("\"num_channels\":3"));
        assert!(meta.contains("\"num_samples\":4"));
    }

    #[test]
    fn saleae_channel_bin_packs_lsb_first() {
        let f = CaptureFrame {
            // 9 samples: 1, 0, 1, 1, 0, 0, 1, 0, 1
            samples: vec![1, 0, 1, 1, 0, 0, 1, 0, 1],
            sample_rate_hz: 1,
            trigger_offset: 0,
        };
        let bin = write_saleae_channel_bin(&f, 0);
        // First byte (samples 0..7): bits 0,1,2,3,4,5,6,7 = 1,0,1,1,0,0,1,0
        //                          → LSB-first → 0b01001101 = 0x4D
        assert_eq!(bin[0], 0b0100_1101);
        // Second byte holds sample 8 only → bit 0 = 1.
        assert_eq!(bin[1], 0b0000_0001);
    }

    #[test]
    fn sigrok_metadata_contains_sample_rate() {
        let m = write_sigrok_metadata(&small_frame(), 3);
        assert!(m.contains("samplerate=1000000 Hz"));
        assert!(m.contains("total probes=3"));
        assert!(m.contains("probe1=CH0"));
    }

    #[test]
    fn sigrok_version_string() {
        assert_eq!(write_sigrok_version(), "2");
    }
}
