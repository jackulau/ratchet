export interface ChipDef {
  name: string;
  vendor: string;
  jedecId: string;
  sizeBytes: number;
  type: "spi" | "i2c";
  pageSize: number;
  sectorSize: number;
  blockSize: number;
  voltage: number;
  needs4ByteAddr: boolean;
  voltageMin?: number;
  voltageMax?: number;
  maxClockMhz?: number;
  eraseOpcodes?: number[];
}

export const CHIP_DATABASE: ChipDef[] = [
  // ═══════════════════════════════════════════
  // Winbond 3.3V
  // ═══════════════════════════════════════════
  { name: "W25Q10CL", vendor: "Winbond", jedecId: "ef4011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q20CL", vendor: "Winbond", jedecId: "ef4012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q40CL", vendor: "Winbond", jedecId: "ef4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q80BV", vendor: "Winbond", jedecId: "ef4014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q16JV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q32JV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q64JV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q128JV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q256JV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q512JV", vendor: "Winbond", jedecId: "ef4020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q01JV", vendor: "Winbond", jedecId: "ef4021", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q02JV", vendor: "Winbond", jedecId: "ef4022", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // Winbond 1.8V
  { name: "W25Q80DL", vendor: "Winbond", jedecId: "ef6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q16FW", vendor: "Winbond", jedecId: "ef6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q32FW", vendor: "Winbond", jedecId: "ef6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q64FW", vendor: "Winbond", jedecId: "ef6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q128FW", vendor: "Winbond", jedecId: "ef6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q256FW", vendor: "Winbond", jedecId: "ef6019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q512NW", vendor: "Winbond", jedecId: "ef6020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // Winbond 3.3V (7-series dual/quad SPI)
  { name: "W25Q256JVEQ", vendor: "Winbond", jedecId: "ef7019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Macronix 3.3V
  // ═══════════════════════════════════════════
  { name: "MX25L512E", vendor: "Macronix", jedecId: "c22010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L1005", vendor: "Macronix", jedecId: "c22011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L2005", vendor: "Macronix", jedecId: "c22012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L4005", vendor: "Macronix", jedecId: "c22013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L8005", vendor: "Macronix", jedecId: "c22014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L1606E", vendor: "Macronix", jedecId: "c22015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L3206E", vendor: "Macronix", jedecId: "c22016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L6406E", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L12835F", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L25635F", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L51245G", vendor: "Macronix", jedecId: "c2201a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L1G45G", vendor: "Macronix", jedecId: "c2201b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // Macronix 1.8V
  { name: "MX25U8035F", vendor: "Macronix", jedecId: "c22534", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U1635F", vendor: "Macronix", jedecId: "c22535", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U3235F", vendor: "Macronix", jedecId: "c22536", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U6435F", vendor: "Macronix", jedecId: "c22537", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U12835F", vendor: "Macronix", jedecId: "c22538", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "MX25U25643G", vendor: "Macronix", jedecId: "c22539", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "MX25U51245G", vendor: "Macronix", jedecId: "c2253a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // GigaDevice 3.3V
  // ═══════════════════════════════════════════
  { name: "GD25Q10B", vendor: "GigaDevice", jedecId: "c84011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q20C", vendor: "GigaDevice", jedecId: "c84012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q40C", vendor: "GigaDevice", jedecId: "c84013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q80C", vendor: "GigaDevice", jedecId: "c84014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q16C", vendor: "GigaDevice", jedecId: "c84015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q32C", vendor: "GigaDevice", jedecId: "c84016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q64C", vendor: "GigaDevice", jedecId: "c84017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q128C", vendor: "GigaDevice", jedecId: "c84018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q256D", vendor: "GigaDevice", jedecId: "c84019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q512MC", vendor: "GigaDevice", jedecId: "c84020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25B256E", vendor: "GigaDevice", jedecId: "c86519", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25B512ME", vendor: "GigaDevice", jedecId: "c86520", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // GigaDevice 1.8V
  { name: "GD25LQ16C", vendor: "GigaDevice", jedecId: "c86015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 120 },
  { name: "GD25LQ32D", vendor: "GigaDevice", jedecId: "c86016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 120 },
  { name: "GD25LQ64C", vendor: "GigaDevice", jedecId: "c86017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 120 },
  { name: "GD25LQ128D", vendor: "GigaDevice", jedecId: "c86018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 120 },
  { name: "GD25LQ256D", vendor: "GigaDevice", jedecId: "c86019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 120 },

  // ═══════════════════════════════════════════
  // SST / Microchip
  // ═══════════════════════════════════════════
  { name: "SST25VF010A", vendor: "SST", jedecId: "bf2549", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "SST25VF020B", vendor: "SST", jedecId: "bf258c", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25VF040B", vendor: "SST", jedecId: "bf258d", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25VF080B", vendor: "SST", jedecId: "bf258e", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25VF016B", vendor: "SST", jedecId: "bf2541", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25VF032B", vendor: "SST", jedecId: "bf254a", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25VF064C", vendor: "SST", jedecId: "bf254b", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST26VF016B", vendor: "SST", jedecId: "bf2641", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SST26VF032B", vendor: "SST", jedecId: "bf2642", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SST26VF064B", vendor: "SST", jedecId: "bf2643", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // EON
  // ═══════════════════════════════════════════
  { name: "EN25Q10A", vendor: "EON", jedecId: "1c3011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q20B", vendor: "EON", jedecId: "1c3012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q40B", vendor: "EON", jedecId: "1c3013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q80B", vendor: "EON", jedecId: "1c3014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25QH16", vendor: "EON", jedecId: "1c7015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25QH32B", vendor: "EON", jedecId: "1c7016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25QH64A", vendor: "EON", jedecId: "1c7017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25QH128A", vendor: "EON", jedecId: "1c7018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25QH256A", vendor: "EON", jedecId: "1c7019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25S16A", vendor: "EON", jedecId: "1c3815", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S32A", vendor: "EON", jedecId: "1c3816", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S64A", vendor: "EON", jedecId: "1c3817", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Spansion / Cypress / Infineon
  // ═══════════════════════════════════════════
  { name: "S25FL008A", vendor: "Spansion", jedecId: "010213", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "S25FL016A", vendor: "Spansion", jedecId: "010214", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "S25FL032P", vendor: "Spansion", jedecId: "010215", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL064L", vendor: "Spansion", jedecId: "016017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL128L", vendor: "Spansion", jedecId: "016018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL256L", vendor: "Spansion", jedecId: "016019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL256S", vendor: "Spansion", jedecId: "010219", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL512S", vendor: "Spansion", jedecId: "010220", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FS128S", vendor: "Spansion", jedecId: "012018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "S25FS256S", vendor: "Spansion", jedecId: "012019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Micron / Numonyx
  // ═══════════════════════════════════════════
  { name: "N25Q016A", vendor: "Micron", jedecId: "20ba15", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q032A", vendor: "Micron", jedecId: "20ba16", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q064A", vendor: "Micron", jedecId: "20ba17", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q128A", vendor: "Micron", jedecId: "20ba18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q256A", vendor: "Micron", jedecId: "20ba19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "MT25QL512ABB", vendor: "Micron", jedecId: "20ba20", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MT25QL01GBBB", vendor: "Micron", jedecId: "20ba21", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  // Micron 1.8V
  { name: "MT25QU064A", vendor: "Micron", jedecId: "20bb17", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "MT25QU128ABA", vendor: "Micron", jedecId: "20bb18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "MT25QU256ABA", vendor: "Micron", jedecId: "20bb19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "MT25QU512ABB", vendor: "Micron", jedecId: "20bb20", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // ISSI
  // ═══════════════════════════════════════════
  { name: "IS25LP016D", vendor: "ISSI", jedecId: "9d6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP032D", vendor: "ISSI", jedecId: "9d6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP064A", vendor: "ISSI", jedecId: "9d6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP128F", vendor: "ISSI", jedecId: "9d6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP256D", vendor: "ISSI", jedecId: "9d6019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP512M", vendor: "ISSI", jedecId: "9d601a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  // ISSI 1.8V
  { name: "IS25WP016D", vendor: "ISSI", jedecId: "9d7015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25WP032D", vendor: "ISSI", jedecId: "9d7016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25WP064A", vendor: "ISSI", jedecId: "9d7017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25WP128F", vendor: "ISSI", jedecId: "9d7018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25WP256D", vendor: "ISSI", jedecId: "9d7019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // XMC (Wuhan Xinxin Semiconductor)
  // ═══════════════════════════════════════════
  { name: "XM25QH16C", vendor: "XMC", jedecId: "207015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH32B", vendor: "XMC", jedecId: "207016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH64A", vendor: "XMC", jedecId: "207017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH128A", vendor: "XMC", jedecId: "207018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH256C", vendor: "XMC", jedecId: "207019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QU16C", vendor: "XMC", jedecId: "204115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QU32C", vendor: "XMC", jedecId: "204116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QU64A", vendor: "XMC", jedecId: "204117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QU128C", vendor: "XMC", jedecId: "204118", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // PUYA
  // ═══════════════════════════════════════════
  { name: "P25Q06H", vendor: "PUYA", jedecId: "856013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q11H", vendor: "PUYA", jedecId: "856014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q16H", vendor: "PUYA", jedecId: "856015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q32H", vendor: "PUYA", jedecId: "856016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q64H", vendor: "PUYA", jedecId: "856017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q128H", vendor: "PUYA", jedecId: "856018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // AMIC
  // ═══════════════════════════════════════════
  { name: "A25L010", vendor: "AMIC", jedecId: "374011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25L020", vendor: "AMIC", jedecId: "374012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25L040", vendor: "AMIC", jedecId: "374013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25L080", vendor: "AMIC", jedecId: "374014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25L016", vendor: "AMIC", jedecId: "374015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25LQ32A", vendor: "AMIC", jedecId: "374016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25LQ64", vendor: "AMIC", jedecId: "374017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Fudan Micro
  // ═══════════════════════════════════════════
  { name: "FM25F01A", vendor: "Fudan", jedecId: "f83211", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25F02A", vendor: "Fudan", jedecId: "f83212", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25F04A", vendor: "Fudan", jedecId: "f83213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25Q08A", vendor: "Fudan", jedecId: "f83214", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25Q16A", vendor: "Fudan", jedecId: "f83215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25Q32A", vendor: "Fudan", jedecId: "f83216", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25Q64A", vendor: "Fudan", jedecId: "f83217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25Q128A", vendor: "Fudan", jedecId: "f83218", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Zetta
  // ═══════════════════════════════════════════
  { name: "ZD25Q16B", vendor: "Zetta", jedecId: "ba3215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q32C", vendor: "Zetta", jedecId: "ba3216", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q64B", vendor: "Zetta", jedecId: "ba3217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25WQ16B", vendor: "Zetta", jedecId: "ba6515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZD25WQ32C", vendor: "Zetta", jedecId: "ba6516", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZD25WQ64B", vendor: "Zetta", jedecId: "ba6517", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // XTX Technology
  // ═══════════════════════════════════════════
  { name: "XT25F08B", vendor: "XTX", jedecId: "0b4014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F16B", vendor: "XTX", jedecId: "0b4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F32B", vendor: "XTX", jedecId: "0b4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F64B", vendor: "XTX", jedecId: "0b4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F128B", vendor: "XTX", jedecId: "0b4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F256B", vendor: "XTX", jedecId: "0b4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },

  // ═══════════════════════════════════════════
  // Boya Micro
  // ═══════════════════════════════════════════
  { name: "BY25Q08BS", vendor: "Boya", jedecId: "684014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q16BS", vendor: "Boya", jedecId: "684015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q32BS", vendor: "Boya", jedecId: "684016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q64AS", vendor: "Boya", jedecId: "684017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q128AS", vendor: "Boya", jedecId: "684018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25D16BS", vendor: "Boya", jedecId: "684215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "BY25D32BS", vendor: "Boya", jedecId: "684216", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // ESMT (Elite Semiconductor)
  // ═══════════════════════════════════════════
  { name: "F25L004A", vendor: "ESMT", jedecId: "8c2013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "F25L008A", vendor: "ESMT", jedecId: "8c2014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "F25L016A", vendor: "ESMT", jedecId: "8c2015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "F25L032QA", vendor: "ESMT", jedecId: "8c4116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25L064QA", vendor: "ESMT", jedecId: "8c4117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Fidelix
  // ═══════════════════════════════════════════
  { name: "FM25Q04A", vendor: "Fidelix", jedecId: "f83213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FM25Q08A-F", vendor: "Fidelix", jedecId: "f84014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FM25Q16A-F", vendor: "Fidelix", jedecId: "f84015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FM25Q32A-F", vendor: "Fidelix", jedecId: "f84016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FM25Q64A-F", vendor: "Fidelix", jedecId: "f84017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // PCT (Paragon)
  // ═══════════════════════════════════════════
  { name: "PM25LQ016", vendor: "PCT", jedecId: "7f9d45", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PM25LQ032C", vendor: "PCT", jedecId: "7f9d46", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PM25LQ080", vendor: "PCT", jedecId: "7f9d13", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Atmel/Adesto (1f)
  // ═══════════════════════════════════════════
  { name: "AT25SF041", vendor: "Adesto", jedecId: "1f8401", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25SF081", vendor: "Adesto", jedecId: "1f8501", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25SF161", vendor: "Adesto", jedecId: "1f8601", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "AT25SF321", vendor: "Adesto", jedecId: "1f8701", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "AT25DF041B", vendor: "Atmel", jedecId: "1f4400", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT25DF081A", vendor: "Atmel", jedecId: "1f4501", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25DF161", vendor: "Atmel", jedecId: "1f4602", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25DF321A", vendor: "Atmel", jedecId: "1f4701", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Cypress/Infineon (01) — additional
  // ═══════════════════════════════════════════
  { name: "S25FL064L", vendor: "Cypress", jedecId: "016017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL128L", vendor: "Cypress", jedecId: "016018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL256L", vendor: "Cypress", jedecId: "016019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FS064S", vendor: "Cypress", jedecId: "010217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Intel/Numonyx (89)
  // ═══════════════════════════════════════════
  { name: "25F160S33", vendor: "Intel", jedecId: "898911", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "25F320S33", vendor: "Intel", jedecId: "898912", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "25F640S33", vendor: "Intel", jedecId: "898913", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },

  // ═══════════════════════════════════════════
  // Alliance Memory (52)
  // ═══════════════════════════════════════════
  { name: "AS25F1032", vendor: "Alliance", jedecId: "523016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25F2048", vendor: "Alliance", jedecId: "523017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25F4096", vendor: "Alliance", jedecId: "523018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Douqi (54)
  // ═══════════════════════════════════════════
  { name: "DQ25Q64AS", vendor: "Douqi", jedecId: "544017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DQ25Q128AL", vendor: "Douqi", jedecId: "544018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Winbond — extended variants (BV/CV/DV/FV/RV/IM/IN suffixes; same JEDEC ID, different package/timing)
  // ═══════════════════════════════════════════
  { name: "W25Q40BV", vendor: "Winbond", jedecId: "ef4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q40EW", vendor: "Winbond", jedecId: "ef6013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q40CV", vendor: "Winbond", jedecId: "ef4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q40RV", vendor: "Winbond", jedecId: "ef4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q80V", vendor: "Winbond", jedecId: "ef4014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q80EW", vendor: "Winbond", jedecId: "ef6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q16CV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q16DV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q16BV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q16FV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q16RV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q16IL", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q32BV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q32CV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q32DV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q32FV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q32RV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q32JW-IM", vendor: "Winbond", jedecId: "ef8016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "W25Q64BV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q64CV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q64DV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q64FV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q64RV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q64JW-IM", vendor: "Winbond", jedecId: "ef8017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "W25Q128BV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q128FV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q128JW-IM", vendor: "Winbond", jedecId: "ef8018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "W25Q128RV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q256BV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q256FV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25Q256JW-IM", vendor: "Winbond", jedecId: "ef8019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "W25Q256RV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Winbond W25X (older, smaller)
  // ═══════════════════════════════════════════
  { name: "W25X05CL", vendor: "Winbond", jedecId: "ef3010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X10CL", vendor: "Winbond", jedecId: "ef3011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X20CL", vendor: "Winbond", jedecId: "ef3012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X40CL", vendor: "Winbond", jedecId: "ef3013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X80", vendor: "Winbond", jedecId: "ef3014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X16", vendor: "Winbond", jedecId: "ef3015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X32", vendor: "Winbond", jedecId: "ef3016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "W25X64", vendor: "Winbond", jedecId: "ef3017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },

  // ═══════════════════════════════════════════
  // Winbond W25M (multi-die stacked) and W77Q (secure)
  // ═══════════════════════════════════════════
  { name: "W25M02GV", vendor: "Winbond", jedecId: "ef7119", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25M512JW", vendor: "Winbond", jedecId: "ef6118", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W77Q32JV", vendor: "Winbond", jedecId: "ef8516", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W77Q64JV", vendor: "Winbond", jedecId: "ef8517", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W74M64FV", vendor: "Winbond", jedecId: "ef4218", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Macronix — extended variants and series
  // ═══════════════════════════════════════════
  { name: "MX25L1635D", vendor: "Macronix", jedecId: "c22415", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "MX25L1635E", vendor: "Macronix", jedecId: "c22515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L3205D", vendor: "Macronix", jedecId: "c22016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L3205A", vendor: "Macronix", jedecId: "c22016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "MX25L3235E", vendor: "Macronix", jedecId: "c25e16", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "MX25L3273E", vendor: "Macronix", jedecId: "c22016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "MX25L6405D", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L6436E", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L6445E", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L6473E", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L12805D", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L12873F", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L12875F", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L12839F", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L25673G", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L25735F", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Macronix MX25R (low-power, wide-voltage)
  // ═══════════════════════════════════════════
  { name: "MX25R512F", vendor: "Macronix", jedecId: "c22810", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R1035F", vendor: "Macronix", jedecId: "c22811", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R2035F", vendor: "Macronix", jedecId: "c22812", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R4035F", vendor: "Macronix", jedecId: "c22813", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R8035F", vendor: "Macronix", jedecId: "c22814", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R1635F", vendor: "Macronix", jedecId: "c22815", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R3235F", vendor: "Macronix", jedecId: "c22816", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25R6435F", vendor: "Macronix", jedecId: "c22817", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // Macronix MX25V (wide-voltage)
  // ═══════════════════════════════════════════
  { name: "MX25V512", vendor: "Macronix", jedecId: "c22310", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 70 },
  { name: "MX25V8035F", vendor: "Macronix", jedecId: "c22314", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25V1635F", vendor: "Macronix", jedecId: "c22315", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25V8005", vendor: "Macronix", jedecId: "c22314", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "MX25V4035F", vendor: "Macronix", jedecId: "c22313", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "MX25V2033F", vendor: "Macronix", jedecId: "c22312", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 70 },

  // ═══════════════════════════════════════════
  // Macronix MX66 (high density)
  // ═══════════════════════════════════════════
  { name: "MX66L51235F", vendor: "Macronix", jedecId: "c2201a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX66L1G45G", vendor: "Macronix", jedecId: "c2201b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX66U51235F", vendor: "Macronix", jedecId: "c2253a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "MX66U1G45G", vendor: "Macronix", jedecId: "c2253b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "MX66U2G45G", vendor: "Macronix", jedecId: "c2253c", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // GigaDevice extended variants and low-voltage
  // ═══════════════════════════════════════════
  { name: "GD25Q10", vendor: "GigaDevice", jedecId: "c84011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q20B", vendor: "GigaDevice", jedecId: "c84012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q40B", vendor: "GigaDevice", jedecId: "c84013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q80B", vendor: "GigaDevice", jedecId: "c84014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q16B", vendor: "GigaDevice", jedecId: "c84015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q32B", vendor: "GigaDevice", jedecId: "c84016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q64B", vendor: "GigaDevice", jedecId: "c84017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q128B", vendor: "GigaDevice", jedecId: "c84018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25Q128E", vendor: "GigaDevice", jedecId: "c84018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25LQ128E", vendor: "GigaDevice", jedecId: "c86018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LB256E", vendor: "GigaDevice", jedecId: "c86719", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LB512ME", vendor: "GigaDevice", jedecId: "c86720", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LB512MF", vendor: "GigaDevice", jedecId: "c86720", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 166 },
  { name: "GD25LE128E", vendor: "GigaDevice", jedecId: "c86018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LR128E", vendor: "GigaDevice", jedecId: "c86018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LR256E", vendor: "GigaDevice", jedecId: "c86019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25T80", vendor: "GigaDevice", jedecId: "c83114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D40C", vendor: "GigaDevice", jedecId: "c83013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D05C", vendor: "GigaDevice", jedecId: "c83010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25VQ16C", vendor: "GigaDevice", jedecId: "c84215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD25VQ21B", vendor: "GigaDevice", jedecId: "c84212", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD25VQ41B", vendor: "GigaDevice", jedecId: "c84213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD25VQ80C", vendor: "GigaDevice", jedecId: "c84214", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD25WQ128E", vendor: "GigaDevice", jedecId: "c86518", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25WQ80E", vendor: "GigaDevice", jedecId: "c86514", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25WQ16E", vendor: "GigaDevice", jedecId: "c86515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25WQ32E", vendor: "GigaDevice", jedecId: "c86516", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25WQ64E", vendor: "GigaDevice", jedecId: "c86517", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 2.5, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // SST extended (LF/PF/WF families + parallel NOR)
  // ═══════════════════════════════════════════
  { name: "SST25LF020A", vendor: "SST", jedecId: "bf43", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 3.0, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "SST25LF040A", vendor: "SST", jedecId: "bf44", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 3.0, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "SST25VF010", vendor: "SST", jedecId: "bf2549", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "SST25VF020", vendor: "SST", jedecId: "bf43", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "SST25WF010", vendor: "SST", jedecId: "bf2502", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 33 },
  { name: "SST25WF020", vendor: "SST", jedecId: "bf2503", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 33 },
  { name: "SST25WF040", vendor: "SST", jedecId: "bf2504", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 33 },
  { name: "SST25WF080", vendor: "SST", jedecId: "bf2505", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },
  { name: "SST25WF020A", vendor: "SST", jedecId: "621612", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },
  { name: "SST25WF040B", vendor: "SST", jedecId: "621613", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },
  { name: "SST25PF020B", vendor: "SST", jedecId: "bf258c", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST25PF040C", vendor: "SST", jedecId: "bf6213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "SST26WF016B", vendor: "SST", jedecId: "bf2651", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "SST26WF032B", vendor: "SST", jedecId: "bf2652", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "SST26WF064C", vendor: "SST", jedecId: "bf2653", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "SST26VF016", vendor: "SST", jedecId: "bf2601", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SST26VF032", vendor: "SST", jedecId: "bf2602", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SST26VF064", vendor: "SST", jedecId: "bf2603", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // EON / EN25 extended (P/F/T/B/SE families)
  // ═══════════════════════════════════════════
  { name: "EN25B05", vendor: "EON", jedecId: "1c2010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25B10", vendor: "EON", jedecId: "1c2011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25B20", vendor: "EON", jedecId: "1c2012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25B40", vendor: "EON", jedecId: "1c2013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25B80", vendor: "EON", jedecId: "1c2014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25B16", vendor: "EON", jedecId: "1c2015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25B32", vendor: "EON", jedecId: "1c2016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25B64", vendor: "EON", jedecId: "1c2017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25F05", vendor: "EON", jedecId: "1c3110", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F10", vendor: "EON", jedecId: "1c3111", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F20", vendor: "EON", jedecId: "1c3112", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F40", vendor: "EON", jedecId: "1c3113", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F80", vendor: "EON", jedecId: "1c3114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F16", vendor: "EON", jedecId: "1c3115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F32", vendor: "EON", jedecId: "1c3116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25F64", vendor: "EON", jedecId: "1c3117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25T80", vendor: "EON", jedecId: "1c5114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25T16", vendor: "EON", jedecId: "1c5115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25P05", vendor: "EON", jedecId: "1c2010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25P10", vendor: "EON", jedecId: "1c2011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "EN25P32", vendor: "EON", jedecId: "1c2016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25P64", vendor: "EON", jedecId: "1c2017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "EN25SE10A", vendor: "EON", jedecId: "1c3811", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25SE20A", vendor: "EON", jedecId: "1c3812", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25SE40A", vendor: "EON", jedecId: "1c3813", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25SE80A", vendor: "EON", jedecId: "1c3814", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25QH16A", vendor: "EON", jedecId: "1c7015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25Q16", vendor: "EON", jedecId: "1c3015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q32A", vendor: "EON", jedecId: "1c3016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q32B", vendor: "EON", jedecId: "1c3016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q32C", vendor: "EON", jedecId: "1c3016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "EN25Q64", vendor: "EON", jedecId: "1c3017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "EN25Q128", vendor: "EON", jedecId: "1c3018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // ISSI extended
  // ═══════════════════════════════════════════
  { name: "IS25LP010", vendor: "ISSI", jedecId: "9d6011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP020", vendor: "ISSI", jedecId: "9d6012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP040", vendor: "ISSI", jedecId: "9d6013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25LP080", vendor: "ISSI", jedecId: "9d6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25CD512", vendor: "ISSI", jedecId: "7f9d10", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "IS25CD010", vendor: "ISSI", jedecId: "7f9d11", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "IS25CD020", vendor: "ISSI", jedecId: "7f9d12", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "IS25LE016", vendor: "ISSI", jedecId: "9d8015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25LE032", vendor: "ISSI", jedecId: "9d8016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25LE064", vendor: "ISSI", jedecId: "9d8017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25WP512M", vendor: "ISSI", jedecId: "9d701a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "IS25LP01G", vendor: "ISSI", jedecId: "9d601b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "IS25WQ016", vendor: "ISSI", jedecId: "9d4515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Spansion / Cypress / Infineon — extended
  // ═══════════════════════════════════════════
  { name: "S25FL004A", vendor: "Spansion", jedecId: "010212", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "S25FL040A", vendor: "Spansion", jedecId: "010212", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "S25FL064A", vendor: "Spansion", jedecId: "010216", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "S25FL064P", vendor: "Spansion", jedecId: "010216", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "S25FL129P", vendor: "Spansion", jedecId: "012018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL128P", vendor: "Spansion", jedecId: "012018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL128S", vendor: "Spansion", jedecId: "012018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL204K", vendor: "Spansion", jedecId: "014013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL208K", vendor: "Spansion", jedecId: "014014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL216K", vendor: "Spansion", jedecId: "014015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL232K", vendor: "Spansion", jedecId: "014016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "S25FL164K", vendor: "Spansion", jedecId: "014017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "S25FL132K", vendor: "Spansion", jedecId: "014016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "S25FS512S", vendor: "Spansion", jedecId: "010220", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25HL512T", vendor: "Cypress", jedecId: "342a1a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25HL01GT", vendor: "Cypress", jedecId: "342a1b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25HS512T", vendor: "Cypress", jedecId: "342b1a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "S25HS01GT", vendor: "Cypress", jedecId: "342b1b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Micron extended (MT25, N25Q variants)
  // ═══════════════════════════════════════════
  { name: "N25Q016", vendor: "Micron", jedecId: "20ba15", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q032", vendor: "Micron", jedecId: "20ba16", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q064", vendor: "Micron", jedecId: "20ba17", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q128", vendor: "Micron", jedecId: "20ba18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q256", vendor: "Micron", jedecId: "20ba19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q512", vendor: "Micron", jedecId: "20ba20", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "N25Q00A", vendor: "Micron", jedecId: "20ba21", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "M25P05", vendor: "Micron", jedecId: "202010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 25 },
  { name: "M25P10", vendor: "Micron", jedecId: "202011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 25 },
  { name: "M25P20", vendor: "Micron", jedecId: "202012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "M25P40", vendor: "Micron", jedecId: "202013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25P80", vendor: "Micron", jedecId: "202014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25P16", vendor: "Micron", jedecId: "202015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25P32", vendor: "Micron", jedecId: "202016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25P64", vendor: "Micron", jedecId: "202017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25P128", vendor: "Micron", jedecId: "202018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 262144, blockSize: 262144, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 54 },
  { name: "M25PE10", vendor: "Micron", jedecId: "208011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M25PE20", vendor: "Micron", jedecId: "208012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M25PE40", vendor: "Micron", jedecId: "208013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "M25PE80", vendor: "Micron", jedecId: "208014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "M25PE16", vendor: "Micron", jedecId: "208015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M45PE10", vendor: "Micron", jedecId: "204011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M45PE20", vendor: "Micron", jedecId: "204012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M45PE40", vendor: "Micron", jedecId: "204013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M45PE80", vendor: "Micron", jedecId: "204014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "M45PE16", vendor: "Micron", jedecId: "204015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "MT25QL128AB", vendor: "Micron", jedecId: "20ba18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MT25QL256AB", vendor: "Micron", jedecId: "20ba19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MT25QU01GBBB", vendor: "Micron", jedecId: "20bb21", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "MT25QU02GCBB", vendor: "Micron", jedecId: "20bb22", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.7, voltageMax: 2.0, maxClockMhz: 133 },
  { name: "MT25QL02GCBB", vendor: "Micron", jedecId: "20ba22", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Adesto / Atmel DataFlash (AT45DBxx) and AT25-series
  // ═══════════════════════════════════════════
  { name: "AT45DB011D", vendor: "Atmel", jedecId: "1f2200", sizeBytes: 128 * 1024 + 8 * 1024, type: "spi", pageSize: 264, sectorSize: 8448, blockSize: 67584, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB021D", vendor: "Atmel", jedecId: "1f2300", sizeBytes: 256 * 1024 + 8 * 1024, type: "spi", pageSize: 264, sectorSize: 8448, blockSize: 67584, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB041D", vendor: "Atmel", jedecId: "1f2400", sizeBytes: 512 * 1024 + 16 * 1024, type: "spi", pageSize: 264, sectorSize: 8448, blockSize: 67584, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB081D", vendor: "Atmel", jedecId: "1f2500", sizeBytes: 1 * 1024 * 1024 + 32 * 1024, type: "spi", pageSize: 264, sectorSize: 8448, blockSize: 67584, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB161D", vendor: "Atmel", jedecId: "1f2600", sizeBytes: 2 * 1024 * 1024 + 64 * 1024, type: "spi", pageSize: 528, sectorSize: 16896, blockSize: 270336, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB321D", vendor: "Atmel", jedecId: "1f2700", sizeBytes: 4 * 1024 * 1024 + 128 * 1024, type: "spi", pageSize: 528, sectorSize: 16896, blockSize: 270336, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT45DB642D", vendor: "Atmel", jedecId: "1f2800", sizeBytes: 8 * 1024 * 1024 + 256 * 1024, type: "spi", pageSize: 1056, sectorSize: 33792, blockSize: 270336, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 66 },
  { name: "AT25F512B", vendor: "Atmel", jedecId: "1f6500", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "AT25FS010", vendor: "Atmel", jedecId: "1f6601", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "AT25FS040", vendor: "Atmel", jedecId: "1f6604", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "AT25DF021A", vendor: "Adesto", jedecId: "1f4301", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 70 },
  { name: "AT25DF321", vendor: "Atmel", jedecId: "1f4700", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 70 },
  { name: "AT25DF641", vendor: "Atmel", jedecId: "1f4800", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "AT25DF641A", vendor: "Atmel", jedecId: "1f4800", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "AT25SF641", vendor: "Adesto", jedecId: "1f3217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "AT25SF128A", vendor: "Adesto", jedecId: "1f8901", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "AT25QF128A", vendor: "Adesto", jedecId: "1f8901", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "AT25XE021A", vendor: "Adesto", jedecId: "1f4312", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 70 },
  { name: "AT25XE041B", vendor: "Adesto", jedecId: "1f4413", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25XE081B", vendor: "Adesto", jedecId: "1f4514", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 85 },
  { name: "AT25XE161B", vendor: "Adesto", jedecId: "1f4615", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // PUYA additional + low-voltage
  // ═══════════════════════════════════════════
  { name: "P25Q40H", vendor: "PUYA", jedecId: "856013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q80H", vendor: "PUYA", jedecId: "856014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "P25Q05L", vendor: "PUYA", jedecId: "856010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "P25Q10L", vendor: "PUYA", jedecId: "856011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "P25Q20L", vendor: "PUYA", jedecId: "856012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "PY25Q06H", vendor: "PUYA", jedecId: "852010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PY25Q16H", vendor: "PUYA", jedecId: "852015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PY25Q32H", vendor: "PUYA", jedecId: "852016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PY25Q64H", vendor: "PUYA", jedecId: "852017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PY25Q128H", vendor: "PUYA", jedecId: "852018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // ESMT extended (F25H/F25D/F25HP)
  // ═══════════════════════════════════════════
  { name: "F25L32QA", vendor: "ESMT", jedecId: "8c4116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25L64QA", vendor: "ESMT", jedecId: "8c4117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25L128QA", vendor: "ESMT", jedecId: "8c4118", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25D08QA", vendor: "ESMT", jedecId: "8c3214", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25D16QA", vendor: "ESMT", jedecId: "8c3215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "F25H04S", vendor: "ESMT", jedecId: "8c2013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "F25H08S", vendor: "ESMT", jedecId: "8c2014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "F25HP01G", vendor: "ESMT", jedecId: "8c281b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // XMC additional
  // ═══════════════════════════════════════════
  { name: "XM25QH128B", vendor: "XMC", jedecId: "207018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH256B", vendor: "XMC", jedecId: "207019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH512A", vendor: "XMC", jedecId: "207020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QU256B", vendor: "XMC", jedecId: "204119", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QU512A", vendor: "XMC", jedecId: "204120", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QH04", vendor: "XMC", jedecId: "207013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QH08", vendor: "XMC", jedecId: "207014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "XM25QU04", vendor: "XMC", jedecId: "204113", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XM25QU08", vendor: "XMC", jedecId: "204114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Boya extended
  // ═══════════════════════════════════════════
  { name: "BY25Q40BS", vendor: "Boya", jedecId: "684013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q05BS", vendor: "Boya", jedecId: "684010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q10BS", vendor: "Boya", jedecId: "684011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q20BS", vendor: "Boya", jedecId: "684012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25Q256AS", vendor: "Boya", jedecId: "684019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BY25D40AS", vendor: "Boya", jedecId: "684213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "BY25D80AS", vendor: "Boya", jedecId: "684214", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "BY25D64AS", vendor: "Boya", jedecId: "684217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "BY25D128AS", vendor: "Boya", jedecId: "684218", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // XTX extended
  // ═══════════════════════════════════════════
  { name: "XT25F02E", vendor: "XTX", jedecId: "0b4012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25F04D", vendor: "XTX", jedecId: "0b4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25Q08D", vendor: "XTX", jedecId: "0b6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25Q16D", vendor: "XTX", jedecId: "0b6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25Q32D", vendor: "XTX", jedecId: "0b6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25Q64D", vendor: "XTX", jedecId: "0b6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25Q128D", vendor: "XTX", jedecId: "0b6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },
  { name: "XT25W08F", vendor: "XTX", jedecId: "0b6514", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XT25W16F", vendor: "XTX", jedecId: "0b6515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XT25W32F", vendor: "XTX", jedecId: "0b6516", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XT25W64F", vendor: "XTX", jedecId: "0b6517", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "XT25W128F", vendor: "XTX", jedecId: "0b6518", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // AMIC additional
  // ═══════════════════════════════════════════
  { name: "A25LQ16", vendor: "AMIC", jedecId: "374015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25LQ128A", vendor: "AMIC", jedecId: "374018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "A25L40P", vendor: "AMIC", jedecId: "377113", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "A25L80P", vendor: "AMIC", jedecId: "377114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "A25L16P", vendor: "AMIC", jedecId: "377115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "A25LS080", vendor: "AMIC", jedecId: "3F3014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "A25LS016", vendor: "AMIC", jedecId: "3F3015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "A25LS032", vendor: "AMIC", jedecId: "3F3016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Fudan additional + 1.8V
  // ═══════════════════════════════════════════
  { name: "FM25Q256", vendor: "Fudan", jedecId: "f83219", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "FM25LM08", vendor: "Fudan", jedecId: "a14014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "FM25LM16", vendor: "Fudan", jedecId: "a14015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "FM25LM32", vendor: "Fudan", jedecId: "a14016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "FM25LM64", vendor: "Fudan", jedecId: "a14017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },
  { name: "FM25LM128", vendor: "Fudan", jedecId: "a14018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Zbit Semiconductor (new vendor)
  // ═══════════════════════════════════════════
  { name: "ZB25VQ16", vendor: "Zbit", jedecId: "5e4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZB25VQ32", vendor: "Zbit", jedecId: "5e4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZB25VQ64", vendor: "Zbit", jedecId: "5e4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZB25VQ128", vendor: "Zbit", jedecId: "5e4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZB25LQ16", vendor: "Zbit", jedecId: "5e6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZB25LQ32", vendor: "Zbit", jedecId: "5e6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZB25LQ64", vendor: "Zbit", jedecId: "5e6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZB25LQ128", vendor: "Zbit", jedecId: "5e6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // PCT (Paragon) extended
  // ═══════════════════════════════════════════
  { name: "PM25LD512", vendor: "PCT", jedecId: "7f9d20", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "PM25LD010", vendor: "PCT", jedecId: "7f9d21", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "PM25LD020", vendor: "PCT", jedecId: "7f9d22", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "PM25LD040C", vendor: "PCT", jedecId: "7f9d23", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "PM25LD256C", vendor: "PCT", jedecId: "7f9d12", sizeBytes: 32 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "PM25LD512C", vendor: "PCT", jedecId: "7f9d10", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "PM25LV010A", vendor: "PCT", jedecId: "7f9d7c", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "PM25LV020", vendor: "PCT", jedecId: "7f9d7d", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },

  // ═══════════════════════════════════════════
  // Douqi additional
  // ═══════════════════════════════════════════
  { name: "DQ25Q08AS", vendor: "Douqi", jedecId: "544014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DQ25Q16AS", vendor: "Douqi", jedecId: "544015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DQ25Q32AS", vendor: "Douqi", jedecId: "544016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DQ25Q256AL", vendor: "Douqi", jedecId: "544019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Alliance additional
  // ═══════════════════════════════════════════
  { name: "AS25F1G", vendor: "Alliance", jedecId: "523019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25DF021A", vendor: "Alliance", jedecId: "521412", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 70 },
  { name: "AS25DF041A", vendor: "Alliance", jedecId: "521413", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 70 },

  // ═══════════════════════════════════════════
  // Zetta additional
  // ═══════════════════════════════════════════
  { name: "ZD25Q05B", vendor: "Zetta", jedecId: "ba3210", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q10B", vendor: "Zetta", jedecId: "ba3211", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q20B", vendor: "Zetta", jedecId: "ba3212", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q40B", vendor: "Zetta", jedecId: "ba3213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q80B", vendor: "Zetta", jedecId: "ba3214", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q128B", vendor: "Zetta", jedecId: "ba3218", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25Q256B", vendor: "Zetta", jedecId: "ba3219", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ZD25LQ16B", vendor: "Zetta", jedecId: "ba6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZD25LQ32B", vendor: "Zetta", jedecId: "ba6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "ZD25LQ128B", vendor: "Zetta", jedecId: "ba6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // BergMicro / Berg Microelectronics
  // ═══════════════════════════════════════════
  { name: "BG25Q08A", vendor: "Berg", jedecId: "e04014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BG25Q16A", vendor: "Berg", jedecId: "e04015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BG25Q32A", vendor: "Berg", jedecId: "e04016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BG25Q64A", vendor: "Berg", jedecId: "e04017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "BG25Q128A", vendor: "Berg", jedecId: "e04018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // ChingisTech
  // ═══════════════════════════════════════════
  { name: "Pm25LV010", vendor: "Chingis", jedecId: "7f9d7c", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "Pm25LV020", vendor: "Chingis", jedecId: "7f9d7d", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "Pm25LV040", vendor: "Chingis", jedecId: "7f9d7e", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "Pm25LV080", vendor: "Chingis", jedecId: "7f9d13", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },

  // ═══════════════════════════════════════════
  // Microchip SST/Standalone parallel NOR (used in legacy embedded)
  // ═══════════════════════════════════════════
  { name: "SST39SF010A", vendor: "SST", jedecId: "bfb5", sizeBytes: 128 * 1024, type: "spi", pageSize: 128, sectorSize: 4096, blockSize: 32768, voltage: 5.0, needs4ByteAddr: false, voltageMin: 4.5, voltageMax: 5.5, maxClockMhz: 33 },
  { name: "SST39SF020A", vendor: "SST", jedecId: "bfb6", sizeBytes: 256 * 1024, type: "spi", pageSize: 128, sectorSize: 4096, blockSize: 32768, voltage: 5.0, needs4ByteAddr: false, voltageMin: 4.5, voltageMax: 5.5, maxClockMhz: 33 },
  { name: "SST39SF040", vendor: "SST", jedecId: "bfb7", sizeBytes: 512 * 1024, type: "spi", pageSize: 128, sectorSize: 4096, blockSize: 32768, voltage: 5.0, needs4ByteAddr: false, voltageMin: 4.5, voltageMax: 5.5, maxClockMhz: 33 },

  // ═══════════════════════════════════════════
  // DOSILICON (XR25 series)
  // ═══════════════════════════════════════════
  { name: "DS25Q40", vendor: "DOSILICON", jedecId: "e54013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25Q80", vendor: "DOSILICON", jedecId: "e54014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25Q16", vendor: "DOSILICON", jedecId: "e54015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25Q32", vendor: "DOSILICON", jedecId: "e54016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25Q64", vendor: "DOSILICON", jedecId: "e54017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25Q128", vendor: "DOSILICON", jedecId: "e54018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25M256", vendor: "DOSILICON", jedecId: "e54019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "DS25LQ16", vendor: "DOSILICON", jedecId: "e56015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "DS25LQ32", vendor: "DOSILICON", jedecId: "e56016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "DS25LQ64", vendor: "DOSILICON", jedecId: "e56017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "DS25LQ128", vendor: "DOSILICON", jedecId: "e56018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Allspeed
  // ═══════════════════════════════════════════
  { name: "AS25Q40", vendor: "Allspeed", jedecId: "5f4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25Q80", vendor: "Allspeed", jedecId: "5f4014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25Q16", vendor: "Allspeed", jedecId: "5f4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25Q32", vendor: "Allspeed", jedecId: "5f4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25Q64", vendor: "Allspeed", jedecId: "5f4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "AS25Q128", vendor: "Allspeed", jedecId: "5f4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // SiliconKaiser
  // ═══════════════════════════════════════════
  { name: "SK25P32", vendor: "SiliconKaiser", jedecId: "254016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SK25P64", vendor: "SiliconKaiser", jedecId: "254017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SK25P128", vendor: "SiliconKaiser", jedecId: "254018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Eorex
  // ═══════════════════════════════════════════
  { name: "EN25QW16", vendor: "Eorex", jedecId: "1c6115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25QW32", vendor: "Eorex", jedecId: "1c6116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25QW64", vendor: "Eorex", jedecId: "1c6117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25QW128", vendor: "Eorex", jedecId: "1c6118", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Excelsemi (additional)
  // ═══════════════════════════════════════════
  { name: "ES25P10", vendor: "Excelsemi", jedecId: "4a2011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "ES25P20", vendor: "Excelsemi", jedecId: "4a2012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "ES25P40", vendor: "Excelsemi", jedecId: "4a2013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "ES25P80", vendor: "Excelsemi", jedecId: "4a2014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "ES25P16", vendor: "Excelsemi", jedecId: "4a2015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },

  // ═══════════════════════════════════════════
  // ON Semiconductor / Catalyst (catalyst legacy 24Cxx serial EEPROMs as I2C added separately)
  // ═══════════════════════════════════════════
  { name: "LE25FW418A", vendor: "ON Semi", jedecId: "626313", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "LE25FW806", vendor: "ON Semi", jedecId: "626314", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 33 },
  { name: "LE25FU406B", vendor: "ON Semi", jedecId: "623213", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 33 },
  { name: "LE25U40CMC", vendor: "ON Semi", jedecId: "624013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },

  // ═══════════════════════════════════════════
  // Sanyo (62) extended
  // ═══════════════════════════════════════════
  { name: "LE25FU406C", vendor: "Sanyo", jedecId: "623313", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },
  { name: "LE25FU406", vendor: "Sanyo", jedecId: "624113", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 50 },

  // ═══════════════════════════════════════════
  // Microchip 25LCxxx (SPI EEPROM)
  // ═══════════════════════════════════════════
  { name: "25LC010A", vendor: "Microchip", jedecId: "", sizeBytes: 128, type: "spi", pageSize: 16, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC020A", vendor: "Microchip", jedecId: "", sizeBytes: 256, type: "spi", pageSize: 16, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC040A", vendor: "Microchip", jedecId: "", sizeBytes: 512, type: "spi", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC080", vendor: "Microchip", jedecId: "", sizeBytes: 1024, type: "spi", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC160", vendor: "Microchip", jedecId: "", sizeBytes: 2048, type: "spi", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC320A", vendor: "Microchip", jedecId: "", sizeBytes: 4096, type: "spi", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC640A", vendor: "Microchip", jedecId: "", sizeBytes: 8192, type: "spi", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC128", vendor: "Microchip", jedecId: "", sizeBytes: 16384, type: "spi", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC256", vendor: "Microchip", jedecId: "", sizeBytes: 32768, type: "spi", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC512", vendor: "Microchip", jedecId: "", sizeBytes: 65536, type: "spi", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25LC1024", vendor: "Microchip", jedecId: "", sizeBytes: 131072, type: "spi", pageSize: 256, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "25AA010A", vendor: "Microchip", jedecId: "", sizeBytes: 128, type: "spi", pageSize: 16, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25AA020A", vendor: "Microchip", jedecId: "", sizeBytes: 256, type: "spi", pageSize: 16, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25AA040", vendor: "Microchip", jedecId: "", sizeBytes: 512, type: "spi", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25AA080", vendor: "Microchip", jedecId: "", sizeBytes: 1024, type: "spi", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25AA160", vendor: "Microchip", jedecId: "", sizeBytes: 2048, type: "spi", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "25AA512", vendor: "Microchip", jedecId: "", sizeBytes: 65536, type: "spi", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },

  // ═══════════════════════════════════════════
  // EFINIX / OPI HyperFlash devices
  // ═══════════════════════════════════════════
  { name: "S26HL512T", vendor: "Cypress", jedecId: "342a1a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 200 },
  { name: "S26HL01GT", vendor: "Cypress", jedecId: "342a1b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 200 },
  { name: "S26KL512S", vendor: "Cypress", jedecId: "342b1a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 262144, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 333 },

  // ═══════════════════════════════════════════
  // FORESEE
  // ═══════════════════════════════════════════
  { name: "FS25Q08", vendor: "FORESEE", jedecId: "cd6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FS25Q16", vendor: "FORESEE", jedecId: "cd6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FS25Q32", vendor: "FORESEE", jedecId: "cd6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FS25Q64", vendor: "FORESEE", jedecId: "cd6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FS25Q128", vendor: "FORESEE", jedecId: "cd6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "FS25Q256", vendor: "FORESEE", jedecId: "cd6019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // PFLASH
  // ═══════════════════════════════════════════
  { name: "PF25Q08", vendor: "PFLASH", jedecId: "634014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PF25Q16", vendor: "PFLASH", jedecId: "634015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PF25Q32", vendor: "PFLASH", jedecId: "634016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PF25Q64", vendor: "PFLASH", jedecId: "634017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "PF25Q128", vendor: "PFLASH", jedecId: "634018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Sino Wealth
  // ═══════════════════════════════════════════
  { name: "SH25Q08", vendor: "SinoWealth", jedecId: "424014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SH25Q16", vendor: "SinoWealth", jedecId: "424015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SH25Q32", vendor: "SinoWealth", jedecId: "424016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SH25Q64", vendor: "SinoWealth", jedecId: "424017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "SH25Q128", vendor: "SinoWealth", jedecId: "424018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Pkenpapu / TH (CSF) — automotive grade
  // ═══════════════════════════════════════════
  { name: "TH25Q16HB", vendor: "TH", jedecId: "eb6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "TH25Q32HB", vendor: "TH", jedecId: "eb6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "TH25Q64HB", vendor: "TH", jedecId: "eb6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "TH25Q128HB", vendor: "TH", jedecId: "eb6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // CFeon (10) — additional from flashrom
  // ═══════════════════════════════════════════
  { name: "EN25S10", vendor: "EON", jedecId: "1c3811", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S20", vendor: "EON", jedecId: "1c3812", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S40", vendor: "EON", jedecId: "1c3813", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S80", vendor: "EON", jedecId: "1c3814", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S128", vendor: "EON", jedecId: "1c3818", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "EN25S256", vendor: "EON", jedecId: "1c3819", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // EON EN25QE/QU (low-power QSPI)
  // ═══════════════════════════════════════════
  { name: "EN25QU16", vendor: "EON", jedecId: "1c5115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "EN25QU32", vendor: "EON", jedecId: "1c5116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "EN25QU64", vendor: "EON", jedecId: "1c5117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "EN25QU128", vendor: "EON", jedecId: "1c5118", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "EN25QU256", vendor: "EON", jedecId: "1c5119", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Macronix MX25U extended
  // ═══════════════════════════════════════════
  { name: "MX25U4035", vendor: "Macronix", jedecId: "c22533", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U2035", vendor: "Macronix", jedecId: "c22532", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25U1735E", vendor: "Macronix", jedecId: "c22531", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "MX25L1735E", vendor: "Macronix", jedecId: "c22431", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // Winbond W25R (industrial)
  // ═══════════════════════════════════════════
  { name: "W25R256JV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25R128JV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Winbond W25N (NAND SPI) — large blocks
  // ═══════════════════════════════════════════
  { name: "W25N01GV", vendor: "Winbond", jedecId: "efaa21", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25N02JW", vendor: "Winbond", jedecId: "efba22", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25N04KV", vendor: "Winbond", jedecId: "efaa23", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // GigaDevice GD5F (NAND SPI)
  // ═══════════════════════════════════════════
  { name: "GD5F1GQ4U", vendor: "GigaDevice", jedecId: "c8d1", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD5F2GQ4U", vendor: "GigaDevice", jedecId: "c8d2", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "GD5F4GQ4U", vendor: "GigaDevice", jedecId: "c8d4", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Macronix NAND SPI
  // ═══════════════════════════════════════════
  { name: "MX35LF1GE4AB", vendor: "Macronix", jedecId: "c212", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "MX35LF2GE4AB", vendor: "Macronix", jedecId: "c222", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Micron NAND SPI
  // ═══════════════════════════════════════════
  { name: "MT29F1G01ABA", vendor: "Micron", jedecId: "2c14", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "MT29F2G01ABA", vendor: "Micron", jedecId: "2c24", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "MT29F4G01AD", vendor: "Micron", jedecId: "2c34", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // Toshiba (98) — TC58xxx NAND/NOR
  // ═══════════════════════════════════════════
  { name: "TC58CVG0S3HRAIG", vendor: "Toshiba", jedecId: "98c2", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "TC58CVG2S0HRAIG", vendor: "Toshiba", jedecId: "98cd", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 4096, sectorSize: 262144, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "TH58NVG2S3HBAI4", vendor: "Toshiba", jedecId: "98cd", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 4096, sectorSize: 262144, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // CFeon legacy + Winbond W29 (parallel NOR via SPI bridges)
  // ═══════════════════════════════════════════
  { name: "W29N01HV", vendor: "Winbond", jedecId: "efaa20", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "W29N02JV", vendor: "Winbond", jedecId: "efaa22", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },
  { name: "W29N04GV", vendor: "Winbond", jedecId: "efac23", sizeBytes: 512 * 1024 * 1024, type: "spi", pageSize: 2048, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 50 },

  // ═══════════════════════════════════════════
  // GigaDevice GD25Q (additional density extensions)
  // ═══════════════════════════════════════════
  { name: "GD25Q05B", vendor: "GigaDevice", jedecId: "c84010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25D05B", vendor: "GigaDevice", jedecId: "c83010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D10B", vendor: "GigaDevice", jedecId: "c83011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D20B", vendor: "GigaDevice", jedecId: "c83012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D40B", vendor: "GigaDevice", jedecId: "c83013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25D80B", vendor: "GigaDevice", jedecId: "c83014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "GD25Q16E", vendor: "GigaDevice", jedecId: "c84015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25Q32E", vendor: "GigaDevice", jedecId: "c84016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "GD25Q64E", vendor: "GigaDevice", jedecId: "c84017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Numonyx legacy aliases (M25Pxx alternates)
  // ═══════════════════════════════════════════
  { name: "M25PX16", vendor: "Numonyx", jedecId: "207115", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25PX32", vendor: "Numonyx", jedecId: "207116", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25PX64", vendor: "Numonyx", jedecId: "207117", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },
  { name: "M25PX80", vendor: "Numonyx", jedecId: "207114", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },

  // ═══════════════════════════════════════════
  // Renesas / Hitachi serial flash (legacy)
  // ═══════════════════════════════════════════
  { name: "HF25Q16", vendor: "Renesas", jedecId: "f25615", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 75 },

  // ═══════════════════════════════════════════
  // ChangXin Memory (CXMT)
  // ═══════════════════════════════════════════
  { name: "CX25Q32", vendor: "CXMT", jedecId: "1f4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "CX25Q64", vendor: "CXMT", jedecId: "1f4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Macronix MX25L flagship octa-SPI / Hyperflash
  // ═══════════════════════════════════════════
  { name: "MX25LM51245G", vendor: "Macronix", jedecId: "c2853a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 200 },
  { name: "MX25UM51245G", vendor: "Macronix", jedecId: "c2803a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 200 },

  // ═══════════════════════════════════════════
  // Numonyx N25Q-Auto (T) variants
  // ═══════════════════════════════════════════
  { name: "N25Q256-T", vendor: "Micron", jedecId: "20ba19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 108 },

  // ═══════════════════════════════════════════
  // Spansion S25FL S/L additional
  // ═══════════════════════════════════════════
  { name: "S25FL127S", vendor: "Spansion", jedecId: "012018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "S25FL01GS", vendor: "Spansion", jedecId: "010221", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // GigaDevice GD25LR (low-power radiation-tolerant)
  // ═══════════════════════════════════════════
  { name: "GD25LR512", vendor: "GigaDevice", jedecId: "c8671a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "GD25LR1G", vendor: "GigaDevice", jedecId: "c8671b", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // I2C EEPROM (24Cxx)
  // ═══════════════════════════════════════════
  { name: "24C01", vendor: "Generic", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 8, sectorSize: 128, blockSize: 128, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C02", vendor: "Generic", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 8, sectorSize: 256, blockSize: 256, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C04", vendor: "Generic", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C08", vendor: "Generic", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C16", vendor: "Generic", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C32", vendor: "Generic", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C64", vendor: "Generic", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C128", vendor: "Generic", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C256", vendor: "Generic", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C512", vendor: "Generic", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 5.0, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24C1024", vendor: "Generic", jedecId: "", sizeBytes: 131072, type: "i2c", pageSize: 128, sectorSize: 131072, blockSize: 131072, voltage: 5.0, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Atmel/Microchip AT24Cxx (I2C EEPROM, branded)
  // ═══════════════════════════════════════════
  { name: "AT24C01A", vendor: "Atmel", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 8, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C02", vendor: "Atmel", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 8, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C04", vendor: "Atmel", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C08A", vendor: "Atmel", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C16A", vendor: "Atmel", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C32D", vendor: "Atmel", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C64D", vendor: "Atmel", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C128C", vendor: "Atmel", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "AT24C256C", vendor: "Atmel", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "AT24C512C", vendor: "Atmel", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "AT24C1024B", vendor: "Atmel", jedecId: "", sizeBytes: 131072, type: "i2c", pageSize: 256, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // ST/STMicro M24Cxx (I2C EEPROM)
  // ═══════════════════════════════════════════
  { name: "M24C01", vendor: "ST", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 16, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C02", vendor: "ST", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 16, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C04", vendor: "ST", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C08", vendor: "ST", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C16", vendor: "ST", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C32", vendor: "ST", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24C64", vendor: "ST", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24128", vendor: "ST", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24256", vendor: "ST", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M24512", vendor: "ST", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "M24M01", vendor: "ST", jedecId: "", sizeBytes: 131072, type: "i2c", pageSize: 256, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "M24M02", vendor: "ST", jedecId: "", sizeBytes: 262144, type: "i2c", pageSize: 256, sectorSize: 262144, blockSize: 262144, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Catalyst/ON Semi CAT24Cxx
  // ═══════════════════════════════════════════
  { name: "CAT24C01", vendor: "Catalyst", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 16, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C02", vendor: "Catalyst", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 16, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C04", vendor: "Catalyst", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C08", vendor: "Catalyst", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C16", vendor: "Catalyst", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C32", vendor: "Catalyst", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C64", vendor: "Catalyst", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C128", vendor: "Catalyst", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C256", vendor: "Catalyst", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT24C512", vendor: "Catalyst", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "CAT24M01", vendor: "Catalyst", jedecId: "", sizeBytes: 131072, type: "i2c", pageSize: 256, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Microchip 24AAxxx (low-voltage I2C)
  // ═══════════════════════════════════════════
  { name: "24AA01", vendor: "Microchip", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 8, sectorSize: 128, blockSize: 128, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA02", vendor: "Microchip", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 8, sectorSize: 256, blockSize: 256, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA04", vendor: "Microchip", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA08", vendor: "Microchip", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA16", vendor: "Microchip", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA32", vendor: "Microchip", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA64", vendor: "Microchip", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA128", vendor: "Microchip", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA256", vendor: "Microchip", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA512", vendor: "Microchip", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "24AA1025", vendor: "Microchip", jedecId: "", sizeBytes: 131072, type: "i2c", pageSize: 128, sectorSize: 131072, blockSize: 131072, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // STMicroelectronics M93Cxx (Microwire EEPROM via I2C bridge)
  // ═══════════════════════════════════════════
  { name: "M93C46", vendor: "ST", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 1, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M93C56", vendor: "ST", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 1, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M93C66", vendor: "ST", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 1, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M93C76", vendor: "ST", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 1, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "M93C86", vendor: "ST", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 1, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Macronix MX25L additional density variants (sub-Mb)
  // ═══════════════════════════════════════════
  { name: "MX25L1635F", vendor: "Macronix", jedecId: "c22515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "MX25L3236F", vendor: "Macronix", jedecId: "c25e16", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "MX25L6433F", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L12873G", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L25733F", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Winbond W25Q small-density (sub-Mb)
  // ═══════════════════════════════════════════
  { name: "W25Q05CL", vendor: "Winbond", jedecId: "ef4010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "W25Q05NW", vendor: "Winbond", jedecId: "ef6010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q10NW", vendor: "Winbond", jedecId: "ef6011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "W25Q20NW", vendor: "Winbond", jedecId: "ef6012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // GigaDevice GD25LD (low-density 1.8V)
  // ═══════════════════════════════════════════
  { name: "GD25LD05", vendor: "GigaDevice", jedecId: "c86010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "GD25LD10", vendor: "GigaDevice", jedecId: "c86011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "GD25LD20", vendor: "GigaDevice", jedecId: "c86012", sizeBytes: 256 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "GD25LD40", vendor: "GigaDevice", jedecId: "c86013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },
  { name: "GD25LD80", vendor: "GigaDevice", jedecId: "c86014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // ISSI IS25LD (small density)
  // ═══════════════════════════════════════════
  { name: "IS25LD512", vendor: "ISSI", jedecId: "9d6010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "IS25LD05", vendor: "ISSI", jedecId: "9d6010", sizeBytes: 64 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.3, voltageMax: 3.6, maxClockMhz: 100 },

  // ═══════════════════════════════════════════
  // STMicro M95xxx (SPI EEPROM)
  // ═══════════════════════════════════════════
  { name: "M95010", vendor: "ST", jedecId: "", sizeBytes: 128, type: "spi", pageSize: 16, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "M95020", vendor: "ST", jedecId: "", sizeBytes: 256, type: "spi", pageSize: 16, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "M95040", vendor: "ST", jedecId: "", sizeBytes: 512, type: "spi", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "M95080", vendor: "ST", jedecId: "", sizeBytes: 1024, type: "spi", pageSize: 32, sectorSize: 1024, blockSize: 1024, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "M95160", vendor: "ST", jedecId: "", sizeBytes: 2048, type: "spi", pageSize: 32, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 10 },
  { name: "M95320", vendor: "ST", jedecId: "", sizeBytes: 4096, type: "spi", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95640", vendor: "ST", jedecId: "", sizeBytes: 8192, type: "spi", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95128", vendor: "ST", jedecId: "", sizeBytes: 16384, type: "spi", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95256", vendor: "ST", jedecId: "", sizeBytes: 32768, type: "spi", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95512", vendor: "ST", jedecId: "", sizeBytes: 65536, type: "spi", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95M01", vendor: "ST", jedecId: "", sizeBytes: 131072, type: "spi", pageSize: 256, sectorSize: 131072, blockSize: 131072, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95M02", vendor: "ST", jedecId: "", sizeBytes: 262144, type: "spi", pageSize: 256, sectorSize: 262144, blockSize: 262144, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5, maxClockMhz: 20 },
  { name: "M95M04", vendor: "ST", jedecId: "", sizeBytes: 524288, type: "spi", pageSize: 512, sectorSize: 524288, blockSize: 524288, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5, maxClockMhz: 20 },

  // ═══════════════════════════════════════════
  // Macronix MX25L flagship serial NOR (additional)
  // ═══════════════════════════════════════════
  { name: "MX25L4006E", vendor: "Macronix", jedecId: "c22013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L8006E", vendor: "Macronix", jedecId: "c22014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L1633E", vendor: "Macronix", jedecId: "c22515", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L4026E", vendor: "Macronix", jedecId: "c22513", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },

  // ═══════════════════════════════════════════
  // GigaDevice GD25S (high-reliability serial)
  // ═══════════════════════════════════════════
  { name: "GD25S512MD", vendor: "GigaDevice", jedecId: "c84020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25S256ME", vendor: "GigaDevice", jedecId: "c84019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },
  { name: "GD25S128MC", vendor: "GigaDevice", jedecId: "c84018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 120 },

  // ═══════════════════════════════════════════
  // Macronix industrial extended-temp variants
  // ═══════════════════════════════════════════
  { name: "MX25L12865E", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 86 },
  { name: "MX25L25655F", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "MX25L51273G", vendor: "Macronix", jedecId: "c2201a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Macronix MX25R wide-voltage extended
  // ═══════════════════════════════════════════
  { name: "MX25R12835F", vendor: "Macronix", jedecId: "c22818", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.0, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 3.6, maxClockMhz: 80 },

  // ═══════════════════════════════════════════
  // Cypress S70 (multi-die HyperFlash)
  // ═══════════════════════════════════════════
  { name: "S70FL01GS", vendor: "Spansion", jedecId: "010221", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 262144, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // ISSI IS25LX (Octal NOR)
  // ═══════════════════════════════════════════
  { name: "IS25LX256", vendor: "ISSI", jedecId: "9d5a19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 166 },
  { name: "IS25LX512", vendor: "ISSI", jedecId: "9d5a1a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 200 },
  { name: "IS25WX256", vendor: "ISSI", jedecId: "9d5b19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 200 },

  // ═══════════════════════════════════════════
  // Winbond W25H (high-reliability)
  // ═══════════════════════════════════════════
  { name: "W25H02JV", vendor: "Winbond", jedecId: "ef9022", sizeBytes: 256 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },
  { name: "W25H01JV", vendor: "Winbond", jedecId: "ef9021", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Catalyst CAT93Cxx (Microwire EEPROM)
  // ═══════════════════════════════════════════
  { name: "CAT93C46", vendor: "Catalyst", jedecId: "", sizeBytes: 128, type: "i2c", pageSize: 1, sectorSize: 128, blockSize: 128, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT93C56", vendor: "Catalyst", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 1, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT93C66", vendor: "Catalyst", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 1, sectorSize: 512, blockSize: 512, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },
  { name: "CAT93C86", vendor: "Catalyst", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 1, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.8, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Renesas R1Ex24xxx / Hitachi HD24xxx (legacy I2C)
  // ═══════════════════════════════════════════
  { name: "R1EX24512", vendor: "Renesas", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 5.5 },
  { name: "R1EX24128", vendor: "Renesas", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.5, voltageMax: 5.5 },

  // ═══════════════════════════════════════════
  // Rohm BR24xxx (I2C EEPROM)
  // ═══════════════════════════════════════════
  { name: "BR24G02", vendor: "Rohm", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 8, sectorSize: 256, blockSize: 256, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "BR24G16", vendor: "Rohm", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "BR24G32", vendor: "Rohm", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 3.3, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 5.5 },
  { name: "BR24L32F", vendor: "Rohm", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.6, voltageMax: 3.6 },

  // ═══════════════════════════════════════════
  // Macronix MX25U flagship (extended density)
  // ═══════════════════════════════════════════
  { name: "MX25U6432F", vendor: "Macronix", jedecId: "c22537", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },
  { name: "MX25U12873G", vendor: "Macronix", jedecId: "c22538", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 133 },

  // ═══════════════════════════════════════════
  // Winbond W25Q (additional 1.8V industrial)
  // ═══════════════════════════════════════════
  { name: "W25Q16JW-IM", vendor: "Winbond", jedecId: "ef8015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.7, voltageMax: 1.95, maxClockMhz: 133 },
  { name: "W25Q16JL", vendor: "Winbond", jedecId: "ef6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false, voltageMin: 1.65, voltageMax: 1.95, maxClockMhz: 104 },

  // ═══════════════════════════════════════════
  // Final additions: rare/regional vendors
  // ═══════════════════════════════════════════
  { name: "MR25H40", vendor: "Everspin", jedecId: "c22013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 3.0, voltageMax: 3.6, maxClockMhz: 40 },
  { name: "MR25H10", vendor: "Everspin", jedecId: "c22011", sizeBytes: 128 * 1024, type: "spi", pageSize: 256, sectorSize: 65536, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 3.0, voltageMax: 3.6, maxClockMhz: 40 },
  { name: "MR25H256", vendor: "Everspin", jedecId: "c22015", sizeBytes: 32768, type: "spi", pageSize: 256, sectorSize: 32768, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false, voltageMin: 3.0, voltageMax: 3.6, maxClockMhz: 40 },
  { name: "ICN25Q16", vendor: "Icnova", jedecId: "1f4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ICN25Q32", vendor: "Icnova", jedecId: "1f4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ICN25Q64", vendor: "Icnova", jedecId: "1f4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "ICN25Q128", vendor: "Icnova", jedecId: "1f4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "T25S40", vendor: "TSMC", jedecId: "ef4013", sizeBytes: 512 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 80 },
  { name: "AB25Q32", vendor: "AB", jedecId: "574016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 104 },
  { name: "NM25Q032", vendor: "Nuvoton", jedecId: "562016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "NM25Q064", vendor: "Nuvoton", jedecId: "562017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
  { name: "NM25Q128", vendor: "Nuvoton", jedecId: "562018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false, voltageMin: 2.7, voltageMax: 3.6, maxClockMhz: 100 },
];

// ═══════════════════════════════════════════
// Lookup functions
// ═══════════════════════════════════════════

export function lookupChipByJedecId(jedecId: string): ChipDef | undefined {
  return CHIP_DATABASE.find((c) => c.jedecId === jedecId.toLowerCase());
}

export function lookupChipByName(name: string): ChipDef | undefined {
  return CHIP_DATABASE.find(
    (c) => c.name.toLowerCase() === name.toLowerCase().trim(),
  );
}

export function searchChips(query: string): ChipDef[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...CHIP_DATABASE];
  return CHIP_DATABASE.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.vendor.toLowerCase().includes(q) ||
      c.jedecId.includes(q) ||
      `${c.voltage}v`.includes(q) ||
      `${c.voltage}`.includes(q),
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function isLowVoltageChip(jedecId: string): boolean {
  const chip = lookupChipByJedecId(jedecId);
  return chip ? chip.voltage < 2.0 : false;
}

export function getChipVoltage(jedecId: string): number | undefined {
  return lookupChipByJedecId(jedecId)?.voltage;
}

export function needs4ByteAddressing(jedecId: string): boolean {
  const chip = lookupChipByJedecId(jedecId);
  if (chip) return chip.needs4ByteAddr;
  if (jedecId.length >= 6) {
    const capacityByte = parseInt(jedecId.substring(4, 6), 16);
    return capacityByte >= 0x19;
  }
  return false;
}

// ═══════════════════════════════════════════
// JEDEC manufacturer table
// ═══════════════════════════════════════════

const JEDEC_MANUFACTURERS: Record<string, string> = {
  "ef": "Winbond",
  "c2": "Macronix",
  "c8": "GigaDevice",
  "bf": "SST/Microchip",
  "1c": "EON",
  "01": "Spansion/Cypress/Infineon",
  "20": "Micron/Numonyx",
  "9d": "ISSI",
  "37": "AMIC",
  "f8": "Fudan",
  "ba": "Zetta",
  "0b": "XTX",
  "68": "Boya",
  "85": "PUYA",
  "8c": "ESMT",
  "7f": "PCT/Extended JEDEC",
  "89": "Intel",
  "1f": "Atmel/Adesto",
  "62": "Sanyo",
  "a1": "Fudan Micro (alt)",
  "e0": "Paragon",
  "d5": "ISSI (alt)",
  "52": "Alliance Memory",
  "54": "Douqi",
};

export function getManufacturerName(jedecId: string): string {
  if (jedecId.length >= 2) {
    return JEDEC_MANUFACTURERS[jedecId.substring(0, 2).toLowerCase()] || "Unknown";
  }
  return "Unknown";
}

// ═══════════════════════════════════════════
// Fuzzy JEDEC matching
// ═══════════════════════════════════════════

export interface FuzzyMatch {
  manufacturer: string;
  estimatedSizeBytes: number;
  estimatedVoltage: number;
  confidence: "high" | "medium" | "low";
  similarChips: ChipDef[];
  reasoning: string;
}

export function estimateCapacityFromByte(capacityByte: number): number {
  if (capacityByte >= 0x10 && capacityByte <= 0x22) {
    return 1 << capacityByte;
  }
  return 0;
}

export function fuzzyMatchJedec(jedecId: string): FuzzyMatch {
  const id = jedecId.toLowerCase();

  if (id === "000000" || id === "ffffff" || !id || id.length < 6) {
    return {
      manufacturer: "None",
      estimatedSizeBytes: 0,
      estimatedVoltage: 0,
      confidence: "low",
      similarChips: [],
      reasoning: id === "000000" || id === "ffffff"
        ? "Dead chip response — no SPI flash detected. Check SOIC clip connection."
        : "Invalid or incomplete JEDEC ID",
    };
  }

  const mfgByte = id.substring(0, 2);
  const typeByte = id.substring(2, 4);
  const capByte = parseInt(id.substring(4, 6), 16);
  const manufacturer = JEDEC_MANUFACTURERS[mfgByte] || "Unknown";
  const estimatedSize = estimateCapacityFromByte(capByte);

  const sameVendor = CHIP_DATABASE.filter(
    (c) => c.jedecId.substring(0, 2) === mfgByte && c.type === "spi",
  );

  const sameType = sameVendor.filter(
    (c) => c.jedecId.substring(2, 4) === typeByte,
  );

  const similarChips = (sameType.length > 0 ? sameType : sameVendor).slice(0, 5);

  let estimatedVoltage = 3.3;
  if (similarChips.length > 0) {
    const voltages = similarChips.map((c) => c.voltage);
    estimatedVoltage = voltages[0];
  }

  let confidence: "high" | "medium" | "low";
  const reasons: string[] = [];

  if (manufacturer !== "Unknown" && estimatedSize > 0 && sameType.length > 0) {
    confidence = "high";
    reasons.push(`Known manufacturer: ${manufacturer}`);
    reasons.push(`Capacity: ${formatSize(estimatedSize)} (from byte 0x${capByte.toString(16)})`);
    reasons.push(`${sameType.length} similar chips in database`);
  } else if (manufacturer !== "Unknown" && estimatedSize > 0) {
    confidence = "medium";
    reasons.push(`Known manufacturer: ${manufacturer}`);
    reasons.push(`Capacity: ${formatSize(estimatedSize)} (from byte 0x${capByte.toString(16)})`);
    reasons.push("Exact type byte not in database — voltage is estimated");
  } else if (manufacturer !== "Unknown") {
    confidence = "medium";
    reasons.push(`Known manufacturer: ${manufacturer}`);
    reasons.push("Capacity byte outside standard range — size unknown");
  } else {
    confidence = "low";
    reasons.push(`Unknown manufacturer byte: 0x${mfgByte}`);
    if (estimatedSize > 0) reasons.push(`Estimated capacity: ${formatSize(estimatedSize)}`);
  }

  return {
    manufacturer,
    estimatedSizeBytes: estimatedSize,
    estimatedVoltage,
    confidence,
    similarChips,
    reasoning: reasons.join(". ") + ".",
  };
}

// ═══════════════════════════════════════════
// Voltage/timing recommendations
// ═══════════════════════════════════════════

export interface ChipRecommendation {
  safeVoltage: string;
  maxSpiClock: string;
  eraseStrategy: string;
  writePageSize: number;
  addressMode: string;
  warnings: string[];
}

export function getChipRecommendations(chip: ChipDef): ChipRecommendation {
  const warnings: string[] = [];

  let safeVoltage: string;
  if (chip.voltageMin && chip.voltageMax) {
    safeVoltage = `${chip.voltage}V (range: ${chip.voltageMin}-${chip.voltageMax}V)`;
  } else {
    safeVoltage = `${chip.voltage}V`;
  }

  if (chip.voltage < 2.0) {
    warnings.push("1.8V chip — CH341A outputs 3.3V natively. Use a 1.8V adapter or level shifter to avoid chip damage.");
  }

  let maxSpiClock: string;
  if (chip.maxClockMhz) {
    const conservative = Math.min(chip.maxClockMhz, 30);
    maxSpiClock = `${chip.maxClockMhz}MHz max (conservative: ${conservative}MHz for CH341A)`;
  } else {
    maxSpiClock = "Unknown — use conservative 25MHz";
  }

  const eraseOps: string[] = [];
  if (chip.sectorSize === 4096) eraseOps.push("4KB sector (0x20)");
  if (chip.blockSize === 32768) eraseOps.push("32KB block (0x52)");
  if (chip.blockSize === 65536) eraseOps.push("64KB block (0xD8)");
  eraseOps.push("Chip erase (0xC7/0x60)");

  const addressMode = chip.needs4ByteAddr ? "4-byte (>16MB, uses EN4B 0xB7)" : "3-byte standard";

  if (chip.needs4ByteAddr) {
    warnings.push("Large chip requires 4-byte addressing mode. biospy handles this automatically.");
  }

  if (chip.type === "i2c") {
    warnings.push("I2C EEPROM — requires I2C protocol, not SPI. Use appropriate clip/adapter.");
  }

  return {
    safeVoltage,
    maxSpiClock,
    eraseStrategy: eraseOps.join(", "),
    writePageSize: chip.pageSize,
    addressMode,
    warnings,
  };
}

// ═══════════════════════════════════════════
// Community chip submission validation
// ═══════════════════════════════════════════

export const CHIP_SUBMISSION_SCHEMA = {
  required: ["name", "vendor", "jedecId", "sizeBytes", "type", "pageSize", "sectorSize", "blockSize", "voltage", "needs4ByteAddr"] as const,
  optional: ["voltageMin", "voltageMax", "maxClockMhz", "eraseOpcodes"] as const,
  types: {
    name: "string",
    vendor: "string",
    jedecId: "string (6 hex chars, e.g. 'ef4017')",
    sizeBytes: "number (power of 2, in bytes)",
    type: "'spi' | 'i2c'",
    pageSize: "number (typically 256 for SPI)",
    sectorSize: "number (typically 4096 for SPI)",
    blockSize: "number (typically 65536 for SPI)",
    voltage: "number (e.g. 3.3 or 1.8)",
    needs4ByteAddr: "boolean (true if >16MB)",
    voltageMin: "number (optional, e.g. 2.7)",
    voltageMax: "number (optional, e.g. 3.6)",
    maxClockMhz: "number (optional, max SPI clock)",
    eraseOpcodes: "number[] (optional, e.g. [0x20, 0xD8, 0xC7])",
  },
};

export function validateChipSubmission(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Submission must be an object"] };
  }

  const d = data as Record<string, unknown>;

  for (const field of CHIP_SUBMISSION_SCHEMA.required) {
    if (d[field] === undefined || d[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof d.name === "string" && d.name.length === 0) {
    errors.push("name must be non-empty");
  }

  if (typeof d.jedecId === "string") {
    if (!/^[0-9a-fA-F]{6}$/.test(d.jedecId)) {
      errors.push("jedecId must be exactly 6 hex characters (e.g. 'ef4017')");
    }
  }

  if (typeof d.sizeBytes === "number") {
    if (d.sizeBytes <= 0 || (d.sizeBytes & (d.sizeBytes - 1)) !== 0) {
      errors.push("sizeBytes must be a positive power of 2");
    }
  }

  if (d.type !== undefined && d.type !== "spi" && d.type !== "i2c") {
    errors.push("type must be 'spi' or 'i2c'");
  }

  if (typeof d.voltage === "number" && (d.voltage <= 0 || d.voltage > 10)) {
    errors.push("voltage must be between 0 and 10");
  }

  return { valid: errors.length === 0, errors };
}
