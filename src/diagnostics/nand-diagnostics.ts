// NAND Flash Diagnostics — chip database, failure patterns, SMART interpretation
// Technically accurate data for SSD/flash repair and forensic analysis

export interface NandChipInfo {
  id: string;
  manufacturer: string;
  partNumber: string;
  type: "slc" | "mlc" | "tlc" | "qlc";
  technology: string;
  layers: number;
  density: string;
  pageSize: number;
  blockSize: number;
  pagesPerBlock: number;
  voltage: string;
  interface: "onfi" | "toggle" | "toggle2" | "toggle3";
  endurance: string;
  keywords: string[];
}

export interface NandDiagPattern {
  id: string;
  name: string;
  category:
    | "bad-blocks"
    | "read-errors"
    | "retention"
    | "wear"
    | "ecc"
    | "controller-nand";
  description: string;
  symptoms: string[];
  diagnosticSteps: string[];
  interpretation: string;
  severity: "info" | "warning" | "critical";
  keywords: string[];
}

export interface NandHealthIndicator {
  name: string;
  smartAttribute: number;
  description: string;
  warningThreshold: string;
  criticalThreshold: string;
  interpretation: string;
}

// ---------------------------------------------------------------------------
// Synonym map for search expansion
// ---------------------------------------------------------------------------

const NAND_SYNONYMS: Record<string, string[]> = {
  bad: ["defective", "failed", "faulty", "damaged", "grown"],
  block: ["blk", "erase-block", "eb"],
  read: ["rd", "sense", "readout"],
  error: ["err", "fault", "failure", "fail"],
  write: ["wr", "program", "prog"],
  erase: ["er", "blk-erase"],
  wear: ["wearout", "endurance", "aging", "degradation", "pe-cycle"],
  retention: ["data-retention", "charge-loss", "leakage", "retention-loss"],
  ecc: ["error-correction", "ldpc", "bch", "bose-chaudhuri", "parity"],
  uecc: ["uncorrectable", "uecc", "uncorr"],
  disturb: ["read-disturb", "program-disturb", "rd-disturb"],
  smart: ["self-monitoring", "health", "attribute"],
  controller: ["ctrl", "ftl", "firmware", "fw"],
  slc: ["single-level", "single-level-cell"],
  mlc: ["multi-level", "multi-level-cell", "2bit"],
  tlc: ["triple-level", "triple-level-cell", "3bit"],
  qlc: ["quad-level", "quad-level-cell", "4bit"],
  nand: ["flash", "nor", "memory-cell"],
  onfi: ["open-nand-flash-interface"],
  toggle: ["toggle-ddr", "toggle-mode"],
  samsung: ["sec", "k9"],
  micron: ["mt29", "mu"],
  hynix: ["sk-hynix", "h27", "skhynix"],
  kioxia: ["toshiba", "tc58", "bics"],
  intel: ["29f", "imft"],
  sandisk: ["wd", "western-digital", "sdtn"],
  vnand: ["v-nand", "3d-nand", "vertical-nand", "3dnand"],
  bics: ["bit-cost-scalable", "bics3", "bics4", "bics5"],
  page: ["pg", "page-size"],
  amplification: ["waf", "write-amp", "write-amplification"],
  reallocated: ["remap", "remapped", "spare", "replacement"],
  threshold: ["limit", "boundary", "max"],
  power: ["power-loss", "power-off", "spl", "sudden-power-loss"],
  temperature: ["temp", "thermal", "heat"],
  timing: ["tR", "tPROG", "tBERS", "latency"],
  training: ["calibration", "init", "initialization"],
  ber: ["bit-error-rate", "raw-ber", "rber"],
  life: ["lifespan", "lifetime", "remaining-life", "ssd-life"],
  crc: ["cyclic-redundancy", "checksum"],
};

// ---------------------------------------------------------------------------
// NAND chip database
// ---------------------------------------------------------------------------

export const NAND_CHIPS: NandChipInfo[] = [
  // ---- Samsung ----
  {
    id: "samsung-k9f1g08u0e",
    manufacturer: "Samsung",
    partNumber: "K9F1G08U0E",
    type: "slc",
    technology: "2D planar 50nm",
    layers: 1,
    density: "1Gbit (128MB)",
    pageSize: 2048,
    blockSize: 131072,
    pagesPerBlock: 64,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "100K P/E cycles",
    keywords: [
      "samsung",
      "slc",
      "1gbit",
      "legacy",
      "k9f",
      "onfi",
      "2d",
      "planar",
      "50nm",
      "embedded",
      "boot-rom",
    ],
  },
  {
    id: "samsung-k9gag08u0e",
    manufacturer: "Samsung",
    partNumber: "K9GAG08U0E",
    type: "mlc",
    technology: "2D planar 27nm",
    layers: 1,
    density: "16Gbit (2GB)",
    pageSize: 8192,
    blockSize: 1048576,
    pagesPerBlock: 128,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "3K P/E cycles",
    keywords: [
      "samsung",
      "mlc",
      "16gbit",
      "k9gag",
      "onfi",
      "2d",
      "planar",
      "27nm",
      "emmc",
      "tablet",
    ],
  },
  {
    id: "samsung-k9adgd8s0m",
    manufacturer: "Samsung",
    partNumber: "K9ADGD8S0M",
    type: "tlc",
    technology: "3D V-NAND 48-layer",
    layers: 48,
    density: "256Gbit (32GB)",
    pageSize: 16384,
    blockSize: 12582912,
    pagesPerBlock: 768,
    voltage: "1.8V / 3.3V",
    interface: "toggle2",
    endurance: "1.5K P/E cycles",
    keywords: [
      "samsung",
      "tlc",
      "256gbit",
      "v-nand",
      "vnand",
      "48-layer",
      "3d",
      "toggle2",
      "860-evo",
      "ssd",
    ],
  },
  {
    id: "samsung-klueg8uhdb",
    manufacturer: "Samsung",
    partNumber: "KLUEG8UHDB",
    type: "tlc",
    technology: "3D V-NAND 64-layer",
    layers: 64,
    density: "256Gbit (32GB)",
    pageSize: 16384,
    blockSize: 12582912,
    pagesPerBlock: 768,
    voltage: "1.8V / 3.3V",
    interface: "toggle2",
    endurance: "1.5K P/E cycles",
    keywords: [
      "samsung",
      "tlc",
      "256gbit",
      "v-nand",
      "vnand",
      "64-layer",
      "3d",
      "toggle2",
      "ufs",
      "mobile",
      "emmc",
    ],
  },

  // ---- Micron ----
  {
    id: "micron-mt29f4g08abaea",
    manufacturer: "Micron",
    partNumber: "MT29F4G08ABAEA",
    type: "slc",
    technology: "2D planar 25nm",
    layers: 1,
    density: "4Gbit (512MB)",
    pageSize: 4096,
    blockSize: 262144,
    pagesPerBlock: 64,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "100K P/E cycles",
    keywords: [
      "micron",
      "slc",
      "4gbit",
      "industrial",
      "mt29f",
      "onfi",
      "2d",
      "planar",
      "25nm",
      "automotive",
      "mil-spec",
    ],
  },
  {
    id: "micron-mt29f128g08cbcab",
    manufacturer: "Micron",
    partNumber: "MT29F128G08CBCAB",
    type: "mlc",
    technology: "2D planar 20nm",
    layers: 1,
    density: "128Gbit (16GB)",
    pageSize: 8192,
    blockSize: 2097152,
    pagesPerBlock: 256,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "3K P/E cycles",
    keywords: [
      "micron",
      "mlc",
      "128gbit",
      "mt29f",
      "onfi",
      "2d",
      "planar",
      "20nm",
      "ssd",
      "enterprise",
    ],
  },
  {
    id: "micron-mt29f2t08emhbfj4",
    manufacturer: "Micron",
    partNumber: "MT29F2T08EMHBFJ4",
    type: "tlc",
    technology: "3D NAND 176-layer",
    layers: 176,
    density: "2Tbit (256GB)",
    pageSize: 16384,
    blockSize: 18874368,
    pagesPerBlock: 1152,
    voltage: "1.2V / 3.3V",
    interface: "onfi",
    endurance: "1.5K P/E cycles",
    keywords: [
      "micron",
      "tlc",
      "2tbit",
      "176-layer",
      "3d",
      "b47r",
      "replacement-gate",
      "onfi",
      "datacenter",
      "ssd",
      "high-density",
    ],
  },

  // ---- SK Hynix ----
  {
    id: "hynix-h27ucg8t2atr",
    manufacturer: "SK Hynix",
    partNumber: "H27UCG8T2ATR",
    type: "mlc",
    technology: "2D planar 16nm",
    layers: 1,
    density: "64Gbit (8GB)",
    pageSize: 8192,
    blockSize: 2097152,
    pagesPerBlock: 256,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "3K P/E cycles",
    keywords: [
      "hynix",
      "sk-hynix",
      "mlc",
      "64gbit",
      "h27",
      "onfi",
      "2d",
      "planar",
      "16nm",
      "ssd",
    ],
  },
  {
    id: "hynix-h27qdg8ver",
    manufacturer: "SK Hynix",
    partNumber: "H27QDG8VER",
    type: "tlc",
    technology: "3D CTF NAND 72-layer",
    layers: 72,
    density: "512Gbit (64GB)",
    pageSize: 16384,
    blockSize: 12582912,
    pagesPerBlock: 768,
    voltage: "1.8V / 3.3V",
    interface: "toggle2",
    endurance: "1K P/E cycles",
    keywords: [
      "hynix",
      "sk-hynix",
      "tlc",
      "512gbit",
      "72-layer",
      "3d",
      "ctf",
      "charge-trap",
      "toggle2",
      "ssd",
      "p31",
    ],
  },
  {
    id: "hynix-h27t4g8f2m",
    manufacturer: "SK Hynix",
    partNumber: "H27T4G8F2M",
    type: "tlc",
    technology: "3D CTF NAND 238-layer",
    layers: 238,
    density: "1Tbit (128GB)",
    pageSize: 16384,
    blockSize: 18874368,
    pagesPerBlock: 1152,
    voltage: "1.2V",
    interface: "toggle3",
    endurance: "1.5K P/E cycles",
    keywords: [
      "hynix",
      "sk-hynix",
      "tlc",
      "1tbit",
      "238-layer",
      "3d",
      "ctf",
      "charge-trap",
      "toggle3",
      "p41",
      "pcie5",
      "high-density",
    ],
  },

  // ---- Kioxia (Toshiba) ----
  {
    id: "kioxia-tc58nvg0s3hta00",
    manufacturer: "Kioxia",
    partNumber: "TC58NVG0S3HTA00",
    type: "slc",
    technology: "2D planar 43nm",
    layers: 1,
    density: "1Gbit (128MB)",
    pageSize: 2048,
    blockSize: 131072,
    pagesPerBlock: 64,
    voltage: "3.3V",
    interface: "onfi",
    endurance: "100K P/E cycles",
    keywords: [
      "kioxia",
      "toshiba",
      "slc",
      "1gbit",
      "tc58",
      "onfi",
      "2d",
      "planar",
      "43nm",
      "legacy",
      "embedded",
    ],
  },
  {
    id: "kioxia-tc58teg7thlba09",
    manufacturer: "Kioxia",
    partNumber: "TC58TEG7THLBA09",
    type: "tlc",
    technology: "3D BiCS3 48-layer",
    layers: 48,
    density: "256Gbit (32GB)",
    pageSize: 16384,
    blockSize: 12582912,
    pagesPerBlock: 768,
    voltage: "1.8V / 3.3V",
    interface: "toggle",
    endurance: "1K P/E cycles",
    keywords: [
      "kioxia",
      "toshiba",
      "tlc",
      "256gbit",
      "bics3",
      "bics",
      "48-layer",
      "3d",
      "toggle",
      "ssd",
    ],
  },
  {
    id: "kioxia-tc58byg2s0hbaig",
    manufacturer: "Kioxia",
    partNumber: "TC58BYG2S0HBAIG",
    type: "tlc",
    technology: "3D BiCS5 112-layer",
    layers: 112,
    density: "512Gbit (64GB)",
    pageSize: 16384,
    blockSize: 18874368,
    pagesPerBlock: 1152,
    voltage: "1.2V / 3.3V",
    interface: "toggle3",
    endurance: "1.5K P/E cycles",
    keywords: [
      "kioxia",
      "toshiba",
      "tlc",
      "512gbit",
      "bics5",
      "bics",
      "112-layer",
      "3d",
      "toggle3",
      "high-density",
      "ssd",
    ],
  },

  // ---- Intel ----
  {
    id: "intel-29f32b08jamdb",
    manufacturer: "Intel",
    partNumber: "29F32B08JAMDB",
    type: "tlc",
    technology: "3D NAND 64-layer floating gate",
    layers: 64,
    density: "256Gbit (32GB)",
    pageSize: 16384,
    blockSize: 12582912,
    pagesPerBlock: 768,
    voltage: "1.8V / 3.3V",
    interface: "onfi",
    endurance: "1K P/E cycles",
    keywords: [
      "intel",
      "29f",
      "tlc",
      "256gbit",
      "64-layer",
      "3d",
      "floating-gate",
      "onfi",
      "ssd",
      "660p",
      "imft",
    ],
  },

  // ---- WD/SanDisk ----
  {
    id: "wd-sdtnqgama",
    manufacturer: "WD/SanDisk",
    partNumber: "SDTNQGAMA",
    type: "tlc",
    technology: "3D BiCS4 96-layer",
    layers: 96,
    density: "512Gbit (64GB)",
    pageSize: 16384,
    blockSize: 18874368,
    pagesPerBlock: 1152,
    voltage: "1.8V / 3.3V",
    interface: "toggle2",
    endurance: "1K P/E cycles",
    keywords: [
      "wd",
      "sandisk",
      "western-digital",
      "tlc",
      "512gbit",
      "bics4",
      "bics",
      "96-layer",
      "3d",
      "toggle2",
      "ssd",
      "sn750",
    ],
  },
];

// ---------------------------------------------------------------------------
// NAND diagnostic patterns
// ---------------------------------------------------------------------------

export const NAND_DIAG_PATTERNS: NandDiagPattern[] = [
  // ---- Bad Blocks ----
  {
    id: "bb-factory-growth",
    name: "Factory Bad Block Growth Rate Exceeded",
    category: "bad-blocks",
    description:
      "The rate of new bad blocks appearing exceeds the manufacturer-specified grown-bad-block budget. Factory-marked bad blocks are expected, but rapid growth after deployment signals die-level degradation.",
    symptoms: [
      "SMART attribute 5 (Reallocated Sector Count) increasing faster than 1 block per 100 P/E cycles",
      "Grown defect list (G-List) growing at an accelerating rate",
      "Intermittent write failures to previously good blocks",
      "Controller log shows increasing erase-fail and program-fail entries",
    ],
    diagnosticSteps: [
      "Read SMART attribute 5 raw value and track weekly delta",
      "Compare grown-bad-block count vs total P/E cycles — rate > 1 per 100 P/E is abnormal",
      "Dump vendor-specific SMART logs for per-die bad block distribution",
      "Check if bad blocks cluster on specific dies (indicates die failure vs normal wear)",
    ],
    interpretation:
      "Accelerating bad block growth typically indicates the NAND is approaching end of life or a specific die is failing. If blocks cluster on one die, the die may have a latent defect. If distributed evenly, the flash has simply exhausted its wear budget.",
    severity: "warning",
    keywords: [
      "bad",
      "block",
      "factory",
      "growth",
      "grown",
      "defect",
      "reallocated",
      "g-list",
    ],
  },
  {
    id: "bb-runtime-clustering",
    name: "Runtime Bad Block Clustering",
    category: "bad-blocks",
    description:
      "Multiple bad blocks appear on the same die or plane in a short period, indicating localized physical damage or a die-level defect rather than normal wear distribution.",
    symptoms: [
      "Multiple erase or program failures on blocks sharing the same die/plane address",
      "Sudden spike in SMART attribute 171 (Program Fail Count) or 172 (Erase Fail Count)",
      "Drive performance drops as controller remaps around clustered failures",
      "Vendor log shows die-specific error counters far above average",
    ],
    diagnosticSteps: [
      "Extract per-die bad block map from vendor SMART or debug log",
      "Identify whether failed blocks share a common die, plane, or wordline",
      "Check for correlation with thermal events or physical shock",
      "Compare affected die block count vs other dies in the package",
    ],
    interpretation:
      "Clustered failures strongly suggest physical damage (solder crack, bond wire, die crack) or a manufacturing defect that passed initial screening. This is not normal wear — the drive is at risk of rapid capacity loss if the affected die is large.",
    severity: "critical",
    keywords: [
      "bad",
      "block",
      "cluster",
      "runtime",
      "die",
      "plane",
      "localized",
      "damage",
    ],
  },
  {
    id: "bb-spare-exhaustion",
    name: "Spare Block Pool Exhaustion",
    category: "bad-blocks",
    description:
      "The over-provisioned spare block pool is nearly or fully consumed. Once spares run out the controller cannot remap bad blocks and the drive becomes read-only or fails entirely.",
    symptoms: [
      "SMART attribute 231 (SSD Life Remaining) below 5%",
      "SMART attribute 233 (Media Wearout Indicator) near 0",
      "Drive enters read-only or write-protect mode",
      "Controller log warnings about low spare block count",
      "Capacity reported by the OS shrinks or write operations stall",
    ],
    diagnosticSteps: [
      "Read SMART attribute 231 and 233 — values near minimum confirm exhaustion",
      "Check spare block count in vendor-specific SMART page",
      "Attempt a small write — if rejected, spare pool is exhausted",
      "Image the drive immediately in read-only mode before total failure",
    ],
    interpretation:
      "Spare exhaustion is end-of-life for the SSD. Data recovery should be performed immediately. The drive should not be used for any further writes. Backup and replace.",
    severity: "critical",
    keywords: [
      "spare",
      "exhaustion",
      "over-provision",
      "op",
      "read-only",
      "write-protect",
      "capacity",
      "life",
      "remaining",
    ],
  },

  // ---- Read Errors ----
  {
    id: "re-uecc-increase",
    name: "Uncorrectable ECC Error Rate Increase",
    category: "read-errors",
    description:
      "The rate of uncorrectable ECC (UECC) errors is rising, meaning the ECC engine can no longer fully correct the raw bit errors on read. Data integrity is at risk.",
    symptoms: [
      "SMART attribute 187 (Reported Uncorrectable Errors) incrementing",
      "Host sees I/O errors or CRC failures on read",
      "File system corruption or checksum mismatches",
      "Controller retry loop detected in latency histogram (long tail reads)",
    ],
    diagnosticSteps: [
      "Track SMART 187 raw value over time — any non-zero delta is significant",
      "Run a full-surface sequential read and log sector-level errors",
      "Check ECC correction statistics: if correctable errors are near LDPC/BCH max, UECC will follow",
      "Correlate UECC sectors with block P/E counts to identify wear-related vs retention-related failures",
    ],
    interpretation:
      "Rising UECC means the raw BER has exceeded the ECC correction capability. For TLC/QLC this often correlates with high P/E counts or long retention intervals. Data on affected pages is permanently lost unless a higher-level redundancy (RAID, filesystem checksum) can recover it.",
    severity: "critical",
    keywords: [
      "uecc",
      "uncorrectable",
      "ecc",
      "error",
      "read",
      "data-loss",
      "ber",
      "integrity",
    ],
  },
  {
    id: "re-read-retry-climbing",
    name: "Read Retry Count Climbing",
    category: "read-errors",
    description:
      "The controller is increasingly using read-retry (voltage threshold shifting) to successfully read pages. This indicates the NAND threshold voltage distributions are widening due to wear or retention loss.",
    symptoms: [
      "Average read latency increasing over time (from ~50us to 200us+ on retries)",
      "Vendor SMART shows read-retry count or read-reclaim count rising",
      "Occasional long-tail I/O latency spikes during sequential reads",
      "No UECC yet, but correctable error count per page is near maximum",
    ],
    diagnosticSteps: [
      "Check vendor-specific SMART for read-retry counters",
      "Plot read latency distribution — a growing tail above 200us indicates retries",
      "Compare P/E cycle count vs expected retry onset for the NAND type",
      "Run background read-refresh (if supported) to re-program marginal pages",
    ],
    interpretation:
      "Read retries are the controller compensating for Vt distribution drift. This is a precursor to UECC errors. The drive is still functional but degrading. For TLC NAND, retries typically start around 50-70% of rated endurance.",
    severity: "warning",
    keywords: [
      "read",
      "retry",
      "latency",
      "voltage",
      "threshold",
      "vt",
      "shift",
      "reclaim",
    ],
  },
  {
    id: "re-read-disturb",
    name: "Read Disturb Induced Errors",
    category: "read-errors",
    description:
      "Repeated reads to the same block without intervening erase cause charge injection into adjacent cells, shifting their threshold voltage and increasing BER. Particularly affects MLC/TLC in hot-read workloads.",
    symptoms: [
      "Errors concentrated in blocks with very high read counts but low P/E counts",
      "BER increases on pages adjacent to heavily-read pages within the same block",
      "Controller triggers read-reclaim or data migration on specific blocks",
      "Workload is read-heavy with strong locality (database index, OS boot partition)",
    ],
    diagnosticSteps: [
      "Identify blocks with highest read counts from controller telemetry",
      "Compare per-block BER vs read count — positive correlation confirms read disturb",
      "Check if controller has read-disturb management (automatic patrol read and migration)",
      "Verify read-reclaim or scrubbing is active and keeping up with the read rate",
    ],
    interpretation:
      "Read disturb is a well-known NAND phenomenon. Modern controllers mitigate it via patrol read and proactive data migration. If the controller's mitigation cannot keep pace with the read rate, consider reducing read locality or adding DRAM caching above the SSD.",
    severity: "warning",
    keywords: [
      "read",
      "disturb",
      "adjacent",
      "cell",
      "charge",
      "injection",
      "patrol",
      "reclaim",
      "hot-read",
    ],
  },

  // ---- Retention ----
  {
    id: "ret-power-off-loss",
    name: "Data Retention Loss After Extended Power-Off",
    category: "retention",
    description:
      "NAND cells lose stored charge over time when unpowered. After extended storage (months to years depending on wear level and temperature), data may become unreadable due to Vt drift below the read reference voltage.",
    symptoms: [
      "Drive returns read errors after being unpowered for weeks or months",
      "Errors are widespread rather than localized to specific blocks",
      "BER correlates with block P/E count — higher-worn blocks fail first",
      "Data was intact at last power-off but corrupted at next power-on",
    ],
    diagnosticSteps: [
      "Record time since last power-on from SMART power-on hours and calendar",
      "Correlate failing blocks with their P/E cycle counts",
      "Attempt read-retry with shifted Vt thresholds (if controller supports vendor mode)",
      "Compare error rate for SLC-cached vs TLC/QLC regions — SLC retains longer",
    ],
    interpretation:
      "NAND data retention decreases exponentially with P/E cycle count. JEDEC specifies 1 year at 40C for client SSDs at rated endurance. Highly worn TLC (>1K P/E) may lose data in weeks at elevated temperature. This is a fundamental physics limitation.",
    severity: "critical",
    keywords: [
      "retention",
      "power-off",
      "charge",
      "loss",
      "storage",
      "unpowered",
      "vt",
      "drift",
      "data-loss",
    ],
  },
  {
    id: "ret-temperature-accelerated",
    name: "Temperature-Accelerated Retention Loss",
    category: "retention",
    description:
      "Elevated storage temperature (not operating temperature) dramatically accelerates charge leakage from NAND floating gate or charge trap, reducing data retention time according to the Arrhenius equation.",
    symptoms: [
      "Drive stored in warm environment (>40C) shows errors much sooner than expected",
      "Retention failure after only days or weeks at high temperature",
      "Errors preferentially affect blocks with highest P/E counts",
      "Operating temperature during writes was normal — only storage temperature was high",
    ],
    diagnosticSteps: [
      "Check SMART temperature log for storage (not operating) conditions",
      "Estimate retention budget: each 10C increase roughly halves retention time",
      "Compare against JEDEC client (40C/1yr) or enterprise (55C/3mo) spec",
      "If data is critical, attempt immediate read with Vt-shifted retry",
    ],
    interpretation:
      "Temperature is the dominant accelerant for retention loss. A drive at 55C storage loses retention roughly 4x faster than at 40C. Drives intended for archival storage must be kept cool and periodically refreshed (read + rewrite).",
    severity: "warning",
    keywords: [
      "retention",
      "temperature",
      "thermal",
      "heat",
      "arrhenius",
      "accelerated",
      "storage",
      "charge",
      "leakage",
    ],
  },
  {
    id: "ret-pe-correlation",
    name: "Retention Degradation Correlated with P/E Cycles",
    category: "retention",
    description:
      "Data retention degrades as a function of cumulative P/E cycles. Each erase cycle damages the tunnel oxide (floating gate) or charge trap layer, reducing the cell's ability to hold charge. Higher P/E blocks lose data faster.",
    symptoms: [
      "Blocks with highest P/E counts show the worst BER after idle periods",
      "Fresh (low-P/E) blocks retain data normally while worn blocks fail",
      "SMART attribute 173 (Wear Leveling Count) is high and retention errors appear",
      "Write amplification is high, accelerating effective wear beyond host writes",
    ],
    diagnosticSteps: [
      "Correlate per-block BER with per-block P/E count from controller telemetry",
      "Plot BER vs P/E — expect an exponential relationship",
      "Check write amplification factor (WAF) — high WAF means NAND is wearing faster than host writes suggest",
      "Estimate remaining retention budget using NAND datasheet BER vs P/E curve",
    ],
    interpretation:
      "This is the fundamental NAND wear mechanism. Every P/E cycle traps electrons in the tunnel oxide, narrowing the Vt window and reducing charge retention. Once P/E approaches the rated endurance, retention drops dramatically. The drive may still operate but cannot safely store data unpowered.",
    severity: "warning",
    keywords: [
      "retention",
      "pe",
      "cycle",
      "wear",
      "endurance",
      "oxide",
      "damage",
      "tunnel",
      "correlation",
    ],
  },

  // ---- Wear ----
  {
    id: "wear-pe-limit",
    name: "P/E Cycle Count Approaching Rated Limit",
    category: "wear",
    description:
      "The average or maximum P/E cycle count is approaching the manufacturer-rated endurance limit. Beyond this point, BER, retention, and reliability degrade rapidly.",
    symptoms: [
      "SMART attribute 173 (Wear Leveling Count) near rated P/E limit",
      "SMART attribute 233 (Media Wearout Indicator) approaching 0%",
      "ECC correction rate increasing across all blocks",
      "Drive firmware may log endurance warnings",
    ],
    diagnosticSteps: [
      "Read SMART 173 raw value — this is typically average P/E count",
      "Compare against rated endurance: SLC 100K, MLC 3K-10K, TLC 1K-3K, QLC 100-1K",
      "Check SMART 177 (Wear Range Delta) to assess wear leveling effectiveness",
      "Calculate remaining write budget: (rated P/E - current P/E) * capacity * WAF",
    ],
    interpretation:
      "Reaching the rated P/E limit means the NAND is at the edge of its designed reliability envelope. The drive will not immediately fail but error rates, read retries, and bad block growth will accelerate. Plan replacement proactively.",
    severity: "warning",
    keywords: [
      "wear",
      "pe",
      "cycle",
      "limit",
      "endurance",
      "rated",
      "lifetime",
      "budget",
    ],
  },
  {
    id: "wear-waf-excessive",
    name: "Excessive Write Amplification Factor",
    category: "wear",
    description:
      "The ratio of NAND writes to host writes (WAF) is excessively high, causing the NAND to wear out much faster than the host write volume would suggest. Caused by poor alignment, small random writes, or aggressive garbage collection.",
    symptoms: [
      "SMART total NAND writes far exceed total host writes (WAF > 3-5x)",
      "Drive endurance consumed faster than expected based on host write rate",
      "High garbage collection activity visible in controller telemetry",
      "Small random write workload (4K random) causing full-block rewrites",
    ],
    diagnosticSteps: [
      "Calculate WAF = (SMART total NAND bytes written) / (SMART total host bytes written)",
      "Normal WAF is 1-3x for sequential, 3-10x for random 4K workloads",
      "Check filesystem alignment — misaligned partitions cause extra writes",
      "Evaluate TRIM/UNMAP support — disabled TRIM causes higher GC overhead",
    ],
    interpretation:
      "High WAF is the most common cause of premature SSD wear. Enabling TRIM, aligning partitions to erase block boundaries, and batching small writes can dramatically reduce WAF. For database workloads, consider WAL mode or larger write buffers.",
    severity: "warning",
    keywords: [
      "write",
      "amplification",
      "waf",
      "garbage",
      "collection",
      "gc",
      "trim",
      "random",
      "alignment",
    ],
  },
  {
    id: "wear-uneven-leveling",
    name: "Uneven Wear Leveling Distribution",
    category: "wear",
    description:
      "The wear leveling algorithm is not distributing P/E cycles evenly across all blocks. Some blocks are worn significantly more than others, causing localized premature failure while overall average P/E is still low.",
    symptoms: [
      "SMART attribute 177 (Wear Range Delta) is high (>20% of average P/E)",
      "Some blocks have 2-3x the average P/E count",
      "Bad blocks concentrate in high-P/E regions while low-P/E blocks are healthy",
      "Static data occupies blocks permanently, preventing wear rotation",
    ],
    diagnosticSteps: [
      "Read SMART 177 (Wear Range Delta) — large delta indicates poor leveling",
      "If available, dump per-block P/E histogram from vendor diagnostics",
      "Check for large static files that were written once and never moved (prevents leveling)",
      "Verify firmware version — some firmware updates improve wear leveling",
    ],
    interpretation:
      "Good wear leveling keeps all blocks within 5-10% of the average P/E count. Poor leveling can reduce effective endurance by 2-3x because hot blocks fail while cold blocks have unused budget. A firmware update or secure erase followed by fresh use can sometimes reset the imbalance.",
    severity: "info",
    keywords: [
      "wear",
      "leveling",
      "uneven",
      "distribution",
      "delta",
      "imbalance",
      "static",
      "hot",
      "cold",
    ],
  },

  // ---- ECC ----
  {
    id: "ecc-ldpc-limit",
    name: "ECC Correction Rate Near LDPC/BCH Limit",
    category: "ecc",
    description:
      "The average number of bit errors corrected per page is approaching the maximum correction capability of the ECC engine (LDPC or BCH). Once exceeded, uncorrectable errors (UECC) will occur.",
    symptoms: [
      "Average corrected bits per page exceeds 70% of ECC max correction capability",
      "Read retries becoming frequent as first-pass decoding fails",
      "LDPC decoder iterations increasing (visible in controller telemetry)",
      "Sporadic UECC errors beginning to appear",
    ],
    diagnosticSteps: [
      "Determine ECC type and strength: e.g., LDPC 2KB with 120-bit correction per 2KB sector",
      "Read average and maximum corrected bits per codeword from vendor SMART",
      "If average exceeds 70% of max, UECC onset is imminent",
      "Plot corrected bits vs time — exponential growth is a red flag",
    ],
    interpretation:
      "Modern SSDs use LDPC with 60-200+ bit correction per 2KB codeword. When average BER pushes corrected bits above 70% of capacity, the statistical tail starts producing UECC. This is the strongest leading indicator of impending data loss.",
    severity: "critical",
    keywords: [
      "ecc",
      "ldpc",
      "bch",
      "correction",
      "limit",
      "capacity",
      "bits",
      "codeword",
      "decoder",
    ],
  },
  {
    id: "ecc-ber-trending",
    name: "Raw Bit Error Rate Trending Upward",
    category: "ecc",
    description:
      "The raw BER (before ECC correction) is trending upward over time. While ECC currently handles it, the trend projects future UECC errors. BER increases with P/E cycles, retention time, and read disturb.",
    symptoms: [
      "Vendor SMART raw BER metric increasing month over month",
      "Correctable error count per read growing steadily",
      "Read performance slowly degrading as ECC works harder",
      "Power consumption during reads may increase slightly (more decoder iterations)",
    ],
    diagnosticSteps: [
      "Track raw BER or correctable error count over time (weekly samples)",
      "Fit an exponential curve to project when BER will exceed ECC capability",
      "Separate BER contributions: wear (P/E), retention (time), disturb (read count)",
      "Compare against NAND datasheet BER vs P/E specification",
    ],
    interpretation:
      "BER trending is the most reliable way to predict SSD remaining useful life. A linear BER increase is normal; exponential acceleration indicates the NAND is entering its end-of-life phase. Use the trend to schedule proactive replacement before data loss.",
    severity: "warning",
    keywords: [
      "ber",
      "bit",
      "error",
      "rate",
      "trend",
      "raw",
      "correctable",
      "projection",
      "rber",
    ],
  },

  // ---- Controller-NAND ----
  {
    id: "ctrl-timing-violation",
    name: "NAND Interface Timing Violation",
    category: "controller-nand",
    description:
      "The electrical signaling between the controller and NAND dies is experiencing timing violations — setup/hold time failures on the data bus. This causes corrupted data transfers even when the NAND cells themselves are healthy.",
    symptoms: [
      "CRC errors on the controller-NAND bus (SMART attribute 199)",
      "Errors are random and not correlated with block P/E count or position",
      "Drive works intermittently — sometimes reads fine, sometimes returns garbage",
      "Errors may change with temperature (thermal expansion affects signal integrity)",
    ],
    diagnosticSteps: [
      "Check SMART 199 (CRC Error Count) — non-zero indicates bus-level errors",
      "Test at different temperatures — timing-sensitive failures often worsen with heat",
      "Check for cold solder joints on NAND package or controller BGA",
      "If accessible, measure NAND bus signal integrity with oscilloscope",
    ],
    interpretation:
      "Timing violations are a hardware-level issue, not a NAND wear issue. Common causes: cold solder joints, PCB trace damage, overheating causing timing margin loss, or incompatible NAND replacement during repair. Re-flowing solder or replacing the NAND package may resolve it.",
    severity: "critical",
    keywords: [
      "timing",
      "violation",
      "interface",
      "signal",
      "crc",
      "bus",
      "solder",
      "controller",
      "integrity",
    ],
  },
  {
    id: "ctrl-training-failure",
    name: "ONFI/Toggle Interface Training Failure",
    category: "controller-nand",
    description:
      "The controller failed to negotiate or train the high-speed NAND interface (ONFI NV-DDR2/3 or Toggle DDR 2/3). The drive may fall back to a slower mode, fail to initialize, or not detect some NAND dies.",
    symptoms: [
      "Drive takes abnormally long to initialize (>10 seconds)",
      "Some NAND dies not detected — reported capacity is less than expected",
      "Drive operates at reduced speed (ONFI async mode instead of NV-DDR3)",
      "Controller log shows repeated DLL training or READ_ID failures",
    ],
    diagnosticSteps: [
      "Check if drive capacity matches specification — missing dies suggest training failure",
      "Look for initialization timeout or training failure in controller vendor log",
      "Test NAND dies individually (if supported) to isolate which die fails training",
      "Check NAND supply voltage — insufficient Vccq (1.2V/1.8V) causes training failure",
    ],
    interpretation:
      "Training failures indicate either a faulty NAND die, incorrect supply voltage, PCB signal integrity issue, or controller firmware bug. If a specific die consistently fails, it may need replacement. If all dies fail, check power supply and PCB traces first.",
    severity: "critical",
    keywords: [
      "training",
      "onfi",
      "toggle",
      "interface",
      "initialization",
      "ddr",
      "calibration",
      "dll",
      "detect",
      "controller",
    ],
  },
];

// ---------------------------------------------------------------------------
// SMART health indicators
// ---------------------------------------------------------------------------

export const NAND_HEALTH_INDICATORS: NandHealthIndicator[] = [
  {
    name: "Reallocated Sector Count",
    smartAttribute: 5,
    description:
      "Count of bad blocks that have been remapped to spare blocks from the over-provisioned pool. Each increment means a block has permanently failed and its data was moved to a spare.",
    warningThreshold: "Value increasing by >1 per week",
    criticalThreshold:
      "Value exceeds 50% of total spare pool or accelerating growth",
    interpretation:
      "A slowly growing count is normal as NAND wears. Rapid growth (multiple per day) or acceleration indicates die-level failure or endurance exhaustion. Compare against total spare pool size to assess remaining runway.",
  },
  {
    name: "Program Fail Count",
    smartAttribute: 171,
    description:
      "Total count of NAND page program (write) operations that failed. The controller retries on a different page and marks the original block as bad.",
    warningThreshold: "Any non-zero value after first 1% of rated endurance",
    criticalThreshold:
      "Count exceeding 10 per 1K P/E cycles or clustered on single die",
    interpretation:
      "Program failures are expected at end of life but abnormal early on. Early program failures suggest manufacturing defects, voltage issues, or physical damage. Check if failures cluster on a specific die.",
  },
  {
    name: "Erase Fail Count",
    smartAttribute: 172,
    description:
      "Total count of block erase operations that failed. Erase failure is the primary mechanism by which blocks are retired. The controller marks the block bad and uses a spare.",
    warningThreshold: "Count growing faster than 1 per 500 P/E cycles",
    criticalThreshold: "Count exceeding 20 per 1K P/E cycles or sudden spike",
    interpretation:
      "Erase failures increase with wear as the tunnel oxide degrades. A sudden spike (10+ in a short period) may indicate a power supply issue (insufficient erase voltage) rather than NAND wear. Check Vcc stability.",
  },
  {
    name: "Wear Leveling Count (Average P/E)",
    smartAttribute: 173,
    description:
      "Average P/E (Program/Erase) cycle count across all blocks. This is the primary indicator of how much of the NAND's rated endurance has been consumed.",
    warningThreshold:
      "Exceeds 80% of rated endurance (e.g., 2400 of 3000 for MLC)",
    criticalThreshold: "Exceeds 95% of rated endurance or at rated limit",
    interpretation:
      "Directly indicates consumed endurance. SLC: 100K rated, MLC: 3K-10K, TLC: 1K-3K, QLC: 100-1K. Drives can operate beyond rated endurance but with rapidly increasing BER and decreasing retention. Plan replacement at 80%.",
  },
  {
    name: "Unexpected Power Loss Count",
    smartAttribute: 174,
    description:
      "Count of times the drive lost power without a proper shutdown command. Each unexpected power loss risks data loss in the write cache and can leave the FTL mapping table in an inconsistent state.",
    warningThreshold: "More than 100 unexpected power losses",
    criticalThreshold:
      "More than 1000 or if correlated with data corruption symptoms",
    interpretation:
      "Modern SSDs have power-loss protection (capacitors) for FTL metadata, but repeated power loss stresses the protection circuit and can cause FTL corruption. If the count is very high, verify the supercap/tantalum capacitors are still functional.",
  },
  {
    name: "Wear Range Delta",
    smartAttribute: 177,
    description:
      "Difference between the maximum and minimum P/E cycle counts across all blocks. Indicates how effectively the wear leveling algorithm is distributing writes.",
    warningThreshold: "Delta exceeds 20% of average P/E count",
    criticalThreshold: "Delta exceeds 50% of average P/E count",
    interpretation:
      "A small delta (under 5%) indicates excellent wear leveling. A large delta means some blocks are wearing much faster than others, effectively reducing the drive's usable endurance. Hot/cold data separation and static wear leveling quality affect this metric.",
  },
  {
    name: "Reported Uncorrectable Errors",
    smartAttribute: 187,
    description:
      "Count of read errors that the ECC engine could not correct (UECC). Each occurrence means data on that page is permanently lost at the NAND level.",
    warningThreshold: "Any non-zero value",
    criticalThreshold: "Value increasing or exceeds 10",
    interpretation:
      "UECC errors are the most serious NAND health indicator. Even a single UECC means permanent data loss on that page. If this counter is non-zero and growing, the drive is failing and should be replaced immediately after data recovery.",
  },
  {
    name: "SATA/Interface CRC Error Count",
    smartAttribute: 199,
    description:
      "Count of CRC errors on the host interface (SATA, NVMe) or internal controller-NAND bus. Indicates signal integrity or connector issues rather than NAND cell failures.",
    warningThreshold: "Any non-zero value",
    criticalThreshold: "Count exceeding 100 or actively incrementing",
    interpretation:
      "CRC errors point to a hardware interconnect problem: damaged cable, loose connector, PCB trace issue, or controller malfunction. This is NOT a NAND wear indicator. Replace the cable first; if errors persist, the controller or PCB may be damaged.",
  },
  {
    name: "SSD Life Remaining",
    smartAttribute: 231,
    description:
      "Percentage of drive life remaining based on NAND wear, spare block consumption, and other vendor-specific factors. Starts at 100% and counts down to 0%.",
    warningThreshold: "Below 20%",
    criticalThreshold: "Below 5% — drive may enter read-only mode soon",
    interpretation:
      "This is the controller's composite health estimate. It accounts for P/E cycles, spare blocks, and error rates. Below 10% the drive is in its end-of-life phase. Some drives enter read-only mode at 0% to preserve existing data. Plan replacement well before this point.",
  },
  {
    name: "Media Wearout Indicator",
    smartAttribute: 233,
    description:
      "Vendor-specific metric indicating the percentage of rated NAND media life consumed. Often reflects total NAND bytes written relative to the rated TBW (Terabytes Written) specification.",
    warningThreshold: "Exceeds 80% of rated TBW",
    criticalThreshold: "Exceeds 100% of rated TBW",
    interpretation:
      "This attribute tracks cumulative writes against the manufacturer's TBW rating. Exceeding 100% does not mean immediate failure but indicates the NAND is operating beyond its rated envelope. BER, retention, and reliability degrade unpredictably beyond this point.",
  },
];

// ---------------------------------------------------------------------------
// Search utilities
// ---------------------------------------------------------------------------

function expandQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const expanded = new Set<string>(words);

  for (const word of words) {
    const synonyms = NAND_SYNONYMS[word];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
    // Reverse lookup: if the word is a synonym value, add the key
    for (const [key, values] of Object.entries(NAND_SYNONYMS)) {
      if (values.includes(word)) {
        expanded.add(key);
      }
    }
  }

  return Array.from(expanded);
}

function scoreKeywordMatch(keywords: string[], queryTerms: string[]): number {
  let score = 0;
  for (const term of queryTerms) {
    for (const keyword of keywords) {
      if (keyword === term) {
        score += 3; // exact match
      } else if (keyword.includes(term) || term.includes(keyword)) {
        score += 1; // partial match
      }
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Exported lookup functions
// ---------------------------------------------------------------------------

export function lookupNandChip(query: string): NandChipInfo[] {
  const queryTerms = expandQuery(query);

  const scored: Array<{ chip: NandChipInfo; score: number }> = [];

  for (const chip of NAND_CHIPS) {
    // Also match against manufacturer, partNumber, type, technology, density
    const allKeywords = [
      ...chip.keywords,
      chip.manufacturer.toLowerCase(),
      chip.partNumber.toLowerCase(),
      chip.type,
      chip.technology.toLowerCase(),
      chip.density.toLowerCase(),
      chip.interface,
    ];

    const score = scoreKeywordMatch(allKeywords, queryTerms);
    if (score > 0) {
      scored.push({ chip, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.chip);
}

export function searchNandDiagPatterns(query: string): NandDiagPattern[] {
  const queryTerms = expandQuery(query);

  const scored: Array<{ pattern: NandDiagPattern; score: number }> = [];

  for (const pattern of NAND_DIAG_PATTERNS) {
    const allKeywords = [
      ...pattern.keywords,
      pattern.category,
      pattern.severity,
      pattern.name.toLowerCase(),
    ];

    const score = scoreKeywordMatch(allKeywords, queryTerms);
    if (score > 0) {
      scored.push({ pattern, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.pattern);
}

export function getNandPatternsByCategory(
  category: NandDiagPattern["category"]
): NandDiagPattern[] {
  return NAND_DIAG_PATTERNS.filter((p) => p.category === category);
}

export function interpretSmartAttribute(
  attributeId: number
): NandHealthIndicator | undefined {
  return NAND_HEALTH_INDICATORS.find(
    (ind) => ind.smartAttribute === attributeId
  );
}
