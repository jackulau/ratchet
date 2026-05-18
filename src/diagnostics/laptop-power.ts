export interface LaptopPowerStage {
  name: string;
  order: number;
  rail: string;
  typicalVoltage: string;
  description: string;
  controlledBy: string;
  failureSymptoms: string[];
  diagnosticChecks: string[];
}

export interface LaptopPlatform {
  name: string;
  vendor: "intel" | "amd";
  codename: string;
  generation: string;
  powerSequence: LaptopPowerStage[];
}

export interface LaptopPowerSymptoms {
  chargerLed?: boolean;
  batteryCharges?: boolean;
  powerButtonResponse?: boolean;
  fanSpins?: boolean;
  screenBacklight?: boolean;
  displayOutput?: boolean;
  keyboardLights?: boolean;
  usbPower?: boolean;
}

export interface LaptopPowerAnalysis {
  suspectedStage: LaptopPowerStage;
  confidence: number;
  reasoning: string;
  nextChecks: string[];
}

const STANDBY_STAGE: LaptopPowerStage = {
  name: "Charger/Standby",
  order: 1,
  rail: "PPBUS_G3H / VIN",
  typicalVoltage: "19-20V (barrel) or 5-20V (USB-C PD)",
  description: "AC adapter provides input power. Charging IC negotiates voltage (USB-C PD) or passes through (barrel jack). EC and standby rails powered.",
  controlledBy: "Charger IC (ISL9240, BQ25700, ISL95338)",
  failureSymptoms: [
    "Charger LED off or wrong color",
    "No response at all when plugged in",
    "Charger gets very hot",
    "Battery not charging",
  ],
  diagnosticChecks: [
    "Measure charger output voltage at barrel jack or USB-C connector",
    "Check for shorts on main power rail (resistance to ground should be >100Ω)",
    "Inspect charger port/connector for damage or bent pins",
    "Check charger IC for thermal damage (discoloration, bulging caps nearby)",
    "Verify PD negotiation with USB-C power meter (if USB-C)",
  ],
};

const EC_STAGE: LaptopPowerStage = {
  name: "EC (Embedded Controller)",
  order: 2,
  rail: "+3VS / +3VALW",
  typicalVoltage: "3.3V always-on",
  description: "Embedded Controller powers up on standby rail. Controls power sequencing, keyboard, battery management. Must be running before power button works.",
  controlledBy: "EC chip (ITE IT8987E, Nuvoton NPCE985, MEC1705)",
  failureSymptoms: [
    "Power button completely unresponsive",
    "No keyboard backlight",
    "Battery LED doesn't light when charger plugged in",
    "No EC communication (can't read battery status)",
  ],
  diagnosticChecks: [
    "Check +3VALW rail at EC VCC pins — should read 3.3V",
    "Check EC crystal oscillator with oscilloscope (32.768 kHz)",
    "Check EC reset pin — should go high after power applied",
    "Verify EC SPI flash has valid firmware (check JEDEC ID of EC flash chip)",
    "Check for corrosion or liquid damage near EC",
  ],
};

function makeIntelPlatform(
  name: string, codename: string, generation: string,
  vccsa: string, vccio: string, vcore: string, vccgt: string,
  vrmChip: string,
): LaptopPlatform {
  return {
    name, vendor: "intel", codename, generation,
    powerSequence: [
      STANDBY_STAGE,
      EC_STAGE,
      {
        name: "VCCSA (System Agent)",
        order: 3,
        rail: "VCCSA",
        typicalVoltage: vccsa,
        description: "Powers the System Agent — memory controller, PCIe lanes, DMI bus. First CPU rail to come up.",
        controlledBy: `IMVP VRM (${vrmChip})`,
        failureSymptoms: [
          "Fan spins briefly then shuts off",
          "No POST, no display output",
          "Memory not detected",
        ],
        diagnosticChecks: [
          `Measure VCCSA at VRM output inductor — should read ${vccsa}`,
          "Check VRM MOSFET drain-source with diode mode (should read 0.4-0.6V)",
          "Inspect VRM inductors for cracks or burn marks",
          "Check VRM enable signal from PCH/EC",
        ],
      },
      {
        name: "VCCIO (I/O Voltage)",
        order: 4,
        rail: "VCCIO",
        typicalVoltage: vccio,
        description: "Powers I/O buffers — DDR interface, PCIe PHY, display interfaces. Comes up after VCCSA.",
        controlledBy: `IMVP VRM (${vrmChip})`,
        failureSymptoms: [
          "No display output but fans spin",
          "Memory errors or no memory detection",
          "PCIe devices not detected",
        ],
        diagnosticChecks: [
          `Measure VCCIO at VRM output — should read ${vccio}`,
          "Check DDR voltage rail (VDDQ) — related to VCCIO",
          "Check for cold solder joints on VRM components",
        ],
      },
      {
        name: "VCORE (CPU Core)",
        order: 5,
        rail: "VCORE / VCC",
        typicalVoltage: vcore,
        description: "Main CPU core voltage. Highest-power rail. Dynamically adjusts with load (DVFS).",
        controlledBy: `IMVP VRM (${vrmChip})`,
        failureSymptoms: [
          "Fans spin, no POST, no display",
          "System powers on then immediately shuts off",
          "CPU runs but thermal throttles immediately",
        ],
        diagnosticChecks: [
          `Measure VCORE at VRM output inductor — should read ${vcore} (varies with load)`,
          "Check VRM phase MOSFETs with thermal camera — even heat distribution",
          "Check CPU socket for bent or broken pins (LGA) or pads (BGA)",
          "Measure VCORE ripple with oscilloscope — should be <50mV pk-pk",
        ],
      },
      {
        name: "VCCGT (GPU/Graphics)",
        order: 6,
        rail: "VCCGT",
        typicalVoltage: vccgt,
        description: "Powers integrated GPU. May be same VRM as VCORE on lower-power designs.",
        controlledBy: `IMVP VRM (${vrmChip})`,
        failureSymptoms: [
          "System boots but no display on internal GPU",
          "Graphics artifacts on integrated display",
          "GPU driver crashes",
        ],
        diagnosticChecks: [
          `Measure VCCGT at output — should read ${vccgt}`,
          "Test with external display to isolate GPU vs panel",
          "Check if discrete GPU works (if equipped) to confirm CPU iGPU issue",
        ],
      },
      {
        name: "PCH (Platform Controller Hub)",
        order: 7,
        rail: "VCCPCH / V1P05PCH",
        typicalVoltage: "1.05V",
        description: "Powers the PCH — USB, SATA, audio, LPC/eSPI bus. Comes up alongside or after CPU rails.",
        controlledBy: "Dedicated LDO or buck converter",
        failureSymptoms: [
          "USB ports dead",
          "SATA devices not detected",
          "Audio not working",
          "Keyboard/touchpad dead (LPC/eSPI bus)",
        ],
        diagnosticChecks: [
          "Measure V1P05PCH at PCH power pins — should read 1.05V",
          "Check PCH for thermal damage (hot to touch without CPU load)",
          "Check PCH clock input (24 MHz reference clock)",
        ],
      },
    ],
  };
}

function makeAmdPlatform(
  name: string, codename: string, generation: string,
  vddcrSoc: string, vddcrCpu: string, vddio: string,
  vrmChip: string,
): LaptopPlatform {
  return {
    name, vendor: "amd", codename, generation,
    powerSequence: [
      STANDBY_STAGE,
      EC_STAGE,
      {
        name: "VDDCR_SOC (SoC Domain)",
        order: 3,
        rail: "VDDCR_SOC",
        typicalVoltage: vddcrSoc,
        description: "Powers SoC infrastructure — memory controller, PCIe root complex, display engine, USB. First AMD CPU rail.",
        controlledBy: `SVI2/SVI3 VRM (${vrmChip})`,
        failureSymptoms: [
          "Fan spins briefly then shuts off",
          "No POST, completely dead after power button",
          "Memory not detected",
          "USB ports dead",
        ],
        diagnosticChecks: [
          `Measure VDDCR_SOC at VRM output inductor — should read ${vddcrSoc}`,
          "Check VRM enable signal from EC",
          "Check SVI2/SVI3 bus communication (clock + data lines between CPU and VRM)",
          "Inspect for liquid damage around SOC VRM area",
        ],
      },
      {
        name: "VDDCR_CPU (CPU Core)",
        order: 4,
        rail: "VDDCR_CPU",
        typicalVoltage: vddcrCpu,
        description: "Main CPU core voltage. Controlled via SVI2/SVI3 serial bus. Dynamically adjusted by CPU.",
        controlledBy: `SVI2/SVI3 VRM (${vrmChip})`,
        failureSymptoms: [
          "Fans spin but no POST",
          "System powers on then immediately shuts off (over-current protection)",
          "CPU thermal throttle even at idle",
        ],
        diagnosticChecks: [
          `Measure VDDCR_CPU at VRM output — should read ${vddcrCpu} (varies with load)`,
          "Check all VRM phases with thermal camera — should be evenly warm",
          "Check CPU BGA for micro-cracks (may need reflow)",
          "Measure ripple — should be <30mV pk-pk",
        ],
      },
      {
        name: "VDDIO (Memory I/O)",
        order: 5,
        rail: "VDDIO / VDDP",
        typicalVoltage: vddio,
        description: "Powers DDR memory interface. Must be stable for memory training during POST.",
        controlledBy: "Dedicated LDO or buck converter",
        failureSymptoms: [
          "No memory detection",
          "Random crashes / memory errors",
          "System hangs during memory training (early POST)",
        ],
        diagnosticChecks: [
          `Measure VDDIO at memory slot power pins — should read ${vddio}`,
          "Check DDR DIMM slot contacts for corrosion",
          "Try single DIMM in different slots",
          "Check memory VRM for hot components",
        ],
      },
      {
        name: "FCH (Fusion Controller Hub)",
        order: 6,
        rail: "VDD_FCH / VDDP",
        typicalVoltage: "0.9-1.1V",
        description: "Powers integrated southbridge — USB, SATA, SD card, audio codec interface.",
        controlledBy: "On-die regulator or external LDO",
        failureSymptoms: [
          "USB ports not working",
          "SATA/NVMe drives not detected",
          "Audio not working",
          "SD card reader dead",
        ],
        diagnosticChecks: [
          "Measure FCH power rail at test points — should read 0.9-1.1V",
          "Check for thermal hotspot on APU die (FCH is integrated)",
          "Check USB/SATA controller in BIOS — disabled?",
        ],
      },
    ],
  };
}

export const INTEL_PLATFORMS: LaptopPlatform[] = [
  makeIntelPlatform("Haswell", "Haswell", "4th Gen Core", "1.05V", "1.05V", "0.8-1.3V", "0.8-1.2V", "ISL95820/RT8243"),
  makeIntelPlatform("Broadwell", "Broadwell", "5th Gen Core", "1.0V", "1.0V", "0.75-1.2V", "0.75-1.1V", "ISL95828/RT8243"),
  makeIntelPlatform("Skylake", "Skylake", "6th Gen Core", "0.95V", "0.95V", "0.6-1.2V", "0.6-1.1V", "ISL95338/RT8249"),
  makeIntelPlatform("Kaby Lake", "Kaby Lake", "7th Gen Core", "0.95V", "0.95V", "0.6-1.2V", "0.6-1.1V", "ISL95338/RT8249"),
  makeIntelPlatform("Coffee Lake", "Coffee Lake", "8th/9th Gen Core", "1.05V", "1.0V", "0.6-1.3V", "0.6-1.15V", "ISL69138/RAA228228"),
  makeIntelPlatform("Comet Lake", "Comet Lake", "10th Gen Core", "1.05V", "1.0V", "0.6-1.3V", "0.6-1.15V", "ISL69138/RAA228228"),
  makeIntelPlatform("Tiger Lake", "Tiger Lake", "11th Gen Core", "0.85V", "0.9V", "0.6-1.2V", "0.5-1.1V", "RAA229131/TPS51397"),
  makeIntelPlatform("Alder Lake", "Alder Lake", "12th Gen Core", "1.05V", "0.95V", "0.6-1.45V", "0.5-1.2V", "RAA229132/ISL69269"),
  makeIntelPlatform("Raptor Lake", "Raptor Lake", "13th/14th Gen Core", "1.05V", "0.95V", "0.6-1.45V", "0.5-1.2V", "RAA229132/ISL69269"),
];

export const AMD_PLATFORMS: LaptopPlatform[] = [
  makeAmdPlatform("Zen 1 (Raven Ridge)", "Raven Ridge", "Ryzen 2000 Mobile", "0.9-1.1V", "0.9-1.4V", "1.2V", "SY8286/IR35217"),
  makeAmdPlatform("Zen+ (Picasso)", "Picasso", "Ryzen 3000 Mobile", "0.9-1.1V", "0.9-1.35V", "1.2V", "SY8286/IR35217"),
  makeAmdPlatform("Zen 2 (Renoir)", "Renoir", "Ryzen 4000 Mobile", "0.9-1.1V", "0.8-1.3V", "1.1V", "SY8286RAC/RT8249"),
  makeAmdPlatform("Zen 3 (Cezanne)", "Cezanne", "Ryzen 5000 Mobile", "0.9-1.1V", "0.75-1.3V", "1.1V", "RT8249/NCP81239"),
  makeAmdPlatform("Zen 4 (Phoenix)", "Phoenix", "Ryzen 7000 Mobile", "0.75-1.0V", "0.65-1.3V", "1.1V", "RAA229131/NCP81599"),
];

export const ALL_LAPTOP_PLATFORMS: LaptopPlatform[] = [...INTEL_PLATFORMS, ...AMD_PLATFORMS];

export function lookupPlatform(query: string): LaptopPlatform | undefined {
  const q = query.toLowerCase();
  return ALL_LAPTOP_PLATFORMS.find(p =>
    p.name.toLowerCase().includes(q) ||
    p.codename.toLowerCase().includes(q) ||
    p.generation.toLowerCase().includes(q)
  );
}

export function analyzeLaptopPower(platform: LaptopPlatform, symptoms: LaptopPowerSymptoms): LaptopPowerAnalysis {
  const seq = platform.powerSequence;

  if (symptoms.chargerLed === false || (symptoms.batteryCharges === false && symptoms.powerButtonResponse === false)) {
    return {
      suspectedStage: seq[0],
      confidence: 0.85,
      reasoning: "No charger indication and no power button response points to charger/input power stage failure.",
      nextChecks: seq[0].diagnosticChecks,
    };
  }

  if (symptoms.powerButtonResponse === false) {
    return {
      suspectedStage: seq[1],
      confidence: 0.8,
      reasoning: "Charger works but power button unresponsive — EC likely not running or power sequencing stuck.",
      nextChecks: seq[1].diagnosticChecks,
    };
  }

  if (symptoms.fanSpins === false && symptoms.powerButtonResponse === true) {
    const vrm = seq[2];
    return {
      suspectedStage: vrm,
      confidence: 0.7,
      reasoning: `Power button responds but no fan spin — ${vrm.name} rail may be shorted or VRM not enabling.`,
      nextChecks: vrm.diagnosticChecks,
    };
  }

  if (symptoms.fanSpins === true && symptoms.displayOutput === false && symptoms.screenBacklight === false) {
    const stage = seq.length > 5 ? seq[5] : seq[seq.length - 1];
    return {
      suspectedStage: stage,
      confidence: 0.6,
      reasoning: "Fans spin but no backlight and no display — could be GPU rail, display connector, or backlight circuit.",
      nextChecks: [
        "Check backlight fuse on motherboard (usually near display connector)",
        "Check eDP/LVDS cable connection",
        "Shine flashlight on screen — if image visible, backlight circuit failed",
        ...stage.diagnosticChecks,
      ],
    };
  }

  if (symptoms.fanSpins === true && symptoms.screenBacklight === true && symptoms.displayOutput === false) {
    const coreStage = seq.find(s => s.name.includes("VCORE") || s.name.includes("VDDCR_CPU")) ?? seq[4];
    return {
      suspectedStage: coreStage,
      confidence: 0.65,
      reasoning: "Backlight works but no display output — CPU may not be POSTing. Check core voltage and CPU.",
      nextChecks: coreStage.diagnosticChecks,
    };
  }

  if (symptoms.keyboardLights === false && symptoms.displayOutput === true) {
    const pchStage = seq.find(s => s.name.includes("PCH") || s.name.includes("FCH")) ?? seq[seq.length - 1];
    return {
      suspectedStage: pchStage,
      confidence: 0.5,
      reasoning: "Display works but keyboard/peripherals dead — PCH/FCH or EC peripheral interface issue.",
      nextChecks: pchStage.diagnosticChecks,
    };
  }

  return {
    suspectedStage: seq[2],
    confidence: 0.4,
    reasoning: "Symptoms don't clearly point to a single stage. Start from first CPU power rail and work forward.",
    nextChecks: seq[2].diagnosticChecks,
  };
}
