export interface WorkflowStep {
  id: string;
  instruction: string;
  question: string;
  branches: Record<string, string | WorkflowConclusion>;
}

export interface WorkflowConclusion {
  cause: string;
  fix: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tools: string[];
}

export interface Workflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

function isConclusion(v: string | WorkflowConclusion): v is WorkflowConclusion {
  return typeof v === "object" && "cause" in v;
}

export const WORKFLOWS: Record<string, Workflow> = {
  "no-boot": {
    name: "No Boot Troubleshooter",
    description: "System won't boot at all — diagnose from power to POST",
    steps: [
      {
        id: "start",
        instruction: "Check the motherboard standby LED (small LED on the board, visible when PSU is plugged in and switched on).",
        question: "Is the standby LED lit?",
        branches: {
          "yes": "check-power-button",
          "no": { cause: "No standby power (5VSB) — PSU failure or no AC power", fix: "Test PSU with paperclip test. Check wall outlet. Try different power cable. If PSU passes, motherboard has a short preventing 5VSB.", difficulty: 2, tools: ["Multimeter", "Paperclip"] },
        },
      },
      {
        id: "check-power-button",
        instruction: "Press the power button. If nothing happens, try shorting the power switch header pins on the motherboard directly with a screwdriver.",
        question: "Do the fans spin when you short the power pins?",
        branches: {
          "yes": "fans-duration",
          "no": { cause: "PS_ON signal not reaching PSU — power button circuit failure or board-level short preventing ATX enable", fix: "Check EPS 8-pin CPU power is connected. Disconnect everything except 24-pin and 8-pin, try again. If still dead: measure PS_ON signal with multimeter — should go from 5V to <1V when pins shorted.", difficulty: 3, tools: ["Multimeter", "Screwdriver"] },
        },
      },
      {
        id: "fans-duration",
        instruction: "Observe the fans. Do they spin and STAY spinning, or do they spin briefly (1-3 seconds) then stop?",
        question: "Do fans stay spinning?",
        branches: {
          "yes": "check-display",
          "no": { cause: "Power Good not asserted or VRM fault — PSU detects overcurrent/short and shuts down", fix: "Measure 12V rail under load. Check for shorted VRM MOSFETs (multimeter diode mode across drain-source of each MOSFET near CPU). Remove CPU and check for bent pins. Try minimum config: one RAM stick, no GPU.", difficulty: 4, tools: ["Multimeter (diode mode)", "Magnifying glass"] },
        },
      },
      {
        id: "check-display",
        instruction: "Connect a monitor. Try both HDMI and DisplayPort if available. Try both motherboard video output and GPU output.",
        question: "Do you see any display output (POST screen, logo, or BIOS)?",
        branches: {
          "yes": "check-boot-device",
          "no": "check-beeps",
        },
      },
      {
        id: "check-beeps",
        instruction: "Connect a PC speaker/buzzer to the motherboard speaker header. Power on and listen.",
        question: "Do you hear any beep codes?",
        branches: {
          "yes": { cause: "BIOS is running and reporting an error via beep codes", fix: "Count the beep pattern. Use 'biospy post-decode' to interpret. Common: 1 long 2 short = GPU error (reseat GPU), 3 short = RAM error (reseat/replace RAM), continuous beep = RAM not detected.", difficulty: 2, tools: ["PC speaker", "biospy post-decode"] },
          "no": "check-debug-led",
        },
      },
      {
        id: "check-debug-led",
        instruction: "Check if your motherboard has a POST code debug LED display (2-digit hex display, usually near the 24-pin connector).",
        question: "Does the board have a debug LED, and does it show a code?",
        branches: {
          "yes": { cause: "System is stuck at a specific POST stage — the code tells you which one", fix: "Read the hex code on the LED. Use 'biospy post-decode <code>' to decode it. Address the specific hardware subsystem identified by the code.", difficulty: 2, tools: ["biospy post-decode"] },
          "no": "try-ram",
        },
      },
      {
        id: "try-ram",
        instruction: "Remove all RAM. Try one stick at a time in the primary DIMM slot (usually A2, second slot from CPU). Clean contacts with isopropyl alcohol.",
        question: "Does the system POST with one RAM stick?",
        branches: {
          "yes": { cause: "RAM issue — either a bad stick, bad slot, or incompatible combination", fix: "Test each stick individually. If one stick fails in all slots, it's bad. If all sticks fail in one slot, the slot is bad. Check motherboard QVL for compatibility.", difficulty: 2, tools: ["Isopropyl alcohol", "Lint-free cloth"] },
          "no": "try-igpu",
        },
      },
      {
        id: "try-igpu",
        instruction: "Remove the discrete GPU entirely. Connect monitor to motherboard video output (HDMI/DP on I/O panel).",
        question: "Does the CPU have integrated graphics, and does the system POST without the GPU?",
        branches: {
          "yes": { cause: "GPU or PCIe slot failure", fix: "Try GPU in different PCIe slot. Try a different GPU. Clean PCIe contacts with isopropyl alcohol. If all GPUs fail in all slots: PCIe controller on CPU/PCH may be dead.", difficulty: 3, tools: ["Isopropyl alcohol", "Known-good GPU (optional)"] },
          "no": "likely-cpu-or-bios",
        },
      },
      {
        id: "likely-cpu-or-bios",
        instruction: "With minimum config (CPU + 1 RAM stick + no GPU), system still doesn't POST. Try: 1) Clear CMOS (remove battery 30s). 2) If board has BIOS flashback, try flashing BIOS via USB.",
        question: "Does BIOS flashback work or does clearing CMOS help?",
        branches: {
          "yes": { cause: "Corrupt BIOS", fix: "If BIOS flashback worked, system should POST. If clearing CMOS helped, settings were misconfigured. If problem recurs: replace CMOS battery and flash BIOS clean.", difficulty: 2, tools: ["USB drive (FAT32)", "CR2032 battery"] },
          "no": { cause: "CPU failure, dead motherboard, or BIOS chip hardware failure", fix: "If possible, try a known-good CPU. If BIOS chip is socketed or SOIC, read with CH341A: 'biospy read dump.bin'. If dump is all 0xFF or 0x00: chip is dead/erased — flash correct BIOS externally. If dump looks valid: CPU or board is dead.", difficulty: 5, tools: ["CH341A/CH347", "SOIC8 clip", "Known-good CPU", "biospy"] },
        },
      },
      {
        id: "check-boot-device",
        instruction: "System POSTs and shows BIOS/logo. Check if it finds a boot device.",
        question: "Does the system attempt to boot an OS?",
        branches: {
          "yes": { cause: "System POSTs and boots — issue may be OS-level", fix: "If it crashes during OS load: run memtest86, check storage SMART health, boot Linux live USB to verify hardware. If all hardware tests pass: reinstall OS.", difficulty: 1, tools: ["Memtest86 USB", "Linux live USB"] },
          "no": { cause: "POST succeeds but no bootable device", fix: "Check BIOS boot order. Verify storage drive is connected and detected. Check UEFI/Legacy mode matches OS installation. Try drive in different SATA port.", difficulty: 1, tools: ["SATA cable"] },
        },
      },
    ],
  },

  "no-display": {
    name: "No Display Troubleshooter",
    description: "System powers on but no video output — fans spin, LEDs light, but screen is blank",
    steps: [
      {
        id: "start",
        instruction: "Verify the monitor is on, set to correct input, and the cable is securely connected at both ends.",
        question: "Is the monitor confirmed working (shows 'No Signal' or similar)?",
        branches: {
          "yes": "try-different-output",
          "no": { cause: "Monitor issue", fix: "Try a different monitor. Check monitor power cable. Try different input source.", difficulty: 1, tools: ["Known-good monitor"] },
        },
      },
      {
        id: "try-different-output",
        instruction: "Try a different video output: HDMI instead of DP, or vice versa. Try both GPU outputs and motherboard outputs.",
        question: "Does any video output work?",
        branches: {
          "yes": { cause: "Specific port or cable failure", fix: "If only motherboard output works: GPU or PCIe issue. If only GPU works: iGPU disabled in BIOS (normal when GPU present). If only certain ports: bad port on GPU or bad cable.", difficulty: 1, tools: ["Different display cable"] },
          "no": "check-gpu-seated",
        },
      },
      {
        id: "check-gpu-seated",
        instruction: "Power off. Open case. Reseat the GPU: remove it completely, clean PCIe contacts with isopropyl alcohol, reinsert firmly until the latch clicks. Check GPU power cables (6/8-pin) are connected.",
        question: "After reseating, does display work?",
        branches: {
          "yes": { cause: "Poor GPU contact in PCIe slot", fix: "Issue resolved. If it recurs: the PCIe slot may be worn or the GPU bracket may be applying pressure that unseats the card. Secure the GPU with a support bracket.", difficulty: 1, tools: ["Isopropyl alcohol"] },
          "no": "remove-gpu",
        },
      },
      {
        id: "remove-gpu",
        instruction: "Remove the GPU entirely. Connect monitor to motherboard video output. This only works if your CPU has integrated graphics (Intel non-F, AMD with G suffix).",
        question: "Does the system display via motherboard output?",
        branches: {
          "yes": { cause: "GPU failure or PCIe slot issue", fix: "Try GPU in a different PCIe slot if available. Try a different GPU if available. If no GPU works in any slot: PCIe controller failure on CPU or PCH.", difficulty: 3, tools: ["Known-good GPU (optional)"] },
          "no": "check-ram",
        },
      },
      {
        id: "check-ram",
        instruction: "Remove all RAM. Try one stick in the primary slot (A2). Clean contacts with isopropyl alcohol.",
        question: "Does display work with one RAM stick?",
        branches: {
          "yes": { cause: "RAM incompatibility or bad stick preventing video init", fix: "Test each stick individually. A bad RAM stick can prevent the system from reaching video initialization.", difficulty: 2, tools: ["Isopropyl alcohol"] },
          "no": "clear-cmos",
        },
      },
      {
        id: "clear-cmos",
        instruction: "Clear CMOS: remove the CR2032 battery for 30 seconds, or use the CLR_CMOS jumper. This resets all BIOS settings including GPU-related ones.",
        question: "Does display work after clearing CMOS?",
        branches: {
          "yes": { cause: "BIOS settings were misconfigured (wrong primary display, disabled iGPU, etc.)", fix: "Reconfigure BIOS settings carefully. Avoid setting 'Primary Display' to a GPU type that isn't installed.", difficulty: 1, tools: ["CR2032 battery"] },
          "no": { cause: "Hardware failure preventing video initialization — likely GPU, CPU graphics, or BIOS corruption", fix: "Try BIOS flashback if available. Read BIOS chip with 'biospy read dump.bin' and analyze with 'biospy analyze dump.bin'. If BIOS is corrupt, reflash. If BIOS is fine: CPU or motherboard failure.", difficulty: 4, tools: ["CH341A/CH347", "biospy"] },
        },
      },
    ],
  },

  "reboot-loop": {
    name: "Reboot Loop Troubleshooter",
    description: "System powers on but reboots repeatedly — never stays on or reaches BIOS",
    steps: [
      {
        id: "start",
        instruction: "Observe the reboot cycle timing. How long does the system stay on before rebooting?",
        question: "Does it stay on for more than 5 seconds?",
        branches: {
          "yes": "reaches-post",
          "no": "short-cycle",
        },
      },
      {
        id: "short-cycle",
        instruction: "Very short power cycle (1-3 seconds) usually means the CPU can't initialize. Check if CPU is compatible with BIOS version.",
        question: "Is this a new CPU installation or CPU upgrade?",
        branches: {
          "yes": { cause: "CPU likely requires BIOS update to be supported", fix: "Check motherboard support page for CPU compatibility list. Use BIOS flashback to update BIOS without the CPU if supported. If no flashback: you need a compatible CPU to boot, update BIOS, then swap.", difficulty: 2, tools: ["USB drive (FAT32)", "Compatible CPU for BIOS update"] },
          "no": "check-vrm",
        },
      },
      {
        id: "check-vrm",
        instruction: "Feel the VRM heatsinks near the CPU socket (after brief power cycle, power off first!). Check for extremely hot MOSFETs.",
        question: "Are the VRM components extremely hot?",
        branches: {
          "yes": { cause: "VRM failure — MOSFET short circuit causing overcurrent shutdown", fix: "Board needs VRM repair (MOSFET replacement). Check which phase is shorted: measure drain-source resistance of each MOSFET in diode mode — shorted one will read near 0 ohms. This is advanced board-level repair.", difficulty: 5, tools: ["Multimeter (diode mode)", "Soldering station (for repair)"] },
          "no": "minimum-config",
        },
      },
      {
        id: "minimum-config",
        instruction: "Strip to minimum config: CPU + 1 RAM stick in primary slot + CPU cooler. Remove GPU, all drives, all USB devices, all expansion cards.",
        question: "Does the system still reboot loop in minimum config?",
        branches: {
          "yes": "try-different-ram",
          "no": { cause: "One of the removed components is causing the reboot", fix: "Add components back one at a time, testing between each. The one that triggers the loop is the culprit. Common: bad RAM stick, shorted SATA device, or faulty GPU.", difficulty: 2, tools: [] },
        },
      },
      {
        id: "try-different-ram",
        instruction: "Try completely different RAM (different kit, not just different stick from same kit). Try each DIMM slot.",
        question: "Does different RAM fix the reboot loop?",
        branches: {
          "yes": { cause: "RAM incompatibility or failure", fix: "Check motherboard QVL (Qualified Vendor List) for supported RAM kits. Try running RAM at JEDEC spec (no XMP) first.", difficulty: 1, tools: ["Compatible RAM from QVL"] },
          "no": "clear-and-flash",
        },
      },
      {
        id: "clear-and-flash",
        instruction: "Clear CMOS. If board has BIOS flashback, flash the latest BIOS.",
        question: "Does clearing CMOS or flashing BIOS fix it?",
        branches: {
          "yes": { cause: "Corrupt BIOS or bad settings causing init failure", fix: "Reconfigure BIOS settings conservatively. Avoid aggressive overclocking on first boot.", difficulty: 1, tools: ["USB drive (FAT32)"] },
          "no": { cause: "CPU or motherboard hardware failure", fix: "Try a known-good CPU if possible. If CPU swap doesn't help: motherboard failure (likely PCH or CPU socket damage). External BIOS flash with CH341A may help if the issue is firmware, not hardware.", difficulty: 5, tools: ["Known-good CPU", "CH341A/CH347", "biospy"] },
        },
      },
    ],
  },

  "bios-corrupt": {
    name: "BIOS Recovery Troubleshooter",
    description: "BIOS appears corrupt — failed update, won't POST, recovery mode",
    steps: [
      {
        id: "start",
        instruction: "Determine what happened: did a BIOS update fail? Was there a power loss during update? Or did the board just stop booting one day?",
        question: "Did this happen during or after a BIOS update attempt?",
        branches: {
          "yes": "check-recovery-features",
          "no": "gradual-corruption",
        },
      },
      {
        id: "check-recovery-features",
        instruction: "Check your motherboard manual for BIOS recovery features: BIOS Flashback (USB recovery without CPU), Dual BIOS (backup chip), or BIOS recovery hotkey.",
        question: "Does your board have BIOS Flashback or Dual BIOS?",
        branches: {
          "yes": "try-flashback",
          "no": "external-flash",
        },
      },
      {
        id: "try-flashback",
        instruction: "For BIOS Flashback: Format USB drive as FAT32. Download correct BIOS from manufacturer. Rename file exactly as manual specifies (e.g., MSI.ROM, ASUS.CAP). Insert in designated flashback USB port. Hold flashback button 3 seconds.",
        question: "Did BIOS flashback complete successfully (LED stops blinking)?",
        branches: {
          "yes": { cause: "Corrupt BIOS — now recovered via flashback", fix: "System should boot now. Enter BIOS, load optimized defaults, save and reboot. Verify version is correct.", difficulty: 1, tools: ["USB drive (FAT32)"] },
          "no": "flashback-debug",
        },
      },
      {
        id: "flashback-debug",
        instruction: "Flashback failed. Common issues: wrong USB port, wrong filename, wrong BIOS file, USB drive not FAT32, USB 3.0 drive (some boards need USB 2.0).",
        question: "After fixing the above, does flashback work?",
        branches: {
          "yes": { cause: "Flashback user error — now resolved", fix: "Ensure you follow the exact procedure from the manual next time.", difficulty: 1, tools: ["USB 2.0 drive (FAT32)"] },
          "no": "external-flash",
        },
      },
      {
        id: "external-flash",
        instruction: "External BIOS flash required. You need a CH341A or CH347 USB programmer and an SOIC8 clip (or desolder the chip). The BIOS chip is the 8-pin SPI flash near the BIOS battery.",
        question: "Can you locate and access the BIOS chip on the motherboard?",
        branches: {
          "yes": "read-chip",
          "no": { cause: "BIOS chip inaccessible", fix: "Look for an 8-pin SOIC chip labeled W25Q... or MX25L... near the CMOS battery. Some boards have the BIOS chip in a DIP8 socket (removable). If chip is under heatsink or heatsink, it must be removed first. Check board photos online for exact location.", difficulty: 3, tools: ["Magnifying glass", "Motherboard photos/manual"] },
        },
      },
      {
        id: "read-chip",
        instruction: "Connect SOIC8 clip to BIOS chip (pin 1 = dot on chip = red wire on clip). Connect CH341A/CH347. Run: biospy identify",
        question: "Does biospy detect and identify the chip?",
        branches: {
          "yes": "dump-and-flash",
          "no": { cause: "Poor SOIC clip contact or wrong chip", fix: "Ensure clip is firmly seated on all 8 pins. Pin 1 marker on clip must match pin 1 dot on chip. Try 'biospy test-connection' to verify. If chip doesn't identify: check clip orientation, ensure board is powered OFF but PSU standby may need to be disconnected.", difficulty: 3, tools: ["CH341A/CH347", "SOIC8 clip"] },
        },
      },
      {
        id: "dump-and-flash",
        instruction: "First, backup the current chip contents: 'biospy read current_bios.bin'. Then download the correct BIOS from the motherboard manufacturer. Flash it: 'biospy write correct_bios.bin'",
        question: "Did the write and verify complete successfully?",
        branches: {
          "yes": { cause: "Corrupt BIOS — now flashed externally", fix: "Remove the programmer, reconnect all cables, and try booting. System should POST with the new BIOS. Enter BIOS setup and load optimized defaults.", difficulty: 3, tools: ["CH341A/CH347", "SOIC8 clip", "biospy"] },
          "no": { cause: "Write failure — possibly write-protected chip or hardware issue", fix: "Check 'biospy wp-status'. If write-protected: WP pin may need to be pulled high. Some boards tie WP low — you may need to lift pin 3 of the SOIC8 chip and tie it to VCC (3.3V). If Intel Boot Guard: chip cannot be reflashed with unsigned BIOS.", difficulty: 5, tools: ["Multimeter", "Soldering iron (for WP pin lift)"] },
        },
      },
      {
        id: "gradual-corruption",
        instruction: "BIOS didn't fail during an update — this could be gradual corruption from aging flash, electrical noise, or firmware bug. Clear CMOS first as a simple test.",
        question: "Does clearing CMOS (remove battery 30s) fix the issue?",
        branches: {
          "yes": { cause: "NVRAM corruption — not full BIOS corruption", fix: "Settings were corrupt but code region is fine. If it recurs: CMOS battery may be weak (measure it, should be >2.9V) or BIOS chip is wearing out.", difficulty: 1, tools: ["CR2032 battery", "Multimeter"] },
          "no": "external-flash",
        },
      },
    ],
  },

  "no-power": {
    name: "No Power Troubleshooter",
    description: "System appears completely dead — no LEDs, no fans, no response at all",
    steps: [
      {
        id: "start",
        instruction: "Check the basics first: is the PSU power switch set to ON (I position)? Is the power cable firmly connected to both the PSU and the wall outlet?",
        question: "Is the PSU switch ON and cable connected?",
        branches: {
          "yes": "test-outlet",
          "no": { cause: "No AC power to PSU", fix: "Switch PSU to ON position. Ensure power cable is fully seated. Try a different wall outlet.", difficulty: 1, tools: [] },
        },
      },
      {
        id: "test-outlet",
        instruction: "Verify the wall outlet works by plugging in a lamp or phone charger.",
        question: "Does the outlet provide power?",
        branches: {
          "yes": "paperclip-test",
          "no": { cause: "Dead wall outlet or tripped circuit breaker", fix: "Check circuit breaker panel. Try a different outlet. If using a power strip/UPS, test without it.", difficulty: 1, tools: [] },
        },
      },
      {
        id: "paperclip-test",
        instruction: "Disconnect the 24-pin cable from the motherboard. Paperclip test: bend a paperclip into a U shape and insert into the green wire hole (PS_ON, pin 16) and any black wire hole (GND) on the 24-pin connector. Turn on PSU.",
        question: "Does the PSU fan spin during the paperclip test?",
        branches: {
          "yes": "psu-ok-board-issue",
          "no": { cause: "PSU is dead", fix: "Replace the PSU. Verify wattage is sufficient for your system (CPU TDP + GPU TDP + 100W overhead minimum).", difficulty: 2, tools: ["New PSU"] },
        },
      },
      {
        id: "psu-ok-board-issue",
        instruction: "PSU works on its own. Reconnect to motherboard. Check that both the 24-pin ATX and 8-pin EPS (CPU power) are fully connected. Check for standby LED.",
        question: "Does the motherboard standby LED light up when you reconnect?",
        branches: {
          "yes": "standby-ok",
          "no": "board-short",
        },
      },
      {
        id: "board-short",
        instruction: "PSU works alone but can't power the board — motherboard likely has a short circuit. Remove motherboard from case and place on cardboard (non-conductive surface). Connect only 24-pin and 8-pin.",
        question: "Does the standby LED light up outside the case?",
        branches: {
          "yes": { cause: "Short circuit to case — motherboard was grounding against the case", fix: "Check all standoff positions. Ensure no extra standoffs are touching the board where there's no mounting hole. Check for loose screws behind motherboard. Reinstall with correct standoffs.", difficulty: 2, tools: ["Standoff set"] },
          "no": { cause: "Motherboard short circuit — component-level failure", fix: "With multimeter in diode mode, check resistance across major power rails at the 24-pin: 3.3V to GND, 5V to GND, 12V to GND. Very low reading (<100 ohms) indicates a short. Common short locations: VRM MOSFETs, PCH, USB fuses. Advanced board-level repair needed.", difficulty: 5, tools: ["Multimeter (diode mode)", "Thermal camera (optional, for finding shorts)"] },
        },
      },
      {
        id: "standby-ok",
        instruction: "Standby power works. Try pressing the power button, or short the power switch header pins with a screwdriver.",
        question: "Do fans spin when you short the power pins?",
        branches: {
          "yes": { cause: "Faulty power button or front panel cable", fix: "Replace front panel power switch cable. Or rewire: connect a momentary push button to the power switch header pins.", difficulty: 1, tools: ["Momentary push button (optional)"] },
          "no": { cause: "Motherboard cannot assert PS_ON — likely PCH or power management IC failure", fix: "Check for blown SMD fuses near the front panel header. Measure voltage on PS_ON line — if it's pulled low permanently, something is preventing power-on. This typically requires board-level repair or replacement.", difficulty: 5, tools: ["Multimeter", "Magnifying glass"] },
        },
      },
    ],
  },
};

export function getWorkflow(name: string): Workflow | undefined {
  return WORKFLOWS[name];
}

export function listWorkflows(): Array<{ name: string; title: string; description: string }> {
  return Object.entries(WORKFLOWS).map(([name, wf]) => ({
    name,
    title: wf.name,
    description: wf.description,
  }));
}

export function formatWorkflowTree(workflow: Workflow): string {
  const lines: string[] = [];
  lines.push(`${workflow.name}`);
  lines.push(`${workflow.description}`);
  lines.push("");

  const visited = new Set<string>();

  function renderStep(stepId: string, indent: number): void {
    if (visited.has(stepId)) {
      lines.push(`${"  ".repeat(indent)}→ (back to step: ${stepId})`);
      return;
    }
    visited.add(stepId);

    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) return;

    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}[${step.id}] ${step.instruction}`);
    lines.push(`${prefix}  ? ${step.question}`);

    for (const [answer, target] of Object.entries(step.branches)) {
      if (isConclusion(target)) {
        lines.push(`${prefix}  ${answer} → CONCLUSION: ${target.cause}`);
        lines.push(`${prefix}    Fix: ${target.fix}`);
        lines.push(`${prefix}    Difficulty: ${"★".repeat(target.difficulty)}${"☆".repeat(5 - target.difficulty)}  Tools: ${target.tools.join(", ") || "none"}`);
      } else {
        lines.push(`${prefix}  ${answer} ↓`);
        renderStep(target, indent + 2);
      }
    }
  }

  renderStep(workflow.steps[0]?.id ?? "start", 0);
  return lines.join("\n");
}
