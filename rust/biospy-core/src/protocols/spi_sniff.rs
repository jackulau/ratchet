// Passive SPI bus sniffer.
//
// Decodes captured (timestamp, CS, SCLK, MOSI, MISO) line traces into SPI
// transactions and (optionally) into human-readable SPI-flash commands.
//
// Configurable CPOL/CPHA (mode 0..3 per Motorola convention). CS-active
// polarity defaults to low (the common case).

use serde::Serialize;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum SpiMode {
    Mode0,
    Mode1,
    Mode2,
    Mode3,
}

impl SpiMode {
    /// (CPOL, CPHA). CPOL=clock idle high. CPHA=sample on second edge.
    pub fn cpol_cpha(self) -> (bool, bool) {
        match self {
            SpiMode::Mode0 => (false, false),
            SpiMode::Mode1 => (false, true),
            SpiMode::Mode2 => (true, false),
            SpiMode::Mode3 => (true, true),
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct SpiSample {
    pub t_us: u64,
    pub cs: bool,
    pub sclk: bool,
    pub mosi: bool,
    pub miso: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SpiTransaction {
    pub t_start_us: u64,
    pub t_end_us: u64,
    pub mosi: Vec<u8>,
    pub miso: Vec<u8>,
    pub decoded: Option<String>,
}

pub struct SpiDecoder {
    mode: SpiMode,
    cs_active_low: bool,
    in_xfer: bool,
    bit_count: u8,
    mosi_byte: u8,
    miso_byte: u8,
    cur_mosi: Vec<u8>,
    cur_miso: Vec<u8>,
    t_start: u64,
    last: Option<SpiSample>,
    pub transactions: Vec<SpiTransaction>,
}

impl SpiDecoder {
    pub fn new(mode: SpiMode, cs_active_low: bool) -> Self {
        Self {
            mode,
            cs_active_low,
            in_xfer: false,
            bit_count: 0,
            mosi_byte: 0,
            miso_byte: 0,
            cur_mosi: Vec::new(),
            cur_miso: Vec::new(),
            t_start: 0,
            last: None,
            transactions: Vec::new(),
        }
    }

    fn cs_asserted(&self, cs: bool) -> bool {
        if self.cs_active_low {
            !cs
        } else {
            cs
        }
    }

    pub fn push(&mut self, s: SpiSample) {
        let active = self.cs_asserted(s.cs);
        let (cpol, cpha) = self.mode.cpol_cpha();

        // CS edge: start/end transaction.
        if let Some(prev) = self.last {
            let prev_active = self.cs_asserted(prev.cs);
            if !prev_active && active {
                self.in_xfer = true;
                self.bit_count = 0;
                self.mosi_byte = 0;
                self.miso_byte = 0;
                self.cur_mosi.clear();
                self.cur_miso.clear();
                self.t_start = s.t_us;
            } else if prev_active && !active {
                if !self.cur_mosi.is_empty() || !self.cur_miso.is_empty() {
                    let mosi = std::mem::take(&mut self.cur_mosi);
                    let miso = std::mem::take(&mut self.cur_miso);
                    let decoded = decode_spi_flash_command(&mosi);
                    self.transactions.push(SpiTransaction {
                        t_start_us: self.t_start,
                        t_end_us: s.t_us,
                        mosi,
                        miso,
                        decoded,
                    });
                }
                self.in_xfer = false;
            }

            // Clock edge sampling (only while CS asserted).
            if active && self.in_xfer {
                let prev_sclk = prev.sclk;
                let cur_sclk = s.sclk;
                let sampling_edge = if !cpha {
                    // Sample on first edge after idle.
                    if cpol {
                        prev_sclk && !cur_sclk
                    } else {
                        !prev_sclk && cur_sclk
                    }
                } else {
                    // Sample on second edge.
                    if cpol {
                        !prev_sclk && cur_sclk
                    } else {
                        prev_sclk && !cur_sclk
                    }
                };

                if sampling_edge {
                    // SPI is MSB-first.
                    self.mosi_byte = (self.mosi_byte << 1) | (s.mosi as u8);
                    self.miso_byte = (self.miso_byte << 1) | (s.miso as u8);
                    self.bit_count += 1;
                    if self.bit_count == 8 {
                        self.cur_mosi.push(self.mosi_byte);
                        self.cur_miso.push(self.miso_byte);
                        self.bit_count = 0;
                        self.mosi_byte = 0;
                        self.miso_byte = 0;
                    }
                }
            }
        }

        self.last = Some(s);
    }

    pub fn finish(mut self) -> Vec<SpiTransaction> {
        if self.in_xfer && (!self.cur_mosi.is_empty() || !self.cur_miso.is_empty()) {
            let t_end = self.last.map(|s| s.t_us).unwrap_or(0);
            let mosi = std::mem::take(&mut self.cur_mosi);
            let miso = std::mem::take(&mut self.cur_miso);
            let decoded = decode_spi_flash_command(&mosi);
            self.transactions.push(SpiTransaction {
                t_start_us: self.t_start,
                t_end_us: t_end,
                mosi,
                miso,
                decoded,
            });
        }
        self.transactions
    }
}

/// Convenience.
pub fn decode_trace(
    samples: &[SpiSample],
    mode: SpiMode,
    cs_active_low: bool,
) -> Vec<SpiTransaction> {
    let mut d = SpiDecoder::new(mode, cs_active_low);
    for s in samples {
        d.push(*s);
    }
    d.finish()
}

/// Map common SPI-flash opcode bytes to human-readable descriptions.
pub fn decode_spi_flash_command(mosi: &[u8]) -> Option<String> {
    if mosi.is_empty() {
        return None;
    }
    let cmd = mosi[0];
    let name = match cmd {
        0x03 => "READ",
        0x0B => "FAST_READ",
        0x13 => "READ_4B",
        0x02 => "PAGE_PROGRAM",
        0x12 => "PAGE_PROGRAM_4B",
        0x20 => "SECTOR_ERASE_4K",
        0x21 => "SECTOR_ERASE_4K_4B",
        0x52 => "BLOCK_ERASE_32K",
        0xD8 => "BLOCK_ERASE_64K",
        0xDC => "BLOCK_ERASE_64K_4B",
        0xC7 | 0x60 => "CHIP_ERASE",
        0x06 => "WRITE_ENABLE",
        0x04 => "WRITE_DISABLE",
        0x05 => "READ_STATUS",
        0x35 => "READ_STATUS_2",
        0x15 => "READ_STATUS_3",
        0x01 => "WRITE_STATUS",
        0x50 => "WRITE_STATUS_VOLATILE",
        0x9F => "READ_JEDEC_ID",
        0x90 => "READ_MFR_DEVICE_ID",
        0xAB => "RELEASE_POWER_DOWN",
        0xB9 => "POWER_DOWN",
        0x66 => "ENABLE_RESET",
        0x99 => "RESET",
        0x5A => "READ_SFDP",
        0xB7 => "ENTER_4BYTE_ADDR",
        0xE9 => "EXIT_4BYTE_ADDR",
        _ => return Some(format!("UNKNOWN(0x{cmd:02X})")),
    };
    if mosi.len() >= 4 && matches!(cmd, 0x03 | 0x0B | 0x02 | 0x20 | 0x52 | 0xD8) {
        let addr = ((mosi[1] as u32) << 16) | ((mosi[2] as u32) << 8) | mosi[3] as u32;
        Some(format!("{name} @ 0x{addr:06X}"))
    } else if mosi.len() >= 5 && matches!(cmd, 0x13 | 0x12 | 0x21 | 0xDC) {
        let addr = ((mosi[1] as u32) << 24)
            | ((mosi[2] as u32) << 16)
            | ((mosi[3] as u32) << 8)
            | mosi[4] as u32;
        Some(format!("{name} @ 0x{addr:08X}"))
    } else {
        Some(name.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Synthesize Mode-0 SPI samples for a known MOSI/MISO byte sequence.
    fn synth_mode0(mosi: &[u8], miso: &[u8]) -> Vec<SpiSample> {
        assert_eq!(mosi.len(), miso.len());
        let mut out = Vec::new();
        let mut t = 0u64;
        // Initial idle: CS high, SCLK low.
        out.push(SpiSample {
            t_us: t,
            cs: true,
            sclk: false,
            mosi: false,
            miso: false,
        });
        t += 1;
        // Assert CS low.
        out.push(SpiSample {
            t_us: t,
            cs: false,
            sclk: false,
            mosi: false,
            miso: false,
        });
        t += 1;
        for (mb, sb) in mosi.iter().zip(miso.iter()) {
            for i in 0..8 {
                let mbit = (mb >> (7 - i)) & 1 != 0;
                let sbit = (sb >> (7 - i)) & 1 != 0;
                // Setup data on MOSI before clock rise.
                out.push(SpiSample {
                    t_us: t,
                    cs: false,
                    sclk: false,
                    mosi: mbit,
                    miso: sbit,
                });
                t += 1;
                // Clock rise — decoder samples here (Mode 0 = sample on rising).
                out.push(SpiSample {
                    t_us: t,
                    cs: false,
                    sclk: true,
                    mosi: mbit,
                    miso: sbit,
                });
                t += 1;
                // Clock fall.
                out.push(SpiSample {
                    t_us: t,
                    cs: false,
                    sclk: false,
                    mosi: mbit,
                    miso: sbit,
                });
                t += 1;
            }
        }
        // CS rise.
        out.push(SpiSample {
            t_us: t,
            cs: true,
            sclk: false,
            mosi: false,
            miso: false,
        });
        out
    }

    #[test]
    fn decode_simple_read_command() {
        let samples = synth_mode0(&[0x03, 0x00, 0x01, 0x00], &[0, 0, 0, 0xAB]);
        let txns = decode_trace(&samples, SpiMode::Mode0, true);
        assert_eq!(txns.len(), 1);
        assert_eq!(txns[0].mosi, vec![0x03, 0x00, 0x01, 0x00]);
        assert_eq!(txns[0].miso, vec![0, 0, 0, 0xAB]);
        let decoded = txns[0].decoded.as_ref().unwrap();
        assert!(decoded.contains("READ"));
        assert!(decoded.contains("0x000100"));
    }

    #[test]
    fn decode_jedec_id_command() {
        let samples = synth_mode0(&[0x9F, 0, 0, 0], &[0, 0xEF, 0x40, 0x17]);
        let txns = decode_trace(&samples, SpiMode::Mode0, true);
        assert_eq!(txns[0].decoded.as_deref(), Some("READ_JEDEC_ID"));
        assert_eq!(txns[0].miso, vec![0, 0xEF, 0x40, 0x17]);
    }

    #[test]
    fn unknown_opcode_passes_through() {
        let txns = decode_trace(&synth_mode0(&[0x77], &[0]), SpiMode::Mode0, true);
        assert_eq!(txns[0].decoded.as_deref(), Some("UNKNOWN(0x77)"));
    }

    #[test]
    fn idle_bus_emits_no_transactions() {
        let samples = vec![
            SpiSample {
                t_us: 0,
                cs: true,
                sclk: false,
                mosi: false,
                miso: false,
            },
            SpiSample {
                t_us: 1,
                cs: true,
                sclk: false,
                mosi: false,
                miso: false,
            },
            SpiSample {
                t_us: 2,
                cs: true,
                sclk: false,
                mosi: false,
                miso: false,
            },
        ];
        let txns = decode_trace(&samples, SpiMode::Mode0, true);
        assert!(txns.is_empty());
    }

    #[test]
    fn multiple_back_to_back_transactions() {
        let mut s1 = synth_mode0(&[0x06], &[0]); // WREN
        let s2 = synth_mode0(&[0x05], &[0x02]); // RDSR
        s1.extend_from_slice(&s2);
        let txns = decode_trace(&s1, SpiMode::Mode0, true);
        assert_eq!(txns.len(), 2);
        assert_eq!(txns[0].decoded.as_deref(), Some("WRITE_ENABLE"));
        assert_eq!(txns[1].decoded.as_deref(), Some("READ_STATUS"));
    }

    #[test]
    fn spi_mode_constants() {
        assert_eq!(SpiMode::Mode0.cpol_cpha(), (false, false));
        assert_eq!(SpiMode::Mode3.cpol_cpha(), (true, true));
    }
}
