// NVRAM variable store parser. $VSS header → variable enumeration.
// Ports src/analysis/nvram.ts.

use serde::{Deserialize, Serialize};

const VSS_SIGNATURE: u32 = 0x5353_5624; // "$VSS"
const VARIABLE_HEADER_SIGNATURE: u16 = 0x55aa;
const VARIABLE_STATE_VALID: u8 = 0x3f;
const VARIABLE_STATE_DELETED: u8 = 0x3c;

const WELL_KNOWN_GUIDS: &[(&str, &str)] = &[
    (
        "8be4df61-93ca-11d2-aa0d-00e098032b8c",
        "EFI Global Variable",
    ),
    ("4599d26f-1a11-49b8-b91f-858745cff824", "Boot Manager"),
    ("158def5a-f656-419c-b027-7a3192c079d2", "AMI Setup"),
    ("ec87d643-eba4-4bb5-a1e5-3f3e36b20da9", "AMI AMITSE"),
    ("c811fa38-42c8-4579-a9bb-60e94eddfb34", "AMI NVRAM"),
    ("a04a27f4-df00-4d42-b552-39511302113d", "Setup (Phoenix)"),
    (
        "4dfbbaab-1392-4fde-abb8-c4861e4e0bcb",
        "Intel ME Configuration",
    ),
    (
        "3812723d-7e48-4e29-bc27-f4b9ce6be564",
        "Intel Platform Setup",
    ),
    ("4b3082a3-80c6-4d7e-9cd0-583917265df1", "Secure Boot KEK"),
    ("d719b2cb-3d3a-4596-a3bc-dad00e67656f", "Secure Boot DB"),
    ("77fa9abd-0359-4d32-bd60-28f4e78f784b", "Microsoft Variable"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NvramVarState {
    Valid,
    Deleted,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NvramVariable {
    pub name: String,
    pub guid: String,
    #[serde(rename = "guidName")]
    pub guid_name: String,
    pub size: u32,
    #[serde(rename = "dataSize")]
    pub data_size: u32,
    pub attributes: u32,
    pub state: NvramVarState,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NvramStore {
    pub found: bool,
    pub offset: u64,
    pub size: u64,
    pub format: String,
    pub variables: Vec<NvramVariable>,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
    #[serde(rename = "usedSize")]
    pub used_size: u64,
    #[serde(rename = "freeSize")]
    pub free_size: u64,
    #[serde(rename = "deletedCount")]
    pub deleted_count: u32,
    pub warnings: Vec<String>,
}

fn read_u16_le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}

fn read_u32_le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

fn format_guid(buf: &[u8], offset: usize) -> String {
    if offset + 16 > buf.len() {
        return String::new();
    }
    let d1 = read_u32_le(buf, offset);
    let d2 = read_u16_le(buf, offset + 4);
    let d3 = read_u16_le(buf, offset + 6);
    let d4: String = buf[offset + 8..offset + 10]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let d5: String = buf[offset + 10..offset + 16]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    format!("{d1:08x}-{d2:04x}-{d3:04x}-{d4}-{d5}")
}

fn read_utf16_le(buf: &[u8], offset: usize, max_bytes: usize) -> String {
    let mut chars = Vec::new();
    let mut i = 0usize;
    while i + 1 < max_bytes {
        if offset + i + 1 >= buf.len() {
            break;
        }
        let code = read_u16_le(buf, offset + i);
        if code == 0 {
            break;
        }
        chars.push(code);
        i += 2;
    }
    String::from_utf16_lossy(&chars)
}

fn guid_name(guid: &str) -> &'static str {
    let lower = guid.to_ascii_lowercase();
    WELL_KNOWN_GUIDS
        .iter()
        .find(|(k, _)| *k == lower)
        .map(|(_, v)| *v)
        .unwrap_or("")
}

pub fn find_nvram_store(data: &[u8]) -> Option<usize> {
    let mut i = 0usize;
    while i + 4 < data.len() {
        if read_u32_le(data, i) == VSS_SIGNATURE {
            return Some(i);
        }
        i += 4;
    }
    // Fallback: scan for variable header signature.
    for i in 0..data.len().saturating_sub(44) {
        if read_u16_le(data, i) == VARIABLE_HEADER_SIGNATURE {
            let state = data[i + 2];
            if state == VARIABLE_STATE_VALID || state == VARIABLE_STATE_DELETED {
                let name_size = read_u32_le(data, i + 36);
                let data_size = read_u32_le(data, i + 40);
                if name_size > 0 && name_size < 512 && data_size > 0 && data_size < 65536 {
                    return Some(i);
                }
            }
        }
    }
    None
}

pub fn parse_nvram_store(data: &[u8], store_offset: Option<usize>) -> NvramStore {
    let mut warnings: Vec<String> = Vec::new();

    let so = store_offset.or_else(|| find_nvram_store(data));
    let store_offset = match so {
        Some(o) => o,
        None => {
            return NvramStore {
                found: false,
                offset: 0,
                size: 0,
                format: "none".to_string(),
                variables: vec![],
                total_size: 0,
                used_size: 0,
                free_size: 0,
                deleted_count: 0,
                warnings: vec!["No NVRAM variable store found in image".to_string()],
            };
        }
    };

    let format: String;
    let store_size: usize;
    let mut var_offset: usize;

    if store_offset + 28 <= data.len() && read_u32_le(data, store_offset) == VSS_SIGNATURE {
        store_size = read_u32_le(data, store_offset + 4) as usize;
        format = "VSS (Variable Storage Segment)".to_string();
        var_offset = store_offset + 28;
    } else {
        store_size = (data.len() - store_offset).min(256 * 1024);
        format = "Raw UEFI Variables".to_string();
        var_offset = store_offset;
    }

    let mut variables: Vec<NvramVariable> = Vec::new();
    let mut used_size: usize = 0;
    let mut deleted_count: u32 = 0;
    let store_end = store_offset + store_size.min(data.len() - store_offset);

    while var_offset + 44 < store_end {
        if data[var_offset] == 0xff {
            var_offset += 1;
            continue;
        }
        let sig = read_u16_le(data, var_offset);
        if sig != VARIABLE_HEADER_SIGNATURE {
            var_offset += 1;
            continue;
        }
        let state = data[var_offset + 2];
        let attributes = read_u32_le(data, var_offset + 4);
        let guid = format_guid(data, var_offset + 20);
        let name_size = read_u32_le(data, var_offset + 36);
        let data_size = read_u32_le(data, var_offset + 40);

        if name_size == 0 || name_size > 512 || data_size > 65536 {
            var_offset += 4;
            continue;
        }
        let header_size: usize = 44;
        let total_var_size = header_size + name_size as usize + data_size as usize;
        if var_offset + total_var_size > store_end {
            break;
        }
        let name = read_utf16_le(data, var_offset + header_size, name_size as usize);
        let var_state = match state & 0x3f {
            x if x == VARIABLE_STATE_VALID => NvramVarState::Valid,
            x if x == VARIABLE_STATE_DELETED => NvramVarState::Deleted,
            _ => NvramVarState::Invalid,
        };

        variables.push(NvramVariable {
            name,
            guid: guid.clone(),
            guid_name: guid_name(&guid).to_string(),
            size: total_var_size as u32,
            data_size,
            attributes,
            state: var_state,
            offset: var_offset as u64,
        });
        used_size += total_var_size;
        if var_state == NvramVarState::Deleted {
            deleted_count += 1;
        }
        var_offset = (var_offset + total_var_size + 3) & !3;
    }

    let free_size = store_size.saturating_sub(used_size);

    if variables.is_empty() {
        warnings
            .push("No valid NVRAM variables found  -  store may be empty or corrupted".to_string());
    }
    if (deleted_count as usize) > variables.len() / 2 && !variables.is_empty() {
        warnings.push(format!(
            "High proportion of deleted variables ({deleted_count}/{})  -  NVRAM may need garbage collection or reflash",
            variables.len()
        ));
    }

    NvramStore {
        found: true,
        offset: store_offset as u64,
        size: store_size as u64,
        format,
        variables,
        total_size: store_size as u64,
        used_size: used_size as u64,
        free_size: free_size as u64,
        deleted_count,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal VSS store with one valid variable.
    fn vss_store_with_var(name: &str) -> Vec<u8> {
        let mut v = vec![0xffu8; 8192];
        // $VSS header at offset 100.
        let store = 100usize;
        v[store..store + 4].copy_from_slice(&VSS_SIGNATURE.to_le_bytes());
        v[store + 4..store + 8].copy_from_slice(&4096u32.to_le_bytes()); // store size
                                                                         // First variable at store + 28.
        let var = store + 28;
        // Header signature 0xAA55 (LE: 55 AA)
        v[var..var + 2].copy_from_slice(&VARIABLE_HEADER_SIGNATURE.to_le_bytes());
        v[var + 2] = VARIABLE_STATE_VALID;
        v[var + 4..var + 8].copy_from_slice(&7u32.to_le_bytes()); // attributes
                                                                  // GUID at var + 20 = EFI Global Variable GUID (LE bytes for first 8)
                                                                  // 8be4df61-93ca-11d2-aa0d-00e098032b8c
        v[var + 20..var + 24].copy_from_slice(&0x8be4_df61u32.to_le_bytes());
        v[var + 24..var + 26].copy_from_slice(&0x93cau16.to_le_bytes());
        v[var + 26..var + 28].copy_from_slice(&0x11d2u16.to_le_bytes());
        v[var + 28..var + 30].copy_from_slice(&[0xaa, 0x0d]);
        v[var + 30..var + 36].copy_from_slice(&[0x00, 0xe0, 0x98, 0x03, 0x2b, 0x8c]);
        // Name and data size
        let name_bytes_u16: Vec<u8> = name
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(|c| c.to_le_bytes())
            .collect();
        let name_size = name_bytes_u16.len() as u32;
        let data_size = 4u32;
        v[var + 36..var + 40].copy_from_slice(&name_size.to_le_bytes());
        v[var + 40..var + 44].copy_from_slice(&data_size.to_le_bytes());
        // Name follows header
        v[var + 44..var + 44 + name_bytes_u16.len()].copy_from_slice(&name_bytes_u16);
        // Data follows name
        let data_start = var + 44 + name_bytes_u16.len();
        v[data_start..data_start + 4].copy_from_slice(&0xDEAD_BEEFu32.to_le_bytes());
        v
    }

    #[test]
    fn no_store_returns_not_found() {
        let v = vec![0xaau8; 1024];
        let store = parse_nvram_store(&v, None);
        assert!(!store.found);
        assert!(store.warnings.iter().any(|w| w.contains("No NVRAM")));
    }

    #[test]
    fn finds_vss_store_with_one_variable() {
        let v = vss_store_with_var("Boot0000");
        let store = parse_nvram_store(&v, None);
        assert!(store.found);
        assert!(store.format.contains("VSS"));
        assert_eq!(store.variables.len(), 1);
        assert_eq!(store.variables[0].name, "Boot0000");
        assert_eq!(store.variables[0].state, NvramVarState::Valid);
    }

    #[test]
    fn resolves_well_known_guid_name() {
        let v = vss_store_with_var("BootCurrent");
        let store = parse_nvram_store(&v, None);
        assert_eq!(store.variables[0].guid_name, "EFI Global Variable");
    }

    #[test]
    fn format_guid_roundtrip() {
        let bytes = [
            0x61, 0xdf, 0xe4, 0x8b, 0xca, 0x93, 0xd2, 0x11, 0xaa, 0x0d, 0x00, 0xe0, 0x98, 0x03,
            0x2b, 0x8c,
        ];
        assert_eq!(
            format_guid(&bytes, 0),
            "8be4df61-93ca-11d2-aa0d-00e098032b8c"
        );
    }

    #[test]
    fn read_utf16_stops_at_null() {
        let bytes = [b'H', 0, b'i', 0, 0, 0, b'X', 0];
        assert_eq!(read_utf16_le(&bytes, 0, 8), "Hi");
    }
}
