interface ChipDef {
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
}

export const CHIP_DATABASE: ChipDef[] = [
  // Winbond 3.3V
  { name: "W25Q80BV", vendor: "Winbond", jedecId: "ef4014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "W25Q16JV", vendor: "Winbond", jedecId: "ef4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "W25Q32JV", vendor: "Winbond", jedecId: "ef4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "W25Q64JV", vendor: "Winbond", jedecId: "ef4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "W25Q128JV", vendor: "Winbond", jedecId: "ef4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "W25Q256JV", vendor: "Winbond", jedecId: "ef4019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "W25Q512JV", vendor: "Winbond", jedecId: "ef4020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "W25Q01JV", vendor: "Winbond", jedecId: "ef4021", sizeBytes: 128 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // Winbond 1.8V (laptops/tablets — DANGER: CH341A outputs 3.3V)
  { name: "W25Q80DL", vendor: "Winbond", jedecId: "ef6014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "W25Q16FW", vendor: "Winbond", jedecId: "ef6015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "W25Q32FW", vendor: "Winbond", jedecId: "ef6016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "W25Q64FW", vendor: "Winbond", jedecId: "ef6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "W25Q128FW", vendor: "Winbond", jedecId: "ef6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "W25Q256FW", vendor: "Winbond", jedecId: "ef6019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true },

  // Winbond 3.3V (7-series)
  { name: "W25Q256JVEQ", vendor: "Winbond", jedecId: "ef7019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // Macronix 3.3V
  { name: "MX25L8005", vendor: "Macronix", jedecId: "c22014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "MX25L1606E", vendor: "Macronix", jedecId: "c22015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "MX25L3206E", vendor: "Macronix", jedecId: "c22016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "MX25L6406E", vendor: "Macronix", jedecId: "c22017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "MX25L12835F", vendor: "Macronix", jedecId: "c22018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "MX25L25635F", vendor: "Macronix", jedecId: "c22019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "MX25L51245G", vendor: "Macronix", jedecId: "c2201a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // Macronix 1.8V
  { name: "MX25U6435F", vendor: "Macronix", jedecId: "c22537", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "MX25U12835F", vendor: "Macronix", jedecId: "c22538", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "MX25U25643G", vendor: "Macronix", jedecId: "c22539", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true },
  { name: "MX25U51245G", vendor: "Macronix", jedecId: "c2253a", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true },

  // GigaDevice 3.3V
  { name: "GD25Q80C", vendor: "GigaDevice", jedecId: "c84014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "GD25Q16C", vendor: "GigaDevice", jedecId: "c84015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "GD25Q32C", vendor: "GigaDevice", jedecId: "c84016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "GD25Q64C", vendor: "GigaDevice", jedecId: "c84017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "GD25Q128C", vendor: "GigaDevice", jedecId: "c84018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "GD25Q256D", vendor: "GigaDevice", jedecId: "c84019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "GD25Q512MC", vendor: "GigaDevice", jedecId: "c84020", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // GigaDevice 1.8V
  { name: "GD25LQ16C", vendor: "GigaDevice", jedecId: "c86015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "GD25LQ32D", vendor: "GigaDevice", jedecId: "c86016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "GD25LQ64C", vendor: "GigaDevice", jedecId: "c86017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "GD25LQ128D", vendor: "GigaDevice", jedecId: "c86018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "GD25LQ256D", vendor: "GigaDevice", jedecId: "c86019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true },

  // SST / Microchip
  { name: "SST25VF016B", vendor: "SST", jedecId: "bf2541", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false },
  { name: "SST25VF032B", vendor: "SST", jedecId: "bf254a", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false },
  { name: "SST25VF064C", vendor: "SST", jedecId: "bf254b", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 32768, voltage: 3.3, needs4ByteAddr: false },

  // EON
  { name: "EN25QH16", vendor: "EON", jedecId: "1c7015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "EN25QH32B", vendor: "EON", jedecId: "1c7016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "EN25QH64A", vendor: "EON", jedecId: "1c7017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "EN25QH128A", vendor: "EON", jedecId: "1c7018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // Spansion / Cypress / Infineon
  { name: "S25FL064L", vendor: "Spansion", jedecId: "016017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "S25FL128L", vendor: "Spansion", jedecId: "016018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "S25FL256L", vendor: "Spansion", jedecId: "016019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "S25FL256S", vendor: "Spansion", jedecId: "010219", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "S25FL512S", vendor: "Spansion", jedecId: "010220", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // Micron / Numonyx
  { name: "N25Q064A", vendor: "Micron", jedecId: "20ba17", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "N25Q128A", vendor: "Micron", jedecId: "20ba18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "N25Q256A", vendor: "Micron", jedecId: "20ba19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },
  { name: "MT25QL512ABB", vendor: "Micron", jedecId: "20ba20", sizeBytes: 64 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // Micron 1.8V
  { name: "MT25QU128ABA", vendor: "Micron", jedecId: "20bb18", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "MT25QU256ABA", vendor: "Micron", jedecId: "20bb19", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: true },

  // ISSI
  { name: "IS25LP064A", vendor: "ISSI", jedecId: "9d6017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "IS25LP128F", vendor: "ISSI", jedecId: "9d6018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "IS25WP064A", vendor: "ISSI", jedecId: "9d7017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },
  { name: "IS25WP128F", vendor: "ISSI", jedecId: "9d7018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 1.8, needs4ByteAddr: false },

  // XMC (Wuhan Xinxin Semiconductor)
  { name: "XM25QH64A", vendor: "XMC", jedecId: "207017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "XM25QH128A", vendor: "XMC", jedecId: "207018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "XM25QH256C", vendor: "XMC", jedecId: "207019", sizeBytes: 32 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: true },

  // PUYA
  { name: "P25Q16H", vendor: "PUYA", jedecId: "856015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "P25Q32H", vendor: "PUYA", jedecId: "856016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // AMIC
  { name: "A25L080", vendor: "AMIC", jedecId: "374014", sizeBytes: 1 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "A25L016", vendor: "AMIC", jedecId: "374015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "A25LQ32A", vendor: "AMIC", jedecId: "374016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "A25LQ64", vendor: "AMIC", jedecId: "374017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // Fudan
  { name: "FM25Q16A", vendor: "Fudan", jedecId: "f83215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "FM25Q32A", vendor: "Fudan", jedecId: "f83216", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "FM25Q64A", vendor: "Fudan", jedecId: "f83217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "FM25Q128A", vendor: "Fudan", jedecId: "f83218", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // Zetta
  { name: "ZD25Q16B", vendor: "Zetta", jedecId: "ba3215", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "ZD25Q32C", vendor: "Zetta", jedecId: "ba3216", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "ZD25Q64B", vendor: "Zetta", jedecId: "ba3217", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // XTX Technology
  { name: "XT25F16B", vendor: "XTX", jedecId: "0b4015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "XT25F32B", vendor: "XTX", jedecId: "0b4016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "XT25F64B", vendor: "XTX", jedecId: "0b4017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "XT25F128B", vendor: "XTX", jedecId: "0b4018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // Boya Micro
  { name: "BY25Q16BS", vendor: "Boya", jedecId: "684015", sizeBytes: 2 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "BY25Q32BS", vendor: "Boya", jedecId: "684016", sizeBytes: 4 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "BY25Q64AS", vendor: "Boya", jedecId: "684017", sizeBytes: 8 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },
  { name: "BY25Q128AS", vendor: "Boya", jedecId: "684018", sizeBytes: 16 * 1024 * 1024, type: "spi", pageSize: 256, sectorSize: 4096, blockSize: 65536, voltage: 3.3, needs4ByteAddr: false },

  // I2C EEPROM (24Cxx)
  { name: "24C02", vendor: "Generic", jedecId: "", sizeBytes: 256, type: "i2c", pageSize: 8, sectorSize: 256, blockSize: 256, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C04", vendor: "Generic", jedecId: "", sizeBytes: 512, type: "i2c", pageSize: 16, sectorSize: 512, blockSize: 512, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C08", vendor: "Generic", jedecId: "", sizeBytes: 1024, type: "i2c", pageSize: 16, sectorSize: 1024, blockSize: 1024, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C16", vendor: "Generic", jedecId: "", sizeBytes: 2048, type: "i2c", pageSize: 16, sectorSize: 2048, blockSize: 2048, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C32", vendor: "Generic", jedecId: "", sizeBytes: 4096, type: "i2c", pageSize: 32, sectorSize: 4096, blockSize: 4096, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C64", vendor: "Generic", jedecId: "", sizeBytes: 8192, type: "i2c", pageSize: 32, sectorSize: 8192, blockSize: 8192, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C128", vendor: "Generic", jedecId: "", sizeBytes: 16384, type: "i2c", pageSize: 64, sectorSize: 16384, blockSize: 16384, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C256", vendor: "Generic", jedecId: "", sizeBytes: 32768, type: "i2c", pageSize: 64, sectorSize: 32768, blockSize: 32768, voltage: 5.0, needs4ByteAddr: false },
  { name: "24C512", vendor: "Generic", jedecId: "", sizeBytes: 65536, type: "i2c", pageSize: 128, sectorSize: 65536, blockSize: 65536, voltage: 5.0, needs4ByteAddr: false },
];

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
};

export function getManufacturerName(jedecId: string): string {
  if (jedecId.length >= 2) {
    return JEDEC_MANUFACTURERS[jedecId.substring(0, 2).toLowerCase()] || "Unknown";
  }
  return "Unknown";
}
