/**
 * HDD PCB-level repair diagnostics
 *
 * Reference data and search utilities for hard-drive printed-circuit-board
 * repair: chip identification, swap/transfer procedures, and failure-pattern
 * diagnosis.  Aimed at data-recovery technicians who use SPI programmers
 * (CH341A, CH347, etc.) for ROM work.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HddPcbChip {
  id: string;
  name: string;
  manufacturer: string;
  type:
    | "motor-controller"
    | "preamp"
    | "flash-rom"
    | "dram-cache"
    | "main-controller"
    | "tvs-diode";
  package: string;
  commonDrives: string[];
  programmingMethod: string;
  notes: string;
  keywords: string[];
}

export interface HddPcbProcedure {
  id: string;
  name: string;
  driveFamily: string;
  manufacturer:
    | "seagate"
    | "western-digital"
    | "hitachi"
    | "toshiba"
    | "samsung";
  category:
    | "rom-swap"
    | "firmware-transfer"
    | "preamp-replacement"
    | "motor-controller"
    | "tvs-bypass"
    | "head-map-edit";
  description: string;
  steps: string[];
  requiredTools: string[];
  chipsTouched: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  riskLevel: "low" | "medium" | "high" | "critical";
  keywords: string[];
}

export interface HddPcbFailurePattern {
  id: string;
  name: string;
  symptoms: string[];
  causes: Array<{ cause: string; probability: "high" | "medium" | "low" }>;
  diagnosticSteps: string[];
  repairProcedure: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Synonym map  (query normalisation)
// ---------------------------------------------------------------------------

export const HDD_SYNONYMS: Record<string, string[]> = {
  seagate: ["st", "barracuda", "ironwolf", "exos", "f3", "constellation"],
  "western-digital": [
    "wd",
    "caviar",
    "blue",
    "black",
    "red",
    "purple",
    "gold",
    "mybook",
  ],
  hitachi: ["hgst", "deskstar", "travelstar", "ultrastar"],
  toshiba: ["dt01", "dt02", "mq01", "mq04", "hdwd"],
  samsung: ["spinpoint", "hd501lj", "hd103sj"],
  rom: [
    "spi",
    "flash",
    "eeprom",
    "25p",
    "w25",
    "firmware-chip",
    "bios",
    "overlay",
  ],
  "motor-controller": [
    "smooth",
    "spindle",
    "voice-coil",
    "vcm",
    "l6283",
    "l7251",
    "drv",
  ],
  "main-controller": [
    "marvell",
    "moose",
    "grenada",
    "pharaoh",
    "arm",
    "asic",
    "soc",
  ],
  preamp: ["pre-amp", "preamplifier", "head-amplifier"],
  tvs: [
    "tvs-diode",
    "smdj",
    "surge",
    "esd",
    "transient",
    "zener",
    "overvoltage",
  ],
  dram: ["cache", "sdram", "ddr", "ddr2", "w9825", "buffer"],
  swap: ["transfer", "transplant", "donor", "desolder", "rework"],
  firmware: [
    "fw",
    "modules",
    "sa",
    "system-area",
    "adaptive-data",
    "service-area",
  ],
  "head-map": ["head-mask", "head-table", "disable-head"],
  click: ["clicking", "tick", "ticking", "knock"],
  dead: ["no-spin", "not-detected", "unresponsive", "brick", "no-power"],
  bsy: ["busy", "f3-busy", "led-busy", "stuck-busy"],
  capacity: ["0-bytes", "zero-capacity", "wrong-size", "wrong-model", "lba0"],
  terminal: [
    "serial",
    "uart",
    "hyperterminal",
    "putty",
    "tx-rx",
    "38400",
    "baud",
  ],
  solder: ["desolder", "reflow", "rework", "hot-air", "soldering-iron"],
};

// ---------------------------------------------------------------------------
// Chip database  (16 entries)
// ---------------------------------------------------------------------------

export const HDD_PCB_CHIPS: HddPcbChip[] = [
  // ---- Seagate ----
  {
    id: "sg-smooth-l6283",
    name: "SMOOTH L6283 2.3",
    manufacturer: "STMicroelectronics",
    type: "motor-controller",
    package: "QFP-48",
    commonDrives: [
      "ST1000DM003",
      "ST2000DM001",
      "ST3000DM001",
      "ST500DM002",
    ],
    programmingMethod:
      "Not field-programmable. Replace entire IC via hot-air rework at 350-380 C.",
    notes:
      "Drives spindle motor (3-phase BLDC commutation via BEMF sensing) and " +
      "voice-coil actuator. Successor to L7251 with lower heat dissipation. " +
      "Same QFP-48 footprint but NOT cross-compatible with L7251 — silicon " +
      "revision must match. If this chip shorts, the PCB draws excessive " +
      "current from 12 V and may blow the TVS diode. Check 12 V TVS and " +
      "motor FET outputs with multimeter diode mode before condemning.",
    keywords: [
      "smooth",
      "l6283",
      "motor",
      "spindle",
      "seagate",
      "qfp48",
      "voice-coil",
      "stmicro",
      "barracuda",
    ],
  },
  {
    id: "sg-smooth-l7251",
    name: "SMOOTH L7251 3.1",
    manufacturer: "STMicroelectronics",
    type: "motor-controller",
    package: "QFP-48",
    commonDrives: [
      "ST3500418AS",
      "ST31000528AS",
      "ST3500320AS",
      "ST3250318AS",
    ],
    programmingMethod:
      "Not field-programmable. Replace via hot-air rework at 350-380 C.",
    notes:
      "Earlier-generation Smooth IC used in 7200.11 / 7200.12 era drives. " +
      "Drives spindle motor and voice coil. Revision number (3.1, 3.0) " +
      "matters for compatibility. If motor won't spin, check 12 V at input " +
      "pins 1-2 and BEMF sense outputs before condemning this chip.",
    keywords: [
      "smooth",
      "l7251",
      "motor",
      "spindle",
      "seagate",
      "qfp48",
      "7200.11",
      "7200.12",
    ],
  },
  {
    id: "sg-moose",
    name: "Seagate Moose TTB5760C ASIC",
    manufacturer: "Seagate (LSI custom)",
    type: "main-controller",
    package: "BGA-316",
    commonDrives: [
      "ST3500320AS",
      "ST3500620AS",
      "ST31000333AS",
      "ST31000340AS",
    ],
    programmingMethod:
      "Firmware stored in external SPI flash; ASIC itself is mask-ROM.",
    notes:
      "7200.11 / ES.2 era controller running ARM core. Infamous for BSY bug " +
      "(firmware module 0 corruption). Terminal access at 38400 baud via TX/RX " +
      "pads on PCB resolves most firmware issues without chip-level work. " +
      "Controller failure is rare — ROM corruption is far more common. Do NOT " +
      "replace this chip unless confirmed dead with oscilloscope on SATA PHY.",
    keywords: [
      "moose",
      "main-controller",
      "seagate",
      "7200.11",
      "bsy",
      "f3",
      "terminal",
      "ttb5760",
      "asic",
    ],
  },
  {
    id: "sg-grenada",
    name: "Seagate Grenada TTB5790A ASIC",
    manufacturer: "Seagate (Avago custom)",
    type: "main-controller",
    package: "BGA-352",
    commonDrives: ["ST1000DM003", "ST2000DM001", "ST3000DM001"],
    programmingMethod:
      "Firmware in external SPI flash; some adaptive data in SA on platters.",
    notes:
      "Barracuda 7200.14 / CC-family controller. Higher integration — " +
      "combines some preamp interface logic. ROM swap requires matching " +
      "firmware revision AND head count. Use CH341A to read/write ROM.",
    keywords: [
      "grenada",
      "main-controller",
      "seagate",
      "barracuda",
      "7200.14",
      "asic",
      "ttb5790",
      "cc",
    ],
  },
  {
    id: "sg-pharaoh",
    name: "Seagate Pharaoh TTB5800 ASIC",
    manufacturer: "Seagate (Avago custom)",
    type: "main-controller",
    package: "BGA-400",
    commonDrives: ["ST4000DM004", "ST8000DM004", "ST2000DM008"],
    programmingMethod:
      "External SPI flash for ROM; SA on platters; terminal via UART.",
    notes:
      "Rosewood platform. Supports SMR and TDMR recording. Larger firmware " +
      "footprint — typically paired with 8 Mbit SPI ROM instead of 1 Mbit. " +
      "Requires Seagate F3 terminal commands for firmware-level repair. " +
      "Physical ROM swap is last resort.",
    keywords: [
      "pharaoh",
      "main-controller",
      "seagate",
      "rosewood",
      "f3",
      "uart",
      "ttb5800",
    ],
  },
  {
    id: "sg-spiflash",
    name: "Seagate SPI Flash ROM (25P10VP / W25X10)",
    manufacturer: "STMicro / Winbond",
    type: "flash-rom",
    package: "SOP-8 / WSON-8",
    commonDrives: [
      "ST3500418AS",
      "ST1000DM003",
      "ST2000DM001",
      "ST31000528AS",
    ],
    programmingMethod:
      "SPI programmer (CH341A / CH347) with SOIC-8 clip or desolder. " +
      "Standard 25-series SPI commands. Capacity 1-8 Mbit.",
    notes:
      "Stores drive-unique ROM: serial number, model, firmware rev, max LBA, " +
      "head map, adaptive params pointer. THIS is the chip you read/write with " +
      "a CH341A SPI programmer. For ROM swap: desolder from patient, solder to " +
      "donor (or read/write data in-circuit). Always read and back up before " +
      "any write. ROM is NOT interchangeable without editing.",
    keywords: [
      "spi",
      "flash",
      "rom",
      "25p10",
      "w25x10",
      "seagate",
      "soic8",
      "ch341a",
      "firmware",
      "overlay",
    ],
  },
  {
    id: "sg-dram",
    name: "Seagate DRAM Cache (W9825G6KH-6)",
    manufacturer: "Winbond",
    type: "dram-cache",
    package: "TSOP-II-54",
    commonDrives: ["ST1000DM003", "ST2000DM001", "ST500DM002"],
    programmingMethod:
      "Not programmable; volatile cache. Replace via hot-air rework.",
    notes:
      "32 MB (256 Mbit) SDR SDRAM cache buffer. Failure causes immediate BSY " +
      "or I/O errors during sustained transfer. Test by swapping with " +
      "known-good IC from matching PCB. Some boards use 64 MB Samsung " +
      "K4S561632N instead. -6 suffix = 166 MHz, -5 = 200 MHz.",
    keywords: [
      "dram",
      "cache",
      "w9825",
      "sdram",
      "seagate",
      "winbond",
      "tsop",
      "buffer",
      "32mb",
    ],
  },
  {
    id: "sg-tvs",
    name: "Seagate TVS Diode Array (SMDJ5.0A / SMDJ12A)",
    manufacturer: "Littelfuse / Bourns",
    type: "tvs-diode",
    package: "SMD (DO-214AB / SMA)",
    commonDrives: [
      "ST3500418AS",
      "ST1000DM003",
      "ST2000DM001",
      "ST4000DM004",
    ],
    programmingMethod:
      "N/A — passive component. Desolder/replace with soldering iron.",
    notes:
      "SMDJ5.0A (5 V rail) and SMDJ12A (12 V rail), bi-directional. " +
      "Most common failure: 12 V TVS shorts after power surge, drive appears " +
      "completely dead. Remove shorted TVS to restore power (drive runs " +
      "unprotected). Diagnosis: good TVS reads >1 M-ohm, blown TVS reads " +
      "near 0 ohms. Replace with exact-spec part for permanent fix.",
    keywords: [
      "tvs",
      "diode",
      "smdj",
      "surge",
      "5v",
      "12v",
      "seagate",
      "power",
      "short",
      "overvoltage",
    ],
  },

  // ---- Western Digital ----
  {
    id: "wd-marvell-88i9346",
    name: "Marvell 88i9346-TFJ2 Controller",
    manufacturer: "Marvell",
    type: "main-controller",
    package: "BGA-272",
    commonDrives: ["WD10EZEX", "WD20EZRX", "WD30EFRX", "WD5000AAKX"],
    programmingMethod:
      "Firmware in external SPI flash; some SA on platters.",
    notes:
      "Caviar Blue/Green/Red era ARM SoC. Manages SATA interface, R/W " +
      "channel, ECC engine, and servo control. ROM must be transferred from " +
      "patient to donor PCB or edited to match serial, heads, and adaptive " +
      "pointer. Use CH341A for SPI read/write. If controller fails (no SATA " +
      "link), check crystal oscillator and VCC rails before condemning.",
    keywords: [
      "marvell",
      "88i9346",
      "main-controller",
      "wd",
      "western-digital",
      "caviar",
      "arm",
      "soc",
    ],
  },
  {
    id: "wd-marvell-88i9747",
    name: "Marvell 88i9747-BNP2 Controller",
    manufacturer: "Marvell",
    type: "main-controller",
    package: "BGA-380",
    commonDrives: ["WD40EZRZ", "WD80EFZX", "WD100EFAX", "WD60EFRX"],
    programmingMethod:
      "Firmware in external SPI flash; ROM + SA modules on platters.",
    notes:
      "Newer WD Red/Blue/Purple controller. Higher pin-count BGA — rework " +
      "requires BGA station. Supports 4 TB+ capacities and advanced format " +
      "(4 K native sectors). ROM swap via SPI programmer is preferred over " +
      "controller swap. SATA PHY is ESD-sensitive — ground yourself.",
    keywords: [
      "marvell",
      "88i9747",
      "main-controller",
      "wd",
      "western-digital",
      "red",
      "purple",
      "4tb",
    ],
  },
  {
    id: "wd-spiflash",
    name: "WD SPI Flash ROM (25P / 25Q Series)",
    manufacturer: "STMicro / Winbond / cFeon",
    type: "flash-rom",
    package: "SOP-8",
    commonDrives: ["WD10EZEX", "WD20EZRX", "WD40EZRZ", "WD5000AAKX"],
    programmingMethod:
      "SPI programmer (CH341A / CH347) with SOIC-8 clip. Typically 1-16 Mbit.",
    notes:
      "Stores drive-unique ROM including serial, model string, head count, " +
      "firmware module pointers, and key adaptive data references. WD ROMs " +
      "contain drive-unique data that CANNOT be substituted from another drive. " +
      "For PCB swap, you MUST transfer the patient ROM to the donor PCB. " +
      "Always back up patient ROM before any swap.",
    keywords: [
      "spi",
      "flash",
      "rom",
      "25p",
      "25q",
      "wd",
      "western-digital",
      "soic8",
      "ch341a",
      "adaptive",
    ],
  },
  {
    id: "wd-dram",
    name: "WD DRAM Cache (Samsung / Micron DDR2)",
    manufacturer: "Samsung / Micron",
    type: "dram-cache",
    package: "BGA-60 / FBGA-84",
    commonDrives: ["WD10EZEX", "WD20EARS", "WD40EZRZ"],
    programmingMethod:
      "Not programmable; volatile cache. BGA rework to replace.",
    notes:
      "32-256 MB DDR2/DDR3 SDRAM. BGA package makes field replacement harder " +
      "than Seagate TSOP parts. Failure symptom: drive detected with correct " +
      "model but produces I/O errors, UDMA CRC errors (SMART 199) during " +
      "sustained transfers. DDR2 is voltage-sensitive — check 1.8 V rail.",
    keywords: [
      "dram",
      "cache",
      "samsung",
      "micron",
      "ddr2",
      "wd",
      "western-digital",
      "bga",
      "buffer",
    ],
  },
  {
    id: "wd-motor-drv",
    name: "WD Motor Driver (TI DRV Series)",
    manufacturer: "Texas Instruments",
    type: "motor-controller",
    package: "QFP-48 / QFP-64",
    commonDrives: ["WD10EZEX", "WD20EZRX", "WD5000AAKX", "WD40EZRZ"],
    programmingMethod:
      "Not field-programmable; hot-air rework to replace.",
    notes:
      "TI DRV10866 or DRV8412 variants. Drives spindle and VCM. Check TVS " +
      "diodes and 12 V fuse before condemning. Failure mode: no spin or " +
      "partial spin with clicking. Less standardized than Seagate SMOOTH — " +
      "match the exact part number from donor PCB.",
    keywords: [
      "motor",
      "drv",
      "ti",
      "texas-instruments",
      "spindle",
      "wd",
      "western-digital",
      "vcm",
    ],
  },

  // ---- Hitachi / HGST ----
  {
    id: "hitachi-arm-ctrl",
    name: "Hitachi/HGST ARM Main Controller",
    manufacturer: "Renesas / Broadcom",
    type: "main-controller",
    package: "BGA-280",
    commonDrives: [
      "HDS721010CLA332",
      "HDS723020BLA642",
      "HUS726060ALE614",
    ],
    programmingMethod:
      "Firmware in external SPI flash; SA on platters.",
    notes:
      "ARM-based SoC. ROM swap between matching PCBs is standard procedure. " +
      "HGST Ultrastar drives often use a Broadcom-designed controller with " +
      "on-die error-correction acceleration. Donor matching is harder due " +
      "to smaller production volumes and more revision-specific firmware.",
    keywords: [
      "hitachi",
      "hgst",
      "arm",
      "main-controller",
      "renesas",
      "broadcom",
      "ultrastar",
      "deskstar",
    ],
  },
  {
    id: "hitachi-spiflash",
    name: "Hitachi/HGST SPI Flash ROM",
    manufacturer: "Winbond / Macronix",
    type: "flash-rom",
    package: "SOP-8",
    commonDrives: [
      "HDS721010CLA332",
      "HDS5C3020ALA632",
      "HUS726060ALE614",
    ],
    programmingMethod:
      "SPI programmer (CH341A) via SOIC-8 clip or desolder. " +
      "W25Q10 / MX25L1005 typically, 8-16 Mbit.",
    notes:
      "HGST firmware ROM layout differs from Seagate/WD but the physical " +
      "chip and SPI protocol are identical. Must transfer from patient to " +
      "donor or edit manually. HGST stores more calibration data in ROM " +
      "versus platter SA compared to Seagate, making ROM transfer even " +
      "more critical.",
    keywords: [
      "hitachi",
      "hgst",
      "spi",
      "flash",
      "rom",
      "w25q",
      "mx25l",
      "ch341a",
    ],
  },

  // ---- Toshiba ----
  {
    id: "toshiba-ti-ctrl",
    name: "Toshiba TI-Based Main Controller",
    manufacturer: "Texas Instruments / Toshiba custom",
    type: "main-controller",
    package: "BGA-256",
    commonDrives: ["DT01ACA100", "DT01ACA200", "MQ01ABD100", "HDWD110"],
    programmingMethod:
      "Firmware in external SPI flash; SA on platters.",
    notes:
      "TI-derived ARM SoC with integrated read-channel. Many desktop models " +
      "(DT01/DT02) share the same controller family. ROM swap via CH341A is " +
      "the standard PCB-swap procedure. Motor driver is integrated on later " +
      "revisions. Toshiba PCB numbering uses G-series (e.g. G003138A) — " +
      "full number including revision letter must match donor.",
    keywords: [
      "toshiba",
      "ti",
      "main-controller",
      "dt01",
      "mq01",
      "arm",
      "g-number",
    ],
  },

  // ---- Samsung ----
  {
    id: "samsung-arm-ctrl",
    name: "Samsung Spinpoint ARM Controller",
    manufacturer: "Samsung (in-house)",
    type: "main-controller",
    package: "BGA-196",
    commonDrives: ["HD103SJ", "HD501LJ", "HD154UI", "HD204UI"],
    programmingMethod:
      "Firmware in external SPI flash; unique ROM per drive. " +
      "ROM is small (1 Mbit SOP-8).",
    notes:
      "Legacy Spinpoint F1/F3/F4 series controller. Samsung HDD division " +
      "was acquired by Seagate (2011); for post-2012 models refer to Seagate " +
      "procedures. Samsung SpinPoint F3 shares firmware architecture with " +
      "Seagate F3 — terminal access at 38400 baud works on many models. " +
      "ROM read/write via CH341A SPI.",
    keywords: [
      "samsung",
      "spinpoint",
      "arm",
      "main-controller",
      "hd103sj",
      "hd501lj",
      "f3",
    ],
  },
];

// ---------------------------------------------------------------------------
// Procedure database  (14 entries)
// ---------------------------------------------------------------------------

export const HDD_PCB_PROCEDURES: HddPcbProcedure[] = [
  // ---- Seagate F3 ----
  {
    id: "sg-rom-swap",
    name: "Seagate F3 ROM Chip Swap",
    driveFamily: "Barracuda 7200.11 / 7200.12 / 7200.14 / Rosewood",
    manufacturer: "seagate",
    category: "rom-swap",
    description:
      "Desolder SPI flash ROM from patient PCB and transfer to donor PCB, or " +
      "read patient ROM with CH341A and write to donor ROM chip in-circuit.",
    steps: [
      "Identify patient ROM chip (SOP-8 near main controller). Record part number.",
      "Connect SOIC-8 clip to patient ROM. Read with CH341A. Save backup.",
      "Read a second time and compare SHA-256 checksums — ROM data is irreplaceable.",
      "If patient ROM is unreadable in-circuit, desolder with hot-air at 300-320 C. Read in ZIF socket adapter.",
      "Obtain donor PCB matching: PCB number + revision, main controller, head count, firmware family.",
      "Connect SOIC-8 clip to donor ROM. Read and save donor ROM as backup.",
      "Write patient ROM image to donor ROM chip via CH341A.",
      "Verify write by reading back and comparing SHA-256 checksums.",
      "Install donor PCB on patient drive chassis. Power on and verify detection.",
    ],
    requiredTools: [
      "CH341A or CH347 SPI programmer",
      "SOIC-8 test clip",
      "Hot-air rework station (if desoldering)",
      "Hex editor for ROM inspection",
    ],
    chipsTouched: ["sg-spiflash"],
    difficulty: 3,
    riskLevel: "medium",
    keywords: [
      "seagate",
      "rom",
      "swap",
      "spi",
      "ch341a",
      "f3",
      "desolder",
      "donor",
    ],
  },
  {
    id: "sg-f3-terminal",
    name: "Seagate F3 Serial Terminal Access",
    driveFamily: "All Seagate F3-based drives (7200.11 through Rosewood)",
    manufacturer: "seagate",
    category: "firmware-transfer",
    description:
      "Connect to the drive's serial diagnostic port (UART) at 38400 baud to " +
      "issue F3 terminal commands for firmware repair, module rebuild, and " +
      "head map editing without desoldering any chips.",
    steps: [
      "Locate TX and RX pads on PCB (near SATA connector, usually labelled or test points).",
      "Connect USB-UART adapter: TX->RX, RX->TX, GND->GND. Do NOT connect VCC.",
      "Open terminal (PuTTY/minicom) at 38400 8N1, no flow control.",
      "Power on drive. Press Ctrl+Z to enter command mode. Verify F3 T> prompt.",
      "If BSY (LED:000000CC): issue Ctrl+Z, then /2 to enter Level 2.",
      "At F3 2> prompt, issue Z to spin down motor. Wait for platters to stop.",
      "Short motor contacts briefly or disconnect motor flex cable.",
      "Issue /2 then U to spin up in diagnostic mode (motor shorted, platters stay still).",
      "Issue /1 then N1 to rebuild SYS module (translator/directory).",
      "Remove motor short. Issue /2, Z, /1, N1 again for clean rebuild with platters spinning.",
      "Power cycle and verify drive detected normally.",
    ],
    requiredTools: [
      "USB-to-UART adapter (TTL 3.3 V)",
      "Terminal software (PuTTY, minicom, or screen)",
      "Jumper wires / soldered header pins",
    ],
    chipsTouched: ["sg-moose", "sg-grenada", "sg-pharaoh", "sg-spiflash"],
    difficulty: 4,
    riskLevel: "high",
    keywords: [
      "seagate",
      "f3",
      "terminal",
      "uart",
      "38400",
      "bsy",
      "firmware",
      "serial",
    ],
  },
  {
    id: "sg-fw-module-rebuild",
    name: "Seagate F3 Firmware Module Rebuild",
    driveFamily: "Barracuda 7200.11 / 7200.12 / 7200.14",
    manufacturer: "seagate",
    category: "firmware-transfer",
    description:
      "Rebuild corrupted firmware modules (SYS, translator, SMART) via F3 " +
      "terminal. Used when the drive enters BSY state due to firmware module " +
      "corruption — the most common Seagate F3 failure mode.",
    steps: [
      "Establish terminal connection (38400 baud, TX/RX).",
      "At F3 T> prompt, type Ctrl+Z to halt pending operations.",
      "Type /2 to enter Level 2, then Z to spin down motor.",
      "Short motor leads to prevent spin during firmware write.",
      "Type /2 then U to spin up in safe mode (motor shorted).",
      "Type /1 to go to Level 1.",
      "Type N1 to rebuild translator module — wait for 'Rebuild Complete'.",
      "Remove motor short. /2, Z, /1, N1 for clean rebuild with platters spinning.",
      "Power cycle completely (disconnect power for 10+ seconds).",
      "Reconnect terminal — F3 T> should appear without BSY state.",
      "Verify drive detected on SATA with correct model and capacity.",
    ],
    requiredTools: [
      "USB-to-UART adapter (TTL 3.3 V)",
      "Terminal software",
      "Seagate F3 command reference",
    ],
    chipsTouched: ["sg-spiflash"],
    difficulty: 3,
    riskLevel: "high",
    keywords: [
      "seagate",
      "firmware",
      "module",
      "rebuild",
      "sys",
      "translator",
      "smart",
      "sa",
      "f3",
      "bsy",
    ],
  },
  {
    id: "sg-head-map-edit",
    name: "Seagate F3 Head Map Editing",
    driveFamily: "Barracuda / Ironwolf / Exos (F3-based)",
    manufacturer: "seagate",
    category: "head-map-edit",
    description:
      "Disable failed read/write heads in the drive's head map (stored in ROM " +
      "and SA) to allow partial data recovery from remaining good heads.",
    steps: [
      "Read ROM via CH341A. Identify head map bytes (offset varies by family).",
      "Determine which head(s) failed (clicking pattern, SA read errors on specific head).",
      "Edit head map in hex editor: mask out failed head bits. Update head count byte.",
      "Write modified ROM back to chip. Verify checksum if ROM uses one.",
      "Access F3 terminal. Clear SMART and rebuild translator with new head config.",
      "Power cycle. Drive should spin up and report reduced capacity.",
      "Image accessible data immediately — partial recovery is fragile.",
    ],
    requiredTools: [
      "CH341A or CH347 SPI programmer",
      "SOIC-8 test clip",
      "Hex editor with binary template support",
      "USB-to-UART adapter for F3 terminal",
    ],
    chipsTouched: ["sg-spiflash"],
    difficulty: 5,
    riskLevel: "critical",
    keywords: [
      "seagate",
      "head",
      "map",
      "mask",
      "disable",
      "partial",
      "recovery",
      "rom",
      "edit",
      "clicking",
    ],
  },

  // ---- Western Digital ----
  {
    id: "wd-rom-transfer",
    name: "WD ROM Transfer Between PCBs",
    driveFamily: "Caviar Blue / Green / Red / Purple / Black",
    manufacturer: "western-digital",
    category: "rom-swap",
    description:
      "Transfer SPI ROM contents from patient PCB to donor PCB using a CH341A " +
      "programmer. Essential because WD ROMs contain drive-unique adaptive " +
      "data pointers and serial/model configuration.",
    steps: [
      "Identify ROM chip on patient PCB (SOP-8, near Marvell controller).",
      "Attach SOIC-8 clip. Read ROM with CH341A. Save as patient_rom.bin.",
      "Read a second time and compare checksums to confirm clean read.",
      "If in-circuit read fails, desolder ROM with hot-air at 280-320 C.",
      "Obtain donor PCB matching: model number, board revision (e.g. 2060-771829-005 REV P1), head count.",
      "Read donor ROM and save as donor_rom_backup.bin.",
      "Write patient_rom.bin to donor ROM chip (in-circuit or desoldered).",
      "Verify by read-back and SHA-256 comparison.",
      "Mount donor PCB on patient drive chassis. Test power-on and BIOS detection.",
    ],
    requiredTools: [
      "CH341A or CH347 SPI programmer",
      "SOIC-8 test clip",
      "SOP-8 to DIP-8 adapter (for desoldered chips)",
      "Hot-air rework station",
    ],
    chipsTouched: ["wd-spiflash"],
    difficulty: 3,
    riskLevel: "medium",
    keywords: [
      "wd",
      "western-digital",
      "rom",
      "transfer",
      "swap",
      "ch341a",
      "donor",
      "spi",
    ],
  },
  {
    id: "wd-marvell-hotswap",
    name: "WD Marvell Firmware Hot-Swap",
    driveFamily: "Caviar / WD Blue / WD Red (Marvell-based)",
    manufacturer: "western-digital",
    category: "firmware-transfer",
    description:
      "Access a WD drive's service area (SA) by hot-swapping the PCB after " +
      "initial spin-up on a donor, allowing firmware module-level repair.",
    steps: [
      "Prepare donor PCB with matching firmware family (not necessarily exact model).",
      "Power on donor PCB on patient HDA. Wait for spin-up.",
      "If drive enters BSY, issue ATA BUSY reset via compatible SATA adapter.",
      "Once drive is READY, issue vendor-specific SA read commands via tool.",
      "Read critical SA modules: firmware, adaptive data, SMART, translator.",
      "Repair or replace corrupted modules using known-good references.",
      "Write repaired modules back to SA.",
      "Power cycle with patient's own PCB (ROM already transferred). Verify operation.",
    ],
    requiredTools: [
      "Matching donor PCB",
      "SATA-to-USB adapter with ATA pass-through",
      "WD-specific firmware tools (WDR, Idle3-tools)",
      "Terminal / hex editor for module inspection",
    ],
    chipsTouched: [
      "wd-marvell-88i9346",
      "wd-marvell-88i9747",
      "wd-spiflash",
    ],
    difficulty: 4,
    riskLevel: "high",
    keywords: [
      "wd",
      "marvell",
      "hotswap",
      "firmware",
      "sa",
      "service-area",
      "modules",
    ],
  },
  {
    id: "wd-rom-ch341a",
    name: "WD ROM Read/Write via CH341A",
    driveFamily: "All WD SATA with SOP-8 SPI ROM",
    manufacturer: "western-digital",
    category: "rom-swap",
    description:
      "Direct SPI ROM read and write using CH341A programmer and SOIC-8 clip. " +
      "The foundational procedure for all WD firmware-level repairs.",
    steps: [
      "Disconnect PCB from drive and from any SATA/power connection.",
      "Locate SOP-8 ROM chip (usually 25-series: W25Q16, 25P10, EN25F10).",
      "Attach SOIC-8 clip firmly. Verify pin 1 orientation (dot on chip).",
      "Launch programmer software. Detect chip (auto-detect or select manually).",
      "Read ROM. Save two copies and compare checksums to confirm clean read.",
      "Edit ROM in hex editor if needed (serial, head map, module pointers).",
      "Write modified/patient ROM to chip. Verify by read-back.",
      "Remove clip carefully. Reinstall PCB on drive.",
    ],
    requiredTools: [
      "CH341A USB SPI programmer",
      "SOIC-8 test clip with DuPont leads",
      "Programmer software (flashrom or similar)",
    ],
    chipsTouched: ["wd-spiflash"],
    difficulty: 2,
    riskLevel: "low",
    keywords: [
      "wd",
      "ch341a",
      "spi",
      "rom",
      "read",
      "write",
      "soic8",
      "clip",
      "programmer",
    ],
  },
  {
    id: "wd-adaptive-backup",
    name: "WD Adaptive Data (SA) Backup",
    driveFamily: "All WD SATA",
    manufacturer: "western-digital",
    category: "firmware-transfer",
    description:
      "Back up the Service Area (SA) adaptive data from platters before any " +
      "PCB swap or firmware modification. SA contains calibration parameters " +
      "unique to each head-disk assembly.",
    steps: [
      "Connect drive with working PCB (donor or repaired patient).",
      "Use WD-specific tool to enter engineering mode (vendor ATA commands).",
      "Read SA modules: adaptive data, head calibration, servo params, SMART log.",
      "Save each module as separate binary file with descriptive naming.",
      "Store backups on separate media. Label with drive serial and date.",
      "Proceed with PCB swap or firmware modification.",
      "After swap, verify SA is still readable. Restore if any corruption detected.",
    ],
    requiredTools: [
      "WD firmware tool (WDR, Sediv, or PC-3000 WD module)",
      "SATA adapter with ATA pass-through",
      "Secure backup storage",
    ],
    chipsTouched: ["wd-spiflash"],
    difficulty: 3,
    riskLevel: "medium",
    keywords: [
      "wd",
      "adaptive",
      "sa",
      "service-area",
      "backup",
      "calibration",
      "modules",
    ],
  },

  // ---- General / Cross-manufacturer ----
  {
    id: "gen-tvs-bypass",
    name: "TVS Diode Bypass / Replacement",
    driveFamily: "All SATA HDD manufacturers",
    manufacturer: "seagate",
    category: "tvs-bypass",
    description:
      "Diagnose and bypass or replace shorted TVS diodes on the PCB power " +
      "input. The most common HDD PCB failure after power surges.",
    steps: [
      "Visually inspect PCB for burn marks near SATA power connector.",
      "Measure resistance across each TVS diode with multimeter (should be >1 M-ohm).",
      "If TVS reads near 0 ohms, it is shorted. Identify which rail: 5 V or 12 V.",
      "Desolder shorted TVS with soldering iron (component is large enough for iron work).",
      "Power on drive WITHOUT TVS to test if drive functions (runs unprotected).",
      "If drive works: order exact replacement TVS (SMDJ5.0A for 5 V, SMDJ12A for 12 V).",
      "Solder replacement TVS. Verify polarity (cathode band orientation).",
      "Test drive with multimeter across TVS to confirm proper clamping voltage.",
    ],
    requiredTools: [
      "Digital multimeter",
      "Soldering iron (fine tip)",
      "Replacement TVS diodes (SMDJ5.0A, SMDJ12A)",
      "Flux and solder wick",
    ],
    chipsTouched: ["sg-tvs"],
    difficulty: 1,
    riskLevel: "low",
    keywords: [
      "tvs",
      "diode",
      "bypass",
      "replace",
      "surge",
      "shorted",
      "5v",
      "12v",
      "power",
      "smdj",
    ],
  },
  {
    id: "gen-motor-ctrl-replace",
    name: "Motor Controller Replacement",
    driveFamily: "Seagate / WD (discrete motor controller)",
    manufacturer: "seagate",
    category: "motor-controller",
    description:
      "Replace a failed motor controller IC (Smooth, TI DRV) by " +
      "transplanting from a donor PCB. Requires hot-air rework skills.",
    steps: [
      "Confirm motor controller failure: supply voltages OK, chip shorts on outputs.",
      "Test spindle motor winding resistance (each phase 2-8 ohms, 3 phases balanced).",
      "Obtain donor PCB with same motor controller part number and revision.",
      "Apply flux to donor IC. Desolder with hot-air at 350-380 C. Lift with tweezers.",
      "Clean donor IC pads with solder wick and IPA. Inspect for damaged pins.",
      "Remove failed IC from patient PCB using same hot-air technique.",
      "Clean patient PCB pads. Apply fresh solder paste (match alloy type).",
      "Place donor IC on patient pads. Align pin 1. Reflow at 340-360 C.",
      "Inspect all joints under magnification. Touch up any bridges.",
      "Reinstall PCB on drive. Power on and verify spindle spin-up.",
    ],
    requiredTools: [
      "Hot-air rework station (accurate to +/- 5 C)",
      "Soldering iron for touch-up",
      "Flux (no-clean, rosin-based)",
      "Solder wick and paste",
      "Magnification (loupe or microscope)",
    ],
    chipsTouched: ["sg-smooth-l6283", "sg-smooth-l7251", "wd-motor-drv"],
    difficulty: 4,
    riskLevel: "high",
    keywords: [
      "motor",
      "controller",
      "replace",
      "smooth",
      "drv",
      "hot-air",
      "rework",
      "spindle",
    ],
  },
  {
    id: "gen-preamp-test",
    name: "Preamp Resistance Testing",
    driveFamily: "All HDD (preamp is on head stack inside HDA)",
    manufacturer: "seagate",
    category: "preamp-replacement",
    description:
      "Measure preamp and head resistance values through the PCB head " +
      "connector to diagnose head/preamp failures without opening the HDA.",
    steps: [
      "Remove PCB from drive carefully (note screw positions and flex cable).",
      "Locate head connector pads on HDA (gold pads where PCB flex connects).",
      "Set multimeter to 200-ohm range.",
      "Measure resistance between each head pair: typical range 80-150 ohms per head.",
      "Measure heater resistance if present: typically 100-200 ohms.",
      "Compare values across all heads: >30% deviation indicates failed head.",
      "Measure preamp supply pins for shorts to ground (should read >1 K-ohm).",
      "Document all readings. Cross-reference with known-good values for model.",
    ],
    requiredTools: [
      "Digital multimeter (accurate to 0.1 ohm)",
      "Fine multimeter probes or pogo pins",
      "Model-specific pinout reference",
    ],
    chipsTouched: [],
    difficulty: 2,
    riskLevel: "low",
    keywords: [
      "preamp",
      "resistance",
      "head",
      "testing",
      "ohm",
      "connector",
      "diagnose",
      "clicking",
    ],
  },
  {
    id: "gen-donor-matching",
    name: "PCB Donor Matching Criteria",
    driveFamily: "All manufacturers",
    manufacturer: "seagate",
    category: "rom-swap",
    description:
      "Criteria for selecting a compatible donor PCB. Incorrect matching is " +
      "the most common cause of failed PCB swaps.",
    steps: [
      "Match exact drive model number (e.g. ST2000DM001, not just ST2000).",
      "Match PCB board revision number (printed on PCB, e.g. 100664987 REV A).",
      "Match number of heads (platters x 2 for standard, check drive label or ROM).",
      "Match firmware revision prefix (first 4 characters, e.g. CC4H).",
      "Match ROM chip type and capacity (same part number preferred).",
      "Verify main controller part number matches.",
      "For Seagate: match site code (TK = Thailand Korat, WU = Wuxi) when possible.",
      "Transfer ROM from patient to donor (see rom-swap procedures).",
      "Test donor PCB on patient drive. If BSY, ROM editing may be needed.",
    ],
    requiredTools: [
      "Magnifying glass or microscope for PCB markings",
      "Drive label (serial, model, firmware, site code, head count)",
      "CH341A SPI programmer (for ROM transfer)",
    ],
    chipsTouched: [],
    difficulty: 2,
    riskLevel: "medium",
    keywords: [
      "donor",
      "matching",
      "pcb",
      "compatible",
      "revision",
      "heads",
      "firmware",
      "model",
    ],
  },

  // ---- Hitachi ----
  {
    id: "hitachi-rom-swap",
    name: "Hitachi/HGST ROM Swap",
    driveFamily: "Deskstar / Travelstar / Ultrastar",
    manufacturer: "hitachi",
    category: "rom-swap",
    description:
      "Transfer ROM between Hitachi/HGST PCBs. Similar to Seagate/WD procedure " +
      "but ROM layout uses HGST-specific structure.",
    steps: [
      "Identify SPI ROM chip on patient PCB (SOP-8, W25Q or MX25L series).",
      "Attach SOIC-8 clip. Read ROM with CH341A. Save backup.",
      "Note: HGST ROM structure differs — do not use Seagate/WD ROM editors.",
      "Obtain donor PCB matching: board number (e.g. 0A90377), controller revision, head count.",
      "Read donor ROM. Save backup.",
      "Write patient ROM to donor chip. Verify via read-back.",
      "Mount donor PCB. Power on. HGST drives may need several power cycles for adaptive settle.",
      "Check BIOS detection and SMART status.",
    ],
    requiredTools: [
      "CH341A SPI programmer",
      "SOIC-8 test clip",
      "HGST-compatible ROM editor or hex editor",
    ],
    chipsTouched: ["hitachi-spiflash"],
    difficulty: 3,
    riskLevel: "medium",
    keywords: [
      "hitachi",
      "hgst",
      "rom",
      "swap",
      "spi",
      "ch341a",
      "deskstar",
      "ultrastar",
    ],
  },
];

// ---------------------------------------------------------------------------
// Failure-pattern database  (12 entries)
// ---------------------------------------------------------------------------

export const HDD_PCB_FAILURE_PATTERNS: HddPcbFailurePattern[] = [
  {
    id: "fail-pcb-burned",
    name: "PCB Burned / TVS Shorted (Catastrophic)",
    symptoms: [
      "Visible burn damage on PCB near SATA power connector",
      "Drive completely dead — no spin, no detection",
      "Burning smell or acrid odor from board",
      "Multiple components visibly damaged",
    ],
    causes: [
      { cause: "Severe power surge exceeding TVS rating", probability: "high" },
      {
        cause: "Wrong external power adapter (wrong voltage or reversed polarity)",
        probability: "medium",
      },
      { cause: "Short circuit in external cabling", probability: "low" },
    ],
    diagnosticSteps: [
      "Document damage extent with photographs.",
      "Identify all damaged components (TVS, motor controller, main IC, passives).",
      "Check if ROM chip survived (SOP-8 is resilient — often intact even in severe burns).",
      "Measure head resistance through HDA connector to verify heads survived.",
      "Assess whether PCB swap (with ROM transfer) is viable.",
    ],
    repairProcedure: "sg-rom-swap",
    difficulty: 3,
    keywords: [
      "burned",
      "burn",
      "catastrophic",
      "surge",
      "damage",
      "tvs",
      "pcb",
      "dead",
    ],
  },
  {
    id: "fail-motor-ctrl",
    name: "Motor Controller Failure",
    symptoms: [
      "Drive does not spin at all — no spin-up whine",
      "Drive attempts to spin but stalls repeatedly",
      "Motor controller IC excessively hot immediately on power-on",
      "Slight hum or buzz but no platter acceleration",
    ],
    causes: [
      {
        cause: "Power surge (after TVS failed to protect) shorted motor FETs",
        probability: "high",
      },
      {
        cause: "Thermal stress from poor ventilation",
        probability: "medium",
      },
      {
        cause: "Motor coil winding open or shorted (mechanical failure inside HDA)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Check TVS diodes first — they are cheaper to replace.",
      "Measure 12 V supply voltage at motor controller VCC pins.",
      "Measure motor winding resistance: each phase 2-8 ohms, 3 phases balanced.",
      "Check motor controller for shorts on output pins (diode mode).",
      "Swap with known-good PCB (ROM transferred) to confirm motor controller vs motor failure.",
    ],
    repairProcedure: "gen-motor-ctrl-replace",
    difficulty: 4,
    keywords: [
      "motor",
      "controller",
      "no-spin",
      "stall",
      "click",
      "smooth",
      "drv",
      "hot",
      "hum",
    ],
  },
  {
    id: "fail-main-ctrl-dead",
    name: "Main Controller Dead",
    symptoms: [
      "Motor spins up normally but drive never becomes READY",
      "No response on SATA interface (host sees no device)",
      "Main controller IC hot to touch immediately on power-on",
      "Perpetual BSY with no SATA link established",
    ],
    causes: [
      {
        cause: "Electrical overstress from power event damaged SATA PHY",
        probability: "high",
      },
      {
        cause: "Firmware corruption causing controller lockup",
        probability: "medium",
      },
      {
        cause: "Solder joint failure under BGA (thermal cycling)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Check if drive appears BSY or completely absent on SATA.",
      "Measure current draw: excessive = short; normal = possible firmware issue.",
      "Try F3 terminal access (Seagate) to rule out firmware-only issue.",
      "Read ROM with CH341A — if readable with valid data, issue is SATA/controller not SPI bus.",
      "Swap PCB (with ROM transfer) to isolate.",
      "Inspect BGA area under magnification for cracked solder balls.",
    ],
    repairProcedure: "sg-rom-swap",
    difficulty: 4,
    keywords: [
      "main",
      "controller",
      "dead",
      "bsy",
      "busy",
      "no-detect",
      "asic",
      "bga",
      "sata",
    ],
  },
  {
    id: "fail-rom-corruption",
    name: "ROM Corruption",
    symptoms: [
      "Drive detected with wrong model or serial number",
      "Drive shows 0 MB or 0 LBA capacity",
      "Drive enters BSY state (LED solid, unresponsive)",
      "Drive spins and clicks slowly (firmware loop)",
      "Previously working drive fails after power interruption during write",
    ],
    causes: [
      {
        cause: "Firmware update failure or power loss during SA self-update cycle",
        probability: "high",
      },
      {
        cause: "ROM chip degradation (flash wear-out on older drives)",
        probability: "medium",
      },
      {
        cause: "Electrical noise corrupting SPI bus during operation",
        probability: "low",
      },
    ],
    diagnosticSteps: [
      "Read ROM via CH341A with SOIC-8 clip.",
      "Compare ROM header bytes against known-good template for model.",
      "Check for all-FF or all-00 blocks (erased/corrupt sections).",
      "Verify serial number, model string, head count in ROM dump.",
      "Try F3 terminal (Seagate) to check if SA modules are also affected.",
      "For WD: ROM data must be patched or replaced preserving adaptive sections.",
    ],
    repairProcedure: "sg-fw-module-rebuild",
    difficulty: 3,
    keywords: [
      "rom",
      "corruption",
      "wrong-model",
      "0-capacity",
      "lba0",
      "firmware",
      "spi",
      "bsy",
    ],
  },
  {
    id: "fail-dram-cache",
    name: "DRAM Cache Failure",
    symptoms: [
      "Drive detected with correct model and capacity",
      "Reads start normally but fail partway through (I/O error, CRC error)",
      "SMART attribute 199 (UDMA CRC Error Count) incrementing rapidly",
      "Drive extremely slow under sustained I/O (cache bypass mode if supported)",
      "Kernel/OS log shows repeated SATA link resets",
    ],
    causes: [
      {
        cause: "DRAM IC failure (bit-rot, open bond wire)",
        probability: "high",
      },
      {
        cause: "Solder joint failure under DRAM (thermal cycling)",
        probability: "medium",
      },
      {
        cause: "Power delivery issue to DRAM (LDO regulator fault)",
        probability: "low",
      },
    ],
    diagnosticSteps: [
      "Reseat PCB firmly (rules out contact issue with HDA connector).",
      "Measure voltage at DRAM VCC pins (3.3 V for SDR, 1.8 V for DDR2/DDR3).",
      "Check SMART attributes: UDMA CRC errors (199), reallocated sectors (5).",
      "Try reflowing DRAM chip solder joints with hot-air before replacing.",
      "Swap PCB with known-good (after ROM transfer) to isolate.",
    ],
    repairProcedure: "sg-rom-swap",
    difficulty: 3,
    keywords: [
      "dram",
      "cache",
      "intermittent",
      "slow",
      "crc",
      "i/o-error",
      "sata-reset",
      "buffer",
    ],
  },
  {
    id: "fail-solder-joint",
    name: "Solder Joint Failure (Thermal Cycling)",
    symptoms: [
      "Drive works intermittently — fails when hot, works when cool (or vice versa)",
      "Drive works if PCB is pressed or flexed in certain spot",
      "Gradually worsening detection issues over weeks/months",
      "Tapping the PCB causes the drive to drop out or reconnect",
    ],
    causes: [
      {
        cause: "Thermal cycling fatigue on BGA solder balls",
        probability: "high",
      },
      {
        cause: "Lead-free solder tin whisker formation",
        probability: "medium",
      },
      {
        cause: "Poor original manufacturing (cold solder joint)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Press on each major IC while drive is powered — note if behavior changes.",
      "Inspect solder joints under 10x+ magnification.",
      "Use freeze spray on individual ICs while drive is warm and failing.",
      "Check if symptoms correlate with drive temperature (monitor SMART).",
      "If main controller BGA: reball or replace PCB with ROM transfer.",
    ],
    repairProcedure: "gen-motor-ctrl-replace",
    difficulty: 3,
    keywords: [
      "solder",
      "joint",
      "thermal",
      "intermittent",
      "cold",
      "bga",
      "reflow",
      "temperature",
    ],
  },
  {
    id: "fail-wrong-fw-after-swap",
    name: "Wrong Firmware After ROM Swap",
    symptoms: [
      "Drive detected but with wrong capacity after PCB swap",
      "Drive clicks and does not become ready after PCB swap",
      "Drive shows garbled or generic model string",
      "SMART reports firmware mismatch warnings",
    ],
    causes: [
      {
        cause: "Donor ROM not overwritten with patient ROM data",
        probability: "high",
      },
      {
        cause: "Firmware revision mismatch between donor and patient families",
        probability: "high",
      },
      {
        cause: "Head count mismatch (donor has different head config)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Read ROM from donor PCB — verify it contains patient serial/model data.",
      "Compare firmware revision in ROM vs SA on platters.",
      "Check head count byte in ROM matches actual heads in patient HDA.",
      "Try F3 terminal (Seagate) for firmware version query.",
      "Double-check PCB number and revision match between patient and donor.",
    ],
    repairProcedure: "gen-donor-matching",
    difficulty: 3,
    keywords: [
      "wrong",
      "firmware",
      "swap",
      "mismatch",
      "capacity",
      "donor",
      "rom",
      "garbled",
    ],
  },
  {
    id: "fail-head-map-mismatch",
    name: "Head Map Mismatch After PCB Swap",
    symptoms: [
      "Drive clicks repeatedly after PCB swap (head seeking to non-existent surface)",
      "Drive detected with reduced capacity after swap",
      "Partial read — some LBA ranges return errors consistently",
      "Click pattern differs from original pre-failure behavior",
    ],
    causes: [
      {
        cause: "Donor PCB has different head count than patient HDA",
        probability: "high",
      },
      {
        cause: "Head map in ROM not updated to match patient HDA geometry",
        probability: "high",
      },
      {
        cause: "Patient had pre-existing head failure masked in original ROM",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Read ROM — check head count byte and head map bitmap.",
      "Compare patient drive label (head count) vs ROM head count value.",
      "If Seagate: use F3 terminal to query active head list.",
      "Test head resistance through flex connector to verify patient heads.",
      "Try booting with fewer heads enabled in head map.",
    ],
    repairProcedure: "sg-head-map-edit",
    difficulty: 4,
    keywords: [
      "head",
      "map",
      "mismatch",
      "click",
      "swap",
      "reduced-capacity",
      "heads",
      "adaptive",
    ],
  },
  {
    id: "fail-spindle-stuck",
    name: "Spindle Motor Stuck / Seized",
    symptoms: [
      "Drive buzzes or hums but platters do not spin",
      "Motor makes brief attempt then stops",
      "No clicking — motor simply won't turn",
      "May happen after drop or long storage",
    ],
    causes: [
      {
        cause: "Seized spindle bearing (lubrication failure or drop damage)",
        probability: "high",
      },
      {
        cause: "Head stuck to platter surface (stiction — heads adhered to media)",
        probability: "high",
      },
      {
        cause: "Fluid dynamic bearing (FDB) lubricant solidified (long storage, extreme cold)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Listen for buzzing vs silence at power-on (buzz = motor attempting).",
      "Feel drive body for vibration — buzz without acceleration = stuck.",
      "Measure motor winding resistance: each phase should be balanced (2-8 ohms).",
      "Check 12 V at motor controller VCC pins.",
      "NOT a PCB repair: requires cleanroom for stiction or bearing replacement.",
    ],
    repairProcedure: "gen-motor-ctrl-replace",
    difficulty: 5,
    keywords: [
      "spindle",
      "stuck",
      "seized",
      "buzz",
      "hum",
      "motor",
      "bearing",
      "no-spin",
      "stiction",
    ],
  },
  {
    id: "fail-tvs-12v-short",
    name: "12 V TVS Diode Short (Most Common)",
    symptoms: [
      "Drive completely dead — no spin, no detection",
      "12 V TVS diode reads near 0 ohms",
      "Drive was working until a power event",
      "Visible scorch marks or discoloration near 12 V TVS",
    ],
    causes: [
      {
        cause: "Power surge from wall outlet or UPS failure",
        probability: "high",
      },
      {
        cause: "Wrong external power adapter used",
        probability: "medium",
      },
      { cause: "Lightning strike through mains", probability: "low" },
    ],
    diagnosticSteps: [
      "Measure resistance across 12 V TVS diode (near 0 = shorted, >1 M-ohm = good).",
      "Check 5 V TVS as well — both may have failed.",
      "After removing shorted TVS: check motor controller and main IC for secondary damage.",
      "Read ROM with CH341A to verify firmware intact before powering on repaired PCB.",
    ],
    repairProcedure: "gen-tvs-bypass",
    difficulty: 1,
    keywords: [
      "tvs",
      "12v",
      "short",
      "surge",
      "dead",
      "burn",
      "power",
      "smdj12a",
    ],
  },
  {
    id: "fail-5v-rail",
    name: "5 V Rail Failure",
    symptoms: [
      "Drive spins (motor runs on 12 V) but logic is dead (not detected)",
      "5 V TVS diode reads shorted",
      "PCB gets hot near 5 V regulator area",
      "ROM is unreadable with CH341A while PCB is powered (bus contention)",
    ],
    causes: [
      {
        cause: "5 V TVS diode shorted from transient",
        probability: "high",
      },
      { cause: "3.3 V LDO regulator failure", probability: "medium" },
      {
        cause: "Main controller short pulling down 5 V rail",
        probability: "low",
      },
    ],
    diagnosticSteps: [
      "Measure 5 V TVS resistance (should be >1 M-ohm).",
      "Check 3.3 V output of on-board LDO regulator.",
      "Measure current draw on 5 V rail (excessive = short downstream).",
      "Remove 5 V TVS and re-test to isolate TVS vs downstream short.",
    ],
    repairProcedure: "gen-tvs-bypass",
    difficulty: 2,
    keywords: [
      "5v",
      "rail",
      "tvs",
      "regulator",
      "logic",
      "no-detect",
      "spin",
      "short",
    ],
  },
  {
    id: "fail-connector-corrosion",
    name: "Connector Corrosion",
    symptoms: [
      "Drive intermittently not detected",
      "SATA link errors in system log",
      "Visible green/white oxidation on SATA or power connector",
      "Drive works in one machine but not another (cable angle dependent)",
    ],
    causes: [
      { cause: "Humidity/moisture exposure", probability: "high" },
      {
        cause: "Galvanic corrosion from dissimilar metals",
        probability: "medium",
      },
      {
        cause: "Chemical exposure (cleaning fluids, smoke damage)",
        probability: "medium",
      },
    ],
    diagnosticSteps: [
      "Inspect SATA data and power connectors under magnification.",
      "Check PCB-to-HDA flex connector for oxidation.",
      "Clean connectors with IPA and fiberglass brush.",
      "Measure continuity through each connector pin.",
      "Try known-good SATA cable and different port on host controller.",
    ],
    repairProcedure: "gen-tvs-bypass",
    difficulty: 1,
    keywords: [
      "connector",
      "corrosion",
      "oxidation",
      "intermittent",
      "sata",
      "contact",
      "green",
    ],
  },
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function normaliseQuery(raw: string): string[] {
  const lower = raw.toLowerCase().trim();
  const tokens = lower.split(/[\s,_\-/]+/).filter(Boolean);
  const expanded: string[] = [];

  for (const token of tokens) {
    expanded.push(token);

    // expand synonyms in both directions
    for (const [canonical, aliases] of Object.entries(HDD_SYNONYMS)) {
      if (aliases.includes(token) && !expanded.includes(canonical)) {
        expanded.push(canonical);
      }
      if (token === canonical) {
        for (const alias of aliases) {
          if (!expanded.includes(alias)) {
            expanded.push(alias);
          }
        }
      }
    }
  }

  return [...new Set(expanded)];
}

function scoreKeywords(queryTokens: string[], keywords: string[]): number {
  let score = 0;
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (const token of queryTokens) {
    for (const kw of lowerKeywords) {
      if (kw === token) {
        score += 3; // exact match
      } else if (kw.includes(token) || token.includes(kw)) {
        score += 1; // partial / substring match
      }
    }
  }

  return score;
}

function scoreText(queryTokens: string[], text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) {
      score += 1;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Public search functions
// ---------------------------------------------------------------------------

/**
 * Look up HDD PCB chips by free-text query.
 * Returns matching chips sorted by relevance (best first).
 */
export function lookupHddPcbChip(query: string): HddPcbChip[] {
  const tokens = normaliseQuery(query);
  if (tokens.length === 0) return [];

  const scored: Array<{ chip: HddPcbChip; score: number }> = [];

  for (const chip of HDD_PCB_CHIPS) {
    let s = scoreKeywords(tokens, chip.keywords);
    s += scoreText(tokens, chip.name);
    s += scoreText(tokens, chip.manufacturer);
    s += scoreText(tokens, chip.notes);
    s += scoreText(tokens, chip.type);
    for (const drive of chip.commonDrives) {
      s += scoreText(tokens, drive);
    }

    if (s > 0) {
      scored.push({ chip, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((e) => e.chip);
}

/**
 * Search HDD PCB repair procedures by free-text query.
 * Returns matching procedures sorted by relevance.
 */
export function searchHddProcedures(query: string): HddPcbProcedure[] {
  const tokens = normaliseQuery(query);
  if (tokens.length === 0) return [];

  const scored: Array<{ proc: HddPcbProcedure; score: number }> = [];

  for (const proc of HDD_PCB_PROCEDURES) {
    let s = scoreKeywords(tokens, proc.keywords);
    s += scoreText(tokens, proc.name);
    s += scoreText(tokens, proc.description);
    s += scoreText(tokens, proc.driveFamily);
    s += scoreText(tokens, proc.category);
    s += scoreText(tokens, proc.manufacturer);
    for (const step of proc.steps) {
      s += scoreText(tokens, step) * 0.5;
    }

    if (s > 0) {
      scored.push({ proc, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((e) => e.proc);
}

/**
 * Filter procedures by manufacturer (exact enum match).
 */
export function getHddProceduresByManufacturer(
  mfr: HddPcbProcedure["manufacturer"],
): HddPcbProcedure[] {
  return HDD_PCB_PROCEDURES.filter((p) => p.manufacturer === mfr);
}

/**
 * Search HDD PCB failure patterns by free-text query.
 * Returns matching patterns sorted by relevance.
 */
export function searchHddPcbFailures(
  query: string,
): HddPcbFailurePattern[] {
  const tokens = normaliseQuery(query);
  if (tokens.length === 0) return [];

  const scored: Array<{
    pattern: HddPcbFailurePattern;
    score: number;
  }> = [];

  for (const pattern of HDD_PCB_FAILURE_PATTERNS) {
    let s = scoreKeywords(tokens, pattern.keywords);
    s += scoreText(tokens, pattern.name);
    for (const symptom of pattern.symptoms) {
      s += scoreText(tokens, symptom);
    }
    for (const c of pattern.causes) {
      s += scoreText(tokens, c.cause);
    }
    for (const step of pattern.diagnosticSteps) {
      s += scoreText(tokens, step) * 0.5;
    }

    if (s > 0) {
      scored.push({ pattern, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((e) => e.pattern);
}
