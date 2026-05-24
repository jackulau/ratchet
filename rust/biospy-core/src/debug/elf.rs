// Minimal ELF parser — enough to look up symbol addresses by name and
// reverse-look-up names by address in firmware images. Supports ELF32
// little-endian (the common case for ARM Cortex-M firmware). ELF64 LE
// supported for desktop tooling.
//
// We deliberately do NOT pull a `goblin` / `object` crate — the parser
// is tiny and avoids dragging in a heavy dependency.
//
// Reference: System V ABI — ELF specification.

use crate::backends::{BackendError, Result};

const ELF_MAGIC: [u8; 4] = [0x7F, b'E', b'L', b'F'];
const ELFCLASS32: u8 = 1;
const ELFCLASS64: u8 = 2;
const ELFDATA2LSB: u8 = 1;

const SHT_SYMTAB: u32 = 2;
// `SHT_STRTAB` (3) — kept for future BSDL/.debug_str expansion. Skip silenced via allow.
#[allow(dead_code)]
const SHT_STRTAB: u32 = 3;

#[derive(Debug, Clone)]
pub struct Symbol {
    pub name: String,
    pub address: u64,
    pub size: u64,
    pub binding: u8,
    pub typ: u8,
}

#[derive(Debug, Clone)]
pub struct ElfFile {
    pub is_64: bool,
    pub little_endian: bool,
    pub entry: u64,
    pub symbols: Vec<Symbol>,
}

impl ElfFile {
    pub fn parse(buf: &[u8]) -> Result<ElfFile> {
        if buf.len() < 16 || buf[0..4] != ELF_MAGIC {
            return Err(BackendError::Other("not an ELF file".into()));
        }
        let class = buf[4];
        let endian = buf[5];
        if endian != ELFDATA2LSB {
            return Err(BackendError::Other(
                "ELF: only little-endian supported".into(),
            ));
        }
        let is_64 = match class {
            ELFCLASS32 => false,
            ELFCLASS64 => true,
            _ => return Err(BackendError::Other("ELF: bad class".into())),
        };

        let entry: u64;
        let shoff: u64;
        let shentsize: usize;
        let shnum: usize;
        let shstrndx: usize;

        if is_64 {
            if buf.len() < 0x40 {
                return Err(BackendError::Other("ELF64: header truncated".into()));
            }
            entry = le_u64(&buf[0x18..0x20]);
            shoff = le_u64(&buf[0x28..0x30]);
            shentsize = le_u16(&buf[0x3A..0x3C]) as usize;
            shnum = le_u16(&buf[0x3C..0x3E]) as usize;
            shstrndx = le_u16(&buf[0x3E..0x40]) as usize;
        } else {
            if buf.len() < 0x34 {
                return Err(BackendError::Other("ELF32: header truncated".into()));
            }
            entry = le_u32(&buf[0x18..0x1C]) as u64;
            shoff = le_u32(&buf[0x20..0x24]) as u64;
            shentsize = le_u16(&buf[0x2E..0x30]) as usize;
            shnum = le_u16(&buf[0x30..0x32]) as usize;
            shstrndx = le_u16(&buf[0x32..0x34]) as usize;
        }

        // Read section headers.
        let mut sections = Vec::with_capacity(shnum);
        for i in 0..shnum {
            let off = (shoff as usize) + i * shentsize;
            if off + shentsize > buf.len() {
                return Err(BackendError::Other("ELF: section header overflow".into()));
            }
            sections.push(parse_section(&buf[off..off + shentsize], is_64));
        }

        // Find .symtab + matching strtab.
        let symtab_idx = sections.iter().position(|s| s.sh_type == SHT_SYMTAB);
        let symbols = if let Some(idx) = symtab_idx {
            let sym = &sections[idx];
            let str_idx = sym.sh_link as usize;
            let symtab_bytes = slice_section(buf, sym)?;
            let strtab = slice_section(buf, &sections[str_idx])?;
            parse_symtab(symtab_bytes, strtab, is_64)?
        } else {
            Vec::new()
        };

        let _ = shstrndx; // not currently used.
        Ok(ElfFile {
            is_64,
            little_endian: true,
            entry,
            symbols,
        })
    }

    pub fn lookup_symbol(&self, name: &str) -> Option<&Symbol> {
        self.symbols.iter().find(|s| s.name == name)
    }

    pub fn lookup_address(&self, addr: u64) -> Option<&Symbol> {
        self.symbols
            .iter()
            .filter(|s| s.size > 0 && addr >= s.address && addr < s.address + s.size)
            .min_by_key(|s| s.size)
    }
}

#[derive(Debug)]
struct Section {
    sh_type: u32,
    sh_offset: u64,
    sh_size: u64,
    sh_link: u32,
}

fn parse_section(bytes: &[u8], is_64: bool) -> Section {
    if is_64 {
        Section {
            sh_type: le_u32(&bytes[4..8]),
            sh_offset: le_u64(&bytes[24..32]),
            sh_size: le_u64(&bytes[32..40]),
            sh_link: le_u32(&bytes[40..44]),
        }
    } else {
        Section {
            sh_type: le_u32(&bytes[4..8]),
            sh_offset: le_u32(&bytes[16..20]) as u64,
            sh_size: le_u32(&bytes[20..24]) as u64,
            sh_link: le_u32(&bytes[24..28]),
        }
    }
}

fn slice_section<'b>(buf: &'b [u8], s: &Section) -> Result<&'b [u8]> {
    let start = s.sh_offset as usize;
    let end = start + s.sh_size as usize;
    if end > buf.len() {
        return Err(BackendError::Other("ELF: section out of bounds".into()));
    }
    Ok(&buf[start..end])
}

fn parse_symtab(symtab: &[u8], strtab: &[u8], is_64: bool) -> Result<Vec<Symbol>> {
    let entsize = if is_64 { 24 } else { 16 };
    let count = symtab.len() / entsize;
    let mut out = Vec::with_capacity(count);
    for i in 0..count {
        let entry = &symtab[i * entsize..(i + 1) * entsize];
        let (name_off, address, size, info) = if is_64 {
            (
                le_u32(&entry[0..4]) as usize,
                le_u64(&entry[8..16]),
                le_u64(&entry[16..24]),
                entry[4],
            )
        } else {
            (
                le_u32(&entry[0..4]) as usize,
                le_u32(&entry[4..8]) as u64,
                le_u32(&entry[8..12]) as u64,
                entry[12],
            )
        };
        let name = read_string(strtab, name_off);
        out.push(Symbol {
            name,
            address,
            size,
            binding: info >> 4,
            typ: info & 0x0F,
        });
    }
    Ok(out)
}

fn read_string(strtab: &[u8], offset: usize) -> String {
    if offset >= strtab.len() {
        return String::new();
    }
    let mut end = offset;
    while end < strtab.len() && strtab[end] != 0 {
        end += 1;
    }
    String::from_utf8_lossy(&strtab[offset..end]).into_owned()
}

fn le_u16(b: &[u8]) -> u16 {
    u16::from_le_bytes([b[0], b[1]])
}

fn le_u32(b: &[u8]) -> u32 {
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

fn le_u64(b: &[u8]) -> u64 {
    u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bad_magic_errors() {
        let buf = vec![0u8; 64];
        assert!(ElfFile::parse(&buf).is_err());
    }

    #[test]
    fn read_string_handles_null_terminator() {
        let strtab = b"\0hello\0world\0";
        assert_eq!(read_string(strtab, 1), "hello");
        assert_eq!(read_string(strtab, 7), "world");
        assert_eq!(read_string(strtab, 0), "");
    }

    #[test]
    fn read_string_out_of_bounds_is_empty() {
        let strtab = b"abc\0";
        assert_eq!(read_string(strtab, 100), "");
    }

    #[test]
    fn parses_synthesized_elf32_header() {
        // Construct a minimal ELF32 LE header (no sections) — just enough to
        // exercise the magic + class + endian + entry parsing path.
        let mut buf = vec![0u8; 0x34];
        buf[0..4].copy_from_slice(&ELF_MAGIC);
        buf[4] = ELFCLASS32;
        buf[5] = ELFDATA2LSB;
        buf[6] = 1; // version
                    // Entry point at 0x18..0x1C
        buf[0x18..0x1C].copy_from_slice(&0x08001234u32.to_le_bytes());
        // shoff/shentsize/shnum/shstrndx = 0 — no sections, fine.
        let elf = ElfFile::parse(&buf).unwrap();
        assert!(!elf.is_64);
        assert!(elf.little_endian);
        assert_eq!(elf.entry, 0x08001234);
        assert!(elf.symbols.is_empty());
    }

    #[test]
    fn lookup_symbol_by_name() {
        let symbols = vec![
            Symbol {
                name: "main".into(),
                address: 0x08001234,
                size: 64,
                binding: 1,
                typ: 2,
            },
            Symbol {
                name: "g_uart_rx_buf".into(),
                address: 0x20000100,
                size: 256,
                binding: 1,
                typ: 1,
            },
        ];
        let elf = ElfFile {
            is_64: false,
            little_endian: true,
            entry: 0,
            symbols,
        };
        let sym = elf.lookup_symbol("g_uart_rx_buf").unwrap();
        assert_eq!(sym.address, 0x20000100);
        assert!(elf.lookup_symbol("missing").is_none());
    }

    #[test]
    fn lookup_address_returns_containing_symbol() {
        let symbols = vec![Symbol {
            name: "data".into(),
            address: 0x20000000,
            size: 0x100,
            binding: 1,
            typ: 1,
        }];
        let elf = ElfFile {
            is_64: false,
            little_endian: true,
            entry: 0,
            symbols,
        };
        assert!(elf.lookup_address(0x20000050).is_some());
        assert!(elf.lookup_address(0x20000100).is_none());
        assert!(elf.lookup_address(0x10000000).is_none());
    }
}
