// UEFI Firmware Volume + FFS file walk.
// Ports src/analysis/uefi.ts.

use serde::{Deserialize, Serialize};

const FVH_SIG_U32: u32 = 0x4856_465f; // "_FVH" in LE
const FVH_SIG: &[u8] = b"_FVH";

const EFI_FV_FILETYPE_SEC: u8 = 0x03;
const EFI_FV_FILETYPE_PEI_CORE: u8 = 0x04;
const EFI_FV_FILETYPE_DXE_CORE: u8 = 0x05;
const EFI_FV_FILETYPE_PEIM: u8 = 0x06;
const EFI_FV_FILETYPE_DRIVER: u8 = 0x07;
const EFI_FV_FILETYPE_SMM: u8 = 0x0A;
const EFI_FV_FILETYPE_FV_IMAGE: u8 = 0x0B;

const FFS_FILE_TYPES: &[(u8, &str)] = &[
    (0x00, "Unknown"),
    (0x01, "RAW"),
    (0x02, "Freeform"),
    (0x03, "Security Core (SEC)"),
    (0x04, "PEI Core"),
    (0x05, "DXE Core"),
    (0x06, "PEIM (PEI Module)"),
    (0x07, "Driver (DXE)"),
    (0x08, "Combined PEIM/Driver"),
    (0x09, "Application"),
    (0x0A, "SMM Driver (MM)"),
    (0x0B, "Firmware Volume Image"),
    (0x0C, "Combined SMM/DXE"),
    (0x0D, "SMM Core (MM)"),
    (0x0E, "SMM Standalone"),
    (0x0F, "SMM Core Standalone"),
    (0xF0, "Pad File"),
];

const KNOWN_GUIDS: &[(&str, &str)] = &[
    ("1ba0062e-c779-4582-8566-336ae8f78f09", "PEI Core (PI)"),
    ("52c05b14-0b98-496c-bc3b-04b50211d680", "PEI Core (EDK2)"),
    ("d6a2cb7f-6a18-4e2f-b43b-9920a733700a", "DXE Core"),
    ("fc510ee7-ffdc-11d4-bd41-0080c73c8881", "DXE Apriori"),
    ("1b45cc0a-156a-428a-af62-49864da0e6e6", "PEI Apriori"),
    (
        "9e21fd93-9c72-4c15-8c4b-e77f1db2d792",
        "BDS (Boot Device Selection)",
    ),
    ("7c04a583-9e3e-4f1c-ad65-e05268d0b4d1", "Security (SEC)"),
    ("a19b1fe7-c1bc-49f8-875f-54a5d542443f", "AMI BIOS Guard"),
    (
        "cef5b9a3-476d-497f-9fdc-e98143e0422c",
        "NV Storage / Variable Store",
    ),
    (
        "fff12b8d-7696-4c8b-a985-2747075b4f50",
        "NV FTW (Fault Tolerant Write)",
    ),
    ("00000000-0000-0000-0000-000000000000", "Null GUID"),
    (
        "8c8ce578-8a3d-4f1c-9935-896185c32dd3",
        "EFI Global Variable GUID",
    ),
    ("24400798-3807-4a42-b413-a1ecee205dd8", "AMI TSE Setup"),
    ("4599d26f-1a11-49b8-b91f-858745cff824", "Boot Manager"),
    ("462caa21-7614-4503-836e-8ab6f4662331", "SMBIOS Protocol"),
    ("eb9d2d31-2d88-11d3-9a16-0090273fc14d", "SMBIOS Table"),
    (
        "964e5b21-6459-11d2-8e39-00a0c969723b",
        "SMBIOS Thunk Driver",
    ),
    (
        "587e72d7-cc50-4f79-8209-ca291fc1a10f",
        "Intel FSP (Firmware Support Package)",
    ),
    (
        "912740be-2284-4734-b971-84b027353f0c",
        "Intel Microcode Update",
    ),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UefiFfsFile {
    pub guid: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: u8,
    #[serde(rename = "typeName")]
    pub type_name: String,
    pub size: u64,
    pub state: u8,
    pub attributes: u8,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UefiFirmwareVolume {
    pub offset: u64,
    pub size: u64,
    pub phase: String,
    pub revision: u8,
    #[serde(rename = "fileSystem")]
    pub file_system: String,
    pub files: Vec<UefiFfsFile>,
    pub attributes: u32,
    #[serde(rename = "headerLength")]
    pub header_length: u16,
}

fn read_u16_le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}

fn read_u32_le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

fn read_u64_le(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes([
        b[o],
        b[o + 1],
        b[o + 2],
        b[o + 3],
        b[o + 4],
        b[o + 5],
        b[o + 6],
        b[o + 7],
    ])
}

fn format_guid(buf: &[u8], offset: usize) -> String {
    if offset + 16 > buf.len() {
        return "00000000-0000-0000-0000-000000000000".to_string();
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

fn guid_name(guid: &str) -> &'static str {
    let lower = guid.to_ascii_lowercase();
    KNOWN_GUIDS
        .iter()
        .find(|(k, _)| *k == lower)
        .map(|(_, v)| *v)
        .unwrap_or("")
}

fn file_type_name(t: u8) -> String {
    FFS_FILE_TYPES
        .iter()
        .find(|(k, _)| *k == t)
        .map(|(_, v)| v.to_string())
        .unwrap_or_else(|| format!("Type 0x{t:x}"))
}

pub fn parse_uefi_firmware_volume(data: &[u8], offset: usize) -> Option<UefiFirmwareVolume> {
    if offset + 56 > data.len() {
        return None;
    }
    let sig = read_u32_le(data, offset + 40);
    if sig != FVH_SIG_U32 {
        return None;
    }
    let fv_length = read_u64_le(data, offset + 32) as usize;
    if fv_length == 0 || fv_length > data.len() - offset {
        return None;
    }
    let header_length = read_u16_le(data, offset + 48);
    let revision = data[offset + 55];
    let attributes = read_u32_le(data, offset + 44);
    let file_system_guid = format_guid(data, offset);

    let mut files: Vec<UefiFfsFile> = Vec::new();
    let mut file_offset = offset + header_length as usize;

    while file_offset + 24 < offset + fv_length {
        while file_offset < offset + fv_length && data[file_offset] == 0xff {
            file_offset += 1;
        }
        if file_offset + 24 >= offset + fv_length {
            break;
        }
        let file_guid = format_guid(data, file_offset);
        if file_guid == "00000000-0000-0000-0000-000000000000" {
            break;
        }

        let file_type = data[file_offset + 18];
        let file_attributes = data[file_offset + 19];
        let file_state = data[file_offset + 23];

        let mut file_size: usize = data[file_offset + 20] as usize
            | ((data[file_offset + 21] as usize) << 8)
            | ((data[file_offset + 22] as usize) << 16);
        let mut data_off = 24usize;

        if (file_attributes & 0x01) != 0
            && file_size == 0xff_ffff
            && file_offset + 32 <= offset + fv_length
        {
            file_size = read_u64_le(data, file_offset + 24) as usize;
            data_off = 32;
        }

        if file_size < data_off || file_size > fv_length {
            break;
        }

        let guid_friendly = guid_name(&file_guid);
        let type_friendly = file_type_name(file_type);

        files.push(UefiFfsFile {
            guid: file_guid,
            name: if !guid_friendly.is_empty() {
                guid_friendly.to_string()
            } else {
                type_friendly.clone()
            },
            file_type,
            type_name: type_friendly,
            size: file_size as u64,
            state: file_state,
            attributes: file_attributes,
            offset: file_offset as u64,
        });

        file_offset += file_size;
        file_offset = (file_offset + 7) & !7;
    }

    // Phase classification
    let mut phase = "Unknown".to_string();
    let has_sec = files.iter().any(|f| f.file_type == EFI_FV_FILETYPE_SEC);
    let has_pei_core = files
        .iter()
        .any(|f| f.file_type == EFI_FV_FILETYPE_PEI_CORE);
    let has_dxe_core = files
        .iter()
        .any(|f| f.file_type == EFI_FV_FILETYPE_DXE_CORE);
    let has_peims = files.iter().any(|f| f.file_type == EFI_FV_FILETYPE_PEIM);
    let has_dxe_drivers = files.iter().any(|f| f.file_type == EFI_FV_FILETYPE_DRIVER);
    let has_smm_drivers = files.iter().any(|f| f.file_type == EFI_FV_FILETYPE_SMM);

    if has_pei_core || (has_peims && !has_dxe_drivers) {
        phase = "PEI".to_string();
    } else if has_dxe_core || has_dxe_drivers {
        phase = "DXE".to_string();
    } else if has_smm_drivers {
        phase = "SMM".to_string();
    } else if files.is_empty()
        || files
            .iter()
            .all(|f| f.file_type == EFI_FV_FILETYPE_FV_IMAGE)
    {
        phase = "FV Container".to_string();
    }
    if has_sec {
        phase = "SEC".to_string();
    }

    Some(UefiFirmwareVolume {
        offset: offset as u64,
        size: fv_length as u64,
        phase,
        revision,
        file_system: file_system_guid,
        files,
        attributes,
        header_length,
    })
}

pub fn scan_firmware_volumes(data: &[u8]) -> Vec<UefiFirmwareVolume> {
    let mut volumes = Vec::new();
    // Single forward cursor: the _FVH search always resumes here, so each
    // location is examined at most once (no per-iteration rescan from 0).
    let mut search_from = 0usize;
    while search_from + 56 < data.len() {
        // Resume the "_FVH" search from the cursor instead of restarting.
        let sig_offset = match data[search_from..]
            .windows(FVH_SIG.len())
            .position(|w| w == FVH_SIG)
            .map(|rel| search_from + rel)
        {
            Some(s) if s >= 40 => s,
            _ => break,
        };
        let fv_base = sig_offset - 40;
        if let Some(fv) = parse_uefi_firmware_volume(data, fv_base) {
            search_from = fv_base + fv.size as usize;
            volumes.push(fv);
        } else {
            search_from = sig_offset + 4;
        }
    }
    volumes
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a synthetic UEFI FV with a single PEI Core file.
    fn fv_with_pei_core() -> Vec<u8> {
        let fv_len: usize = 1024;
        let header_len: usize = 0x48;
        let mut v = vec![0u8; fv_len];
        // FileSystemGuid at offset 0  -  anything works for tests.
        v[8..16].copy_from_slice(&[0x55u8; 8]);
        // FvLength at offset 32 (u64 LE)
        v[32..40].copy_from_slice(&(fv_len as u64).to_le_bytes());
        // _FVH signature at offset 40
        v[40..44].copy_from_slice(FVH_SIG);
        // Attributes at offset 44 (u32)
        v[44..48].copy_from_slice(&0u32.to_le_bytes());
        // HeaderLength at offset 48 (u16)
        v[48..50].copy_from_slice(&(header_len as u16).to_le_bytes());
        // Revision at offset 55
        v[55] = 2;

        // FFS file at file_offset = 0 + header_len
        let f = header_len;
        // GUID = some non-null pattern
        v[f..f + 16].copy_from_slice(&[
            0x2e, 0x06, 0xa0, 0x1b, 0x79, 0xc7, 0x82, 0x45, 0x85, 0x66, 0x33, 0x6a, 0xe8, 0xf7,
            0x8f, 0x09,
        ]); // PEI Core (PI) GUID
        v[f + 18] = EFI_FV_FILETYPE_PEI_CORE;
        v[f + 19] = 0; // attributes (no extended size)
                       // size: 256 bytes (3-byte field at offset 20)
        v[f + 20] = 0x80;
        v[f + 21] = 0x00;
        v[f + 22] = 0x00;
        v[f + 23] = 0; // state
        v
    }

    #[test]
    fn rejects_invalid_fv() {
        let v = vec![0u8; 100];
        assert!(parse_uefi_firmware_volume(&v, 0).is_none());
    }

    #[test]
    fn parses_minimal_fv() {
        let v = fv_with_pei_core();
        let fv = parse_uefi_firmware_volume(&v, 0).expect("parse FV");
        assert_eq!(fv.size, 1024);
        assert_eq!(fv.revision, 2);
        assert!(!fv.files.is_empty());
    }

    #[test]
    fn classifies_pei_phase_from_pei_core_file() {
        let v = fv_with_pei_core();
        let fv = parse_uefi_firmware_volume(&v, 0).unwrap();
        assert_eq!(fv.phase, "PEI");
    }

    #[test]
    fn scan_finds_fv_in_image() {
        let mut img = vec![0u8; 4096];
        // Plant FV at offset 512.
        let fv = fv_with_pei_core();
        img[512..512 + fv.len()].copy_from_slice(&fv);
        let found = scan_firmware_volumes(&img);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].offset, 512);
    }

    #[test]
    fn scan_empty_image_returns_no_volumes() {
        let v = vec![0xffu8; 4096];
        assert!(scan_firmware_volumes(&v).is_empty());
    }

    #[test]
    fn file_type_name_known_and_unknown() {
        assert_eq!(file_type_name(0x06), "PEIM (PEI Module)");
        assert!(file_type_name(0x42).contains("0x42"));
    }

    #[test]
    fn guid_name_resolves_known() {
        assert_eq!(
            guid_name("d6a2cb7f-6a18-4e2f-b43b-9920a733700a"),
            "DXE Core"
        );
        assert_eq!(guid_name("invalid"), "");
    }
}
