// SFDP (Serial Flash Discoverable Parameters)  -  JEDEC JESD216.
// Pure parsers for the SFDP header and Basic Flash Parameter Table.
// Mirrors src/chips/sfdp.ts byte-for-byte.

use serde::{Deserialize, Serialize};

const SFDP_SIGNATURE: [u8; 4] = [0x53, 0x46, 0x44, 0x50]; // "SFDP"

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SfdpParameterHeader {
    pub id_lsb: u8,
    pub minor_rev: u8,
    pub major_rev: u8,
    pub length: u8,
    pub table_pointer: u32,
    pub id_msb: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SfdpHeaderInfo {
    pub signature: String,
    pub valid: bool,
    pub minor_rev: u8,
    pub major_rev: u8,
    pub num_parameter_headers: u8,
    pub access_protocol: u8,
    pub parameter_headers: Vec<SfdpParameterHeader>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AddressByteCount {
    #[serde(rename = "3")]
    Three,
    #[serde(rename = "4")]
    Four,
    #[serde(rename = "3-or-4")]
    ThreeOrFour,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EraseType {
    pub size_exp: u8,
    pub size_bytes: u32,
    pub opcode: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SfdpBasicFlashParams {
    pub erase_size_4kb: bool,
    pub fast_read_supported: bool,
    pub address_byte_count: AddressByteCount,
    pub ddr_supported: bool,
    pub fast_read_opcode: u8,
    pub density_bits: u64,
    pub density_bytes: u64,
    pub erase_types: Vec<EraseType>,
    pub page_size: u32,
    pub needs_4byte_addr: bool,
    pub sector_size: u32,
    pub block_size: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SfdpSynthesizedChip {
    pub name: String,
    pub vendor: String,
    pub jedec_id: String,
    pub size_bytes: u64,
    pub chip_type: &'static str,
    pub page_size: u32,
    pub sector_size: u32,
    pub block_size: u32,
    pub voltage: f32,
    pub needs_4byte_addr: bool,
    pub source: &'static str,
}

fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3],
    ])
}

pub fn parse_sfdp_header(buf: &[u8]) -> SfdpHeaderInfo {
    let empty = SfdpHeaderInfo {
        signature: String::new(),
        valid: false,
        minor_rev: 0,
        major_rev: 0,
        num_parameter_headers: 0,
        access_protocol: 0,
        parameter_headers: Vec::new(),
    };
    if buf.len() < 8 {
        return empty;
    }

    let sig_bytes = [buf[0], buf[1], buf[2], buf[3]];
    let signature = String::from_utf8_lossy(&sig_bytes).into_owned();
    if sig_bytes != SFDP_SIGNATURE {
        return SfdpHeaderInfo { signature, ..empty };
    }

    let minor_rev = buf[4];
    let major_rev = buf[5];
    let nph_field = buf[6];
    let access_protocol = buf[7];
    let num_parameter_headers = nph_field.wrapping_add(1);

    let mut parameter_headers = Vec::new();
    for i in 0..num_parameter_headers as usize {
        let offset = 8 + i * 8;
        if buf.len() < offset + 8 {
            break;
        }
        parameter_headers.push(SfdpParameterHeader {
            id_lsb: buf[offset],
            minor_rev: buf[offset + 1],
            major_rev: buf[offset + 2],
            length: buf[offset + 3],
            table_pointer: (buf[offset + 4] as u32)
                | ((buf[offset + 5] as u32) << 8)
                | ((buf[offset + 6] as u32) << 16),
            id_msb: buf[offset + 7],
        });
    }

    SfdpHeaderInfo {
        signature,
        valid: true,
        minor_rev,
        major_rev,
        num_parameter_headers,
        access_protocol,
        parameter_headers,
    }
}

pub fn parse_basic_flash_params(buf: &[u8]) -> Option<SfdpBasicFlashParams> {
    if buf.len() < 16 {
        return None;
    }

    let dw1 = read_u32_le(buf, 0);
    let dw2 = read_u32_le(buf, 4);

    let erase_size_4kb = (dw1 & 0x3) == 0x1;
    let ddr_supported = ((dw1 >> 2) & 0x1) != 0;
    let address_byte_field = (dw1 >> 17) & 0x3;
    let address_byte_count = match address_byte_field {
        0 => AddressByteCount::Three,
        1 => AddressByteCount::ThreeOrFour,
        _ => AddressByteCount::Four,
    };
    let fast_read_supported = ((dw1 >> 16) & 0x1) != 0;
    let fast_read_opcode = ((dw1 >> 8) & 0xff) as u8;

    let density_bits: u64 = if dw2 & 0x8000_0000 != 0 {
        let n = dw2 & 0x7fff_ffff;
        if n >= 32 {
            return None;
        }
        1u64 << n
    } else {
        (dw2 as u64) + 1
    };
    if density_bits == 0 {
        return None;
    }
    let density_bytes = density_bits / 8;

    let mut erase_types = Vec::new();
    if buf.len() >= 36 {
        for i in 0..4 {
            let size_exp = buf[28 + i * 2];
            let opcode = buf[28 + i * 2 + 1];
            if size_exp > 0 && size_exp < 32 {
                erase_types.push(EraseType {
                    size_exp,
                    size_bytes: 1u32 << size_exp,
                    opcode,
                });
            }
        }
    }

    let mut page_size: u32 = 256;
    if buf.len() >= 44 {
        let dw11 = read_u32_le(buf, 40);
        let page_size_bits = (dw11 >> 4) & 0x0f;
        if page_size_bits > 0 && page_size_bits < 24 {
            page_size = 1u32 << page_size_bits;
        }
    }

    let sector_size = erase_types
        .iter()
        .map(|e| e.size_bytes)
        .min()
        .unwrap_or(if erase_size_4kb { 4096 } else { 65536 });
    let block_size = erase_types
        .iter()
        .map(|e| e.size_bytes)
        .max()
        .unwrap_or(65536);

    let needs_4byte_addr = density_bytes > 16 * 1024 * 1024;

    Some(SfdpBasicFlashParams {
        erase_size_4kb,
        fast_read_supported,
        address_byte_count,
        ddr_supported,
        fast_read_opcode,
        density_bits,
        density_bytes,
        erase_types,
        page_size,
        needs_4byte_addr,
        sector_size,
        block_size,
    })
}

/// Run full SFDP discovery over any transport. `read_at(addr, len)` performs an
/// SFDP read (opcode 0x5A + 3-byte address + dummy) at the given SFDP-space
/// address. Returns Ok(None) when the chip exposes no valid SFDP signature or
/// no parsable basic flash parameter table — callers report that honestly
/// instead of fabricating zeroed parameters.
pub fn discover_sfdp<E>(
    mut read_at: impl FnMut(u32, usize) -> std::result::Result<Vec<u8>, E>,
) -> std::result::Result<Option<crate::types::SfdpInfo>, E> {
    // SFDP header (8 bytes) + first parameter header (8 bytes).
    let hdr = read_at(0, 16)?;
    let info = parse_sfdp_header(&hdr);
    if !info.valid {
        return Ok(None);
    }
    // The Basic Flash Parameter Table is the mandatory id-0x00 header.
    let Some(ph) = info.parameter_headers.iter().find(|h| h.id_lsb == 0x00) else {
        return Ok(None);
    };
    let table_len = ((ph.length as usize) * 4).max(16);
    let table = read_at(ph.table_pointer, table_len)?;
    let Some(p) = parse_basic_flash_params(&table) else {
        return Ok(None);
    };
    Ok(Some(crate::types::SfdpInfo {
        density_bits: p.density_bits,
        density_bytes: p.density_bytes,
        page_size: p.page_size,
        sector_size_4kb: p.erase_size_4kb,
        block_size_32kb: p.erase_types.iter().any(|e| e.size_bytes == 32 * 1024),
        block_size_64kb: p.erase_types.iter().any(|e| e.size_bytes == 64 * 1024),
        supports_4byte_addr: p.needs_4byte_addr
            || !matches!(p.address_byte_count, AddressByteCount::Three),
        fast_read_supported: p.fast_read_supported,
        raw_header: crate::types::hex_encode(&hdr),
    }))
}

pub fn synthesize_chip_from_sfdp(
    jedec_id: &str,
    manufacturer_name: &str,
    params: &SfdpBasicFlashParams,
    voltage_hint: Option<f32>,
) -> SfdpSynthesizedChip {
    SfdpSynthesizedChip {
        name: format!("Unknown {} (via SFDP)", jedec_id.to_ascii_uppercase()),
        vendor: manufacturer_name.to_string(),
        jedec_id: jedec_id.to_ascii_lowercase(),
        size_bytes: params.density_bytes,
        chip_type: "spi",
        page_size: params.page_size,
        sector_size: params.sector_size,
        block_size: params.block_size,
        voltage: voltage_hint.unwrap_or(3.3),
        needs_4byte_addr: params.needs_4byte_addr,
        source: "sfdp",
    }
}

#[derive(Debug, Clone)]
pub struct BuildSfdpOptions {
    pub major_rev: u8,
    pub minor_rev: u8,
    pub density_bits: u64,
    pub use_density_shift: bool,
    pub erase_size_4kb: bool,
    pub fast_read_supported: bool,
    pub address_bytes: AddressByteCount,
    pub page_size: u32,
    pub erase_types: Vec<(u8, u8)>,
    pub corrupt_signature: bool,
    pub truncate_to: Option<usize>,
    pub omit_param_table: bool,
}

impl Default for BuildSfdpOptions {
    fn default() -> Self {
        Self {
            major_rev: 1,
            minor_rev: 5,
            density_bits: 8 * 1024 * 1024 * 8,
            use_density_shift: false,
            erase_size_4kb: true,
            fast_read_supported: true,
            address_bytes: AddressByteCount::Three,
            page_size: 256,
            erase_types: vec![(12, 0x20), (15, 0x52), (16, 0xd8)],
            corrupt_signature: false,
            truncate_to: None,
            omit_param_table: false,
        }
    }
}

pub fn build_synthetic_sfdp(opts: &BuildSfdpOptions) -> Vec<u8> {
    let table_offset: usize = 0x80;
    let table_length_dwords: u8 = 20;
    let mut buf = vec![0u8; table_offset + (table_length_dwords as usize) * 4];

    if opts.corrupt_signature {
        buf[0] = 0x42;
        buf[1] = 0x41;
        buf[2] = 0x44;
        buf[3] = 0x00;
    } else {
        buf[..4].copy_from_slice(&SFDP_SIGNATURE);
    }
    buf[4] = opts.minor_rev;
    buf[5] = opts.major_rev;
    buf[6] = 0x00; // NPH=0 → 1 parameter header
    buf[7] = 0xff;

    buf[8] = 0x00;
    buf[9] = opts.minor_rev;
    buf[10] = opts.major_rev;
    buf[11] = table_length_dwords;
    buf[12] = (table_offset & 0xff) as u8;
    buf[13] = ((table_offset >> 8) & 0xff) as u8;
    buf[14] = ((table_offset >> 16) & 0xff) as u8;
    buf[15] = 0xff;

    if opts.omit_param_table {
        buf.truncate(16);
        return buf;
    }

    let mut dw1: u32 = 0;
    if opts.erase_size_4kb {
        dw1 |= 0x1;
    }
    if opts.fast_read_supported {
        dw1 |= 1 << 16;
    }
    let addr_field: u32 = match opts.address_bytes {
        AddressByteCount::Three => 0,
        AddressByteCount::ThreeOrFour => 1,
        AddressByteCount::Four => 2,
    };
    dw1 |= (addr_field & 0x3) << 17;
    dw1 |= 0xeb << 8;
    buf[table_offset..table_offset + 4].copy_from_slice(&dw1.to_le_bytes());

    let dw2: u32 = if opts.use_density_shift {
        let n = (opts.density_bits as f64).log2().round() as u32;
        0x8000_0000 | n
    } else {
        (opts.density_bits - 1) as u32
    };
    buf[table_offset + 4..table_offset + 8].copy_from_slice(&dw2.to_le_bytes());

    for (i, et) in opts.erase_types.iter().take(4).enumerate() {
        buf[table_offset + 28 + i * 2] = et.0;
        buf[table_offset + 28 + i * 2 + 1] = et.1;
    }

    let page_size_bits = (opts.page_size as f64).log2().round() as u32;
    let dw11: u32 = (page_size_bits & 0xf) << 4;
    buf[table_offset + 40..table_offset + 44].copy_from_slice(&dw11.to_le_bytes());

    if let Some(n) = opts.truncate_to {
        buf.truncate(n);
    }
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_header_valid_signature() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let h = parse_sfdp_header(&buf);
        assert!(h.valid);
        assert_eq!(h.signature, "SFDP");
        assert_eq!(h.major_rev, 1);
        assert_eq!(h.minor_rev, 5);
        assert_eq!(h.num_parameter_headers, 1);
        assert_eq!(h.parameter_headers.len(), 1);
        assert_eq!(h.parameter_headers[0].id_lsb, 0x00);
        assert_eq!(h.parameter_headers[0].table_pointer, 0x80);
    }

    #[test]
    fn parse_header_rejects_corrupt_signature() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions {
            corrupt_signature: true,
            ..Default::default()
        });
        let h = parse_sfdp_header(&buf);
        assert!(!h.valid);
        assert_eq!(h.signature, "BAD\0");
    }

    #[test]
    fn parse_header_too_short() {
        let h = parse_sfdp_header(&[0u8; 4]);
        assert!(!h.valid);
        assert!(h.parameter_headers.is_empty());
    }

    #[test]
    fn parse_bfpt_8mb_default() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let bfpt = parse_basic_flash_params(&buf[0x80..]).expect("parse BFPT");
        assert!(bfpt.erase_size_4kb);
        assert!(bfpt.fast_read_supported);
        assert_eq!(bfpt.address_byte_count, AddressByteCount::Three);
        assert_eq!(bfpt.fast_read_opcode, 0xeb);
        assert_eq!(bfpt.density_bytes, 8 * 1024 * 1024);
        assert_eq!(bfpt.page_size, 256);
        assert!(!bfpt.needs_4byte_addr);
        assert_eq!(bfpt.sector_size, 4096); // smallest erase
        assert_eq!(bfpt.block_size, 65536); // largest erase
    }

    #[test]
    fn parse_bfpt_density_via_shift_encoding() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions {
            density_bits: 32 * 1024 * 1024 * 8, // 32MB → bit 28
            use_density_shift: true,
            ..Default::default()
        });
        let bfpt = parse_basic_flash_params(&buf[0x80..]).expect("parse");
        assert_eq!(bfpt.density_bytes, 32 * 1024 * 1024);
    }

    #[test]
    fn parse_bfpt_4byte_when_over_16mb() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions {
            density_bits: 32 * 1024 * 1024 * 8,
            address_bytes: AddressByteCount::Four,
            ..Default::default()
        });
        let bfpt = parse_basic_flash_params(&buf[0x80..]).expect("parse");
        assert!(bfpt.needs_4byte_addr);
        assert_eq!(bfpt.address_byte_count, AddressByteCount::Four);
    }

    #[test]
    fn parse_bfpt_rejects_too_short() {
        assert!(parse_basic_flash_params(&[0u8; 8]).is_none());
    }

    #[test]
    fn synthesize_from_sfdp_uses_voltage_hint() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let bfpt = parse_basic_flash_params(&buf[0x80..]).unwrap();
        let chip = synthesize_chip_from_sfdp("EF4017", "Winbond", &bfpt, Some(1.8));
        assert_eq!(chip.jedec_id, "ef4017");
        assert_eq!(chip.vendor, "Winbond");
        assert_eq!(chip.size_bytes, 8 * 1024 * 1024);
        assert_eq!(chip.voltage, 1.8);
        assert_eq!(chip.source, "sfdp");
    }

    #[test]
    fn synthesize_default_voltage_when_no_hint() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let bfpt = parse_basic_flash_params(&buf[0x80..]).unwrap();
        let chip = synthesize_chip_from_sfdp("c84017", "Macronix", &bfpt, None);
        assert_eq!(chip.voltage, 3.3);
    }

    #[test]
    fn omit_param_table_truncates() {
        let buf = build_synthetic_sfdp(&BuildSfdpOptions {
            omit_param_table: true,
            ..Default::default()
        });
        assert_eq!(buf.len(), 16);
        let h = parse_sfdp_header(&buf);
        assert!(h.valid);
        assert_eq!(h.parameter_headers.len(), 1);
    }
}
