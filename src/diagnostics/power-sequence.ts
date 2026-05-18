export interface PowerStage {
  name: string;
  order: number;
  description: string;
  voltageRails: string[];
  observableSignals: string[];
  failureSymptoms: string[];
  diagnosticChecks: string[];
}

export interface PowerSymptoms {
  psuFanSpins?: boolean;
  cpuFanSpins?: boolean;
  boardLeds?: boolean;
  postBeeps?: boolean;
  displayOutput?: boolean;
  driveActivity?: boolean;
  usbPower?: boolean;
}

export interface PowerAnalysisResult {
  stage: PowerStage;
  confidence: number;
  reasoning: string;
  nextChecks: string[];
}

export const POWER_STAGES: PowerStage[] = [
  {
    name: "Standby (5VSB)",
    order: 1,
    description: "PSU provides 5V standby power whenever plugged in, even when system is 'off'. Powers wake-on-LAN, USB charging, motherboard standby LED, and power button circuit.",
    voltageRails: ["5VSB (purple wire, 24-pin pin 9)"],
    observableSignals: [
      "Motherboard standby LED (usually green or amber)",
      "PSU fan may spin briefly when first plugged in",
      "USB ports may provide power",
    ],
    failureSymptoms: [
      "No motherboard LED at all",
      "Power button has no effect",
      "Completely dead system",
    ],
    diagnosticChecks: [
      "Check wall outlet with a known-good device",
      "Verify PSU switch is ON (I, not O)",
      "Measure 5VSB at 24-pin pin 9 (purple) to pin GND — should read 5.0V ±5%",
      "Try different power cable (IEC C13)",
      "Paperclip test: short PS_ON (green, pin 16) to GND — PSU fan should spin",
    ],
  },
  {
    name: "PSU Enable (PS_ON)",
    order: 2,
    description: "Power button press pulls PS_ON signal low. PSU turns on all voltage rails (+3.3V, +5V, +12V, -12V). PSU fan starts spinning.",
    voltageRails: ["+12V (yellow)", "+5V (red)", "+3.3V (orange)", "-12V (blue)"],
    observableSignals: [
      "PSU fan starts spinning",
      "All case fans may briefly spin",
      "Motherboard RGB/LEDs activate",
    ],
    failureSymptoms: [
      "Standby LED on but pressing power button does nothing",
      "Brief click from PSU then nothing",
      "PSU clicking/ticking repeatedly",
    ],
    diagnosticChecks: [
      "Short power button header pins directly (bypass front panel)",
      "Measure PS_ON signal: should go from 5V to <1V when power button pressed",
      "Check EPS12V (CPU 8-pin) is connected — some boards won't enable without it",
      "Disconnect everything except 24-pin and EPS 8-pin, try again",
      "If PSU clicks: OCP/SCP triggered — motherboard may have a short",
    ],
  },
  {
    name: "Power Good (PWR_OK)",
    order: 3,
    description: "PSU asserts Power Good signal (100-500ms after PS_ON) once all voltage rails are stable and within spec. CPU held in reset until PWR_OK goes high.",
    voltageRails: ["All rails stable", "PWR_OK (gray wire, 24-pin pin 8)"],
    observableSignals: [
      "CPU fan starts spinning at full speed briefly",
      "All fans ramp up",
      "Board power LEDs fully illuminate",
    ],
    failureSymptoms: [
      "Fans spin for a fraction of a second then stop",
      "System cycles on/off rapidly (every 1-2 seconds)",
      "PSU shutting down due to fault condition",
    ],
    diagnosticChecks: [
      "Measure PWR_OK at 24-pin pin 8 (gray) — should go HIGH (3.3-5V) after power on",
      "If PWR_OK never goes high: PSU is detecting a fault",
      "Measure +12V, +5V, +3.3V at 24-pin — all must be within ±5%",
      "Disconnect components one by one to find what causes PSU fault",
      "Common: shorted VRM MOSFET draws too much 12V, PSU OCP trips",
    ],
  },
  {
    name: "CPU VRM & Reset",
    order: 4,
    description: "Motherboard VRM converts 12V to CPU core voltage (Vcore, typically 0.7-1.4V). CPU released from reset, begins executing from flash at reset vector (0xFFFFFFF0).",
    voltageRails: ["Vcore (0.7-1.4V)", "VCCSA/VCCIO (Intel)", "SOC voltage (AMD)"],
    observableSignals: [
      "CPU fan spins and stays on",
      "System stays on (not cycling)",
      "No display yet — CPU hasn't initialized video",
    ],
    failureSymptoms: [
      "Fans spin 1-3 seconds then shut down",
      "VRM MOSFETs extremely hot after brief power-on",
      "Burning smell from VRM area",
    ],
    diagnosticChecks: [
      "Measure Vcore at the VRM output caps (near CPU socket) — should be 0.7-1.4V",
      "Feel VRM heatsink temperature — warm is normal, burn-hot is failure",
      "Check for bent CPU pins (Intel LGA: socket, AMD PGA: CPU)",
      "Try reseating CPU",
      "If Vcore is 0V: VRM failure or CPU dead short",
    ],
  },
  {
    name: "Memory Initialization (MRC)",
    order: 5,
    description: "CPU Memory Reference Code (MRC) trains memory channels. Reads SPD from DIMMs, configures timing, performs write-leveling and read-leveling. This stage can take 10-60 seconds, especially DDR5.",
    voltageRails: ["VDDQ (DDR voltage: 1.2V DDR4, 1.1V DDR5)", "VPP (2.5V for DDR4)"],
    observableSignals: [
      "System stays on but no display",
      "Board may reboot 1-3 times during training (normal for DDR5)",
      "POST code on debug LED changes through memory codes",
      "May take up to 3 minutes on first boot or after CMOS clear",
    ],
    failureSymptoms: [
      "POST code stuck on memory-related code (AMI: 0x21-0x29, UEFI: 0x14-0x19)",
      "Board keeps rebooting endlessly",
      "One long beep pattern (AMI memory error beep)",
    ],
    diagnosticChecks: [
      "Try one DIMM at a time in the primary slot (usually A2 or second from CPU)",
      "Try different DIMM modules — rule out bad stick",
      "Clear CMOS and try again — removes failed training data",
      "Check DIMM type matches board: DDR4 vs DDR5, ECC vs non-ECC",
      "Clean DIMM contacts with isopropyl alcohol and lint-free cloth",
      "Check CPU spec: Intel 12th gen K CPUs support DDR4 OR DDR5, not both on same board",
    ],
  },
  {
    name: "PCH/Chipset Init",
    order: 6,
    description: "Platform Controller Hub (PCH) initializes: SATA, USB, LAN, audio, PCIe. Intel ME firmware starts. PCI Express links trained.",
    voltageRails: ["PCH 1.05V core", "PCH 1.8V I/O"],
    observableSignals: [
      "USB devices may briefly initialize (keyboard LEDs flash)",
      "Drive activity LED may blink",
      "Ethernet link LED may light",
    ],
    failureSymptoms: [
      "POST code stuck on PCH/SB codes (AMI: 0x37-0x39)",
      "Intel ME error messages",
      "Some peripherals not initializing",
    ],
    diagnosticChecks: [
      "Disconnect all SATA devices and USB devices (external)",
      "Remove all PCIe cards except GPU",
      "Check PCH heatsink is attached (if present)",
      "If Intel ME error: may need ME firmware region fix",
      "Check for blown fuse near PCH (small SMD components)",
    ],
  },
  {
    name: "PCI Enumeration & Video Init",
    order: 7,
    description: "BIOS enumerates PCI/PCIe devices, loads GPU option ROM or GOP driver. Display output begins. POST screen or OEM logo appears.",
    voltageRails: ["PCIe 12V (75W via slot)", "GPU auxiliary power (6/8-pin)"],
    observableSignals: [
      "Display turns on — POST screen, logo, or BIOS splash",
      "GPU fans spin up",
      "POST beep (1 short = success for AMI)",
    ],
    failureSymptoms: [
      "Fans spin, LEDs on, but no display output",
      "POST code stuck on PCI/GPU codes (AMI: 0x42-0x47, UEFI: 0x32-0x35)",
      "1 long 2 short beeps (AMI: video error)",
    ],
    diagnosticChecks: [
      "Try different video output: HDMI, DP, DVI",
      "Reseat GPU — clean PCIe gold contacts",
      "Connect GPU power cables (6-pin/8-pin)",
      "Try motherboard video output (if CPU has iGPU)",
      "Remove GPU, test with iGPU only",
      "Try GPU in a different PCIe slot",
    ],
  },
  {
    name: "POST Complete & Boot",
    order: 8,
    description: "POST complete. BIOS enumerates boot devices, hands off to OS bootloader via INT 19h (legacy) or ExitBootServices (UEFI).",
    voltageRails: ["All stable"],
    observableSignals: [
      "POST complete beep (1 short for AMI)",
      "Boot device activity (drive LED)",
      "OS loading screen appears",
      "BIOS setup accessible via DEL/F2",
    ],
    failureSymptoms: [
      "POST completes but no bootable device found",
      "OS loading fails with BSOD or kernel panic",
      "'Missing operating system' or 'No bootable device'",
    ],
    diagnosticChecks: [
      "Check BIOS boot order",
      "Verify boot drive is connected and detected in BIOS",
      "Check UEFI vs Legacy boot mode matches OS installation",
      "Try boot device in different SATA port or M.2 slot",
      "Boot from USB to verify hardware works — issue is OS/drive if USB boots fine",
    ],
  },
];

export function analyzePowerSequence(symptoms: PowerSymptoms): PowerAnalysisResult[] {
  const results: PowerAnalysisResult[] = [];

  if (symptoms.boardLeds === false && symptoms.psuFanSpins === false) {
    results.push({
      stage: POWER_STAGES[0],
      confidence: 0.95,
      reasoning: "No standby LED and no PSU fan — system has no standby power. PSU, power cable, or wall outlet issue.",
      nextChecks: POWER_STAGES[0].diagnosticChecks,
    });
    return results;
  }

  if (symptoms.boardLeds === true && symptoms.cpuFanSpins === false && symptoms.psuFanSpins === false) {
    results.push({
      stage: POWER_STAGES[1],
      confidence: 0.9,
      reasoning: "Standby LED on but nothing happens on power button press. PS_ON signal not reaching PSU.",
      nextChecks: POWER_STAGES[1].diagnosticChecks,
    });
    return results;
  }

  if (symptoms.cpuFanSpins === false && symptoms.psuFanSpins === true) {
    results.push({
      stage: POWER_STAGES[2],
      confidence: 0.7,
      reasoning: "PSU fan spins but CPU fan doesn't — Power Good may not be asserted, or CPU VRM not enabling.",
      nextChecks: [...POWER_STAGES[2].diagnosticChecks, ...POWER_STAGES[3].diagnosticChecks.slice(0, 3)],
    });
    return results;
  }

  if (symptoms.cpuFanSpins === true && symptoms.displayOutput === false && (symptoms.postBeeps === false || symptoms.postBeeps === undefined)) {
    results.push({
      stage: POWER_STAGES[4],
      confidence: symptoms.postBeeps === false ? 0.6 : 0.5,
      reasoning: "Fans spin but no display" + (symptoms.postBeeps === false ? " and no beeps" : "") + " — likely stuck in memory training or failed before video init.",
      nextChecks: POWER_STAGES[4].diagnosticChecks,
    });
    results.push({
      stage: POWER_STAGES[6],
      confidence: 0.4,
      reasoning: "Could also be video initialization failure — GPU or PCIe issue.",
      nextChecks: POWER_STAGES[6].diagnosticChecks,
    });
    return results;
  }

  if (symptoms.cpuFanSpins === true && symptoms.postBeeps === true && symptoms.displayOutput === false) {
    results.push({
      stage: POWER_STAGES[6],
      confidence: 0.85,
      reasoning: "Beep codes present but no display — past memory init, stuck at video/PCI enumeration.",
      nextChecks: POWER_STAGES[6].diagnosticChecks,
    });
    return results;
  }

  if (symptoms.displayOutput === true && symptoms.driveActivity === false) {
    results.push({
      stage: POWER_STAGES[7],
      confidence: 0.8,
      reasoning: "Display works but no drive activity — POST likely complete but no bootable device found.",
      nextChecks: POWER_STAGES[7].diagnosticChecks,
    });
    return results;
  }

  if (symptoms.cpuFanSpins === true && symptoms.displayOutput === true && symptoms.driveActivity === true) {
    results.push({
      stage: POWER_STAGES[7],
      confidence: 0.5,
      reasoning: "All observable signals present — system appears to be booting. Issue may be OS-level, not hardware.",
      nextChecks: ["Check if OS loads successfully", "If BSOD/panic: run memtest86", "Check storage health with SMART data"],
    });
    return results;
  }

  if (symptoms.usbPower === true && symptoms.cpuFanSpins === true && symptoms.displayOutput === false) {
    results.push({
      stage: POWER_STAGES[5],
      confidence: 0.5,
      reasoning: "USB has power and fans spin but no display — could be PCH initialization or memory training.",
      nextChecks: [...POWER_STAGES[4].diagnosticChecks.slice(0, 3), ...POWER_STAGES[5].diagnosticChecks.slice(0, 3)],
    });
    return results;
  }

  results.push({
    stage: POWER_STAGES[3],
    confidence: 0.3,
    reasoning: "Insufficient symptoms to pinpoint stage. Check each stage in order.",
    nextChecks: [
      "Check standby LED → if off, Stage 1 (5VSB)",
      "Press power button → if nothing, Stage 2 (PS_ON)",
      "Do fans spin and stay? → if brief, Stage 3/4 (PWR_OK/VRM)",
      "Any display? → if no, Stage 5-7 (MRC/PCH/Video)",
      "Boots but no OS? → Stage 8 (Boot)",
    ],
  });

  return results;
}
