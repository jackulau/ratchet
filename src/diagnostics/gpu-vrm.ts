export interface VrmController {
  name: string;
  manufacturer: string;
  type: "pwm-controller" | "smart-power-stage" | "mosfet-driver" | "integrated";
  phases: string;
  inputVoltage: string;
  outputVoltage: string;
  commonGpus: string[];
  datasheet: string;
}

export interface VrmFaultSignature {
  id: string;
  controller: string;
  faultType: string;
  symptoms: string[];
  measurements: string[];
  commonCause: string;
  repairDifficulty: 1 | 2 | 3 | 4 | 5;
  repairNotes: string;
}

export const VRM_CONTROLLERS: VrmController[] = [
  {
    name: "IR35217",
    manufacturer: "Infineon (IR)",
    type: "pwm-controller",
    phases: "8+0 (up to 16 via doublers)",
    inputVoltage: "12V (PCIe)",
    outputVoltage: "0.5-1.1V",
    commonGpus: ["GTX 1070/1080", "GTX 1080 Ti", "RTX 2070/2080", "RX 580/590 (some)"],
    datasheet: "8-phase digital multi-phase PWM controller with I2C/PMBus. Intel IMVP8 compatible. SVI2 telemetry.",
  },
  {
    name: "IR35201",
    manufacturer: "Infineon (IR)",
    type: "pwm-controller",
    phases: "8+0",
    inputVoltage: "12V",
    outputVoltage: "0.25-1.52V",
    commonGpus: ["GTX 1060/1070", "RX 470/480/570/580 (reference)"],
    datasheet: "8-phase digital controller with NVM for configuration. I2C programming. Supports DrMOS/smart power stages.",
  },
  {
    name: "IR35204",
    manufacturer: "Infineon (IR)",
    type: "pwm-controller",
    phases: "4+0",
    inputVoltage: "12V",
    outputVoltage: "0.25-1.52V",
    commonGpus: ["GTX 1650", "GTX 1050 Ti", "RX 560", "Low-power GPU models"],
    datasheet: "4-phase digital controller. Subset of IR35201 feature set for lower-TDP GPUs.",
  },
  {
    name: "IR38163M",
    manufacturer: "Infineon (IR)",
    type: "smart-power-stage",
    phases: "1 (per package)",
    inputVoltage: "4.5-20V",
    outputVoltage: "Per controller",
    commonGpus: ["RTX 2070/2080 Super", "RTX 3060/3070 (some AIB models)"],
    datasheet: "60A integrated smart power stage with driver, high/low-side MOSFETs, current sense. Pairs with IR35217.",
  },
  {
    name: "NCP81610",
    manufacturer: "ON Semiconductor",
    type: "pwm-controller",
    phases: "6+2",
    inputVoltage: "12V",
    outputVoltage: "0.3-1.3V",
    commonGpus: ["RX 5700/5700 XT", "RX 6600/6700 (reference)", "AMD reference designs"],
    datasheet: "6+2 phase digital PWM controller. AMD SVI2/SVI3 interface. Integrated SVID for GPU communication.",
  },
  {
    name: "NCP302155",
    manufacturer: "ON Semiconductor",
    type: "smart-power-stage",
    phases: "1 (55A per package)",
    inputVoltage: "4.5-16V",
    outputVoltage: "Per controller",
    commonGpus: ["RX 6800/6900", "RX 7900 XTX (some)", "AMD high-end reference"],
    datasheet: "55A smart power stage with integrated driver, MOSFETs, and temperature sensor.",
  },
  {
    name: "MP2884A",
    manufacturer: "MPS (Monolithic Power Systems)",
    type: "pwm-controller",
    phases: "8+0",
    inputVoltage: "12V",
    outputVoltage: "0.4-1.3V",
    commonGpus: ["RTX 3060/3070 (FE)", "GTX 1660 (some)"],
    datasheet: "8-phase digital multi-phase converter with PMBus 1.2. Supports DrMOS power stages.",
  },
  {
    name: "MP2894",
    manufacturer: "MPS (Monolithic Power Systems)",
    type: "pwm-controller",
    phases: "16+0",
    inputVoltage: "12V",
    outputVoltage: "0.2-1.3V",
    commonGpus: ["RTX 3080/3090 (FE)", "RTX 4070/4080 (FE)"],
    datasheet: "16-phase digital controller. NV GPIO/I2C control. Used in NVIDIA Founders Edition high-end cards.",
  },
  {
    name: "MP8869S",
    manufacturer: "MPS (Monolithic Power Systems)",
    type: "integrated",
    phases: "1 (integrated MOSFET)",
    inputVoltage: "4.5-16V",
    outputVoltage: "0.6-5V",
    commonGpus: ["Memory VRM on RTX 2000/3000 series", "Auxiliary rails"],
    datasheet: "Single-phase integrated buck converter. Used for VRAM power (MVDD/MVDDQ) and auxiliary rails.",
  },
  {
    name: "uP9505",
    manufacturer: "uPI Semiconductor",
    type: "pwm-controller",
    phases: "5+0",
    inputVoltage: "12V",
    outputVoltage: "0.4-1.4V",
    commonGpus: ["GTX 1060 (various AIB)", "RX 570/580 (MSI, Gigabyte)", "Mid-range GPU models"],
    datasheet: "5-phase digital PWM controller. I2C interface. Popular in mid-range AIB partner designs.",
  },
  {
    name: "uP9512P",
    manufacturer: "uPI Semiconductor",
    type: "pwm-controller",
    phases: "8+0",
    inputVoltage: "12V",
    outputVoltage: "0.3-1.5V",
    commonGpus: ["RTX 2060 (Zotac, Galax)", "RX 5600 XT (some AIBs)"],
    datasheet: "8-phase PWM controller with SVI2 support. Used in various AIB partner designs.",
  },
  {
    name: "RAA229132",
    manufacturer: "Renesas (Intersil)",
    type: "pwm-controller",
    phases: "16+0",
    inputVoltage: "12V",
    outputVoltage: "0.2-1.52V",
    commonGpus: ["RTX 4080/4090 (ASUS, MSI high-end)", "RX 7900 XTX (some AIBs)"],
    datasheet: "16-phase digital multi-phase controller. PMBus 1.3 rev. Telemetry with per-phase current reporting.",
  },
  {
    name: "RAA228236",
    manufacturer: "Renesas (Intersil)",
    type: "smart-power-stage",
    phases: "1 (70A per package)",
    inputVoltage: "4.5-16V",
    outputVoltage: "Per controller",
    commonGpus: ["RTX 4080/4090 (high-end AIB)", "Used with RAA229132"],
    datasheet: "70A smart power stage. Integrated current sense, temp sensor, and MOSFET protection.",
  },
  {
    name: "TDA21472",
    manufacturer: "Infineon",
    type: "smart-power-stage",
    phases: "1 (70A per package)",
    inputVoltage: "4.5-16V",
    outputVoltage: "Per controller",
    commonGpus: ["RTX 3080/3090 (high-end AIB — EVGA, ASUS Strix)", "RX 6900 XT (some)"],
    datasheet: "70A OptiMOS smart power stage with integrated driver and current/temp sense.",
  },
  {
    name: "ISL69269",
    manufacturer: "Renesas (Intersil)",
    type: "pwm-controller",
    phases: "8+0 (up to 12 via doublers)",
    inputVoltage: "12V",
    outputVoltage: "0.25-1.52V",
    commonGpus: ["RTX 2080 Ti (FE)", "RTX 2070 (some AIBs)", "NVIDIA Turing reference"],
    datasheet: "8-phase digital multi-phase controller with NVM. I2C/PMBus. Used in Turing generation reference designs.",
  },
  {
    name: "ISL95870",
    manufacturer: "Renesas (Intersil)",
    type: "mosfet-driver",
    phases: "1 (per package)",
    inputVoltage: "12V",
    outputVoltage: "Per controller",
    commonGpus: ["GTX 900 series", "GTX 1000 series (some)"],
    datasheet: "Single-phase MOSFET driver for buck converters. Drives external high/low-side MOSFETs.",
  },
];

export const VRM_FAULT_SIGNATURES: VrmFaultSignature[] = [
  {
    id: "vrm-001",
    controller: "Any",
    faultType: "No output voltage — VRM not starting",
    symptoms: [
      "GPU not detected in system",
      "No display output",
      "Fan may spin briefly then stop",
      "GPU die cold — no heat generated",
    ],
    measurements: [
      "Check 12V at PCIe connector pins — should be 12V ± 0.6V",
      "Check VRM ENABLE pin — should go high during power-on (3.3V or 5V)",
      "Check VRM output — should be GPU core voltage (0.6-1.1V typically)",
      "If ENABLE high but no output: VRM controller dead or PGOOD fault",
    ],
    commonCause: "VRM controller IC failure, often from overcurrent event or power surge. Also check if ENABLE signal from GPU is present — GPU die failure can prevent VRM startup.",
    repairDifficulty: 4,
    repairNotes: "Replace VRM controller IC. Requires hot air rework station. Verify ENABLE signal path from GPU first — if GPU die is dead, replacing VRM won't help.",
  },
  {
    id: "vrm-002",
    controller: "Any",
    faultType: "Overvoltage — VRM outputting too high",
    symptoms: [
      "GPU dies on startup (further damage from overvoltage)",
      "Burning smell from GPU area",
      "GPU was working, now dead after VRM failure",
      "Multimeter shows >1.5V on GPU core rail",
    ],
    measurements: [
      "IMMEDIATELY check VRM output voltage before powering on",
      "Should be 0.6-1.1V for GPU core — anything above 1.5V is dangerous",
      "Check feedback resistor divider — open/shifted resistor causes high output",
      "Check sense lines from GPU to VRM — broken sense = VRM maxes output",
    ],
    commonCause: "Failed voltage sense resistor, cracked feedback trace, or VRM controller stuck at max duty cycle. Often causes GPU die death as secondary failure.",
    repairDifficulty: 5,
    repairNotes: "GPU may already be dead from overvoltage. Check VRM output BEFORE applying power. Replace VRM controller and inspect feedback network. GPU die likely needs replacement too.",
  },
  {
    id: "vrm-003",
    controller: "Any multi-phase",
    faultType: "Phase imbalance — uneven current sharing",
    symptoms: [
      "One VRM MOSFET significantly hotter than others",
      "GPU artifacts or crashes under heavy load only",
      "Thermal shutdown during benchmark/gaming",
      "Power consumption lower than expected at same clock",
    ],
    measurements: [
      "Thermal camera: identify hottest phase (should all be within 10°C)",
      "Oscilloscope on phase nodes: compare current waveforms",
      "Check inductor DCR — damaged inductor changes current share",
      "Check MOSFET Rds(on) — degraded MOSFET pulls less current",
    ],
    commonCause: "Degraded MOSFET in one phase increasing Rds(on), causing other phases to compensate. Also caused by damaged inductor or current sense resistor drift.",
    repairDifficulty: 3,
    repairNotes: "Identify and replace the degraded power stage (MOSFET/DrMOS/smart power stage). Use thermal camera to find the outlier phase.",
  },
  {
    id: "vrm-004",
    controller: "Any",
    faultType: "Excessive output ripple/noise",
    symptoms: [
      "Screen artifacts that worsen under load",
      "Memory errors in GPU stress tests",
      "GPU clock instability — drops unexpectedly",
      "Audio buzzing/coil whine from GPU area",
    ],
    measurements: [
      "Oscilloscope on VRM output: check for >50mV ripple (typically <30mV acceptable)",
      "Check at high frequency (>100MHz BW scope needed for transient spikes)",
      "Compare ripple magnitude across load levels",
      "Check output capacitor ESR — high ESR = more ripple",
    ],
    commonCause: "Failed or degraded output capacitors (MLCCs or electrolytic). Missing phase (dead phase controller). Inductor saturation at high current.",
    repairDifficulty: 3,
    repairNotes: "Replace output capacitors (use same value and type — typically 22uF-100uF MLCC or 470uF polymer). If phase is dead, replace power stage.",
  },
  {
    id: "vrm-005",
    controller: "Any",
    faultType: "Short to ground on output rail",
    symptoms: [
      "GPU card draws excessive current immediately on power-on",
      "12V rail sags when card is installed",
      "PSU may shut down from overcurrent",
      "Card was working, then sudden failure",
    ],
    measurements: [
      "WITH CARD UNPOWERED: measure resistance from VRM output to ground",
      "Normal: >10 ohms. Shorted: <1 ohm",
      "Remove card from system before measuring",
      "If shorted: isolate — is it MOSFET, GPU die, or capacitor?",
    ],
    commonCause: "Failed low-side MOSFET (shorted drain-source). GPU die internal short. Ceramic capacitor cracked and shorted (often from PCB flex).",
    repairDifficulty: 4,
    repairNotes: "Isolate fault location: remove output caps one at a time, check if short clears. If short remains with caps removed, either MOSFET or GPU die is shorted. Use thermal method (low current, find hot spot) to locate.",
  },
  {
    id: "vrm-006",
    controller: "Any",
    faultType: "Overcurrent shutdown — VRM hitting OCP",
    symptoms: [
      "GPU crashes during heavy load (benchmark, mining, rendering)",
      "Event log shows TDR (Timeout Detection and Recovery)",
      "Card works at stock but crashes when overclocked",
      "Works in low-power applications (desktop, video), fails under 3D load",
    ],
    measurements: [
      "Monitor GPU power draw (software: GPU-Z, HWiNFO)",
      "Check if power draw exceeds card TDP rating",
      "Oscilloscope on individual phase currents — check for >rated current per phase",
      "Check VRM temperature — OCP threshold lowers at high temp",
    ],
    commonCause: "GPU drawing more current than VRM can deliver. Often caused by degraded thermal paste causing higher clocks to maintain temp target. Also: OCP threshold set too low in VBIOS, or one phase dead shifting load to remaining phases.",
    repairDifficulty: 2,
    repairNotes: "First: repaste GPU and clean heatsink. If still tripping OCP: check phase count (dead phase = less total current capacity). Power limit may need adjustment in VBIOS.",
  },
  {
    id: "vrm-007",
    controller: "IR35217",
    faultType: "IR35217 communication failure — no I2C response",
    symptoms: [
      "GPU detected but no frequency/voltage control available",
      "NVIDIA GPU Boost not functioning",
      "Fixed low clock speed regardless of load",
      "VRM monitoring shows 0 values in HWiNFO",
    ],
    measurements: [
      "Check I2C/SDA/SCL lines with oscilloscope for communication",
      "Verify IR35217 power supply pins (VCC = 5V, PVCC = 12V)",
      "Check for stuck I2C bus (SDA/SCL held low)",
    ],
    commonCause: "IR35217 IC partially failed — power section works but digital interface dead. Corrupted NVM configuration. I2C pull-up resistor failure.",
    repairDifficulty: 4,
    repairNotes: "Replace IR35217 IC. If replacement also fails at I2C: check pull-up resistors on SDA/SCL lines and verify GPU die is sending valid commands.",
  },
  {
    id: "vrm-008",
    controller: "NCP81610",
    faultType: "NCP81610 SVI2 communication loss",
    symptoms: [
      "AMD GPU stuck at low voltage/frequency",
      "No GPU boost behavior",
      "GPU detected but very low performance",
    ],
    measurements: [
      "Check SVC (SVI2 clock) and SVD (SVI2 data) lines between GPU and NCP81610",
      "SVI2 uses open-drain protocol — check pull-ups (typically 1K to 1.8V)",
      "Verify NCP81610 has correct supply voltage on VCC5 pin",
    ],
    commonCause: "SVI2 interface failure — often a cold solder joint on the NCP81610 or a failed pull-up resistor on SVC/SVD lines.",
    repairDifficulty: 4,
    repairNotes: "Reflow NCP81610. Check SVI2 pull-up resistors (tiny SMD, easily damaged). Replace NCP81610 if reflow doesn't fix communication.",
  },
  {
    id: "vrm-009",
    controller: "Any",
    faultType: "VRAM VRM failure — memory voltage absent",
    symptoms: [
      "GPU boots but shows artifacts from the start (even in BIOS)",
      "Memory errors in all test patterns",
      "GPU works at very low memory clock but crashes at stock",
      "Some VRAM chips hot, others cold",
    ],
    measurements: [
      "Check MVDD rail — should be ~1.35V for GDDR6, ~1.25V for GDDR6X",
      "Check MVDDQ rail — should be ~1.35V for GDDR6",
      "Measure at capacitors near each VRAM chip",
      "If voltage low or absent: trace back to memory VRM (usually MP8869S or similar)",
    ],
    commonCause: "Memory VRM IC failure (MP8869S, RT8120, etc.). Failed output inductor or capacitor on memory rail. Sometimes caused by VRAM chip short pulling rail down.",
    repairDifficulty: 3,
    repairNotes: "Check VRAM voltage at caps near each chip. If voltage present at some chips but not others: PCB trace issue. If no voltage at all: memory VRM IC needs replacement.",
  },
  {
    id: "vrm-010",
    controller: "Any",
    faultType: "Coil whine — inductor vibration",
    symptoms: [
      "High-pitched buzzing from GPU under load",
      "Sound changes with GPU load/frequency",
      "More noticeable at high FPS (500+ in menus)",
      "Not a functional failure but annoying",
    ],
    measurements: [
      "Identify vibrating inductor by touching each with wooden stick (sound changes)",
      "Check if specific load patterns trigger worse whine (frame cap to 60 may help)",
      "Measure PWM switching frequency — some frequencies resonate more",
    ],
    commonCause: "Inductor magnetostriction — core material vibrates at PWM switching frequency. Worse with rapid load transitions (frame rate spikes). Manufacturing variation makes some cards worse.",
    repairDifficulty: 2,
    repairNotes: "Apply adhesive to inductor to dampen vibration. Frame-cap in games reduces load transitions. Replacing inductors rarely helps (same part will whine). Some users add thermal pad on top of inductors to dampen.",
  },
  {
    id: "vrm-011",
    controller: "Any",
    faultType: "Bootstrap capacitor failure — high-side driver won't turn on",
    symptoms: [
      "Missing phase in VRM (thermal imaging shows one cold MOSFET)",
      "GPU works but at reduced performance/power",
      "Artifacts at high load (remaining phases overloaded)",
    ],
    measurements: [
      "Check bootstrap capacitor voltage (should charge to ~5V during low-side on-time)",
      "Scope: check high-side gate drive waveform — should be a clean square wave",
      "If no high-side switching: bootstrap cap or diode failed",
    ],
    commonCause: "Bootstrap capacitor (small MLCC near MOSFET gate) cracked or short. Bootstrap diode failed open. Phase appears dead but controller still outputs PWM.",
    repairDifficulty: 3,
    repairNotes: "Replace bootstrap capacitor (typically 100nF-1uF MLCC, same voltage rating). Check bootstrap diode if cap replacement doesn't fix.",
  },
  {
    id: "vrm-012",
    controller: "Any",
    faultType: "MOSFET gate driver failure — phase stuck",
    symptoms: [
      "One phase MOSFET extremely hot even at idle",
      "Or: one phase cold (not switching)",
      "Reduced power delivery — GPU throttles early",
    ],
    measurements: [
      "Scope: check gate drive signal on suspect MOSFET (should be clean PWM)",
      "If gate stuck high: MOSFET always on, creating shoot-through or DC output",
      "If gate stuck low: MOSFET never turns on, phase inactive",
      "Check driver IC power supply (VCC)",
    ],
    commonCause: "Gate driver IC (or integrated driver in DrMOS) partially failed. Often after a transient overcurrent event. Can also be a cracked PCB trace to gate pin.",
    repairDifficulty: 4,
    repairNotes: "For DrMOS/smart power stages: replace entire package. For discrete driver + MOSFET: replace driver IC first, then MOSFET if driver was stuck and may have damaged MOSFET.",
  },
  {
    id: "vrm-013",
    controller: "MP2884A / MP2894",
    faultType: "MPS controller NVM corruption — wrong phase config",
    symptoms: [
      "GPU was working, suddenly crashes or won't boot",
      "VRM outputs wrong voltage after a firmware update or power event",
      "Phase count changed (fewer phases active)",
    ],
    measurements: [
      "Read NVM registers via I2C (if possible) — compare to known-good config",
      "Check output voltage — if wrong for GPU spec, NVM likely corrupted",
      "Count active phases via thermal imaging — should match card design (e.g., 8 on RTX 3070)",
    ],
    commonCause: "NVM corruption in MPS controller from power glitch during VRM configuration. Can happen after VBIOS flash or power failure during initialization.",
    repairDifficulty: 5,
    repairNotes: "NVM needs reprogramming via I2C. Requires MPS evaluation software and USB-I2C adapter. Alternative: replace controller IC with pre-programmed unit from donor card.",
  },
  {
    id: "vrm-014",
    controller: "Any",
    faultType: "PCIe 12V input fuse blown",
    symptoms: [
      "GPU fans don't spin",
      "GPU not detected in system at all",
      "Card was working, sudden failure (possibly during power supply failure)",
      "Other cards work in same slot",
    ],
    measurements: [
      "Check continuity through PCIe 12V input fuse (small SMD fuse near edge connector or power connector)",
      "If open: fuse blown — something caused overcurrent",
      "Measure PCIe slot 12V with another card to verify slot is OK",
    ],
    commonCause: "Power supply failure sent voltage spike. Short circuit downstream blew fuse as protection. Sometimes fuse blows from marginal PSU causing ripple.",
    repairDifficulty: 2,
    repairNotes: "Replace SMD fuse with same rating (typically 10-15A). BEFORE replacing: find and fix the downstream short or it will blow again. Check VRM MOSFETs for shorts.",
  },
  {
    id: "vrm-015",
    controller: "Any",
    faultType: "Auxiliary voltage rail failure (1.8V / 0.9V / PLL)",
    symptoms: [
      "GPU detected but no display output",
      "GPU fails POST checks",
      "GPU clock doesn't lock — unstable frequencies",
      "GPU works in 2D mode but fails transitioning to 3D",
    ],
    measurements: [
      "Check auxiliary rails: 1.8V (I/O), 0.9V (PLL), 3.3V (PCIe interface)",
      "These are often small LDOs or buck converters separate from main VRM",
      "Missing PLL voltage = clock can't synthesize = no GPU operation",
    ],
    commonCause: "Small auxiliary voltage regulator (LDO or single-phase buck) failed. Often overlooked because focus goes to main VRM. LDO failure is common from overcurrent during GPU boot sequence.",
    repairDifficulty: 3,
    repairNotes: "Identify which auxiliary rail is missing. These are usually small SOT-23 or DFN LDOs — replace with same part number. Check output capacitor too.",
  },
  {
    id: "vrm-016",
    controller: "uP9505",
    faultType: "uP9505 stuck in protection mode",
    symptoms: [
      "GPU power LED on but no function",
      "VRM output present briefly then drops to 0V",
      "Repeating power-on attempt cycle (1-2 second intervals)",
    ],
    measurements: [
      "Scope: check VRM output — rises then drops = OCP/OVP tripping",
      "Check PGOOD signal — should go high and stay high",
      "If PGOOD pulses: protection is tripping repeatedly",
      "Measure output capacitor bank for shorts",
    ],
    commonCause: "Protection circuit latched due to transient overcurrent or voltage spike. Sometimes caused by cracked ceramic output capacitor developing an intermittent short.",
    repairDifficulty: 3,
    repairNotes: "Remove output capacitors one at a time — if a cracked cap is shorting, removing it will clear the fault. Check for thermal damage on VRM output network.",
  },
  {
    id: "vrm-017",
    controller: "RAA229132",
    faultType: "RAA229132 telemetry mismatch — power reporting error",
    symptoms: [
      "GPU reports incorrect power consumption in monitoring software",
      "Card draws more power than software reports (measured at wall)",
      "Power limit throttling at lower clocks than expected",
    ],
    measurements: [
      "Compare software-reported power (GPU-Z) to actual at-wall measurement",
      "Check per-phase telemetry via I2C if accessible",
      "Verify current sense resistor values (may have drifted)",
    ],
    commonCause: "Current sense resistor drift or replacement with wrong value during repair. Also: PMBus calibration corrupted in NVM. Some AIBs intentionally shift telemetry ('power limit shunt mod').",
    repairDifficulty: 3,
    repairNotes: "Verify current sense resistors match schematic values (typically 1-5 milliohm). If wrong: replace with correct value. If intentional mod: recalibrate via PMBus or reflash VRM NVM.",
  },
  {
    id: "vrm-018",
    controller: "Any",
    faultType: "Input capacitor failure — 12V rail noise",
    symptoms: [
      "GPU intermittently crashes or has artifacts",
      "Worse with certain PSU models",
      "Visible damage or bulging on large capacitors near PCIe power connector",
      "Burning smell from input capacitor area",
    ],
    measurements: [
      "Visual inspection: check for bulging, leaking, or cracked input capacitors",
      "Scope: check 12V input ripple — should be <100mV (higher = cap failure)",
      "ESR test on suspect capacitors (desolder to test accurately)",
    ],
    commonCause: "Input electrolytic or polymer capacitors degraded from heat cycling. More common on older cards or cards run in hot environments. Poor quality capacitors in budget designs.",
    repairDifficulty: 2,
    repairNotes: "Replace input capacitors with same or better rated parts. Use low-ESR polymer or solid capacitors for improvement. Common upgrade: replace electrolytic with polymer caps.",
  },
];

export function lookupVrmController(query: string): VrmController | undefined {
  const q = query.toLowerCase();
  return VRM_CONTROLLERS.find(c =>
    c.name.toLowerCase().includes(q) ||
    c.manufacturer.toLowerCase().includes(q) ||
    c.commonGpus.some(g => g.toLowerCase().includes(q))
  );
}

export function getVrmFaultsForController(controllerName: string): VrmFaultSignature[] {
  const q = controllerName.toLowerCase();
  return VRM_FAULT_SIGNATURES.filter(f =>
    f.controller.toLowerCase().includes(q) || f.controller === "Any" || f.controller.startsWith("Any")
  );
}

export function searchVrmFaults(query: string): VrmFaultSignature[] {
  const words = query.toLowerCase().split(/\s+/);
  const scored: Array<{ sig: VrmFaultSignature; score: number }> = [];

  for (const sig of VRM_FAULT_SIGNATURES) {
    let score = 0;
    const text = [
      sig.faultType,
      ...sig.symptoms,
      sig.commonCause,
      sig.controller,
    ].join(" ").toLowerCase();

    for (const word of words) {
      if (text.includes(word)) score += word.length;
    }

    if (score > 0) scored.push({ sig, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.sig);
}
