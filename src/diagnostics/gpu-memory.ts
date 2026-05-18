export interface GpuMemoryTestPattern {
  name: string;
  description: string;
  pattern: number[];
  expectedBehavior: string;
  detectsFaults: string[];
}

export interface GpuMemoryDiagResult {
  testName: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  faultsDetected: string[];
}

export interface VramInfo {
  type: "gddr5" | "gddr5x" | "gddr6" | "gddr6x" | "hbm2" | "hbm2e" | "hbm3";
  manufacturer: string;
  busWidth: number;
  capacityMB: number;
  clockMHz: number;
  bandwidthGBs: number;
  markings: string;
}

export const VRAM_CHIPS: VramInfo[] = [
  { type: "gddr6", manufacturer: "Samsung", busWidth: 32, capacityMB: 1024, clockMHz: 1750, bandwidthGBs: 14, markings: "K4ZAF325BM-HC14 / K4ZAF325BM-HC16" },
  { type: "gddr6", manufacturer: "Samsung", busWidth: 32, capacityMB: 2048, clockMHz: 1750, bandwidthGBs: 14, markings: "K4ZAF325BM-HC14 (x8 for 16GB)" },
  { type: "gddr6x", manufacturer: "Micron", busWidth: 32, capacityMB: 1024, clockMHz: 2625, bandwidthGBs: 21, markings: "D8BGX (MT61K256M32JE-21)" },
  { type: "gddr6x", manufacturer: "Micron", busWidth: 32, capacityMB: 2048, clockMHz: 2625, bandwidthGBs: 21, markings: "D8BZC (MT61K512M32KPA-21)" },
  { type: "gddr6", manufacturer: "SK Hynix", busWidth: 32, capacityMB: 1024, clockMHz: 1750, bandwidthGBs: 14, markings: "H56G42AS6DX014" },
  { type: "gddr6", manufacturer: "SK Hynix", busWidth: 32, capacityMB: 2048, clockMHz: 2000, bandwidthGBs: 16, markings: "H56G42AS8DX024" },
  { type: "gddr6", manufacturer: "Micron", busWidth: 32, capacityMB: 1024, clockMHz: 1750, bandwidthGBs: 14, markings: "D9WCW (MT61K256M32JE-14)" },
  { type: "gddr6", manufacturer: "Micron", busWidth: 32, capacityMB: 2048, clockMHz: 2000, bandwidthGBs: 16, markings: "D9ZCM (MT61K512M32KPA-18)" },
  { type: "gddr5", manufacturer: "Samsung", busWidth: 32, capacityMB: 1024, clockMHz: 1125, bandwidthGBs: 9, markings: "K4G41325FC / K4G80325FC" },
  { type: "gddr5", manufacturer: "SK Hynix", busWidth: 32, capacityMB: 1024, clockMHz: 1125, bandwidthGBs: 9, markings: "H5GQ4H24MFR / H5GC4H24AJR" },
  { type: "hbm2", manufacturer: "Samsung", busWidth: 1024, capacityMB: 4096, clockMHz: 1000, bandwidthGBs: 256, markings: "HBM2 stacked die (4-Hi)" },
  { type: "hbm2e", manufacturer: "SK Hynix", busWidth: 1024, capacityMB: 8192, clockMHz: 1600, bandwidthGBs: 410, markings: "HBM2E stacked die (8-Hi)" },
  { type: "hbm3", manufacturer: "SK Hynix", busWidth: 1024, capacityMB: 16384, clockMHz: 2400, bandwidthGBs: 614, markings: "HBM3 stacked die (8-Hi / 12-Hi)" },
];

export const GPU_MEMORY_TEST_PATTERNS: GpuMemoryTestPattern[] = [
  {
    name: "All-zeros",
    description: "Write 0x00 to all addresses and read back. Detects stuck-at-1 faults where bits can't be driven low.",
    pattern: [0x00],
    expectedBehavior: "All bytes read back as 0x00",
    detectsFaults: ["Stuck-at-1 bit faults", "Addressing line stuck high", "Write enable failure"],
  },
  {
    name: "All-ones",
    description: "Write 0xFF to all addresses and read back. Detects stuck-at-0 faults where bits can't be driven high.",
    pattern: [0xFF],
    expectedBehavior: "All bytes read back as 0xFF",
    detectsFaults: ["Stuck-at-0 bit faults", "Addressing line stuck low", "Power delivery insufficient"],
  },
  {
    name: "Checkerboard (0x55)",
    description: "Write alternating 0/1 pattern (01010101). Detects adjacent-bit coupling faults.",
    pattern: [0x55],
    expectedBehavior: "All bytes read back as 0x55",
    detectsFaults: ["Adjacent bit coupling", "Data bus crosstalk", "Sense amplifier imbalance"],
  },
  {
    name: "Inverse checkerboard (0xAA)",
    description: "Write inverse alternating 1/0 pattern (10101010). Complement of checkerboard test.",
    pattern: [0xAA],
    expectedBehavior: "All bytes read back as 0xAA",
    detectsFaults: ["Adjacent bit coupling (inverse)", "Data bus crosstalk (inverse)", "Sense amplifier bias"],
  },
  {
    name: "Walking ones",
    description: "Write a single 1 bit that walks across the byte (0x01, 0x02, 0x04... 0x80). Tests each bit position independently.",
    pattern: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
    expectedBehavior: "Each byte position reads back with exactly one bit set",
    detectsFaults: ["Individual bit line faults", "Decoder faults", "Single bit cell failures"],
  },
  {
    name: "Walking zeros",
    description: "Write a single 0 bit that walks across the byte (0xFE, 0xFD, 0xFB... 0x7F). Complement of walking ones.",
    pattern: [0xFE, 0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F],
    expectedBehavior: "Each byte position reads back with exactly one bit cleared",
    detectsFaults: ["Individual bit line faults (inverse)", "Decoder faults", "Cell leakage"],
  },
  {
    name: "Address-as-data",
    description: "Write the address value as data (addr & 0xFF). Detects address line faults where multiple addresses map to same physical cell.",
    pattern: [],
    expectedBehavior: "Each address reads back its own address value (low byte)",
    detectsFaults: ["Address line faults", "Address decoder failures", "Aliasing (multiple addresses map to one cell)"],
  },
  {
    name: "Inverse address-as-data",
    description: "Write the inverse of address value (~addr & 0xFF). Complement test for address lines.",
    pattern: [],
    expectedBehavior: "Each address reads back the bitwise inverse of its address (low byte)",
    detectsFaults: ["Address line stuck faults", "Address decoder complement failures"],
  },
  {
    name: "March C- ascending",
    description: "Industry-standard March test: write 0, then walk up reading 0/writing 1, walk up reading 1/writing 0, verify all 0. Detects coupling faults between cells.",
    pattern: [0x00, 0xFF],
    expectedBehavior: "All transitions complete without mismatch",
    detectsFaults: ["State coupling faults", "Transition faults", "Linked cell failures", "Write recovery time issues"],
  },
  {
    name: "Random seed",
    description: "Write pseudo-random sequence (LFSR-based), read back and verify. Catches faults that fixed patterns miss.",
    pattern: [],
    expectedBehavior: "Random sequence matches on readback",
    detectsFaults: ["Pattern-sensitive faults", "Complex coupling faults", "Intermittent bit failures"],
  },
  {
    name: "Retention test",
    description: "Write pattern, wait, read back. Detects cells that lose charge over time (weak cells).",
    pattern: [0xFF, 0x00],
    expectedBehavior: "Data retained after delay period",
    detectsFaults: ["Weak cell retention", "Charge leakage", "Refresh timing issues", "Temperature-dependent cell weakness"],
  },
  {
    name: "Burst boundary",
    description: "Write different patterns at burst-length boundaries (e.g., every 32/64 bytes). Detects burst controller and column address faults.",
    pattern: [0xA5, 0x5A],
    expectedBehavior: "Pattern changes at correct burst boundaries",
    detectsFaults: ["Burst length controller faults", "Column address counter errors", "Prefetch buffer errors"],
  },
];

export interface MemoryFaultDiagnosis {
  fault: string;
  severity: "critical" | "degraded" | "minor";
  affectedComponent: string;
  repairOptions: string[];
}

export const MEMORY_FAULT_DIAGNOSES: MemoryFaultDiagnosis[] = [
  {
    fault: "Single VRAM chip failure",
    severity: "critical",
    affectedComponent: "Individual GDDR chip (identified by which bits fail in test pattern)",
    repairOptions: [
      "Replace individual VRAM chip with matching specification (same vendor, speed grade, density)",
      "BGA reball and reflow of suspected chip (if solder joint issue rather than chip failure)",
      "GPU card replacement if VRAM is not individually replaceable (BGA-direct packages)",
    ],
  },
  {
    fault: "Multiple VRAM chips failing",
    severity: "critical",
    affectedComponent: "VRAM power rail or memory controller",
    repairOptions: [
      "Check VRAM voltage rail (MVDD/MVDDQ) — should be ~1.35V for GDDR6, ~1.25V for GDDR6X",
      "Measure each VRAM chip power pin for correct voltage under load",
      "Memory controller failure on GPU die — GPU replacement required",
    ],
  },
  {
    fault: "Address line fault",
    severity: "critical",
    affectedComponent: "PCB trace between GPU and VRAM or VRAM address decoder",
    repairOptions: [
      "Inspect PCB traces for physical damage, cracks, or corrosion",
      "Check for cold solder joints on GPU BGA (address lines routed through GPU)",
      "GPU reball may fix if address line issue is at GPU BGA ball",
    ],
  },
  {
    fault: "Intermittent bit errors under load",
    severity: "degraded",
    affectedComponent: "VRAM thermal or signal integrity issue",
    repairOptions: [
      "Replace VRAM thermal pads — ensure correct thickness for full contact with heatsink",
      "Reduce memory clock to lower signaling stress (may extend usable life)",
      "Check VRAM voltage ripple with oscilloscope — excessive ripple causes bit errors",
    ],
  },
  {
    fault: "Capacity mismatch (reports less VRAM than expected)",
    severity: "degraded",
    affectedComponent: "VRAM chip initialization or VBIOS memory mapping",
    repairOptions: [
      "Reflash VBIOS with correct configuration for installed VRAM",
      "Check if VRAM chip is dead (completely non-responsive chips reduce detected capacity)",
      "Verify all VRAM chips have power and ground connections (probe with multimeter)",
    ],
  },
  {
    fault: "Memory clock instability",
    severity: "minor",
    affectedComponent: "VRAM termination resistors or PLL circuit",
    repairOptions: [
      "Reduce memory overclock to stock speeds",
      "Check VRAM VTT termination voltage (should be half of MVDD)",
      "Replace VRAM decoupling capacitors near clock input pins",
      "VBIOS mod to adjust memory timing straps for stability",
    ],
  },
  {
    fault: "ECC errors accumulating (datacenter/workstation GPUs)",
    severity: "degraded",
    affectedComponent: "VRAM or HBM cell degradation",
    repairOptions: [
      "Monitor ECC error rate — isolated correctable errors are normal",
      "Uncorrectable errors indicate chip failure — identify and replace affected HBM stack",
      "Reduce memory clock to lower error rate as interim measure",
      "For HBM: not field-replaceable — GPU module replacement required",
    ],
  },
];

export function lookupVramChip(query: string): VramInfo[] {
  const q = query.toLowerCase();
  return VRAM_CHIPS.filter(c =>
    c.manufacturer.toLowerCase().includes(q) ||
    c.type.toLowerCase().includes(q) ||
    c.markings.toLowerCase().includes(q)
  );
}

export function diagnoseMemoryFault(failedTests: string[]): MemoryFaultDiagnosis[] {
  const results: MemoryFaultDiagnosis[] = [];

  const hasAddressFault = failedTests.some(t =>
    t.includes("address") || t.includes("Address") || t.includes("aliasing")
  );
  const hasBitFault = failedTests.some(t =>
    t.includes("stuck") || t.includes("walking") || t.includes("checkerboard")
  );
  const hasRetention = failedTests.some(t =>
    t.includes("retention") || t.includes("Retention")
  );
  const hasMultiple = failedTests.length > 3;

  if (hasMultiple) {
    results.push(MEMORY_FAULT_DIAGNOSES.find(d => d.fault.includes("Multiple"))!);
  }
  if (hasAddressFault) {
    results.push(MEMORY_FAULT_DIAGNOSES.find(d => d.fault.includes("Address"))!);
  }
  if (hasBitFault && !hasMultiple) {
    results.push(MEMORY_FAULT_DIAGNOSES.find(d => d.fault.includes("Single"))!);
  }
  if (hasRetention) {
    results.push(MEMORY_FAULT_DIAGNOSES.find(d => d.fault.includes("Intermittent"))!);
  }

  if (results.length === 0 && failedTests.length > 0) {
    results.push(MEMORY_FAULT_DIAGNOSES.find(d => d.fault.includes("Single"))!);
  }

  return results;
}
