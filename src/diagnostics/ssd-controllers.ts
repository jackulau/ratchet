export interface SsdController {
  id: string;
  name: string;
  manufacturer: string;
  type: "nvme" | "sata" | "both";
  nandSupport: string[];
  channels: number;
  maxCapacity: string;
  interface: string;
  dram: boolean;
  firmwareAccess: "spi" | "jtag" | "uart" | "vendor-tool" | "none";
  commonDrives: string[];
  recoveryNotes: string;
  keywords: string[];
}

export interface SsdFailurePattern {
  id: string;
  name: string;
  controller: string;
  symptoms: string[];
  diagnosticSteps: string[];
  firmwareRecovery: string;
  dataRecoveryPossible: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

// ═══════════════════════════════════════════════════════════════════
//  SSD CONTROLLERS DATABASE
// ═══════════════════════════════════════════════════════════════════

export const SSD_CONTROLLERS: SsdController[] = [
  // ═══ Silicon Motion ═══
  {
    id: "ssd-ctrl-001",
    name: "SM2259XT",
    manufacturer: "Silicon Motion",
    type: "sata",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "SATA III 6Gbps",
    dram: false,
    firmwareAccess: "spi",
    commonDrives: ["Kingston A400", "ADATA SU650", "ADATA SU635", "Patriot Burst", "Team GX2"],
    recoveryNotes: "DRAM-less design uses HMB (Host Memory Buffer) from system RAM. Firmware stored on external SPI flash (25-series). SM utility MPTool can reload firmware via USB-SATA adapter. If SPI flash corrupt, drive reports 0MB capacity. Desolder SPI flash, reprogram with known-good firmware image, resolder. After firmware reload, FTL rebuild required — may take 30+ minutes.",
    keywords: ["sm2259xt", "silicon motion", "sata", "dram-less", "hmb", "budget ssd", "a400", "su650"],
  },
  {
    id: "ssd-ctrl-002",
    name: "SM2263XT",
    manufacturer: "Silicon Motion",
    type: "nvme",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: false,
    firmwareAccess: "spi",
    commonDrives: ["Intel 660p", "HP EX900", "Corsair MP400 (some)", "Kingston NV1 (some)", "WD SN500"],
    recoveryNotes: "DRAM-less NVMe controller using HMB. Firmware on external SPI NOR flash. SM MPTool supports firmware reload via PCIe passthrough mode. Short test points TP1+TP2 on PCB to enter recovery mode. SPI flash can be read/written with CH341A programmer after desoldering. Intel 660p uses SM2263XT with Intel-specific firmware — requires Intel SSD Toolbox for SMART access.",
    keywords: ["sm2263xt", "silicon motion", "nvme", "dram-less", "660p", "ex900", "hmb"],
  },
  {
    id: "ssd-ctrl-003",
    name: "SM2264",
    manufacturer: "Silicon Motion",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "8TB",
    interface: "PCIe Gen4 x4 NVMe 1.4",
    dram: true,
    firmwareAccess: "spi",
    commonDrives: ["Corsair MP600 (rev2)", "ADATA S70 Blade", "MSI Spatium M480", "Silicon Power US75"],
    recoveryNotes: "High-end 8-channel Gen4 controller with DDR4 DRAM cache. Firmware on external SPI flash. Due to Gen4 speeds, thermal throttling is common — check NAND and controller temps independently. DRAM failure on this controller causes immediate drive disappearance. SPI flash reprogramming restores firmware but FTL must be rebuilt. SM MPTool Gen4 variant required.",
    keywords: ["sm2264", "silicon motion", "nvme", "gen4", "8-channel", "s70", "mp600"],
  },
  {
    id: "ssd-ctrl-004",
    name: "SM2262EN",
    manufacturer: "Silicon Motion",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: true,
    firmwareAccess: "spi",
    commonDrives: ["HP EX950", "ADATA XPG SX8200 Pro", "Corsair MP510 (some revisions)", "Silicon Power P34A80"],
    recoveryNotes: "8-channel Gen3 controller with DDR3L DRAM. Known for strong sustained write performance due to large SLC cache. Firmware stored on external SPI NOR flash. SM MPTool can reload firmware. ADATA SX8200 Pro had reported controller swaps mid-production — verify actual controller before applying firmware. Check DRAM chip soldering if intermittent detection issues.",
    keywords: ["sm2262en", "silicon motion", "nvme", "gen3", "sx8200", "ex950", "dram"],
  },

  // ═══ Phison ═══
  {
    id: "ssd-ctrl-005",
    name: "PS5012-E12",
    manufacturer: "Phison",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: true,
    firmwareAccess: "uart",
    commonDrives: ["Corsair MP510", "Sabrent Rocket (Gen3)", "Inland Premium", "MyDigitalSSD BPX Pro"],
    recoveryNotes: "Phison E12 has UART debug port on PCB for firmware recovery. Connect UART at 115200 baud to access Phison recovery console. Firmware can be reloaded via Phison FWUP tool (Windows). DRAM is DDR3L — check for cold solder joints. If drive stuck in BSY, UART recovery mode can reset the FTL. Phison reference firmware updates available from Phison partners. Drive-specific firmware from OEM (Corsair, Sabrent) may differ.",
    keywords: ["ps5012", "e12", "phison", "nvme", "gen3", "mp510", "sabrent rocket", "uart"],
  },
  {
    id: "ssd-ctrl-006",
    name: "PS5016-E16",
    manufacturer: "Phison",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen4 x4 NVMe 1.3",
    dram: true,
    firmwareAccess: "uart",
    commonDrives: ["Corsair MP600 (original)", "Gigabyte Aorus NVMe Gen4", "Sabrent Rocket 4.0", "Seagate FireCuda 520"],
    recoveryNotes: "First consumer Gen4 controller. Known for high thermals — requires heatsink. UART recovery port on PCB. Phison FWUP tool required for firmware reload. Gen4 link training sensitive — if not detected, try Gen3 slot first to verify controller is alive. DRAM is DDR4. Thermal pad between controller and heatsink is critical — dried/missing pad causes throttling and eventual thermal shutdown. Check VRM on PCB for Gen4 power delivery issues.",
    keywords: ["ps5016", "e16", "phison", "nvme", "gen4", "mp600", "aorus", "firecuda"],
  },
  {
    id: "ssd-ctrl-007",
    name: "PS5018-E18",
    manufacturer: "Phison",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "8TB",
    interface: "PCIe Gen4 x4 NVMe 1.4",
    dram: true,
    firmwareAccess: "uart",
    commonDrives: ["Corsair MP600 Pro", "Sabrent Rocket 4 Plus", "Seagate FireCuda 530", "MSI Spatium M480 Pro"],
    recoveryNotes: "Second-gen Gen4 controller with improved thermals over E16. UART at 115200 baud for recovery console. DDR4 DRAM cache. Phison FWUP Gen4 tool needed. Known firmware issues with early revisions causing random disconnects under sustained load — update to latest OEM firmware. If controller dies with burnt smell, check the small VRM components near the controller die. PCB-level repair possible if VRM components failed but controller survived.",
    keywords: ["ps5018", "e18", "phison", "nvme", "gen4", "mp600 pro", "rocket 4 plus", "firecuda 530"],
  },
  {
    id: "ssd-ctrl-008",
    name: "PS5019-E19T",
    manufacturer: "Phison",
    type: "nvme",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen4 x4 NVMe 1.4",
    dram: false,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Sabrent Rocket Q4", "Inland Performance Plus (some)", "Team MP44L"],
    recoveryNotes: "Budget DRAM-less Gen4 controller. Uses HMB for mapping tables. Firmware recovery via Phison FWUP tool only — no UART on most PCB designs using this controller. If drive shows 0 bytes, HMB data was lost during unsafe shutdown. Power cycle 3-5 times to trigger internal FTL rebuild attempt. If that fails, Phison MP vendor tool can reinitialize the FTL at cost of all user data.",
    keywords: ["ps5019", "e19t", "phison", "nvme", "gen4", "dram-less", "budget", "hmb"],
  },
  {
    id: "ssd-ctrl-009",
    name: "PS3111-S11",
    manufacturer: "Phison",
    type: "sata",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "SATA III 6Gbps",
    dram: false,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Kingston A400 (some revisions)", "Patriot Burst (some)", "PNY CS900 (some)"],
    recoveryNotes: "DRAM-less SATA controller. Kingston A400 may use SM2259XT or PS3111-S11 depending on revision — check label on controller chip. Phison S11 firmware recovery uses Phison UPTOOL via USB-SATA dock. If drive reports incorrect size (32MB, 8MB), FTL is corrupt — UPTOOL can rebuild but data is lost. No external SPI flash — firmware is in NAND reserved area. NAND die failure makes firmware rebuild impossible.",
    keywords: ["ps3111", "s11", "phison", "sata", "dram-less", "a400", "cs900", "budget"],
  },

  // ═══ Realtek ═══
  {
    id: "ssd-ctrl-010",
    name: "RTS5762",
    manufacturer: "Realtek",
    type: "nvme",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: false,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Silicon Power A60", "Patriot P300", "Team MP33"],
    recoveryNotes: "Budget Realtek NVMe controller. Limited recovery tooling — no public firmware tools from Realtek. Some third-party tools (SSD-Z, usbdev.ru tools) can identify firmware version. If drive not detected, check PCIe link negotiation by trying in Gen2 mode via BIOS setting. No external SPI flash — firmware in NAND reserved blocks. If NAND reserved blocks corrupt, drive is typically unrecoverable without chip-off.",
    keywords: ["rts5762", "realtek", "nvme", "gen3", "budget", "dram-less"],
  },
  {
    id: "ssd-ctrl-011",
    name: "RTS5763DL",
    manufacturer: "Realtek",
    type: "nvme",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: false,
    firmwareAccess: "vendor-tool",
    commonDrives: ["WD Blue SN550", "WD Green SN350 (some)", "Lexar NM620 (some)"],
    recoveryNotes: "Realtek DRAM-less controller used in WD SN550. WD had controversy when they silently switched SN550 from SanDisk controller to RTS5763DL, affecting write performance. WD Dashboard can update firmware. Recovery limited — if drive shows in BIOS but not in OS, try WD Dashboard recovery mode. No external SPI flash. For data recovery, chip-off NAND and reconstruct with PC-3000 or similar.",
    keywords: ["rts5763dl", "realtek", "nvme", "sn550", "sn350", "wd blue", "dram-less"],
  },

  // ═══ Marvell ═══
  {
    id: "ssd-ctrl-012",
    name: "88SS1074",
    manufacturer: "Marvell",
    type: "sata",
    nandSupport: ["TLC", "MLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "SATA III 6Gbps",
    dram: true,
    firmwareAccess: "jtag",
    commonDrives: ["Crucial MX300", "Crucial MX500", "Crucial BX500 (early)", "Micron 1100"],
    recoveryNotes: "Marvell SATA controller with DDR3 DRAM. JTAG port available on PCB for low-level firmware recovery. Crucial Storage Executive tool provides firmware updates and SMART monitoring. MX500 is one of the most repairable SATA SSDs — well-documented, JTAG accessible, Crucial provides firmware images. If BSY state: JTAG can reset the controller. DRAM failure causes data corruption — check for cracked DRAM BGA. Marvell controllers are robust but NAND quality varies by source.",
    keywords: ["88ss1074", "marvell", "sata", "mx300", "mx500", "crucial", "jtag", "dram"],
  },
  {
    id: "ssd-ctrl-013",
    name: "88SS1084",
    manufacturer: "Marvell",
    type: "sata",
    nandSupport: ["TLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "SATA III 6Gbps",
    dram: true,
    firmwareAccess: "jtag",
    commonDrives: ["Micron 1300", "Crucial BX500 (some revisions)", "OEM enterprise SATA SSDs"],
    recoveryNotes: "Successor to 88SS1074 with improved error correction. JTAG recovery available. Similar repair process to 88SS1074. Check DRAM soldering under thermal camera — cold joints on DRAM cause intermittent hangs. Marvell controllers tend to fail gracefully, entering read-only mode when NAND degrades rather than disappearing entirely. Enterprise variants have enhanced RAIN (Redundant Array of Independent NAND) for reliability.",
    keywords: ["88ss1084", "marvell", "sata", "micron", "bx500", "jtag", "enterprise"],
  },
  {
    id: "ssd-ctrl-014",
    name: "88SS1092",
    manufacturer: "Marvell",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen3 x4 NVMe 1.2",
    dram: true,
    firmwareAccess: "jtag",
    commonDrives: ["Toshiba XG5", "Toshiba XG6 (OEM)", "Lite-On CA3 (OEM laptops)"],
    recoveryNotes: "Marvell entry NVMe with JTAG debug port. Commonly found in OEM laptop SSDs. Toshiba/Kioxia firmware-locked — generic firmware will not work. If drive from laptop shows 'security frozen' in hdparm, the laptop BIOS set an ATA security lock at boot. For OEM drives, use manufacturer diagnostic tools (Kioxia SSD Utility). JTAG can unlock BSY state but requires Marvell-specific JTAG sequences.",
    keywords: ["88ss1092", "marvell", "nvme", "gen3", "toshiba", "xg5", "xg6", "oem", "jtag"],
  },
  {
    id: "ssd-ctrl-015",
    name: "88SS1100",
    manufacturer: "Marvell",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: true,
    firmwareAccess: "jtag",
    commonDrives: ["WD Black SN750", "WD Black SN720 (OEM)", "HP EX920"],
    recoveryNotes: "High-end Marvell 8-channel Gen3 controller. WD SN750 uses custom WD firmware on this controller. JTAG available but WD firmware is signed — cannot load generic firmware. WD Dashboard required for firmware updates. If drive in BSY state, try power cycling with 3.3V SATA power only (remove 5V/12V) to force controller reset on SATA interface boards. For NVMe: remove and reinsert into PCIe slot after 30-second power drain. DDR4 DRAM cache — check for failed DRAM if drive detects but shows 0 capacity.",
    keywords: ["88ss1100", "marvell", "nvme", "gen3", "sn750", "sn720", "wd black", "jtag", "8-channel"],
  },

  // ═══ Samsung In-House ═══
  {
    id: "ssd-ctrl-016",
    name: "Phoenix",
    manufacturer: "Samsung",
    type: "nvme",
    nandSupport: ["TLC (V-NAND)"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen3 x4 NVMe 1.3",
    dram: true,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Samsung 970 EVO", "Samsung 970 EVO Plus", "Samsung 970 PRO"],
    recoveryNotes: "Samsung proprietary controller. Firmware updates only via Samsung Magician. No JTAG/UART access — Samsung does not publish debug interfaces. If drive enters read-only mode, Samsung Magician may report SMART warning — back up data immediately. Samsung drives use hardware AES-256 encryption by default. If controller dies, NAND data is encrypted with a key stored in the controller — data recovery requires a donor controller with matching firmware revision. 970 EVO Plus had firmware bug causing random slowdowns — update to latest firmware.",
    keywords: ["phoenix", "samsung", "nvme", "970 evo", "970 pro", "v-nand", "gen3"],
  },
  {
    id: "ssd-ctrl-017",
    name: "Elpis",
    manufacturer: "Samsung",
    type: "nvme",
    nandSupport: ["TLC (V-NAND V6/V7)"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen4 x4 NVMe 1.3c",
    dram: true,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Samsung 980 PRO", "Samsung 980 PRO with Heatsink"],
    recoveryNotes: "Samsung Gen4 controller. Samsung Magician only tool for firmware and diagnostics. 980 PRO had well-documented firmware issues with rapid health degradation on early batches — check firmware version (latest is recommended). Same encryption caveat as Phoenix: controller death means encrypted NAND. If SMART shows rapid spare block consumption, firmware update can slow degradation but cannot reverse it. Samsung RMA may be available if drive is under warranty with abnormal wear.",
    keywords: ["elpis", "samsung", "nvme", "gen4", "980 pro", "v-nand"],
  },
  {
    id: "ssd-ctrl-018",
    name: "Pablo",
    manufacturer: "Samsung",
    type: "nvme",
    nandSupport: ["TLC (V-NAND V7/V8)"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen4 x4 NVMe 2.0",
    dram: true,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Samsung 990 PRO", "Samsung 990 PRO with Heatsink"],
    recoveryNotes: "Latest Samsung consumer controller. 990 PRO had reported abnormal health degradation in SMART data on early firmware — Samsung released firmware 4B2QJXD7 and later to address it. Samsung Magician mandatory for firmware updates and health monitoring. Same hardware encryption applies. Thermal design improved over Elpis but still benefits from motherboard M.2 heatsink. If thermal throttling occurs, check heatsink contact and thermal pad thickness.",
    keywords: ["pablo", "samsung", "nvme", "gen4", "990 pro", "v-nand"],
  },

  // ═══ Maxio (previously JMicron) ═══
  {
    id: "ssd-ctrl-019",
    name: "MAP1202",
    manufacturer: "Maxio",
    type: "nvme",
    nandSupport: ["TLC", "QLC"],
    channels: 4,
    maxCapacity: "2TB",
    interface: "PCIe Gen3 x4 NVMe 1.4",
    dram: false,
    firmwareAccess: "vendor-tool",
    commonDrives: ["Patriot P310", "Lexar NM620", "Kingspec NE (various)", "Generic M.2 SSDs"],
    recoveryNotes: "Budget Maxio (formerly JMicron SSD division) controller. Common in no-name and budget-brand SSDs. Limited firmware tooling — Maxio provides vendor tools to OEMs only, not publicly. If drive shows wrong capacity, try Maxio MPTool (if obtainable from OEM). DRAM-less design with HMB. Prone to FTL corruption on sudden power loss. No external SPI flash. Data recovery difficult — requires chip-off with NAND page structure knowledge for this controller.",
    keywords: ["map1202", "maxio", "jmicron", "nvme", "gen3", "budget", "dram-less"],
  },
  {
    id: "ssd-ctrl-020",
    name: "MAP1602",
    manufacturer: "Maxio",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 4,
    maxCapacity: "4TB",
    interface: "PCIe Gen5 x4 NVMe 2.0",
    dram: true,
    firmwareAccess: "vendor-tool",
    commonDrives: ["ADATA Project NeonStorm", "ADATA Legend 970", "Acer Predator GM7 (Gen5)"],
    recoveryNotes: "Early Gen5 controller from Maxio. Very new — limited field repair data available. Runs hot due to Gen5 power requirements — requires active cooling or substantial heatsink. DRAM cache DDR4. Firmware tooling from Maxio via OEM channels only. Gen5 link training is sensitive — if not detected, try forcing Gen4 mode in BIOS to verify controller is alive. PCB has additional VRM components for Gen5 power delivery — check these if controller does not power up.",
    keywords: ["map1602", "maxio", "nvme", "gen5", "pcie5", "emerging"],
  },

  // ═══ InnoGrit ═══
  {
    id: "ssd-ctrl-021",
    name: "IG5236",
    manufacturer: "InnoGrit",
    type: "nvme",
    nandSupport: ["TLC"],
    channels: 8,
    maxCapacity: "4TB",
    interface: "PCIe Gen4 x4 NVMe 1.4",
    dram: true,
    firmwareAccess: "vendor-tool",
    commonDrives: ["SK Hynix Platinum P41", "SK Hynix Gold P31 (successor models)"],
    recoveryNotes: "InnoGrit Rainier controller used in SK Hynix P41. Strong performance with 238-layer NAND. SK Hynix Drive Manager for firmware updates and SMART monitoring. If drive enters read-only mode, back up immediately. InnoGrit provides vendor tools to OEMs for firmware reload. DRAM is LPDDR4. Controller has good power-loss protection circuitry. For data recovery from dead controller: NAND is not hardware-encrypted by default on consumer models (unlike Samsung), making chip-off recovery more feasible.",
    keywords: ["ig5236", "innogrit", "rainier", "nvme", "gen4", "hynix", "p41", "8-channel"],
  },
];

// ═══════════════════════════════════════════════════════════════════
//  SSD FAILURE PATTERNS DATABASE
// ═══════════════════════════════════════════════════════════════════

export const SSD_FAILURE_PATTERNS: SsdFailurePattern[] = [
  // ═══ FTL / TRANSLATION LAYER ═══
  {
    id: "ssd-fail-001",
    name: "Translation layer corruption (FTL damage)",
    controller: "Any",
    symptoms: [
      "Drive reports 0 bytes or wrong capacity (8MB, 32MB, etc.)",
      "Drive detected in BIOS with wrong model name or generic string",
      "SMART data inaccessible or shows all zeros",
      "OS cannot partition or format the drive",
    ],
    diagnosticSteps: [
      "Check if drive appears in BIOS/UEFI — note reported capacity and model string",
      "Use manufacturer diagnostic tool (Samsung Magician, WD Dashboard, etc.) to check SMART",
      "If capacity shows as very small (8MB, 32MB): FTL mapping table is corrupt",
      "Try power cycling 3-5 times — some controllers attempt FTL rebuild on boot",
      "For drives with SPI flash: dump SPI flash contents to check firmware integrity",
      "Check if drive entered 'safe mode' — some controllers expose only firmware area",
    ],
    firmwareRecovery: "Use manufacturer MPTool (SM MPTool, Phison UPTOOL, etc.) to reinitialize FTL. This destroys all user data. For data recovery before FTL rebuild: professional chip-off NAND reading with PC-3000 SSD or similar tool can reconstruct data from raw NAND pages using FTL algorithm knowledge.",
    dataRecoveryPossible: true,
    difficulty: 4,
    keywords: ["ftl", "translation layer", "wrong capacity", "0 bytes", "8mb", "32mb", "mapping table", "capacity wrong"],
  },
  {
    id: "ssd-fail-002",
    name: "Firmware hang / BSY state",
    controller: "Any",
    symptoms: [
      "Drive detected in BIOS but OS hangs during enumeration",
      "SATA drives show BSY bit set in status register (hdparm shows BUSY)",
      "NVMe drives detected but all commands timeout",
      "System boot freezes when drive is connected",
      "Drive causes entire SATA/NVMe bus to hang",
    ],
    diagnosticSteps: [
      "Check if drive causes system hang — disconnect and verify system boots normally",
      "For SATA: use hdparm -I to check if drive responds or is stuck in BSY",
      "For NVMe: check dmesg/Event Viewer for NVMe timeout errors",
      "Try hot-plugging (SATA only) after OS boots to avoid boot hang",
      "If controller has UART: connect at 115200 baud to check for console output",
      "For Marvell controllers: JTAG can reset BSY state",
    ],
    firmwareRecovery: "UART recovery (Phison E12/E16/E18) or JTAG (Marvell 88SS10xx) to break out of BSY loop. For Silicon Motion: short test points on PCB to enter ROM mode, then reload firmware via MPTool. If firmware loop is caused by bad NAND block in system area: may need to remap system area blocks via vendor tool.",
    dataRecoveryPossible: true,
    difficulty: 3,
    keywords: ["bsy", "busy", "hang", "stuck", "timeout", "not responding", "firmware hang", "freeze"],
  },
  {
    id: "ssd-fail-003",
    name: "NAND wear-out — end of life",
    controller: "Any",
    symptoms: [
      "Drive enters read-only mode — writes fail but reads work",
      "SMART reports high Media and Data Integrity Errors (NVMe) or Reallocated Sector Count (SATA)",
      "SMART Percentage Used exceeds 100%",
      "Drive performance degrades dramatically over time",
      "Intermittent I/O errors in system log",
    ],
    diagnosticSteps: [
      "Check SMART attribute 'Percentage Used' (NVMe) or 'Wear Leveling Count' (SATA)",
      "Check 'Available Spare' in NVMe SMART — below threshold triggers read-only mode",
      "Check total bytes written (TBW) vs manufacturer rated endurance",
      "Read-only mode means controller proactively protecting remaining data",
      "If drive disappears entirely: NAND degradation beyond controller error correction capability",
    ],
    firmwareRecovery: "No firmware fix — NAND is physically degraded. If drive in read-only mode: back up all data immediately. Controller read-only mode is a safety feature. Replacing NAND chips is not practical (controller needs matching NAND configuration). Replace the drive.",
    dataRecoveryPossible: true,
    difficulty: 2,
    keywords: ["wear out", "end of life", "read only", "read-only", "tlc wear", "qlc wear", "p/e cycles", "endurance", "percentage used"],
  },
  {
    id: "ssd-fail-004",
    name: "Sudden power loss corruption",
    controller: "Any",
    symptoms: [
      "Drive was working, power lost unexpectedly, now not detected or wrong capacity",
      "Partial file corruption after power outage",
      "Drive shows in BIOS but filesystem is corrupted",
      "FTL mapping table partially written — inconsistent state",
      "More common on DRAM-less drives (HMB data in system RAM is lost)",
    ],
    diagnosticSteps: [
      "Check if drive is detected at all — BIOS, OS, or neither",
      "If detected with wrong capacity: FTL flush was interrupted — mapping table incomplete",
      "If filesystem corrupt but drive capacity correct: run filesystem check (chkdsk, fsck)",
      "For DRAM-less drives: HMB mapping data was in system RAM and lost — controller must rebuild from NAND",
      "Power cycle 3-5 times to trigger FTL rebuild on drives that support it",
      "Check for power-loss protection capacitors on PCB — budget drives often lack them",
    ],
    firmwareRecovery: "Most quality controllers (Samsung, Intel, Marvell) have power-loss protection with onboard capacitors to flush DRAM to NAND. Budget DRAM-less drives lack this. If FTL corrupt: MPTool rebuild destroys data. For data recovery: professional tools can read raw NAND and reconstruct FTL from page metadata. DRAM-equipped drives with capacitors rarely suffer this unless capacitors failed.",
    dataRecoveryPossible: true,
    difficulty: 3,
    keywords: ["power loss", "power outage", "sudden shutdown", "power failure", "unsafe shutdown", "plp", "capacitor"],
  },
  {
    id: "ssd-fail-005",
    name: "Bad block overflow",
    controller: "Any",
    symptoms: [
      "Drive capacity gradually shrinks over time",
      "Increasing number of reallocated sectors in SMART",
      "Write performance drops as spare blocks are consumed",
      "Drive eventually enters read-only mode or disappears",
      "SMART 'Available Spare Threshold' reached",
    ],
    diagnosticSteps: [
      "Check SMART 'Reallocated Sector Count' (SATA) trend — is it increasing rapidly?",
      "Check NVMe 'Available Spare' percentage — below threshold is critical",
      "Check 'Runtime Bad Block' count if available in vendor SMART",
      "Compare current capacity to original — some controllers hide bad block reduction",
      "If bad blocks accumulate in one NAND die: die-level failure, not normal wear",
    ],
    firmwareRecovery: "No firmware fix for bad NAND. If limited to one or two NAND dies: some vendor tools can mark entire dies as bad and continue with reduced capacity. This is a temporary measure. If bad block growth is rapid: NAND batch defect or thermal damage likely. Replace drive. Back up data while drive is still readable.",
    dataRecoveryPossible: true,
    difficulty: 2,
    keywords: ["bad blocks", "reallocated", "spare blocks", "capacity shrink", "nand failure", "bad nand"],
  },
  {
    id: "ssd-fail-006",
    name: "Controller overheat shutdown",
    controller: "Any",
    symptoms: [
      "Drive disappears during heavy load (sustained writes, benchmarks)",
      "Reappears after cooling down (5-10 minutes)",
      "SMART reports thermal throttling events",
      "NVMe drives: 'Critical Warning' bit set for temperature",
      "More common in Gen4/Gen5 NVMe drives without heatsink",
    ],
    diagnosticSteps: [
      "Check controller temperature via SMART or hwinfo/CrystalDiskInfo during load",
      "NVMe thermal throttle typically at 70-80C, shutdown at 85-100C (vendor-specific)",
      "Check thermal pad between controller and heatsink — may be dried out or missing",
      "Check M.2 slot airflow — drives sandwiched between GPU and motherboard overheat",
      "For drives with label: the paper label acts as insulator — removing it helps (warranty void)",
    ],
    firmwareRecovery: "Not a firmware issue — thermal management working as designed. Fix thermal interface: replace thermal pad (1.5-2mm thickness typically), ensure heatsink makes contact, improve case airflow. For M.2 drives under GPU: relocate to a different M.2 slot or use PCIe adapter card with heatsink. Gen4/Gen5 drives often need active airflow.",
    dataRecoveryPossible: true,
    difficulty: 1,
    keywords: ["overheat", "thermal", "throttle", "temperature", "disappears", "hot", "heatsink", "thermal pad"],
  },
  {
    id: "ssd-fail-007",
    name: "Firmware update brick",
    controller: "Any",
    symptoms: [
      "Drive stopped working during firmware update",
      "Drive not detected in BIOS after interrupted firmware update",
      "Drive shows in BIOS with generic name ('SATAFIRM S11', 'PATA SSD', etc.)",
      "Firmware update tool crashed or system lost power during update",
    ],
    diagnosticSteps: [
      "Check if drive appears in BIOS — even with wrong name means controller is alive",
      "Generic name like 'SATAFIRM S11' or 'PATA SSD' indicates firmware area corrupt but controller functional",
      "Try manufacturer recovery tool — many have a 'recovery flash' mode",
      "For drives with SPI flash: dump SPI contents — if corrupt, reprogram with known-good image",
      "Check UART/JTAG for console access to firmware loader",
    ],
    firmwareRecovery: "If controller is alive (detected with generic name): firmware reload possible. Silicon Motion: MPTool can reflash. Phison: FWUP tool recovery mode. Marvell: JTAG firmware reload. Samsung: Samsung Magician may detect drive in recovery mode. If controller completely dead (not detected): SPI flash reprogram needed, or controller replacement from donor.",
    dataRecoveryPossible: true,
    difficulty: 3,
    keywords: ["firmware brick", "update failed", "bricked", "satafirm", "pata ssd", "interrupted update", "firmware update"],
  },
  {
    id: "ssd-fail-008",
    name: "DRAM failure on DRAM-equipped controller",
    controller: "Any DRAM-equipped",
    symptoms: [
      "Data corruption — files have wrong contents",
      "Blue screen / kernel panic with memory-related errors",
      "Drive detected but I/O errors during read/write",
      "Drive works intermittently — sometimes OK, sometimes corrupt data",
      "SMART may show uncorrectable errors increasing",
    ],
    diagnosticSteps: [
      "Check SMART for 'Uncorrectable Error Count' trend",
      "Verify DRAM chip soldering under microscope — look for cracked solder balls",
      "Use thermal camera: DRAM chip running abnormally hot indicates internal failure",
      "Test drive in another system to rule out PCIe/SATA port issue",
      "If errors are random across different files/sectors: DRAM cache corruption likely",
      "Compare with known-good drive behavior in same slot",
    ],
    firmwareRecovery: "Not a firmware issue — DRAM hardware failure. Replace DRAM chip (BGA rework required). DRAM is typically DDR3L (SATA controllers) or DDR4/LPDDR4 (NVMe controllers). Match exact part number from donor drive or datasheet. After DRAM replacement, firmware may need reinitializing as DRAM contents are lost. Data on NAND is likely intact if corruption was only in the cache layer.",
    dataRecoveryPossible: true,
    difficulty: 4,
    keywords: ["dram failure", "cache corruption", "bsod", "data corruption", "ddr", "memory error", "intermittent"],
  },
  {
    id: "ssd-fail-009",
    name: "SPI flash corruption on controller",
    controller: "Silicon Motion / Phison (SPI-based)",
    symptoms: [
      "Drive not detected in BIOS at all",
      "No activity LED on drive during power-on",
      "Controller present on PCB but non-functional",
      "SPI flash chip on PCB near controller IC",
      "Occurs after power surge or static discharge",
    ],
    diagnosticSteps: [
      "Identify SPI flash chip on PCB (small 8-pin SOIC, usually 25-series like W25Q16/32)",
      "Desolder SPI flash and read with CH341A programmer",
      "Compare dump to known-good firmware image — if all 0xFF, flash was erased",
      "Check for valid firmware header in dump (varies by controller vendor)",
      "Verify SPI flash chip itself is not dead — should respond to JEDEC ID command on programmer",
    ],
    firmwareRecovery: "Desolder SPI flash chip. Read with CH341A/CH347 programmer to verify it responds. Program with known-good firmware image (obtain from donor drive of exact same model/revision or firmware database). Resolder. If SPI flash chip is dead (no JEDEC response): replace with same part (W25Q16, W25Q32, etc.) and program fresh. After SPI reflash, controller should reinitialize — FTL rebuild may be automatic.",
    dataRecoveryPossible: true,
    difficulty: 3,
    keywords: ["spi flash", "firmware lost", "not detected", "w25q", "spi corruption", "ch341a", "flash chip", "25-series"],
  },
  {
    id: "ssd-fail-010",
    name: "PCIe link training failure (NVMe not detected)",
    controller: "Any NVMe",
    symptoms: [
      "NVMe drive not detected in BIOS",
      "M.2 slot works with other drives",
      "Drive works in another system or different M.2 slot",
      "dmesg shows PCIe link training errors or no device enumeration",
      "More common with Gen4/Gen5 drives in Gen3 slots or via adapters",
    ],
    diagnosticSteps: [
      "Try drive in different M.2 slot — some slots are CPU-direct, others via chipset",
      "Check BIOS setting: force PCIe generation to Gen3 if Gen4 drive is not detected",
      "Inspect M.2 connector for bent pins or debris",
      "Check M.2 standoff — wrong standoff position causes poor contact",
      "Try M.2 to PCIe adapter card to test with different PCIe root port",
      "Update motherboard BIOS — Gen4/Gen5 NVMe detection often improved in updates",
    ],
    firmwareRecovery: "Usually not a firmware issue — hardware or compatibility problem. If drive works in one system but not another: PCIe link speed negotiation failure. Force lower Gen in BIOS. If drive does not work anywhere: check controller power rails on PCB with multimeter (3.3V from M.2 slot). Missing 3.3V on PCB means voltage regulator on drive failed. Replace regulator or check for short.",
    dataRecoveryPossible: true,
    difficulty: 2,
    keywords: ["pcie", "link training", "not detected", "nvme not found", "m.2", "gen4 compatibility", "bios not detected"],
  },
  {
    id: "ssd-fail-011",
    name: "SATA PHY failure (intermittent disconnect)",
    controller: "Any SATA",
    symptoms: [
      "SATA drive intermittently disappears from OS",
      "SMART shows 'Interface CRC Error Count' increasing",
      "Drive works at SATA II speed but fails at SATA III",
      "Cable changes do not fix the issue",
      "Event log shows AHCI port reset events",
    ],
    diagnosticSteps: [
      "Replace SATA cable with known-good cable — rule out cable first",
      "Try different SATA port on motherboard",
      "Check SMART attribute 199 (Interface CRC Error Count) — high count = link errors",
      "Force SATA II mode in BIOS if available — if stable, SATA III PHY is failing",
      "Check power connector — marginal 5V or 3.3V causes PHY instability",
      "Inspect SATA data connector on drive for physical damage",
    ],
    firmwareRecovery: "SATA PHY failure is hardware — controller IC or PCB trace damage. Not fixable via firmware. If PHY works at SATA II but not III: component on SATA signal path degraded (termination resistors, AC coupling capacitors). These are tiny SMD components near the SATA connector. Replacing them requires micro-soldering. For data recovery: if drive works at SATA II speed, clone data immediately before complete failure.",
    dataRecoveryPossible: true,
    difficulty: 3,
    keywords: ["sata phy", "disconnect", "crc error", "interface error", "sata link", "intermittent", "port reset"],
  },
  {
    id: "ssd-fail-012",
    name: "Crypto engine failure (encrypted drive inaccessible)",
    controller: "Samsung / Intel / Any with hardware encryption",
    symptoms: [
      "Drive was working with BitLocker/FileVault/eDrive, now data inaccessible",
      "Drive detected but reports as unformatted or RAW filesystem",
      "OPAL/eDrive status shows locked",
      "Controller replacement makes data permanently inaccessible",
      "Encryption key lost due to controller firmware corruption",
    ],
    diagnosticSteps: [
      "Check if drive supports hardware encryption (OPAL, eDrive, TCG) — most modern drives do",
      "Verify encryption was enabled (BitLocker hardware mode, Samsung SED)",
      "If controller died: encryption key is in the controller — data is lost without it",
      "Check if BitLocker recovery key was backed up to Microsoft account",
      "For Samsung drives: Samsung always encrypts at hardware level even without user-set password — controller swap loses key",
      "For Intel drives: AES key stored in controller NVRAM",
    ],
    firmwareRecovery: "If controller functional but encryption state corrupted: manufacturer tool may reset OPAL state (destroys data). If controller dead: encryption key is gone unless backed up externally (BitLocker recovery key, TPM backup). Samsung drives have no key recovery path if controller dies. Intel SSD Toolbox can perform 'Secure Erase' to reset crypto state (destroys data). For future: always back up BitLocker/FileVault recovery keys externally.",
    dataRecoveryPossible: false,
    difficulty: 5,
    keywords: ["encryption", "bitlocker", "opal", "edrive", "crypto", "encrypted", "aes", "key lost", "sed", "filevault"],
  },
];

// ═══════════════════════════════════════════════════════════════════
//  SYNONYM MAP FOR SEARCH EXPANSION
// ═══════════════════════════════════════════════════════════════════

const SSD_SYNONYMS: Record<string, string[]> = {
  capacity: ["capacity", "size", "bytes", "0mb", "0gb", "wrong size", "shrink"],
  firmware: ["firmware", "fw", "bios", "rom", "flash", "update", "brick"],
  corruption: ["corruption", "corrupt", "damaged", "broken", "bad data", "garbled"],
  detection: ["detection", "not detected", "missing", "disappeared", "invisible", "not found", "not showing"],
  performance: ["performance", "slow", "degraded", "throttle", "speed", "latency"],
  thermal: ["thermal", "temperature", "hot", "overheat", "throttle", "heat"],
  power: ["power", "voltage", "power loss", "outage", "surge", "3.3v", "5v"],
  nand: ["nand", "flash", "tlc", "qlc", "mlc", "slc", "v-nand", "3d nand", "wear"],
  controller: ["controller", "silicon motion", "phison", "marvell", "samsung", "realtek", "maxio", "innogrit"],
  sata: ["sata", "ahci", "sata iii", "6gbps", "2.5 inch", "2.5\""],
  nvme: ["nvme", "m.2", "pcie", "gen3", "gen4", "gen5", "nvme ssd"],
  recovery: ["recovery", "data recovery", "chip-off", "repair", "restore", "rebuild"],
};

// ═══════════════════════════════════════════════════════════════════
//  SEARCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

export function lookupSsdController(query: string): SsdController | undefined {
  const q = query.toLowerCase();
  return SSD_CONTROLLERS.find(c =>
    c.name.toLowerCase().includes(q) ||
    c.id.toLowerCase() === q ||
    c.commonDrives.some(d => d.toLowerCase().includes(q))
  );
}

export function searchSsdControllers(query: string): SsdController[] {
  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>();

  for (const word of words) {
    expandedTerms.add(word);
    for (const [, synonyms] of Object.entries(SSD_SYNONYMS)) {
      if (synonyms.some(s => s.includes(word) || word.includes(s))) {
        for (const syn of synonyms) expandedTerms.add(syn);
      }
    }
  }

  const scored: Array<{ ctrl: SsdController; score: number }> = [];

  for (const ctrl of SSD_CONTROLLERS) {
    let score = 0;
    const searchableText = [
      ctrl.name,
      ctrl.manufacturer,
      ctrl.type,
      ctrl.interface,
      ...ctrl.nandSupport,
      ...ctrl.commonDrives,
      ...ctrl.keywords,
      ctrl.recoveryNotes,
    ].join(" ").toLowerCase();

    for (const term of expandedTerms) {
      if (searchableText.includes(term)) score += term.length;
    }

    for (const word of words) {
      for (const kw of ctrl.keywords) {
        if (kw.includes(word)) score += 5;
      }
    }

    if (score > 0) scored.push({ ctrl, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.ctrl);
}

export function getSsdFailuresByController(controllerName: string): SsdFailurePattern[] {
  const q = controllerName.toLowerCase();
  return SSD_FAILURE_PATTERNS.filter(f =>
    f.controller.toLowerCase().includes(q) || f.controller === "Any" || f.controller.startsWith("Any")
  );
}

export function searchSsdFailures(query: string): SsdFailurePattern[] {
  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>();

  for (const word of words) {
    expandedTerms.add(word);
    for (const [, synonyms] of Object.entries(SSD_SYNONYMS)) {
      if (synonyms.some(s => s.includes(word) || word.includes(s))) {
        for (const syn of synonyms) expandedTerms.add(syn);
      }
    }
  }

  const scored: Array<{ pattern: SsdFailurePattern; score: number }> = [];

  for (const pattern of SSD_FAILURE_PATTERNS) {
    let score = 0;
    const searchableText = [
      pattern.name,
      pattern.controller,
      ...pattern.symptoms,
      ...pattern.diagnosticSteps,
      ...pattern.keywords,
      pattern.firmwareRecovery,
    ].join(" ").toLowerCase();

    for (const term of expandedTerms) {
      if (searchableText.includes(term)) score += term.length;
    }

    for (const word of words) {
      for (const kw of pattern.keywords) {
        if (kw.includes(word)) score += 5;
      }
    }

    if (score > 0) scored.push({ pattern, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.pattern);
}
