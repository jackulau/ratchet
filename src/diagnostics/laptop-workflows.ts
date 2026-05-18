import type { Workflow } from "./workflows.js";

// ─── Brand Guide ────────────────────────────────────────────────────────────

export interface BrandGuide {
  brand: string;
  commonEcChips: string[];
  commonChargeIcs: string[];
  commonVrms: string[];
  biosAccessKey: string;
  resetProcedure: string;
  diagnosticMode: string;
  knownIssues: string[];
}

export const LAPTOP_BRAND_GUIDES: Record<string, BrandGuide> = {
  lenovo: {
    brand: "Lenovo / ThinkPad",
    commonEcChips: ["Nuvoton NPCE985", "Nuvoton NPCE586", "ITE IT8586E", "ITE IT8528E"],
    commonChargeIcs: ["ISL9240", "ISL9241", "BQ24780S", "MAX17701"],
    commonVrms: ["ISL95338", "RT8237C", "TPS51362"],
    biosAccessKey: "F1 (ThinkPad), F2 (IdeaPad), Enter then F1 (some ThinkPads)",
    resetProcedure: "Disconnect AC and battery. Hold power button for 30 seconds. On models with internal battery: insert paperclip into reset hole on bottom panel.",
    diagnosticMode: "Press F10 at Lenovo splash screen for Lenovo Diagnostics. ThinkPads also support Lenovo Vantage diagnostics from within Windows.",
    knownIssues: [
      "NPCE985 EC failure causes complete no-power (common on T480/T490)",
      "USB-C port failure on X1 Carbon Gen 6-8 due to TPS65982 PD IC",
      "ThinkPad E-series: ISL9240 charging IC failure after liquid damage",
      "Flex BIOS lock: requires removing CMOS battery and shorting service pin",
      "T440p/T540p: discrete GPU BGA solder joint failure (no display)",
    ],
  },

  dell: {
    brand: "Dell",
    commonEcChips: ["ITE IT8528E", "ITE IT8586E", "Nuvoton NPCE795", "MEC1322"],
    commonChargeIcs: ["BQ25700", "BQ24780", "ISL95338", "BQ25710"],
    commonVrms: ["TPS51367", "RT8243B", "ISL95870"],
    biosAccessKey: "F2 (BIOS Setup), F12 (Boot Menu)",
    resetProcedure: "Disconnect AC and battery. Hold power button for 15-20 seconds. For models with built-in battery: hold power button 30 seconds then press power button for 60 seconds continuously.",
    diagnosticMode: "Press F12 at Dell splash, select Diagnostics. Or press Fn+Power on startup for built-in ePSA diagnostics. Battery LED codes: alternating amber/white blinks indicate specific error codes.",
    knownIssues: [
      "Dell battery LED 2-3 amber/white: memory failure (reseat/replace RAM)",
      "Dell battery LED 1-2 amber/white: motherboard failure",
      "Latitude 5000/7000 series: BQ25700 charging IC failure",
      "XPS 13/15: USB-C port failure due to TPS65982 IC",
      "Inspiron: barrel jack center pin breaks internally (intermittent charging)",
      "BIOS recovery via BIOS Recovery key combo: Ctrl+Esc on power-on",
    ],
  },

  hp: {
    brand: "HP",
    commonEcChips: ["ITE IT8987E", "Nuvoton NPCE586H", "SMSC MEC1633", "ITE IT8595E"],
    commonChargeIcs: ["TPS65982", "ISL9238", "BQ24780", "BQ25710"],
    commonVrms: ["RT8239B", "ISL95852", "TPS51362"],
    biosAccessKey: "F10 (BIOS Setup), F9 (Boot Menu), Esc (Startup Menu)",
    resetProcedure: "Disconnect AC and remove battery. Hold power button for 15 seconds. For sealed battery: hold power button 15 seconds, plug in AC (no battery), press power. Some models: Win key + B + Power for BIOS recovery.",
    diagnosticMode: "Press Esc at startup for Startup Menu, then F2 for HP PC Hardware Diagnostics. Caps Lock blink codes: count blinks to identify error (e.g., 5 blinks = memory, 6 blinks = GPU).",
    knownIssues: [
      "Caps lock blink 5 times: memory subsystem failure",
      "Caps lock blink 6 times: GPU/video failure",
      "HP Spectre x360: thermal throttle due to undersized heatsink",
      "ProBook/EliteBook: TPS65982 USB-C PD controller failure",
      "Pavilion: ISL9238 charging IC fails after power surge",
      "BIOS recovery: Win+B+Power on startup (must have BIOS file on USB as hp.bin)",
    ],
  },

  asus: {
    brand: "ASUS",
    commonEcChips: ["ITE IT8586E", "ITE IT8987E", "Nuvoton NPCE985L", "ITE IT5570E"],
    commonChargeIcs: ["BQ25700", "ISL9240", "BQ24780S", "RAA229131"],
    commonVrms: ["ISL95870", "RT8243B", "TPS51362", "ASP1400BT"],
    biosAccessKey: "F2 (BIOS Setup), Del (some models), Esc (Boot Menu)",
    resetProcedure: "Disconnect AC and battery. Hold power button for 40 seconds. For internal battery: press and hold power 30 seconds. Some ROG models: hold power for 60 seconds for EC reset.",
    diagnosticMode: "No built-in diagnostics on most models. Use ASUS BIOS flashback: insert USB with BIOS file renamed to model-specific name, hold BIOS flashback button 3 seconds (if available on model).",
    knownIssues: [
      "ZenBook: BQ25700 charging IC fails (no charge, power from AC only)",
      "ROG Strix: VRM overheating due to inadequate thermal solution",
      "VivoBook: keyboard ribbon cable connector breaks (keyboard dead)",
      "ZenBook Flip: display cable failure at hinge (flickering screen)",
      "TUF Gaming: GPU VRM MOSFET failure (no display or artifacts)",
      "ASUS EC reset often requires long hold (40-60 seconds vs typical 15)",
    ],
  },

  apple: {
    brand: "Apple MacBook",
    commonEcChips: ["Apple T2 (2018-2020 Intel)", "Apple M1/M2/M3 (SoC integrated)", "SMC (pre-2018)"],
    commonChargeIcs: ["CD3217 (Thunderbolt/USB-C)", "ISL9240 (Intel models)", "BQ24780 (older models)"],
    commonVrms: ["ISL95338", "TPS51980", "ISL9239"],
    biosAccessKey: "Option key (boot picker), Command+R (Recovery), Command+Option+P+R (NVRAM reset)",
    resetProcedure: "SMC reset (Intel): Shift+Ctrl+Option+Power (hold 10 seconds on left-side keys). T2 Macs: press and release power, then hold Shift+Ctrl+Option+Power 7 seconds. Apple Silicon: shut down, hold power 10 seconds.",
    diagnosticMode: "Intel: hold D on startup for Apple Diagnostics. Apple Silicon: hold power button, click Options, then run diagnostics. Error codes: PPxxxx format (e.g., PPF001 = fan failure).",
    knownIssues: [
      "MacBook Pro 2016-2017: flexgate (backlight failure due to display cable at hinge)",
      "MacBook Pro 2018-2019: T2 bridge OS corruption (no boot, DFU restore required)",
      "MacBook Air 2018-2020: CD3217 Thunderbolt IC failure (no charge on one port)",
      "All Intel MacBooks: liquid damage indicator stickers inside (check near logic board edge)",
      "MacBook Pro 15\" 2011-2013: discrete GPU failure (stage light artifacts, kernel panics)",
      "MacBook 12\" 2015-2017: keyboard failure (butterfly switch mechanism)",
      "MacBook Pro M1/M2: SSD not replaceable, data recovery requires Apple tools",
    ],
  },

  acer: {
    brand: "Acer",
    commonEcChips: ["ITE IT8586E", "ITE IT8987E", "KB9012", "ENE KB3930"],
    commonChargeIcs: ["BQ24780", "ISL9238", "BQ25710", "RAA229131"],
    commonVrms: ["RT8243B", "ISL95870", "TPS51367"],
    biosAccessKey: "F2 (BIOS Setup), F12 (Boot Menu), Del (some models)",
    resetProcedure: "Disconnect AC and battery. Hold power button for 30 seconds. For internal battery: insert paperclip into battery reset hole on bottom panel (if present). Some models require removing back panel to disconnect internal battery.",
    diagnosticMode: "Acer Care Center for Windows-based diagnostics. No built-in POST diagnostic LEDs on most consumer models. Predator/ConceptD: may have LED indicators on power button.",
    knownIssues: [
      "Aspire: KB9012 EC frequently corrupted (recoverable via external flash)",
      "Nitro 5: GPU VRM overheating (thermal throttle under gaming load)",
      "Swift: USB-C PD negotiation fails with non-OEM chargers",
      "Predator Helios: fan noise complaints due to aggressive thermal curve",
      "Spin series: display cable failure at hinge pivot point",
    ],
  },

  msi: {
    brand: "MSI",
    commonEcChips: ["ITE IT8587E", "ITE IT5570E", "Nuvoton NPCE985L", "ITE IT8986E"],
    commonChargeIcs: ["ISL9240", "RAA229131", "BQ25700", "ISL95338"],
    commonVrms: ["ISL95870", "RT8243B", "TPS51362", "RAA229131"],
    biosAccessKey: "Del (BIOS Setup), F11 (Boot Menu)",
    resetProcedure: "Disconnect AC and battery. Hold power button for 30 seconds. For EC reset on gaming models: remove bottom panel, disconnect battery, hold power 30 seconds, reconnect.",
    diagnosticMode: "No built-in diagnostic LEDs on most laptop models. MSI Center for software-based diagnostics. Some gaming models (GT/GE series) have LED patterns on power button for POST errors.",
    knownIssues: [
      "GS65/GS66: VRM overheating in compact chassis (thermal throttle)",
      "GP/GF series: BIOS update failures common (use EC firmware + BIOS combined update)",
      "Stealth: keyboard ribbon cable routing causes intermittent dead keys",
      "Creator series: Thunderbolt IC failure after firmware update",
      "Raider: GPU VRM MOSFET failure under sustained load (difficulty: board-level repair)",
      "MSI BIOS often paired with EC firmware: both must match version for stable operation",
    ],
  },
};

// ─── Laptop-Specific Workflows ──────────────────────────────────────────────

export const LAPTOP_WORKFLOWS: Record<string, Workflow> = {

  // ─── ThinkPad No Power ──────────────────────────────────────────────────

  "thinkpad-no-power": {
    name: "ThinkPad No Power Troubleshooter",
    description: "Lenovo ThinkPad completely dead -- EC reset, USB-C PD, and common IC failures",
    steps: [
      {
        id: "start",
        instruction: "Perform a ThinkPad EC hard reset: disconnect the AC adapter, then hold the power button for 30 full seconds. On models with a pinhole reset (bottom panel), insert a paperclip and hold for 10 seconds.",
        question: "After the EC reset, does the ThinkPad show any sign of life (LED, fan, display)?",
        branches: {
          "yes": { cause: "EC was in a hung state (firmware lockup)", fix: "EC reset resolved the issue. If it recurs frequently, the EC firmware may need reflashing. Check Lenovo support for EC firmware updates. On T480/T490, persistent EC hangs may indicate failing NPCE985 chip.", difficulty: 1, tools: [] },
          "no": "check-charger",
        },
      },
      {
        id: "check-charger",
        instruction: "Connect the USB-C charger. Check that it is rated for at least 65W (20V/3.25A). Verify the USB-C cable is not damaged. Try a different USB-C port on the ThinkPad if available.",
        question: "Does the charger LED or laptop charging indicator show any response?",
        branches: {
          "yes": "check-pd-negotiation",
          "no": "check-barrel-jack",
        },
      },
      {
        id: "check-barrel-jack",
        instruction: "If the ThinkPad has a barrel jack (slim tip or rectangular), try a known-good barrel jack charger. Measure the barrel jack voltage with a multimeter: Lenovo slim tip should show 20V.",
        question: "Does the barrel jack charger produce 20V and does the laptop respond?",
        branches: {
          "yes": { cause: "USB-C charging circuit failure -- the barrel jack path bypasses the USB-C PD controller", fix: "USB-C PD IC (often TPS65982 or similar) is likely failed. USB-C ports may need board-level repair. The laptop can operate on barrel jack power in the meantime.", difficulty: 4, tools: ["Multimeter", "Barrel jack charger"] },
          "no": "check-isl9240",
        },
      },
      {
        id: "check-pd-negotiation",
        instruction: "With a USB-C PD analyzer or multimeter on the charger side, verify that the charger is negotiating 20V. Some chargers default to 5V if the PD IC does not request higher voltage.",
        question: "Is the charger outputting 20V (not stuck at 5V)?",
        branches: {
          "yes": "check-isl9240",
          "no": { cause: "USB-C PD negotiation failure -- laptop not requesting 20V from charger", fix: "The USB-C PD controller is not negotiating properly. Try a different USB-C charger and cable. If the issue persists with multiple chargers, the TPS65982 or ISL9240 PD negotiation circuit has failed. Board-level repair of the PD controller IC required.", difficulty: 4, tools: ["USB-C PD analyzer", "Multimeter"] },
        },
      },
      {
        id: "check-isl9240",
        instruction: "The ISL9240 is the main charging/system power IC on many ThinkPads. With the back panel removed, locate the ISL9240 (near the DC-in area). Check for 20V input on the ISL9240 input pins and 12-19V on the output side using a multimeter.",
        question: "Is there voltage present at the ISL9240 input (approximately 20V from charger)?",
        branches: {
          "yes": "check-power-rails",
          "no": { cause: "No voltage reaching the ISL9240 -- open trace or fuse between charge port and ISL9240", fix: "Check for blown fuses between the USB-C/DC-in connector and the ISL9240. On ThinkPads, there is typically a PTC fuse or MOSFET switch before the ISL9240. Inspect for burnt components near the charging port. Replace blown fuse or MOSFET.", difficulty: 4, tools: ["Multimeter", "Magnifying glass"] },
        },
      },
      {
        id: "check-power-rails",
        instruction: "With power applied, check the main power rails: 3.3V standby (3VALW), 5V standby (5VALW), and the main 3.3V/5V/1.05V rails. Use the multimeter on large capacitors near the ISL9240 output.",
        question: "Are the standby rails (3VALW, 5VALW) present?",
        branches: {
          "yes": { cause: "Standby rails are up but system does not turn on -- EC or power sequencing failure", fix: "The EC (Nuvoton NPCE985 on T480/T490/X1 Carbon) should trigger the power-on sequence. Check EC crystal oscillator (32.768 kHz). Measure 3.3V on EC VCC pin. If EC has power but no response, the EC may need reflashing or replacement. Try external SPI flash of EC firmware.", difficulty: 5, tools: ["Multimeter", "Oscilloscope (optional)", "CH341A/CH347 for EC flash"] },
          "no": "check-ec-npce985",
        },
      },
      {
        id: "check-ec-npce985",
        instruction: "The Nuvoton NPCE985 EC chip controls power sequencing. With magnification, inspect the NPCE985 for burn marks, cracked solder joints, or corrosion. Check for 3.3V on the EC's VCC pins.",
        question: "Does the EC chip have 3.3V power and appear physically intact?",
        branches: {
          "yes": { cause: "EC has power but ISL9240 is not generating output rails -- ISL9240 failure or enable signal missing", fix: "The ISL9240 requires an enable signal from the EC to start switching. Verify the EN pin on the ISL9240 goes high when power button is pressed. If EN is stuck low, trace back to EC. If EN goes high but no output: ISL9240 is dead -- replace it.", difficulty: 5, tools: ["Multimeter", "Hot air rework station", "ISL9240 replacement IC"] },
          "no": { cause: "EC chip failure -- no power to Nuvoton NPCE985 or chip is physically damaged", fix: "If EC has no power: trace the 3.3V supply to the EC. Check for blown inductor or LDO regulator feeding the EC. If EC is burnt/corroded: replace the NPCE985. This requires BGA or QFP rework depending on the package.", difficulty: 5, tools: ["Multimeter", "Hot air rework station", "NPCE985 replacement", "Magnifying glass"] },
        },
      },
    ],
  },

  // ─── Dell No Power ──────────────────────────────────────────────────────

  "dell-no-power": {
    name: "Dell Laptop No Power Troubleshooter",
    description: "Dell laptop completely dead -- LED codes, charging IC, and diagnostic patterns",
    steps: [
      {
        id: "start",
        instruction: "Check the Dell battery LED indicator: press the battery check button (if present on older models) or plug in the AC adapter and observe the LED near the charging port. Dell uses amber/white blink patterns to indicate errors.",
        question: "Does the battery or charging LED show any blinking pattern?",
        branches: {
          "yes": "decode-led-pattern",
          "no": "check-charger-type",
        },
      },
      {
        id: "decode-led-pattern",
        instruction: "Count the Dell LED blink pattern carefully: it alternates between amber and white blinks. For example, '2 amber, 3 white' = 2-3 pattern. Common patterns: 1-2 = motherboard failure, 2-1 = CPU failure, 2-3 = memory failure, 2-8 = LCD failure.",
        question: "Is the pattern 2-3 (2 amber, 3 white) indicating a memory issue?",
        branches: {
          "yes": { cause: "Dell diagnostic LED indicates RAM failure", fix: "Remove and reseat all RAM modules. Clean contacts with isopropyl alcohol. Try one stick at a time. If soldered RAM: board-level failure. Check for corrosion near RAM area. On newer Dells with soldered RAM, this may indicate a failed memory controller on the CPU.", difficulty: 2, tools: ["Isopropyl alcohol", "Lint-free cloth"] },
          "no": { cause: "Dell diagnostic LED indicates a specific subsystem failure", fix: "Look up the exact blink pattern in Dell's support documentation. 1-2 = motherboard, 2-1 = CPU, 2-2 = BIOS corruption (try Ctrl+Esc BIOS recovery), 2-4 = RAM not detected, 2-8 = LCD/GPU. Address the specific subsystem identified by the code.", difficulty: 3, tools: ["Dell LED code reference"] },
        },
      },
      {
        id: "check-charger-type",
        instruction: "Determine the charger type: barrel jack (7.4mm or 4.5mm) or USB-C. For barrel jack: measure voltage at the barrel tip (should be 19.5V for most Dells). For USB-C: verify charger is 65W+ and try a different cable.",
        question: "Is the charger producing correct voltage (19.5V barrel or 20V USB-C)?",
        branches: {
          "yes": "check-charging-ic",
          "no": { cause: "Charger failure or wrong charger model", fix: "Replace the charger. Dell laptops are particular about charger identification -- the center pin on barrel jacks carries a 1-wire ID signal. If the center pin is damaged, the laptop may not recognize the charger even if voltage is correct. Try a known-good Dell OEM charger.", difficulty: 1, tools: ["Multimeter", "Known-good Dell charger"] },
        },
      },
      {
        id: "check-charging-ic",
        instruction: "Dell commonly uses BQ25700 or BQ24780 charging ICs. With the bottom panel removed, locate the charging IC (near the DC-in connector). Check for 19.5V (barrel) or 20V (USB-C) at the charging IC input.",
        question: "Is input voltage reaching the charging IC?",
        branches: {
          "yes": "check-bq-output",
          "no": "check-dc-in-connector",
        },
      },
      {
        id: "check-dc-in-connector",
        instruction: "Inspect the DC-in connector: for barrel jacks, check that the center pin is not pushed in or broken. For USB-C, check the port for debris or bent pins. Measure continuity from the connector to the first fuse or protection MOSFET.",
        question: "Is the DC-in connector physically intact and passing voltage through?",
        branches: {
          "yes": { cause: "Open trace or blown fuse between connector and charging IC", fix: "Check for a PTC fuse or MOSFET between the DC-in and the BQ257xx IC. Measure continuity. If the fuse is open, replace it. If a protection MOSFET is shorted, replace it. Inspect for burn marks along the power input trace.", difficulty: 4, tools: ["Multimeter", "Magnifying glass", "Soldering iron"] },
          "no": { cause: "DC-in connector failure -- physical damage to the power input", fix: "Replace the DC-in connector or port assembly. For barrel jack models, this is often a separate daughter board (easy replacement). For USB-C models integrated into the motherboard, this requires board-level soldering.", difficulty: 2, tools: ["Replacement DC-in connector", "Soldering iron"] },
        },
      },
      {
        id: "check-bq-output",
        instruction: "The BQ25700/BQ24780 should produce a system voltage rail (typically 12.6V-19.5V depending on the model). Measure the output side of the charging IC. Also check for 3.3V standby (always-on) rail.",
        question: "Is the charging IC producing an output voltage?",
        branches: {
          "yes": { cause: "Charging IC works but system does not power on -- EC or power button circuit failure", fix: "Check the EC chip for 3.3V supply. Verify the power button generates a signal (measure voltage change on the power button header when pressed). If EC has power but no response: EC firmware may be corrupt. Try BIOS recovery: hold Ctrl+Esc and press power button (Dell BIOS recovery mode).", difficulty: 3, tools: ["Multimeter"] },
          "no": { cause: "BQ25700/BQ24780 charging IC failure -- no output from charge controller", fix: "The charging IC is not converting input power to system rail. Check for stuck BATDRV or ACDRV MOSFET gates. If the IC has input power but no output and no thermal damage visible, the IC itself has likely failed. Replace the BQ25700/BQ24780. This is a QFN package requiring hot air rework.", difficulty: 5, tools: ["Hot air rework station", "BQ25700/BQ24780 replacement", "Multimeter"] },
        },
      },
      {
        id: "check-isl95338",
        instruction: "On some Dell Latitude/XPS models, the ISL95338 handles battery-to-system power conversion. Locate this IC near the battery connector area. Check for battery voltage at the input and system voltage at the output.",
        question: "If the ISL95338 is present, is it receiving battery voltage?",
        branches: {
          "yes": { cause: "ISL95338 has input but no output -- VRM failure", fix: "The ISL95338 converts battery voltage to system rails. If input is present but output is missing, the IC or its switching MOSFETs have failed. Check the high-side and low-side MOSFETs near the ISL95338 in diode mode. Replace failed components.", difficulty: 5, tools: ["Multimeter (diode mode)", "Hot air rework station"] },
          "no": { cause: "No battery power reaching ISL95338 -- battery connector or battery fault", fix: "Check the battery connector for corrosion or bent pins. Try a known-good battery. Measure battery voltage directly (should be 10.8V-12.6V for 3-cell, 14.4V-16.8V for 4-cell). If battery is dead and AC power also does not work: multiple failures or a common upstream component (main fuse) is blown.", difficulty: 3, tools: ["Multimeter", "Known-good battery"] },
        },
      },
    ],
  },

  // ─── HP No Power ────────────────────────────────────────────────────────

  "hp-no-power": {
    name: "HP Laptop No Power Troubleshooter",
    description: "HP laptop completely dead -- caps lock blink codes, hard reset, and PD controller",
    steps: [
      {
        id: "start",
        instruction: "Perform an HP hard reset: disconnect the AC adapter and remove the battery (if removable). Hold the power button for 15 seconds. Reconnect AC adapter only (no battery). Press power button.",
        question: "After the hard reset, does the laptop show any sign of life?",
        branches: {
          "yes": "check-blink-codes",
          "no": "check-sealed-battery-reset",
        },
      },
      {
        id: "check-sealed-battery-reset",
        instruction: "For HP laptops with a non-removable battery: disconnect the AC adapter. Hold the power button for 15 seconds. Plug in AC adapter. Hold the power button for another 15 seconds. Release and press power normally.",
        question: "Does the laptop respond after the sealed battery reset procedure?",
        branches: {
          "yes": { cause: "EC was locked up -- hard reset cleared the state", fix: "If this happens frequently, check for BIOS/EC firmware updates from HP. Persistent EC hangs can indicate a marginal power rail or failing EC chip. Monitor for recurrence.", difficulty: 1, tools: [] },
          "no": "check-ac-adapter",
        },
      },
      {
        id: "check-ac-adapter",
        instruction: "Check the AC adapter: for barrel jack models, measure output voltage (should be 19.5V). For USB-C models, verify the charger is rated 45W or 65W. Try a different charger and cable. Check the charging LED on the laptop (if present).",
        question: "Is the AC adapter producing correct voltage and does the charging LED respond?",
        branches: {
          "yes": "check-caps-lock",
          "no": { cause: "AC adapter failure or DC-in connector damage", fix: "Try a known-good HP charger. For barrel jack models: inspect the connector for a pushed-in center pin (HP uses a smart pin for charger identification). For USB-C: check port for debris. If connector is damaged, replace the DC-in jack (often a separate daughter board on HP).", difficulty: 2, tools: ["Multimeter", "Known-good HP charger"] },
        },
      },
      {
        id: "check-caps-lock",
        instruction: "Try pressing the power button and watch the caps lock LED closely. HP uses caps lock blink codes to indicate POST errors. Count the number of blinks carefully. The LED may blink then pause, then blink again.",
        question: "Does the caps lock LED blink in a pattern?",
        branches: {
          "yes": "decode-caps-blinks",
          "no": "check-tps65982",
        },
      },
      {
        id: "decode-caps-blinks",
        instruction: "Count the HP caps lock blink code: 1 blink = CPU error, 2 blinks = BIOS corruption, 3 blinks = memory power rail, 4 blinks = GPU/graphics, 5 blinks = memory failure, 6 blinks = GPU communication, 7 blinks = embedded controller, 8 blinks = memory timing.",
        question: "Is the blink code 2 (BIOS corruption)?",
        branches: {
          "yes": { cause: "HP BIOS corruption detected (caps lock blink code 2)", fix: "Attempt HP BIOS recovery: turn off laptop, insert USB drive with BIOS file renamed to 'hp.bin' or board-specific name. Hold Win+B and press power. Hold Win+B until screen flashes or you hear beeps. If recovery fails: external flash of BIOS chip with CH341A required.", difficulty: 3, tools: ["USB drive (FAT32)", "CH341A/CH347 (if recovery fails)"] },
          "no": { cause: "HP hardware subsystem failure identified by caps lock blink code", fix: "Address the specific subsystem: 1 blink = CPU (reseat or replace), 3 blinks = memory power rail (check VRM near RAM), 5 blinks = memory (reseat or replace), 6-7 blinks = GPU/EC (board-level repair). Use HP support documentation for exact code interpretation.", difficulty: 3, tools: ["Multimeter", "Isopropyl alcohol"] },
        },
      },
      {
        id: "check-tps65982",
        instruction: "On HP laptops with USB-C charging, the TPS65982 handles PD negotiation. With the bottom panel removed, locate the TPS65982 (near the USB-C port area, QFN package). Check for 3.3V on its VCC pins. Look for physical damage or corrosion.",
        question: "Does the TPS65982 have 3.3V power and appear undamaged?",
        branches: {
          "yes": "check-main-power-ic",
          "no": { cause: "TPS65982 USB-C PD controller failure -- no PD negotiation possible", fix: "If the TPS65982 is visibly damaged or lacks power: check the 3.3V LDO feeding it. If the LDO is fine but TPS65982 has no output, the IC needs replacement. This is a QFN package requiring hot air rework. On some HP models, replacing the TPS65982 also requires reprogramming its firmware via I2C.", difficulty: 5, tools: ["Hot air rework station", "TPS65982 replacement", "Multimeter"] },
        },
      },
      {
        id: "check-main-power-ic",
        instruction: "Check the main system power IC: on HP laptops this is commonly ISL9238 or BQ24780. Measure input voltage from the charger, and check for output voltage on the system power rail. Also verify 3.3V standby rail is present.",
        question: "Are the standby power rails (3.3V always-on, 5V standby) present?",
        branches: {
          "yes": { cause: "Standby rails present but system won't turn on -- EC or power button failure", fix: "Check the EC chip for power (3.3V). Verify the power button generates a signal. Test by shorting the power button pads on the motherboard directly. If EC has power and power button works but no response: EC firmware corruption. Attempt Win+B+Power BIOS recovery. If that fails: external EC/BIOS flash required.", difficulty: 4, tools: ["Multimeter", "CH341A/CH347"] },
          "no": { cause: "Main power IC failure -- no standby rails being generated", fix: "The ISL9238 or BQ24780 is not generating standby power. Check for input voltage at the IC. If input is present but no output: IC has failed. Check associated inductors and MOSFETs for shorts (diode mode). Replace failed IC.", difficulty: 5, tools: ["Multimeter (diode mode)", "Hot air rework station"] },
        },
      },
    ],
  },

  // ─── ASUS No Power ──────────────────────────────────────────────────────

  "asus-no-power": {
    name: "ASUS Laptop No Power Troubleshooter",
    description: "ASUS laptop completely dead -- EC reset, battery LED, USB-C PD, and VRM checks",
    steps: [
      {
        id: "start",
        instruction: "Perform an ASUS EC reset: disconnect the AC adapter and remove the battery (if removable). Hold the power button for 40 seconds (ASUS requires a longer hold than most brands). Reconnect AC adapter only and try powering on.",
        question: "After the 40-second EC reset, does the laptop show any response?",
        branches: {
          "yes": { cause: "EC lockup cleared by extended power button hold", fix: "ASUS EC chips sometimes require a longer reset than other brands. If this recurs, check for EC firmware updates via ASUS MyASUS app. Persistent lockups may indicate a failing ITE IT8586E or IT8987E EC chip.", difficulty: 1, tools: [] },
          "no": "check-battery-led",
        },
      },
      {
        id: "check-battery-led",
        instruction: "Plug in the AC adapter and observe the battery/charging LED. On most ASUS laptops, this is near the front edge or beside the power port. Orange = charging, green/white = fully charged, blinking = error.",
        question: "Does the battery LED show any light or blinking pattern?",
        branches: {
          "yes": "interpret-led",
          "no": "check-charger-voltage",
        },
      },
      {
        id: "interpret-led",
        instruction: "If the battery LED blinks: slow blink (every 2 seconds) usually means charging is paused due to temperature or battery error. Fast blink = critical battery error. Solid orange = normal charging but EC won't start the system.",
        question: "Is the LED solid orange (indicating power is reaching the board but system won't start)?",
        branches: {
          "yes": "check-ec-power",
          "no": { cause: "Battery error or charging subsystem fault", fix: "If LED blinks fast: battery may be critically overdischarged or damaged. Try a known-good battery. If LED blinks slow: check battery temperature sensor connection. Disconnect battery and try AC power only. If system works on AC only: battery or battery connector issue.", difficulty: 2, tools: ["Known-good battery", "Multimeter"] },
        },
      },
      {
        id: "check-charger-voltage",
        instruction: "No LED response at all. Verify the charger output: barrel jack models should show 19V. USB-C models should negotiate to 20V. Try a different charger. On USB-C ASUS models, try both USB-C ports (if available) as only one may support charging.",
        question: "Is the charger producing correct voltage and have you tried alternative chargers/ports?",
        branches: {
          "yes": "check-fuse-mosfet",
          "no": { cause: "Charger failure or incompatible charger", fix: "Replace with a known-good ASUS OEM charger. ASUS barrel jack chargers are typically 19V. For USB-C: minimum 65W PD charger required. Some ASUS gaming laptops require barrel jack for full power delivery and USB-C only provides reduced wattage.", difficulty: 1, tools: ["Known-good charger", "Multimeter"] },
        },
      },
      {
        id: "check-fuse-mosfet",
        instruction: "With the bottom panel removed, trace from the DC-in connector toward the first fuse or protection MOSFET. Check for continuity across the main input fuse. Inspect for any burnt or discolored components near the power input.",
        question: "Is the input fuse intact (continuity across it)?",
        branches: {
          "yes": "check-ec-power",
          "no": { cause: "Blown input fuse -- overcurrent event or short circuit downstream", fix: "Replace the blown fuse. Before powering on: check downstream components for short circuits using diode mode on the multimeter. Common short locations: charging IC MOSFET, USB-C protection IC, or VRM MOSFET. Do not just replace the fuse without finding the root cause.", difficulty: 4, tools: ["Multimeter (diode mode)", "Soldering iron", "Replacement fuse"] },
        },
      },
      {
        id: "check-ec-power",
        instruction: "Locate the EC chip (ITE IT8586E or IT8987E on most ASUS models). Check for 3.3V on the EC VCC pins. Also check for 32.768 kHz crystal oscillator near the EC.",
        question: "Does the EC chip have 3.3V and does the crystal appear intact?",
        branches: {
          "yes": "check-vrm-output",
          "no": { cause: "EC has no power -- upstream LDO or always-on rail failure", fix: "Trace the 3.3V supply backward from the EC chip. Find the LDO regulator that generates the EC's 3.3V (it derives from the main input). If the LDO has input but no 3.3V output: replace the LDO. If the LDO has no input: trace further upstream to the main power path.", difficulty: 4, tools: ["Multimeter", "Board schematic (if available)"] },
        },
      },
      {
        id: "check-vrm-output",
        instruction: "ASUS laptops, especially gaming models, have multiple VRM stages. Check the main CPU VRM output (typically 1.0-1.8V at the output inductor) and the memory VRM (1.1V or 1.35V). Use diode mode on the multimeter to check for shorted MOSFETs.",
        question: "Are all VRM outputs reading normal (no short circuits detected)?",
        branches: {
          "yes": { cause: "All power rails appear normal but system won't start -- EC firmware or BIOS corruption", fix: "Try external BIOS flash: locate the BIOS SPI flash chip (usually W25Q128 or similar 8-pin SOIC near the EC). Read with CH341A: 'biospy read asus_backup.bin'. Flash correct BIOS from ASUS support. Some ASUS models also have a recoverable EC flash region on the same or separate chip.", difficulty: 4, tools: ["CH341A/CH347", "SOIC8 clip", "biospy"] },
          "no": { cause: "VRM MOSFET short circuit -- common on ASUS TUF/ROG gaming laptops", fix: "Identify the shorted MOSFET: measure drain-source resistance in diode mode for each VRM MOSFET. A reading near 0 ohms indicates a short. Replace the shorted MOSFET. Common failure on ASUS ROG/TUF models under heavy GPU load. Check both high-side and low-side FETs.", difficulty: 5, tools: ["Multimeter (diode mode)", "Hot air rework station", "Replacement MOSFETs"] },
        },
      },
    ],
  },

  // ─── Apple MacBook No Power ─────────────────────────────────────────────

  "apple-no-power": {
    name: "Apple MacBook No Power Troubleshooter",
    description: "MacBook completely dead -- MagSafe/USB-C LED, SMC reset, liquid damage, and T2/M-series checks",
    steps: [
      {
        id: "start",
        instruction: "Connect the charger and check the LED. MagSafe: amber = charging, green = charged, no light = no handshake. USB-C (2016+): check USB-C charger indicator if present. On MacBook Pro 14/16 (2021+) with MagSafe 3: check the MagSafe LED color.",
        question: "Does the charger LED show any color (amber or green on MagSafe, any indicator on USB-C)?",
        branches: {
          "yes": "smc-reset",
          "no": "check-liquid-damage",
        },
      },
      {
        id: "smc-reset",
        instruction: "Perform SMC reset. Intel MacBook (pre-2020): hold Shift+Ctrl+Option (left side) + Power button for 10 seconds. Release all keys, then press power normally. T2 Mac: press and release power, then hold Shift+Ctrl+Option+Power for 7 seconds, release, wait 5 seconds, press power. Apple Silicon: shut down, hold power button for 10 seconds, release, wait, press power.",
        question: "After the SMC reset, does the MacBook show signs of life (screen, chime, fan)?",
        branches: {
          "yes": { cause: "SMC was in a fault state -- power management controller was hung", fix: "SMC reset resolved the issue. If it recurs: check for macOS updates, reset NVRAM (Command+Option+P+R on startup), and check battery health in System Information. Frequent SMC hangs on T2 Macs may require a DFU restore via Apple Configurator.", difficulty: 1, tools: [] },
          "no": "check-liquid-damage",
        },
      },
      {
        id: "check-liquid-damage",
        instruction: "Open the bottom case (pentalobe screws on MacBook). Check the liquid contact indicators (LCIs) -- small white stickers that turn red/pink when wet. Located near the logic board edges, near the fan, and near the battery connector. Also look for corrosion (green/white residue) on the logic board.",
        question: "Are there signs of liquid damage (red LCIs, corrosion, residue)?",
        branches: {
          "yes": { cause: "Liquid damage -- corrosion causing shorts or open circuits on the logic board", fix: "Clean the board with 99% isopropyl alcohol and a soft brush. Remove all visible corrosion. Pay special attention to the areas around the charge controller (CD3217, ISL9240) and the USB-C connectors. After cleaning, check for shorted power rails with multimeter in diode mode. Liquid damage often kills the CD3217 Thunderbolt controller or the ISL9240 charging IC.", difficulty: 4, tools: ["99% isopropyl alcohol", "Soft brush", "Multimeter (diode mode)", "Magnifying glass"] },
          "no": "check-cd3217",
        },
      },
      {
        id: "check-cd3217",
        instruction: "The CD3217 Thunderbolt/USB-C controller handles PD negotiation on Intel MacBooks. There is typically one per USB-C port. Locate the CD3217 chips (BGA, near each USB-C port). Check for 3.3V standby on the CD3217. If one port does not work, try the other.",
        question: "Have you tried both USB-C ports (or the MagSafe + USB-C), and does either provide power to the board?",
        branches: {
          "yes": "check-t2-m1",
          "no": { cause: "Both CD3217 controllers or upstream power path failed -- no power negotiation possible", fix: "If both USB-C ports are dead: check the common 20V bus fuse that feeds both CD3217 controllers. A single blown fuse can disable both ports. If fuse is intact: both CD3217 ICs may be damaged (common in liquid damage or surge). At least one CD3217 must be functional for USB-C charging to work.", difficulty: 5, tools: ["Multimeter", "Hot air rework station", "CD3217 replacement"] },
        },
      },
      {
        id: "check-t2-m1",
        instruction: "For T2 MacBooks (2018-2020): the T2 chip manages boot security and SSD encryption. A failed T2 prevents all boot. Check for 1.1V core voltage at the T2. For Apple Silicon (M1/M2/M3): the SoC handles everything -- check for main VCORE at the SoC inductor.",
        question: "Is there any voltage activity when pressing the power button (even momentary fan spin or LED flash)?",
        branches: {
          "yes": { cause: "System attempts to start but T2 or M-series SoC fails to boot -- firmware or silicon failure", fix: "T2 Mac: attempt DFU restore. Connect to another Mac with Apple Configurator 2, put the dead Mac in DFU mode (specific key combo varies by model), and restore BridgeOS firmware. If DFU fails: T2 hardware failure. M1/M2/M3: attempt DFU restore similarly. If DFU is unresponsive: SoC is dead (board replacement required).", difficulty: 4, tools: ["Another Mac with Apple Configurator 2", "USB-C cable for DFU"] },
          "no": "check-power-path",
        },
      },
      {
        id: "check-power-path",
        instruction: "Trace the power path from the USB-C port. Check for 20V on the main power bus (PPBUS_G3H on Intel models). Check the ISL9240 or equivalent charging IC for input and output. Measure 3.3V standby rail (PP3V3_G3H).",
        question: "Is the 20V bus voltage present from the charger (PPBUS or main input rail)?",
        branches: {
          "yes": { cause: "20V is present but downstream conversion fails -- ISL9240 or power management IC failure", fix: "The ISL9240 should generate system rails from the 20V input. Check for enable signals from the SMC/EC. Check ISL9240 output for system voltage. If ISL9240 has input and enable but no output: IC has failed. Replace ISL9240. Also check for shorted output capacitors or inductors.", difficulty: 5, tools: ["Multimeter", "Hot air rework station", "ISL9240 replacement"] },
          "no": { cause: "No voltage from charger reaching the main bus -- USB-C connector, CD3217, or MOSFET switch failure", fix: "Check each component in the chain: USB-C connector (physical damage), CD3217 (PD negotiation), MOSFET power switch (Q-series FET that connects charger to main bus). The MOSFET is controlled by the CD3217. If the MOSFET gate is not being driven: CD3217 failure. If gate is driven but no output: MOSFET is dead.", difficulty: 5, tools: ["Multimeter", "Magnifying glass", "Hot air rework station"] },
        },
      },
    ],
  },

  // ─── Laptop No Charge ───────────────────────────────────────────────────

  "laptop-no-charge": {
    name: "Laptop No Charge Troubleshooter",
    description: "Charger works and laptop runs on AC power, but battery will not charge",
    steps: [
      {
        id: "start",
        instruction: "Verify the charger wattage is correct for the laptop. Many laptops will run on a lower-wattage charger but won't charge the battery simultaneously. Check the label on the laptop bottom for required wattage.",
        question: "Is the charger wattage equal to or greater than the laptop's rated requirement?",
        branches: {
          "yes": "check-battery-health",
          "no": { cause: "Charger wattage insufficient for simultaneous operation and charging", fix: "Replace with a charger that meets or exceeds the laptop's wattage requirement. For USB-C PD laptops: some accept 45W for basic operation but require 65W+ for charging under load. Gaming laptops may need 90-230W.", difficulty: 1, tools: ["Correct wattage charger"] },
        },
      },
      {
        id: "check-battery-health",
        instruction: "Check battery health in the OS: Windows (powercfg /batteryreport), macOS (System Information > Power), Linux (upower -i /org/freedesktop/UPower/devices/battery_BAT0). Look at design capacity vs full charge capacity.",
        question: "Is the battery health above 50% (full charge capacity > 50% of design capacity)?",
        branches: {
          "yes": "check-charge-ic-communication",
          "no": { cause: "Battery is degraded beyond charging threshold", fix: "Replace the battery. Most laptop batteries degrade significantly after 500-1000 charge cycles or 3-5 years. If the battery is swollen (trackpad is raised, bottom panel bulges), remove it immediately -- swollen batteries are a fire hazard.", difficulty: 2, tools: ["Replacement battery"] },
        },
      },
      {
        id: "check-charge-ic-communication",
        instruction: "The EC communicates with the battery via SMBus (I2C). With the bottom panel removed, check the battery connector pins. Typical pinout: positive terminal(s), SMBus SDA, SMBus SCL, temperature sense, negative terminal(s). Look for corrosion on these pins.",
        question: "Is the battery connector clean and free of corrosion?",
        branches: {
          "yes": "check-charge-enable",
          "no": { cause: "Corroded battery connector preventing SMBus communication", fix: "Clean the battery connector pins with isopropyl alcohol and a cotton swab. If pins are heavily corroded: the connector may need replacement. Check both the motherboard connector and the battery cable connector. Ensure all pins make solid contact.", difficulty: 2, tools: ["Isopropyl alcohol", "Cotton swab", "Magnifying glass"] },
        },
      },
      {
        id: "check-charge-enable",
        instruction: "The charging IC (BQ25700, ISL9240, etc.) has a charge enable signal from the EC. If the EC decides not to charge (temperature too high, battery error, unsupported charger), it will disable charging. Check BIOS settings for battery charge thresholds or battery conservation mode.",
        question: "Is there a battery charge threshold or conservation mode enabled in BIOS/OS?",
        branches: {
          "yes": { cause: "Software-controlled charge limit is preventing full charge", fix: "Disable battery charge threshold or conservation mode. ThinkPads: Lenovo Vantage > Battery > Charge Threshold. Dell: Dell Power Manager > Battery > Custom. ASUS: MyASUS > Battery Health Charging. HP: HP Support Assistant > Battery. These modes intentionally stop charging at 60-80% to prolong battery life.", difficulty: 1, tools: [] },
          "no": "check-charge-mosfet",
        },
      },
      {
        id: "check-charge-mosfet",
        instruction: "The charge path typically goes through a MOSFET switch controlled by the charging IC. With the battery disconnected, measure the gate voltage on the charge MOSFET when AC is connected. The gate should go high to enable battery charging.",
        question: "Does the charge MOSFET gate signal change when the charger is connected?",
        branches: {
          "yes": { cause: "Charge MOSFET is switching but battery is not receiving charge current -- possible open sense resistor or battery pack issue", fix: "Check the current sense resistor in the charge path (low-value resistor, typically 5-20 milliohms). If open: no charge current flows. Also verify the battery pack's internal protection circuit is not tripped. Try a battery reset: disconnect battery for 30 seconds, reconnect.", difficulty: 3, tools: ["Multimeter"] },
          "no": { cause: "Charging IC not enabling the charge MOSFET -- IC failure or EC communication fault", fix: "The charging IC is not asserting the charge enable signal. Check I2C/SMBus communication between EC and charging IC (oscilloscope on SDA/SCL lines). If no communication: EC firmware issue or I2C bus pull-up resistor failure. If communication exists but charge still disabled: charging IC is faulty. Replace the IC.", difficulty: 4, tools: ["Multimeter", "Oscilloscope (optional)", "Hot air rework station"] },
        },
      },
    ],
  },

  // ─── Laptop No Backlight ────────────────────────────────────────────────

  "laptop-no-backlight": {
    name: "Laptop No Backlight Troubleshooter",
    description: "Screen appears dark but image is visible with a flashlight -- backlight circuit failure",
    steps: [
      {
        id: "start",
        instruction: "Shine a bright flashlight directly at the screen at an angle. Look for a dim image on the display. Try adjusting brightness with keyboard hotkeys (Fn+brightness up).",
        question: "Can you see a faint image on the screen with a flashlight?",
        branches: {
          "yes": "check-brightness-keys",
          "no": { cause: "No image at all -- this is not a backlight-only issue", fix: "If there is truly no image even with a flashlight, the problem is the display panel, GPU, or display cable, not just the backlight. Connect an external monitor to verify the GPU works. If external works: display cable or panel failure. If external also fails: GPU failure.", difficulty: 2, tools: ["Flashlight", "External monitor", "Display cable"] },
        },
      },
      {
        id: "check-brightness-keys",
        instruction: "Try pressing Fn + brightness up multiple times. On some laptops, the brightness can be set to zero via software. Also check display settings in the OS for brightness level.",
        question: "Does adjusting brightness (Fn key or OS settings) restore the backlight?",
        branches: {
          "yes": { cause: "Brightness was set to minimum via software or hotkey", fix: "Increase brightness. If it resets to zero on each boot: check for conflicting power management software or GPU driver settings. Update GPU drivers and check power plan settings.", difficulty: 1, tools: [] },
          "no": "check-backlight-fuse",
        },
      },
      {
        id: "check-backlight-fuse",
        instruction: "With the bottom panel removed, locate the backlight fuse. It is typically a small SMD fuse (0402 or 0603 size) near the display connector or the backlight driver IC. Measure continuity across it.",
        question: "Is the backlight fuse intact (continuity reads near 0 ohms)?",
        branches: {
          "yes": "check-backlight-driver",
          "no": { cause: "Blown backlight fuse -- overcurrent from short circuit in backlight circuit", fix: "Replace the backlight fuse. Before powering on, check for shorts: measure resistance across the backlight output (where the fuse connects to the display cable). A short to ground here indicates a failed backlight LED strip in the display panel or a shorted display cable. Replace the fuse and test with a known-good display if possible.", difficulty: 3, tools: ["Multimeter", "Soldering iron", "Replacement fuse (check marking for rating)"] },
        },
      },
      {
        id: "check-backlight-driver",
        instruction: "The backlight driver IC (common: LP8550, LP8556, TPS61187, ISL97671) generates high voltage (typically 20-50V) to drive the LED backlight strip. Locate the IC (near the display connector). Measure the output voltage with backlight enabled.",
        question: "Is the backlight driver IC producing output voltage (20-50V DC typical)?",
        branches: {
          "yes": "check-display-cable",
          "no": "check-driver-enable",
        },
      },
      {
        id: "check-driver-enable",
        instruction: "The backlight driver IC has an enable pin (BL_EN) controlled by the GPU or EC, and a PWM dimming signal. Check that the enable pin goes high (3.3V) when the system is on. Check the PWM signal is present (oscilloscope needed for PWM, but a multimeter showing ~1-3V indicates average duty cycle).",
        question: "Is the backlight enable signal (BL_EN) high (3.3V)?",
        branches: {
          "yes": { cause: "Backlight driver IC has enable and input power but produces no output -- IC failure", fix: "The backlight driver IC has failed. Replace the IC (LP8550, LP8556, TPS61187, or model-specific driver). Also check the boost inductor and schottky diode in the driver circuit. A shorted schottky diode can prevent the driver from boosting.", difficulty: 4, tools: ["Hot air rework station", "Replacement driver IC", "Multimeter"] },
          "no": { cause: "Backlight enable signal not asserted by GPU/EC -- software or EC issue", fix: "If BL_EN is always low: the EC or GPU is not requesting backlight. Try BIOS reset (clear CMOS). Try booting Linux live USB to rule out OS/driver issue. If BL_EN stays low in BIOS: EC or GPU output failure. Check the trace from EC/GPU to the backlight driver enable pin.", difficulty: 3, tools: ["Multimeter", "Linux live USB"] },
        },
      },
      {
        id: "check-display-cable",
        instruction: "The display cable (LVDS or eDP, 30-pin or 40-pin) carries both the video signal and backlight power/enable. Inspect the cable for damage, especially at the hinge area where it flexes repeatedly. Reseat both ends of the cable.",
        question: "After reseating the display cable, does the backlight work?",
        branches: {
          "yes": { cause: "Loose or oxidized display cable connection", fix: "Reseat resolved the issue. If it recurs, the cable may be developing a break at the hinge flex point. On MacBook Pro 2016-2017 (flexgate), this is a known design flaw. Replace the display cable. On some models, the cable is part of the display assembly and the entire assembly must be replaced.", difficulty: 2, tools: ["Replacement display cable (if needed)"] },
          "no": { cause: "Display cable or panel backlight strip failure", fix: "Try a known-good display cable if available separately. If the cable is good, the backlight LED strip inside the display panel has failed. For older laptops with CCFL backlights: the inverter board may be dead (replace inverter). For LED backlight: entire display panel replacement is typically required unless you can replace the LED strip.", difficulty: 3, tools: ["Replacement display cable", "Replacement display panel"] },
        },
      },
    ],
  },

  // ─── Laptop Keyboard Dead ──────────────────────────────────────────────

  "laptop-keyboard-dead": {
    name: "Laptop Keyboard Dead Troubleshooter",
    description: "Laptop keyboard completely unresponsive -- all keys dead, no input registered",
    steps: [
      {
        id: "start",
        instruction: "Connect an external USB keyboard to the laptop. Test if the external keyboard works normally, including in BIOS (restart and press F2/Del to enter BIOS setup using the external keyboard).",
        question: "Does the external USB keyboard work, including in BIOS?",
        branches: {
          "yes": "check-ribbon-cable",
          "no": { cause: "Both internal and external keyboards dead -- USB controller or EC failure", fix: "If even USB keyboards don't work: the USB controller (part of the PCH or EC) may be failed. Try different USB ports. In BIOS: if no keyboard works, check for stuck keys on the internal keyboard (a single stuck key can block all input). Disconnect the internal keyboard ribbon cable and try USB keyboard again.", difficulty: 3, tools: ["External USB keyboard"] },
        },
      },
      {
        id: "check-ribbon-cable",
        instruction: "Power off the laptop. Remove the keyboard (typically held by screws from underneath or clips from the top). Carefully disconnect and inspect the keyboard ribbon cable. Look for tears, creases, or corrosion on the contacts.",
        question: "Is the ribbon cable physically intact with clean contacts?",
        branches: {
          "yes": "reseat-ribbon",
          "no": { cause: "Damaged keyboard ribbon cable -- torn or corroded contacts", fix: "Replace the keyboard (the ribbon cable is typically integrated with the keyboard on modern laptops). If the cable is separate: replace just the cable. Clean corroded contacts with isopropyl alcohol before condemning the cable.", difficulty: 2, tools: ["Replacement keyboard", "Isopropyl alcohol"] },
        },
      },
      {
        id: "reseat-ribbon",
        instruction: "Carefully reseat the keyboard ribbon cable into its connector on the motherboard. Ensure the ZIF (zero insertion force) connector latch is fully open before inserting, then close the latch firmly. The cable should be inserted straight and fully in.",
        question: "After reseating the ribbon cable, does the keyboard work?",
        branches: {
          "yes": { cause: "Loose ribbon cable connection -- the ZIF connector was not fully engaged", fix: "Issue resolved. If it recurs: the ZIF connector latch may be worn or broken. Check that the latch fully locks. On some laptops, a small piece of tape over the cable at the connector can help maintain pressure.", difficulty: 1, tools: [] },
          "no": "check-keyboard-connector",
        },
      },
      {
        id: "check-keyboard-connector",
        instruction: "Inspect the ZIF connector on the motherboard more closely. Check for broken latch, corroded pins, or damage. Use a magnifying glass. The connector should have clean, evenly spaced pins.",
        question: "Is the motherboard ZIF connector in good condition (intact latch, clean pins)?",
        branches: {
          "yes": "check-ec-keyboard",
          "no": { cause: "Damaged ZIF connector on the motherboard", fix: "The keyboard connector on the motherboard needs replacement. This is a board-level soldering repair. The connector is typically a surface-mount part that can be replaced with hot air and a replacement connector. Alternatively, some technicians can repair bent pins with fine-tip tweezers under a microscope.", difficulty: 4, tools: ["Hot air rework station", "Replacement ZIF connector", "Magnifying glass"] },
        },
      },
      {
        id: "check-ec-keyboard",
        instruction: "The EC (embedded controller) handles keyboard scanning on most laptops. Check if the EC is running: the EC also handles the power button, fan control, and LED indicators. If all of these work, the EC is functioning.",
        question: "Do other EC-controlled features work (power button, fan control, charge LED)?",
        branches: {
          "yes": { cause: "EC is running but keyboard input is not being read -- keyboard matrix circuit failure", fix: "The issue is between the EC and the keyboard. With a multimeter, check for continuity on the keyboard data lines from the connector to the EC. If lines are intact: try a different keyboard (the keyboard's internal matrix may be failed). If a specific row or column is dead: trace that line from the connector.", difficulty: 3, tools: ["Multimeter", "Replacement keyboard"] },
          "no": { cause: "EC not fully operational -- partial EC failure or firmware corruption", fix: "If the EC is partially working (some functions work, others do not): EC firmware may be corrupted. Try EC firmware update from the manufacturer. If no update available: external flash of EC firmware may be needed. Locate EC SPI flash chip and reprogram with CH341A.", difficulty: 4, tools: ["CH341A/CH347", "SOIC8 clip", "EC firmware file"] },
        },
      },
    ],
  },

  // ─── Laptop No WiFi ─────────────────────────────────────────────────────

  "laptop-no-wifi": {
    name: "Laptop No WiFi Troubleshooter",
    description: "WiFi adapter not detected in OS or BIOS -- M.2 slot, antenna, and whitelist issues",
    steps: [
      {
        id: "start",
        instruction: "Check if WiFi is disabled by a physical switch or keyboard hotkey. Many laptops have an airplane mode key (Fn+F-key with airplane icon) or a physical WiFi switch on the side edge. Also check OS airplane mode settings.",
        question: "Is the WiFi switch/hotkey in the ON position and airplane mode disabled?",
        branches: {
          "yes": "check-device-manager",
          "no": { cause: "WiFi disabled by physical switch or airplane mode", fix: "Enable WiFi using the physical switch or Fn hotkey. Disable airplane mode in OS settings. If the Fn key does not toggle WiFi: the hotkey driver may not be installed. Install the manufacturer's hotkey or system utility driver.", difficulty: 1, tools: [] },
        },
      },
      {
        id: "check-device-manager",
        instruction: "Open Device Manager (Windows) or lspci (Linux) and look for the WiFi adapter. It should appear under 'Network adapters' in Windows or as a PCI device in Linux. Check if it shows as present, or with a yellow exclamation, or completely absent.",
        question: "Is the WiFi adapter visible in Device Manager/lspci (even with an error)?",
        branches: {
          "yes": { cause: "WiFi adapter is detected but has a driver issue", fix: "If showing with an error: uninstall the driver, reboot, and install the latest driver from the manufacturer (Intel, Qualcomm, MediaTek). If it shows as disabled: enable it. On Linux: run 'sudo modprobe iwlwifi' (Intel) or the appropriate module. Check for rfkill: 'rfkill list' and 'rfkill unblock wifi'.", difficulty: 1, tools: [] },
          "no": "check-m2-slot",
        },
      },
      {
        id: "check-m2-slot",
        instruction: "Power off the laptop and remove the bottom panel. Locate the M.2 WiFi card (small card, typically M.2 2230, with two antenna cables attached). Check that it is fully seated in the M.2 slot and secured with a screw.",
        question: "Is the WiFi card properly seated in the M.2 slot?",
        branches: {
          "yes": "check-antenna-cables",
          "no": { cause: "WiFi card not properly seated in M.2 slot", fix: "Reseat the WiFi card: remove the screw, pull the card out, reinsert at a 30-degree angle into the M.2 slot, press down, and secure with the screw. Ensure it clicks into the connector.", difficulty: 1, tools: ["Small Phillips screwdriver"] },
        },
      },
      {
        id: "check-antenna-cables",
        instruction: "Check the two antenna cables (usually black and white, or gray and black) connected to the WiFi card with U.FL/MHF4 connectors. They should snap on firmly. Also trace the cables up through the hinge area to the display lid where the antennas are embedded.",
        question: "Are both antenna cables firmly connected and do they appear undamaged through the hinge?",
        branches: {
          "yes": "check-bios-whitelist",
          "no": { cause: "Disconnected or damaged antenna cables", fix: "Reconnect the antenna cables: press down firmly on each U.FL connector until it clicks. If cables are damaged (torn, pinched at hinge): replace the antenna cables. The cables route through the hinge and into the display lid. On some models, replacing the cables requires removing the display.", difficulty: 2, tools: ["Replacement antenna cables (if damaged)"] },
        },
      },
      {
        id: "check-bios-whitelist",
        instruction: "Some laptop manufacturers (especially Lenovo and HP) have a BIOS WiFi card whitelist. If you installed a non-OEM WiFi card, the BIOS may block it. Check BIOS: restart and enter BIOS setup, look for error messages about unauthorized wireless card.",
        question: "Does the BIOS show a whitelist error or unauthorized card message?",
        branches: {
          "yes": { cause: "BIOS WiFi whitelist rejects the installed card", fix: "Options: 1) Install a WiFi card that is on the whitelist (check the laptop service manual for compatible models). 2) Use a modified BIOS with whitelist removed (not recommended for warranty or security reasons). 3) On some Lenovo ThinkPads, newer BIOS updates have removed the whitelist. Common compatible card: Intel AX210 works in most modern laptops.", difficulty: 2, tools: ["Compatible WiFi card from whitelist"] },
          "no": "try-different-card",
        },
      },
      {
        id: "try-different-card",
        instruction: "If the card is not detected and there is no whitelist issue, try a known-good WiFi card in the same M.2 slot. If no spare card is available, try the existing card in another laptop to verify it works.",
        question: "Does a different WiFi card work in this laptop's M.2 slot?",
        branches: {
          "yes": { cause: "Original WiFi card is dead", fix: "Replace the WiFi card. Common reliable options: Intel AX210, Intel AX211, Intel AX200. Ensure the card matches the M.2 key type (Key E or Key A+E for WiFi). Transfer the antenna cables to the new card.", difficulty: 1, tools: ["Replacement WiFi card", "Small Phillips screwdriver"] },
          "no": { cause: "M.2 WiFi slot is dead -- PCIe lane or power delivery failure to the M.2 slot", fix: "The M.2 slot itself is not providing PCIe or power to the card. Check for voltage at the M.2 slot pins (3.3V should be present). If no 3.3V: trace back to the power rail (usually a small LDO or switched rail from the EC/PCH). A blown fuse or failed LDO can disable the entire M.2 slot. Use a USB WiFi adapter as a workaround.", difficulty: 4, tools: ["Multimeter", "USB WiFi adapter (workaround)"] },
        },
      },
    ],
  },

  // ─── Laptop Overheating ─────────────────────────────────────────────────

  "laptop-overheating": {
    name: "Laptop Overheating Troubleshooter",
    description: "Laptop thermal throttles or shuts down under load -- fan, thermal paste, and airflow diagnostics",
    steps: [
      {
        id: "start",
        instruction: "Monitor CPU and GPU temperatures using HWMonitor (Windows), iStat Menus (macOS), or sensors (Linux). Run a stress test (Prime95 for CPU, FurMark for GPU) for 5 minutes. Note the peak temperatures.",
        question: "Are peak temperatures above 95C under load?",
        branches: {
          "yes": "check-fan-operation",
          "no": { cause: "Temperatures are within normal range -- throttling may be software-related", fix: "If the laptop feels hot but temperatures are normal: check power plan settings (Windows: High Performance vs Balanced), update BIOS for improved fan curve, check for background processes causing unnecessary CPU load. If thermal shutdown occurs below 95C: the shutdown threshold may be set too low in BIOS.", difficulty: 1, tools: ["HWMonitor/iStat Menus/sensors"] },
        },
      },
      {
        id: "check-fan-operation",
        instruction: "Listen for fan noise. Place your hand near the exhaust vent -- you should feel warm air being pushed out. In software, check fan RPM (HWMonitor shows fan speed). If the fan is not spinning or spinning very slowly, the cooling system is compromised.",
        question: "Is the fan spinning and pushing air out of the exhaust vent?",
        branches: {
          "yes": "check-vents",
          "no": "diagnose-fan",
        },
      },
      {
        id: "diagnose-fan",
        instruction: "Fan not spinning. Check: 1) Is the fan connector firmly plugged into the motherboard? 2) Is the fan physically blocked or seized? Spin it gently by hand (should spin freely). 3) Does the BIOS/EC show fan RPM as 0?",
        question: "Does the fan spin freely when manually rotated and is the connector plugged in?",
        branches: {
          "yes": { cause: "Fan motor or fan control circuit failure -- fan has power and is not seized but does not spin", fix: "Check the fan connector voltage: should see 5V (3-wire) or PWM signal (4-wire) when the system is hot. If voltage is present: fan motor is dead -- replace the fan. If no voltage: the EC fan control output is failed or fan control is disabled. Check BIOS for fan settings. Try EC firmware update.", difficulty: 2, tools: ["Multimeter", "Replacement fan"] },
          "no": { cause: "Fan is physically seized or connector is disconnected", fix: "If seized: dust or bearing failure. Clean dust from the fan blades and bearing area with compressed air. If bearing is failed (grinding noise or won't spin freely): replace the fan assembly. If connector is unplugged: reconnect it. Fan connectors are typically 3 or 4 pin JST.", difficulty: 2, tools: ["Compressed air", "Replacement fan (if bearing failed)"] },
        },
      },
      {
        id: "check-vents",
        instruction: "Fan works but temps are still too high. Inspect the exhaust vent and heatsink fins. Look for dust accumulation blocking the fins. Also check the intake vents (usually on the bottom of the laptop) for blockage.",
        question: "Are the heatsink fins and vents clear of dust and debris?",
        branches: {
          "yes": "check-thermal-paste",
          "no": { cause: "Dust buildup blocking airflow through heatsink fins", fix: "Use compressed air to blow out dust from the exhaust vents and heatsink fins. For thorough cleaning: remove the bottom panel and blow compressed air through the fins from the inside out. Do not use a vacuum (creates static). On heavily clogged systems: remove the heatsink entirely and clean each component.", difficulty: 1, tools: ["Compressed air"] },
        },
      },
      {
        id: "check-thermal-paste",
        instruction: "Remove the heatsink (typically 4-8 screws in a specific order). Inspect the thermal paste between the CPU die and the heatsink. Old thermal paste becomes dry, cracked, and loses thermal conductivity. Quality paste should be a smooth gray film.",
        question: "Is the thermal paste dried out, cracked, or unevenly applied?",
        branches: {
          "yes": "repaste",
          "no": "check-heatsink-mount",
        },
      },
      {
        id: "repaste",
        instruction: "Clean old thermal paste from both the CPU/GPU die and the heatsink contact surface using 99% isopropyl alcohol and a lint-free cloth. Apply a small amount of quality thermal paste (Thermal Grizzly Kryonaut, Noctua NT-H1, or similar) -- a grain-of-rice sized dot for laptop CPU dies.",
        question: "After repasting and reassembling, are temperatures improved (10-20C drop typical)?",
        branches: {
          "yes": { cause: "Dried out thermal paste was causing poor heat transfer", fix: "Temperature issue resolved. Thermal paste should be replaced every 2-3 years on laptops, more frequently on gaming laptops under heavy load. Use quality thermal paste (avoid cheap brands). Do not use too much -- excess paste can actually insulate rather than conduct heat.", difficulty: 2, tools: ["99% isopropyl alcohol", "Lint-free cloth", "Quality thermal paste"] },
          "no": "check-heatsink-mount",
        },
      },
      {
        id: "check-heatsink-mount",
        instruction: "Verify the heatsink is making proper contact with the CPU/GPU dies. Check mounting screws are tightened evenly (tighten in a cross pattern). Some heatsinks use spring-loaded screws -- verify springs are intact. Check that heatsink heatpipes are not damaged (dented, kinked, or leaked).",
        question: "Are the heatsink mounting screws tight, springs intact, and heatpipes undamaged?",
        branches: {
          "yes": { cause: "Heatsink and thermal paste are fine -- laptop design has insufficient cooling capacity for the workload", fix: "Some laptops are thermally constrained by design (thin ultrabooks with high-power CPUs). Options: 1) Use a laptop cooling pad (reduces temps by 3-8C). 2) Undervolt the CPU using ThrottleStop (Intel) or Ryzen Controller (AMD). 3) Limit turbo boost in BIOS or OS. 4) Improve airflow: elevate the rear of the laptop.", difficulty: 1, tools: ["Laptop cooling pad (optional)", "ThrottleStop/Ryzen Controller"] },
          "no": { cause: "Heatsink mounting issue -- insufficient pressure on the CPU/GPU die or damaged heatpipe", fix: "If screws are loose: tighten evenly in a cross pattern. If springs are broken: replace the heatsink assembly. If heatpipes are dented or kinked: the heatpipe fluid cannot circulate properly -- replace the entire heatsink/fan assembly. A leaking heatpipe (visible wet spot or crusty residue) is always dead and must be replaced.", difficulty: 2, tools: ["Replacement heatsink/fan assembly", "Screwdriver"] },
        },
      },
    ],
  },
};

// ─── Lookup Functions ───────────────────────────────────────────────────────

export function getLaptopWorkflow(id: string): Workflow | undefined {
  return LAPTOP_WORKFLOWS[id];
}

export function listLaptopWorkflows(): Array<{ id: string; name: string; description: string }> {
  return Object.entries(LAPTOP_WORKFLOWS).map(([id, wf]) => ({
    id,
    name: wf.name,
    description: wf.description,
  }));
}
