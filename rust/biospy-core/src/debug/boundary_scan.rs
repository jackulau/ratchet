// JTAG boundary-scan (IEEE 1149.1) — minimal BSDL parser + EXTEST driver.
//
// BSDL is a VHDL-derived language for describing JTAG-testable devices.
// The full grammar is large; this module implements a useful subset:
//   * entity name
//   * `attribute INSTRUCTION_OPCODE` block (instruction name → bit pattern)
//   * `attribute BOUNDARY_LENGTH` (cell count)
//   * `attribute BOUNDARY_REGISTER` (cell records: num, type, port, direction)
//
// Once parsed, the driver loads SAMPLE/PRELOAD to capture pin state, then
// EXTEST to drive selected output cells while sampling inputs — useful for
// solder-joint and trace continuity testing.

use crate::backends::{BackendError, Result};
use crate::protocols::jtag::{JtagTap, JtagTransport, TapState};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BsdlInstruction {
    pub name: String,
    pub opcode: u64,
    pub width: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundaryCell {
    pub index: u32,
    pub cell_type: String,
    pub port: String,
    pub direction: String,
}

#[derive(Debug, Clone)]
pub struct BsdlDescriptor {
    pub entity: String,
    pub boundary_length: u32,
    pub instructions: HashMap<String, BsdlInstruction>,
    pub boundary: Vec<BoundaryCell>,
}

// ─── Parser ────────────────────────────────────────────────────────────────

pub fn parse_bsdl(text: &str) -> Result<BsdlDescriptor> {
    let cleaned = strip_comments(text);
    let entity = find_entity(&cleaned)?;
    let boundary_length = find_int_attribute(&cleaned, "BOUNDARY_LENGTH").unwrap_or(0);
    let instructions = parse_instruction_opcodes(&cleaned);
    let boundary = parse_boundary_register(&cleaned);
    Ok(BsdlDescriptor {
        entity,
        boundary_length,
        instructions,
        boundary,
    })
}

fn strip_comments(text: &str) -> String {
    text.lines()
        .map(|line| line.split("--").next().unwrap_or("").to_string())
        .collect::<Vec<_>>()
        .join("\n")
}

fn find_entity(text: &str) -> Result<String> {
    let lower = text.to_lowercase();
    let pos = lower
        .find("entity ")
        .ok_or_else(|| BackendError::Other("BSDL: no entity keyword".into()))?;
    let rest = &text[pos + 7..];
    let name: String = rest
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_')
        .collect();
    if name.is_empty() {
        return Err(BackendError::Other("BSDL: empty entity name".into()));
    }
    Ok(name)
}

/// Locate the value side of an attribute declaration. BSDL/VHDL syntax is
/// `attribute NAME of TARGET : CLASS is VALUE;`. Some non-standard tools
/// emit `:= VALUE` instead of `is VALUE`; accept both. Whitespace around
/// `is` is permissive (newline, tab, multiple spaces).
fn find_attribute_value_start<'a>(text: &'a str, attr_name: &str) -> Option<&'a str> {
    let lower = text.to_lowercase();
    let pat = format!("attribute {}", attr_name.to_lowercase());
    let pos = lower.find(&pat)?;
    let after_lower = &lower[pos..];
    let after = &text[pos..];
    let is_pos = find_keyword(after_lower, "is");
    let eq_pos = after_lower.find(":=").map(|p| (p, 2));
    let (p, skip) = match (is_pos, eq_pos) {
        (Some(a), Some(b)) if a.0 < b.0 => a,
        (Some(a), Some(_)) => a,
        (Some(a), None) => a,
        (None, Some(b)) => b,
        (None, None) => return None,
    };
    Some(&after[p + skip..])
}

/// Find a standalone keyword (whitespace-bounded) in `text`. Returns
/// (byte_offset, total_skip_including_trailing_whitespace).
fn find_keyword(text: &str, keyword: &str) -> Option<(usize, usize)> {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let kw_chars: Vec<char> = keyword.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        // Is this position the start of `keyword` with whitespace on both sides?
        if i + kw_chars.len() <= chars.len() {
            let matches = (0..kw_chars.len()).all(|k| chars[i + k].1 == kw_chars[k]);
            if matches {
                let before_ok = i == 0 || chars[i - 1].1.is_whitespace();
                let end_idx = i + kw_chars.len();
                let after_ok = end_idx >= chars.len() || chars[end_idx].1.is_whitespace();
                if before_ok && after_ok {
                    let byte_pos = chars[i].0;
                    // Skip past keyword + 1 whitespace char to point at value.
                    let value_byte = chars
                        .get(end_idx)
                        .map(|(b, _)| *b + chars[end_idx].1.len_utf8())
                        .unwrap_or(text.len());
                    return Some((byte_pos, value_byte - byte_pos));
                }
            }
        }
        i += 1;
    }
    None
}

fn find_int_attribute(text: &str, name: &str) -> Option<u32> {
    let tail = find_attribute_value_start(text, name)?;
    let stop = tail.find(';').unwrap_or(tail.len());
    let value_str = &tail[..stop];
    value_str.trim().parse::<u32>().ok()
}

fn extract_quoted_body_after_attribute(text: &str, attr_name: &str) -> Option<String> {
    let tail = find_attribute_value_start(text, attr_name)?;
    // Find `;` outside parens.
    let mut depth = 0i32;
    let mut end = tail.len();
    for (i, c) in tail.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ';' if depth <= 0 => {
                end = i;
                break;
            }
            _ => {}
        }
    }
    let raw = &tail[..end];
    // BSDL string concatenation joins quoted segments with `&`. Strip both.
    let cleaned: String = raw.chars().filter(|c| *c != '"' && *c != '&').collect();
    Some(cleaned)
}

fn parse_instruction_opcodes(text: &str) -> HashMap<String, BsdlInstruction> {
    let mut out = HashMap::new();
    let Some(body) = extract_quoted_body_after_attribute(text, "INSTRUCTION_OPCODE") else {
        return out;
    };
    // Split on top-level commas (parens balanced).
    let mut current = String::new();
    let mut depth = 0i32;
    let mut chunks = Vec::new();
    for c in body.chars() {
        match c {
            '(' => {
                depth += 1;
                current.push(c);
            }
            ')' => {
                depth -= 1;
                current.push(c);
            }
            ',' if depth == 0 => {
                chunks.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    for entry in chunks {
        if let Some((name_part, bits_part)) = entry.split_once('(') {
            let name = name_part.trim().to_uppercase();
            let bits = bits_part.trim_end_matches(')').trim().replace(' ', "");
            if name.is_empty() || bits.is_empty() {
                continue;
            }
            if let Ok(opcode) = u64::from_str_radix(&bits, 2) {
                out.insert(
                    name.clone(),
                    BsdlInstruction {
                        name,
                        opcode,
                        width: bits.len() as u8,
                    },
                );
            }
        }
    }
    out
}

fn parse_boundary_register(text: &str) -> Vec<BoundaryCell> {
    let mut out = Vec::new();
    let Some(body) = extract_quoted_body_after_attribute(text, "BOUNDARY_REGISTER") else {
        return out;
    };
    let body = body.as_str();
    // Each cell is on a quoted-string-ish line like:
    //   "0 (BC_1, *, CONTROL, 0)," etc.
    for line in body.lines() {
        let line = line.trim().trim_start_matches('"').trim_end_matches('"');
        let line = line.trim_start_matches('"').trim_end_matches(',');
        if line.is_empty() {
            continue;
        }
        // Look for "<num> (<type>, <port>, <dir>, ...)"
        let Some(open) = line.find('(') else { continue };
        let num_part = line[..open].trim();
        let inside = line[open + 1..].trim_end_matches(')');
        let parts: Vec<&str> = inside.split(',').map(|s| s.trim()).collect();
        if parts.len() < 3 {
            continue;
        }
        if let Ok(index) = num_part.parse::<u32>() {
            out.push(BoundaryCell {
                index,
                cell_type: parts[0].to_string(),
                port: parts[1].to_string(),
                direction: parts[2].to_string(),
            });
        }
    }
    out
}

// ─── EXTEST driver ─────────────────────────────────────────────────────────

pub struct BoundaryScan<'a, T: JtagTransport> {
    pub descriptor: BsdlDescriptor,
    pub tap: JtagTap<'a, T>,
}

impl<'a, T: JtagTransport> BoundaryScan<'a, T> {
    pub fn new(descriptor: BsdlDescriptor, transport: &'a mut T) -> Self {
        Self {
            descriptor,
            tap: JtagTap::new(transport),
        }
    }

    fn load_ir(&mut self, name: &str) -> Result<()> {
        let inst = self
            .descriptor
            .instructions
            .get(&name.to_uppercase())
            .ok_or_else(|| BackendError::Other(format!("BSDL: instruction {name} not declared")))?;
        let bits: Vec<bool> = (0..inst.width)
            .map(|i| (inst.opcode >> i) & 1 != 0)
            .collect();
        let _ = self.tap.shift_ir(&bits)?;
        Ok(())
    }

    /// SAMPLE/PRELOAD: capture current pin state into the boundary register.
    pub fn sample(&mut self) -> Result<Vec<bool>> {
        self.load_ir("SAMPLE")?;
        self.tap.goto(TapState::ShiftDr)?;
        let zeros = vec![false; self.descriptor.boundary_length as usize];
        self.tap.shift_dr(&zeros)
    }

    /// EXTEST: drive boundary outputs to `outputs`, return sampled inputs.
    pub fn extest(&mut self, outputs: &[bool]) -> Result<Vec<bool>> {
        self.load_ir("EXTEST")?;
        self.tap.goto(TapState::ShiftDr)?;
        self.tap.shift_dr(outputs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocols::jtag::JtagMockTransport;

    const SAMPLE_BSDL: &str = r#"
        -- A toy BSDL file.
        entity Toy is
        end Toy;
        attribute BOUNDARY_LENGTH of Toy : entity is 8;
        attribute INSTRUCTION_OPCODE of Toy : entity is
            "EXTEST (000), SAMPLE (001), IDCODE (010), BYPASS (111)";
        attribute BOUNDARY_REGISTER of Toy : entity is
            "0 (BC_1, PA0, OUTPUT3, X, 0, Z, 0),"
            "1 (BC_1, PA1, INPUT, X)";
    "#;

    #[test]
    fn parse_entity_name() {
        let d = parse_bsdl(SAMPLE_BSDL).unwrap();
        assert_eq!(d.entity, "Toy");
    }

    #[test]
    fn parse_boundary_length() {
        let d = parse_bsdl(SAMPLE_BSDL).unwrap();
        assert_eq!(d.boundary_length, 8);
    }

    #[test]
    fn parse_instructions() {
        let d = parse_bsdl(SAMPLE_BSDL).unwrap();
        let extest = d.instructions.get("EXTEST").unwrap();
        assert_eq!(extest.opcode, 0);
        assert_eq!(extest.width, 3);
        let bypass = d.instructions.get("BYPASS").unwrap();
        assert_eq!(bypass.opcode, 0b111);
    }

    #[test]
    fn parse_boundary_cells() {
        let d = parse_bsdl(SAMPLE_BSDL).unwrap();
        assert_eq!(d.boundary.len(), 2);
        assert_eq!(d.boundary[0].port, "PA0");
        assert_eq!(d.boundary[1].port, "PA1");
    }

    #[test]
    fn missing_instruction_errors_on_load() {
        let d = BsdlDescriptor {
            entity: "x".into(),
            boundary_length: 8,
            instructions: HashMap::new(),
            boundary: vec![],
        };
        let mut t = JtagMockTransport::new();
        let mut bs = BoundaryScan::new(d, &mut t);
        let r = bs.sample();
        assert!(r.is_err());
    }

    #[test]
    fn extest_loads_ir_and_shifts_dr() {
        let d = parse_bsdl(SAMPLE_BSDL).unwrap();
        let mut t = JtagMockTransport::new();
        t.queue_tdo(&vec![false; 100]);
        let mut bs = BoundaryScan::new(d, &mut t);
        let outputs = vec![true, false, true, false, true, false, true, false];
        let _ = bs.extest(&outputs).unwrap();
        // Some pulses should have been issued.
        assert!(!t.pulses.is_empty());
    }
}
