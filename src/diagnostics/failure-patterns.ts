export type FailureCategory = "power" | "display" | "boot" | "stability" | "bios" | "peripheral";

export interface FailureCause {
  cause: string;
  probability: "high" | "medium" | "low";
}

export interface FailurePattern {
  id: string;
  name: string;
  category: FailureCategory;
  symptoms: string[];
  causes: FailureCause[];
  diagnosticSteps: string[];
  tools: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

const SYNONYMS: Record<string, string[]> = {
  "power": ["power", "dead", "won't turn on", "no power", "doesn't power", "psu"],
  "display": ["display", "screen", "monitor", "video", "blank", "no picture", "black screen", "no image"],
  "boot": ["boot", "post", "startup", "start", "won't start", "no boot", "stuck"],
  "beep": ["beep", "beeping", "beeps", "speaker", "audio code"],
  "fan": ["fan", "fans", "spinning", "spin"],
  "led": ["led", "light", "lights", "indicator"],
  "ram": ["ram", "memory", "dimm", "ddr", "ddr4", "ddr5"],
  "gpu": ["gpu", "graphics", "video card", "graphics card", "display adapter"],
  "cpu": ["cpu", "processor", "overheating", "thermal"],
  "usb": ["usb", "ports", "devices"],
  "sata": ["sata", "hdd", "ssd", "hard drive", "disk", "storage", "nvme"],
  "bios": ["bios", "uefi", "firmware", "flash", "cmos", "setup"],
  "reboot": ["reboot", "restart", "loop", "restarting", "cycling", "reset"],
  "freeze": ["freeze", "hang", "frozen", "stuck", "unresponsive", "lock up"],
  "blue screen": ["bsod", "blue screen", "stop error", "crash", "bugcheck"],
  "artifact": ["artifact", "artifacts", "glitch", "corruption", "lines", "garbled"],
  "shutdown": ["shutdown", "shuts down", "turns off", "powers off", "random shutdown"],
};

export const FAILURE_PATTERNS: FailurePattern[] = [
  // ═══════════════════════════════════════════════
  // POWER (no power, partial power, random shutdown)
  // ═══════════════════════════════════════════════

  {
    id: "pwr-001",
    name: "Completely dead — no LEDs, no fans",
    category: "power",
    symptoms: ["No LEDs on motherboard", "No fan spin", "No response to power button", "PSU fan not spinning"],
    causes: [
      { cause: "PSU failure — no standby voltage (5VSB)", probability: "high" },
      { cause: "Motherboard short circuit — shorted capacitor near VRM or PCH", probability: "high" },
      { cause: "Bad power cable or wall outlet", probability: "medium" },
      { cause: "Stuck power button (shorted pins)", probability: "medium" },
      { cause: "Dead CMOS battery preventing power-on on some boards", probability: "low" },
    ],
    diagnosticSteps: [
      "Verify wall outlet works (plug in a lamp)",
      "Test PSU with paperclip test: short green wire (PS_ON) to any black wire (GND) on 24-pin",
      "Measure 5VSB with multimeter at 24-pin connector pin 9 (purple wire) — should read 5.0V ±5%",
      "Disconnect everything from motherboard except 24-pin and CPU 8-pin, try power on",
      "Check for visible damage: blown capacitors, burn marks, bent pins in CPU socket",
      "Remove motherboard from case and test on non-conductive surface (cardboard) to rule out short to case",
    ],
    tools: ["Multimeter", "PSU tester or paperclip", "Magnifying glass"],
    difficulty: 2,
    keywords: ["dead", "no power", "no led", "no fan", "completely dead", "won't turn on", "nothing happens"],
  },
  {
    id: "pwr-002",
    name: "Standby power only — LEDs on, no boot",
    category: "power",
    symptoms: ["Motherboard standby LED is on", "No fan spin on power button press", "No POST beeps"],
    causes: [
      { cause: "Faulty power button or front panel header connection", probability: "high" },
      { cause: "CPU power (EPS 8-pin) not connected", probability: "high" },
      { cause: "Shorted component preventing ATX PS_ON signal", probability: "medium" },
      { cause: "Bad CPU — preventing power-on (rare)", probability: "low" },
    ],
    diagnosticSteps: [
      "Verify 5VSB present (standby LED confirms this)",
      "Try shorting power button pins on motherboard header directly with screwdriver",
      "Check CPU 8-pin (EPS12V) connector is fully seated",
      "Disconnect all USB devices and front panel connectors except power switch",
      "Remove all RAM and GPU, try power on — fans should spin even without RAM",
      "If fans still don't spin: likely shorted component on board",
    ],
    tools: ["Screwdriver (to short power pins)", "Multimeter"],
    difficulty: 2,
    keywords: ["standby", "led on", "no boot", "power button", "won't start"],
  },
  {
    id: "pwr-003",
    name: "Fans spin briefly then stop",
    category: "power",
    symptoms: ["Fans spin for 0.5-2 seconds then stop", "May cycle on/off repeatedly", "No display output"],
    causes: [
      { cause: "CPU not seated properly or bent pins", probability: "high" },
      { cause: "RAM not installed or not seated properly", probability: "high" },
      { cause: "CPU VRM failure — overcurrent protection triggered", probability: "medium" },
      { cause: "12V rail overload or PSU fault", probability: "medium" },
      { cause: "Short circuit on motherboard", probability: "medium" },
    ],
    diagnosticSteps: [
      "Remove and reseat CPU — inspect for bent pins (Intel LGA) or check socket for debris",
      "Try booting with only one RAM stick in the primary slot (usually A2)",
      "Measure 12V at 24-pin and EPS 8-pin during power-on attempt (should hold 12V ±5%)",
      "Disconnect all unnecessary devices: GPU, drives, USB headers",
      "Check for bulging or leaking capacitors near CPU VRM",
      "If board cycles on/off: often a VRM short — inspect MOSFETs near CPU socket with thermal camera or by touch (burned = shorted)",
    ],
    tools: ["Multimeter", "Magnifying glass", "Thermal camera (optional)"],
    difficulty: 3,
    keywords: ["fans spin stop", "brief spin", "cycling", "on off", "starts stops"],
  },
  {
    id: "pwr-004",
    name: "Random shutdowns under load",
    category: "power",
    symptoms: ["System shuts down during gaming or stress testing", "No BSOD, just instant power off", "Works fine at idle"],
    causes: [
      { cause: "CPU overheating — thermal throttle then emergency shutdown at Tjmax", probability: "high" },
      { cause: "Insufficient PSU wattage for system load", probability: "high" },
      { cause: "VRM overheating — insufficient VRM cooling", probability: "medium" },
      { cause: "12V rail sagging under load — PSU degrading", probability: "medium" },
      { cause: "Bad thermal paste application", probability: "medium" },
    ],
    diagnosticSteps: [
      "Monitor CPU temperature under load — shutdown at 100-105°C = thermal issue",
      "Check VRM temperatures with thermal camera or HWiNFO64 (>120°C is dangerous)",
      "Measure 12V rail with multimeter under load — should not drop below 11.4V",
      "Verify CPU cooler mounting pressure is even (check all 4 corners)",
      "Reseat cooler with fresh thermal paste",
      "Test with a higher wattage PSU if available",
    ],
    tools: ["Multimeter", "Thermal paste", "HWiNFO64 or similar monitoring software", "Thermal camera (optional)"],
    difficulty: 2,
    keywords: ["random shutdown", "shuts down", "under load", "gaming crash", "instant off"],
  },
  {
    id: "pwr-005",
    name: "Shuts down after a few minutes at idle",
    category: "power",
    symptoms: ["Boots and runs for 2-10 minutes then shuts down", "Happens at idle, not just under load", "No error message"],
    causes: [
      { cause: "PSU capacitor degradation — can't hold output voltage over time", probability: "high" },
      { cause: "Motherboard electrolytic capacitor bulging near VRM or PCH", probability: "high" },
      { cause: "RAM issue causing kernel panic/watchdog timeout", probability: "medium" },
      { cause: "BIOS corrupt — watchdog timer resetting system", probability: "low" },
    ],
    diagnosticSteps: [
      "Check CPU temp at shutdown — if cool (<60°C), not thermal",
      "Inspect all electrolytic capacitors on motherboard — look for bulging tops or leaked electrolyte",
      "Try a known-good PSU",
      "Run memtest86 — if it crashes, RAM is the issue",
      "Clear CMOS and load defaults",
      "Re-flash BIOS if other steps don't help",
    ],
    tools: ["Multimeter", "Known-good PSU", "Memtest86 USB drive", "Magnifying glass"],
    difficulty: 3,
    keywords: ["shuts down idle", "few minutes", "timed shutdown", "delayed shutdown"],
  },

  // ═══════════════════════════════════════════════
  // DISPLAY (no display, artifacts, backlight)
  // ═══════════════════════════════════════════════

  {
    id: "disp-001",
    name: "No display — fans spin, no POST",
    category: "display",
    symptoms: ["Fans spinning", "No display output", "No POST beeps", "No motherboard debug LED code"],
    causes: [
      { cause: "RAM not seated or incompatible", probability: "high" },
      { cause: "GPU not seated in PCIe slot", probability: "high" },
      { cause: "CPU integrated graphics disabled in BIOS with no discrete GPU", probability: "medium" },
      { cause: "BIOS corruption — stuck before video init", probability: "medium" },
      { cause: "Monitor connected to wrong output (motherboard vs GPU)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Try different video output (HDMI vs DP, motherboard vs GPU)",
      "Reseat RAM — try one stick at a time, try different slots",
      "Reseat GPU — clean PCIe contacts with isopropyl alcohol",
      "Remove GPU entirely and try motherboard video output (if CPU has iGPU)",
      "Clear CMOS (remove battery 30s or use CLR_CMOS jumper)",
      "Listen for beep codes — add a PC speaker if motherboard doesn't have a buzzer",
      "Check motherboard debug LED if present (shows POST code)",
    ],
    tools: ["PC speaker/buzzer", "Isopropyl alcohol", "Anti-static wrist strap"],
    difficulty: 2,
    keywords: ["no display", "no video", "blank screen", "black screen", "no picture", "fans spin"],
  },
  {
    id: "disp-002",
    name: "Display artifacts — lines, blocks, corruption",
    category: "display",
    symptoms: ["Colored lines on screen", "Block artifacts during gaming", "Screen corruption at POST", "Garbled BIOS screen"],
    causes: [
      { cause: "GPU VRAM failure", probability: "high" },
      { cause: "GPU overheating — thermal paste dried out", probability: "high" },
      { cause: "Bad GPU solder joints (BGA reflow needed)", probability: "medium" },
      { cause: "Damaged PCIe slot", probability: "low" },
      { cause: "Bad display cable or connector", probability: "low" },
    ],
    diagnosticSteps: [
      "Try a different display cable and monitor",
      "Try GPU in a different PCIe slot",
      "Check GPU temperatures under load (>100°C = thermal issue)",
      "Underclock GPU memory by 200-300MHz — if artifacts stop, VRAM is degrading",
      "If artifacts appear at POST/BIOS: issue is hardware, not driver",
      "Inspect GPU board for discolored or cracked solder joints near GPU die",
    ],
    tools: ["Different display cable", "GPU monitoring software", "Thermal paste", "Heat gun (for reflow, advanced)"],
    difficulty: 3,
    keywords: ["artifacts", "lines", "blocks", "corruption", "garbled", "glitch", "vram"],
  },
  {
    id: "disp-003",
    name: "Backlight on, no image (laptop)",
    category: "display",
    symptoms: ["Screen lights up but shows nothing", "Can see faint image with flashlight", "External monitor works"],
    causes: [
      { cause: "Failed LCD inverter or backlight driver circuit", probability: "high" },
      { cause: "Bad LVDS/eDP cable connection", probability: "high" },
      { cause: "GPU failure — can't drive internal display", probability: "medium" },
      { cause: "LCD panel failure", probability: "medium" },
    ],
    diagnosticSteps: [
      "Connect external monitor — if it works, issue is display path not GPU",
      "Shine flashlight at screen — if you see faint image, backlight circuit failed",
      "Reseat LVDS/eDP cable at both motherboard and panel end",
      "Check for damaged pins in display connector",
      "If external also fails: GPU issue",
    ],
    tools: ["External monitor", "Flashlight", "Small screwdriver set for laptop disassembly"],
    difficulty: 3,
    keywords: ["backlight", "no image", "faint", "flashlight", "laptop display", "edp", "lvds"],
  },

  // ═══════════════════════════════════════════════
  // BOOT (reboot loop, stuck POST, BSOD)
  // ═══════════════════════════════════════════════

  {
    id: "boot-001",
    name: "Reboot loop — restarts before/during POST",
    category: "boot",
    symptoms: ["System powers on, shows nothing, reboots", "Cycles every 5-15 seconds", "Never reaches BIOS screen"],
    causes: [
      { cause: "CPU incompatible with BIOS version — needs update", probability: "high" },
      { cause: "RAM incompatible or failing", probability: "high" },
      { cause: "Corrupt BIOS", probability: "medium" },
      { cause: "Overclocking settings causing instability", probability: "medium" },
      { cause: "CPU VRM failure — voltage out of spec", probability: "low" },
    ],
    diagnosticSteps: [
      "Clear CMOS to reset all BIOS settings",
      "Try minimum config: one RAM stick, no GPU (use iGPU), no drives",
      "If new CPU: check if BIOS version supports it (may need BIOS flashback)",
      "Try different RAM kit — check motherboard QVL list",
      "Use BIOS flashback feature if available (USB flash without CPU/RAM)",
      "Measure VRM output voltage with multimeter during boot attempt",
    ],
    tools: ["Multimeter", "USB drive for BIOS flashback", "Known-good RAM"],
    difficulty: 3,
    keywords: ["reboot loop", "restart", "cycling", "boot loop", "never posts"],
  },
  {
    id: "boot-002",
    name: "Stuck at POST — hangs with code displayed",
    category: "boot",
    symptoms: ["System powers on", "Displays a POST code on debug LED", "Hangs indefinitely", "No boot"],
    causes: [
      { cause: "Hardware failure at the reported POST stage", probability: "high" },
      { cause: "Device initialization timeout (USB, SATA, PCIe)", probability: "medium" },
      { cause: "BIOS settings conflict", probability: "medium" },
    ],
    diagnosticSteps: [
      "Read the POST code — use 'biospy post-decode <code>' to interpret it",
      "Identify which subsystem the code relates to (memory, PCI, USB, etc.)",
      "Remove/disconnect the related hardware and retry",
      "Clear CMOS and try again",
      "If memory-related code: try different slots, different sticks, one at a time",
      "If PCI-related code: remove all expansion cards",
    ],
    tools: ["POST code display (or motherboard debug LED)", "biospy post-decode"],
    difficulty: 2,
    keywords: ["stuck post", "hangs", "post code", "debug led", "frozen boot"],
  },
  {
    id: "boot-003",
    name: "Boot to BSOD / kernel panic immediately",
    category: "boot",
    symptoms: ["System POSTs successfully", "Begins loading OS", "Blue screen or kernel panic within seconds"],
    causes: [
      { cause: "Corrupt OS installation or driver", probability: "high" },
      { cause: "Failing storage drive", probability: "high" },
      { cause: "RAM failure — passes POST but fails under OS load", probability: "medium" },
      { cause: "SATA/NVMe controller issue", probability: "low" },
    ],
    diagnosticSteps: [
      "Note the BSOD stop code — search it online for specific cause",
      "Boot to Safe Mode — if it works, likely a driver issue",
      "Run memtest86 — 4+ passes, any errors = bad RAM",
      "Check storage drive health with SMART data",
      "Boot from a USB Linux live disk — if stable, issue is OS/drive not hardware",
      "If BSOD in Safe Mode too: likely RAM or storage hardware failure",
    ],
    tools: ["Memtest86 USB drive", "Linux live USB", "SMART monitoring tool"],
    difficulty: 2,
    keywords: ["bsod", "blue screen", "kernel panic", "crash", "stop error", "boot crash"],
  },
  {
    id: "boot-004",
    name: "No boot device found",
    category: "boot",
    symptoms: ["POST completes", "Error: No boot device found", "BIOS doesn't show any drives", "Or shows drives but won't boot"],
    causes: [
      { cause: "SATA/NVMe cable disconnected or loose", probability: "high" },
      { cause: "Boot order wrong in BIOS", probability: "high" },
      { cause: "Drive dead or not initialized", probability: "medium" },
      { cause: "UEFI/Legacy boot mode mismatch", probability: "medium" },
      { cause: "Secure Boot blocking non-signed OS", probability: "low" },
    ],
    diagnosticSteps: [
      "Enter BIOS — check if drive appears in SATA/NVMe device list",
      "Check SATA cable connections at both ends",
      "Try drive in different SATA port",
      "Check BIOS boot mode: UEFI vs Legacy — must match OS installation",
      "Disable Secure Boot temporarily",
      "If NVMe: check M.2 slot compatibility (some slots are SATA-only or PCIe-only)",
    ],
    tools: ["Spare SATA cable", "BIOS access"],
    difficulty: 1,
    keywords: ["no boot device", "disk not found", "no bootable", "drive not detected", "boot order"],
  },

  // ═══════════════════════════════════════════════
  // STABILITY (random crashes, freezes)
  // ═══════════════════════════════════════════════

  {
    id: "stab-001",
    name: "Random freezes — system locks up",
    category: "stability",
    symptoms: ["System freezes randomly", "No mouse/keyboard response", "Must hard reset", "No BSOD, just freeze"],
    causes: [
      { cause: "RAM instability — fails under certain access patterns", probability: "high" },
      { cause: "Overheating — CPU or VRM thermal throttle then freeze", probability: "medium" },
      { cause: "Storage drive hanging — NVMe thermal throttle or firmware bug", probability: "medium" },
      { cause: "Driver conflict (GPU, chipset, or network)", probability: "medium" },
      { cause: "Failing PSU — voltage dropping under transient load", probability: "low" },
    ],
    diagnosticSteps: [
      "Run memtest86 overnight — any errors = RAM issue",
      "Monitor temperatures during normal use — check CPU, GPU, VRM, NVMe",
      "Check Event Viewer (Windows) or dmesg (Linux) for hardware errors before freeze time",
      "Try with integrated graphics only — if stable, GPU or driver issue",
      "Disable C-states in BIOS and test",
      "Update BIOS, chipset, and GPU drivers to latest",
    ],
    tools: ["Memtest86 USB", "HWiNFO64 or lm-sensors", "Event Viewer"],
    difficulty: 3,
    keywords: ["freeze", "hang", "lock up", "frozen", "unresponsive", "random freeze"],
  },
  {
    id: "stab-002",
    name: "System crashes only under specific workload",
    category: "stability",
    symptoms: ["Crashes during gaming but not office work", "Crashes during rendering but not browsing", "Specific application triggers crash"],
    causes: [
      { cause: "GPU instability — VRAM or GPU core failing under load", probability: "high" },
      { cause: "RAM instability at specific addresses — only hit by large workloads", probability: "medium" },
      { cause: "CPU AVX instability — some CPUs unstable with AVX-512", probability: "medium" },
      { cause: "PSU can't handle transient load spikes", probability: "medium" },
    ],
    diagnosticSteps: [
      "Run GPU stress test (FurMark/Unigine) — crash = GPU issue",
      "Run CPU stress test (Prime95 small FFT) — crash = CPU/VRM/PSU",
      "Run mixed stress (CPU+GPU simultaneously) — crash = PSU",
      "Underclock GPU memory by 200MHz — if stable, VRAM degrading",
      "Try CPU at stock speeds with XMP disabled",
      "Test with a higher wattage PSU",
    ],
    tools: ["FurMark", "Prime95", "HWiNFO64", "Known-good PSU"],
    difficulty: 3,
    keywords: ["workload crash", "gaming crash", "specific crash", "load crash"],
  },

  // ═══════════════════════════════════════════════
  // BIOS (corrupt, settings reset, no flash)
  // ═══════════════════════════════════════════════

  {
    id: "bios-001",
    name: "BIOS corrupt — no POST, no beeps",
    category: "bios",
    symptoms: ["No POST at all", "No beep codes", "Fans spin but nothing else", "Was working before BIOS update"],
    causes: [
      { cause: "Failed BIOS update — power loss during flash", probability: "high" },
      { cause: "Wrong BIOS file flashed", probability: "high" },
      { cause: "BIOS chip partially erased", probability: "medium" },
      { cause: "SPI flash chip hardware failure", probability: "low" },
    ],
    diagnosticSteps: [
      "Check if board has BIOS flashback (USB recovery without CPU/RAM)",
      "Check if board has dual BIOS (switch to backup chip)",
      "If no recovery feature: remove BIOS chip and flash externally with CH341A/CH347",
      "Use 'biospy read backup.bin' to dump current (corrupted) chip contents",
      "Download correct BIOS from manufacturer website",
      "Use 'biospy write correct_bios.bin' to flash the correct BIOS",
      "Verify with 'biospy verify correct_bios.bin'",
    ],
    tools: ["CH341A or CH347 programmer", "SOIC8 clip or chip socket", "biospy CLI tool"],
    difficulty: 4,
    keywords: ["bios corrupt", "failed update", "bricked", "no post after update", "bad flash"],
  },
  {
    id: "bios-002",
    name: "BIOS settings reset on every boot",
    category: "bios",
    symptoms: ["Date/time reset on every boot", "Overclocking settings lost", "Boot order resets", "CMOS checksum error on boot"],
    causes: [
      { cause: "Dead CMOS battery (CR2032)", probability: "high" },
      { cause: "CMOS battery holder bad contact", probability: "medium" },
      { cause: "NVRAM corruption in BIOS", probability: "medium" },
      { cause: "BIOS chip wear — excessive write cycles", probability: "low" },
    ],
    diagnosticSteps: [
      "Replace CR2032 CMOS battery — should measure >2.9V with multimeter",
      "Check battery holder contacts — clean with isopropyl alcohol",
      "Clear CMOS completely, then set settings once and verify they persist after power cycle",
      "If settings still reset with new battery: flash BIOS to rebuild NVRAM region",
      "Use 'biospy analyze backup.bin' to check NVRAM region integrity",
    ],
    tools: ["CR2032 battery", "Multimeter", "Isopropyl alcohol"],
    difficulty: 1,
    keywords: ["settings reset", "cmos", "battery", "date reset", "bios reset", "checksum error"],
  },
  {
    id: "bios-003",
    name: "Cannot flash BIOS — write protected",
    category: "bios",
    symptoms: ["BIOS update tool reports write protection error", "CH341A can read but not write", "Chip reports WP active"],
    causes: [
      { cause: "Hardware write protection pin held low on BIOS chip", probability: "high" },
      { cause: "Intel BIOS Guard (Boot Guard) preventing modification", probability: "high" },
      { cause: "Software write protection bits set in status register", probability: "medium" },
      { cause: "Incorrect chip identification — wrong erase/write commands", probability: "low" },
    ],
    diagnosticSteps: [
      "Use 'biospy wp-status' to check write protection status register",
      "Check WP pin on SOIC8 chip — pin 3 should be pulled HIGH for write enable",
      "Try clearing software WP: write status register to 0x00",
      "If Intel Boot Guard: chip cannot be modified without Intel-signed firmware",
      "If external flash with SOIC clip: ensure clip has good contact on all 8 pins",
      "Verify chip is correctly identified: 'biospy identify'",
    ],
    tools: ["CH341A/CH347 programmer", "Multimeter (check WP pin)", "biospy wp-status"],
    difficulty: 4,
    keywords: ["write protected", "can't flash", "wp", "write protect", "boot guard", "locked"],
  },
  {
    id: "bios-004",
    name: "BIOS not booting after CMOS clear",
    category: "bios",
    symptoms: ["Cleared CMOS and now system won't boot", "Was working before CMOS clear", "Training loop (long boot attempts)"],
    causes: [
      { cause: "Memory retraining in progress — first boot after CMOS clear takes 1-3 minutes", probability: "high" },
      { cause: "BIOS defaults are incompatible with installed hardware", probability: "medium" },
      { cause: "CMOS clear also reset critical PCH/CPU fuse settings", probability: "low" },
    ],
    diagnosticSteps: [
      "Wait 3-5 minutes — DDR5 memory training can take several minutes on first boot",
      "If DDR5: board may cycle multiple times (up to 5) before successful training",
      "If still no boot after 5 minutes: try single DIMM in recommended slot",
      "Enter BIOS and manually set XMP/EXPO profile",
      "Check that SATA mode matches OS installation (AHCI vs RAID)",
    ],
    tools: ["Patience", "Motherboard manual for recommended DIMM slot"],
    difficulty: 1,
    keywords: ["cmos clear", "won't boot after cmos", "training", "ddr5 training", "first boot"],
  },

  // ═══════════════════════════════════════════════
  // PERIPHERAL (USB, PCIe, RAM, network)
  // ═══════════════════════════════════════════════

  {
    id: "periph-001",
    name: "USB ports not working",
    category: "peripheral",
    symptoms: ["Some or all USB ports dead", "Devices not recognized", "USB devices disconnect randomly"],
    causes: [
      { cause: "USB controller disabled in BIOS", probability: "high" },
      { cause: "USB header cable disconnected (front panel ports)", probability: "high" },
      { cause: "Failed USB power delivery — blown fuse on motherboard", probability: "medium" },
      { cause: "USB controller chip failure", probability: "medium" },
      { cause: "ESD damage to USB port", probability: "low" },
    ],
    diagnosticSteps: [
      "Check BIOS — ensure USB controllers are enabled",
      "Test all ports: front and rear — if rear works but front doesn't, check internal USB header cable",
      "Try a different USB device to rule out device failure",
      "Check for blown USB fuses on motherboard (SMD fuse near USB headers)",
      "Test in Linux live USB — if ports work there, driver issue in main OS",
      "Measure 5V on USB port pins 1 and 4 — should be 5.0V ±5%",
    ],
    tools: ["Multimeter", "Linux live USB", "Multiple USB test devices"],
    difficulty: 2,
    keywords: ["usb", "usb dead", "usb not working", "disconnecting", "usb power"],
  },
  {
    id: "periph-002",
    name: "PCIe slot not detecting cards",
    category: "peripheral",
    symptoms: ["GPU not detected in specific slot", "No device in BIOS PCIe list", "Other slots work fine"],
    causes: [
      { cause: "PCIe slot damaged — bent pin or cracked trace", probability: "high" },
      { cause: "BIOS PCIe bifurcation/configuration wrong", probability: "medium" },
      { cause: "Insufficient power from 24-pin for PCIe power delivery", probability: "low" },
      { cause: "CPU PCIe lanes exhausted (M.2 sharing with x16 slot)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Inspect PCIe slot for bent/broken pins with magnifying glass",
      "Test the card in a known-good slot",
      "Check BIOS PCIe configuration — some M.2 slots disable x16 slot lanes",
      "Try a different card in the suspect slot",
      "Check motherboard manual for lane sharing between M.2 and PCIe slots",
      "Clean PCIe slot contacts with compressed air",
    ],
    tools: ["Magnifying glass", "Compressed air", "Known-good PCIe card"],
    difficulty: 3,
    keywords: ["pcie", "slot not working", "card not detected", "gpu not detected", "expansion slot"],
  },
  {
    id: "periph-003",
    name: "RAM not detected in specific slot",
    category: "peripheral",
    symptoms: ["One DIMM slot always shows empty", "System boots with RAM in other slots", "RAM stick works in other slots"],
    causes: [
      { cause: "Dirty DIMM slot contacts", probability: "high" },
      { cause: "DIMM slot damaged — cracked trace or bent pin", probability: "medium" },
      { cause: "CPU IMC (Integrated Memory Controller) partial failure", probability: "medium" },
      { cause: "Motherboard trace damage between CPU and DIMM slot", probability: "low" },
    ],
    diagnosticSteps: [
      "Clean DIMM slot with compressed air and isopropyl alcohol",
      "Test with a known-good DIMM in the suspect slot",
      "Inspect slot for visible damage with magnifying glass",
      "Check if slot is supposed to be populated — some boards need A2/B2 first",
      "If CPU-side issue: check CPU socket for bent pins (Intel) or debris in socket",
      "Run memtest86 with DIMMs in working slots to verify RAM modules are good",
    ],
    tools: ["Compressed air", "Isopropyl alcohol", "Magnifying glass", "Known-good RAM"],
    difficulty: 3,
    keywords: ["ram slot", "dimm slot", "memory not detected", "slot dead", "empty slot"],
  },
  {
    id: "periph-004",
    name: "Network (LAN) port not working",
    category: "peripheral",
    symptoms: ["No link light on Ethernet port", "Network not detected in OS", "Intermittent connection"],
    causes: [
      { cause: "Network controller disabled in BIOS", probability: "high" },
      { cause: "Bad Ethernet cable", probability: "high" },
      { cause: "LAN controller chip failure (especially Intel I225-V rev issues)", probability: "medium" },
      { cause: "ESD damage to LAN port magnetics", probability: "low" },
    ],
    diagnosticSteps: [
      "Check BIOS — ensure onboard LAN is enabled",
      "Try a different Ethernet cable",
      "Check link LED on port — green = link, orange/amber = activity",
      "Test in Linux live USB — if detected there, driver issue",
      "Check for known hardware bugs (Intel I225-V has documented issues)",
      "If no link at all: LAN magnetics or PHY chip may be dead",
    ],
    tools: ["Known-good Ethernet cable", "Linux live USB", "USB Ethernet adapter (workaround)"],
    difficulty: 2,
    keywords: ["network", "lan", "ethernet", "no link", "connection", "nic"],
  },
  {
    id: "periph-005",
    name: "Audio not working — no sound output",
    category: "peripheral",
    symptoms: ["No sound from rear audio jack", "Audio device not detected", "Front panel audio dead"],
    causes: [
      { cause: "Audio controller disabled in BIOS", probability: "high" },
      { cause: "HD Audio front panel header not connected", probability: "high" },
      { cause: "Realtek codec chip failure", probability: "medium" },
      { cause: "OS audio driver issue", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check BIOS — ensure onboard audio is enabled",
      "Test rear audio jacks first (front panel is a separate cable)",
      "Check HD_AUDIO front panel header cable connection",
      "Install latest Realtek audio driver from motherboard vendor",
      "Test in Linux live USB — if audio works there, driver issue",
      "If no audio in Linux either: codec chip likely dead",
    ],
    tools: ["Known-good headphones/speakers", "Linux live USB"],
    difficulty: 1,
    keywords: ["audio", "sound", "no sound", "speaker", "headphone", "realtek"],
  },

  // ═══════════════════════════════════════════════
  // More patterns for comprehensive coverage
  // ═══════════════════════════════════════════════

  {
    id: "pwr-006",
    name: "PSU clicking or ticking noise",
    category: "power",
    symptoms: ["Clicking sound from PSU", "Rhythmic ticking", "System may or may not power on"],
    causes: [
      { cause: "PSU short circuit protection activating repeatedly", probability: "high" },
      { cause: "Shorted component on motherboard causing PSU OCP", probability: "high" },
      { cause: "PSU fan bearing failure (if spinning noise, not electrical click)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disconnect PSU from motherboard entirely",
      "Paperclip test: if PSU runs fine alone, short is on motherboard side",
      "Reconnect 24-pin only (no CPU EPS) — if clicking resumes, 12V rail short on board",
      "Check for conductive debris (screws, wire fragments) under motherboard",
      "Inspect VRM MOSFETs and PCH area for shorts with multimeter (diode mode)",
    ],
    tools: ["Multimeter (diode mode)", "Paperclip"],
    difficulty: 3,
    keywords: ["clicking", "ticking", "psu noise", "clicking psu", "ocp"],
  },
  {
    id: "boot-005",
    name: "System boots to BIOS every time — won't boot OS",
    category: "boot",
    symptoms: ["Always enters BIOS setup", "Never attempts to boot OS", "Boot menu shows no devices"],
    causes: [
      { cause: "Boot order not configured", probability: "high" },
      { cause: "UEFI/Legacy mode mismatch — OS installed in one, BIOS set to other", probability: "high" },
      { cause: "Secure Boot enabled blocking OS bootloader", probability: "medium" },
      { cause: "Boot drive disconnected", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check BIOS boot device list — is your drive visible?",
      "Verify SATA/NVMe cable is connected",
      "Match boot mode: if OS installed as UEFI, set BIOS to UEFI; if Legacy, set Legacy",
      "Try disabling Secure Boot",
      "Add boot entry manually if using UEFI: set path to EFI/BOOT/BOOTX64.EFI",
      "If drive shows in BIOS but won't boot: bootloader corrupt, repair with OS install media",
    ],
    tools: ["OS installation media for bootloader repair"],
    difficulty: 1,
    keywords: ["boots to bios", "bios every time", "no os boot", "enters setup", "boot order"],
  },
  {
    id: "stab-003",
    name: "System restarts when plugging in USB device",
    category: "stability",
    symptoms: ["Plugging in USB device causes reboot", "Specific USB port triggers restart", "ESD sensitivity"],
    causes: [
      { cause: "ESD damage to USB port — overcurrent triggers system reset", probability: "high" },
      { cause: "Shorted USB port — 5V to data line short", probability: "medium" },
      { cause: "PSU unable to handle sudden current draw", probability: "low" },
    ],
    diagnosticSteps: [
      "Identify which specific port(s) trigger the reset",
      "Check if USB port has physical damage (bent pins, debris)",
      "Measure 5V on the problem port with nothing plugged in — should be 5V, not fluctuating",
      "Test with a low-power USB device (keyboard) vs high-power (external HDD)",
      "If only one port: likely ESD damage, avoid using that port",
    ],
    tools: ["Multimeter", "Multiple USB devices"],
    difficulty: 2,
    keywords: ["usb reboot", "usb restart", "esd", "plugging in reboot"],
  },
  {
    id: "disp-004",
    name: "Display works but wrong resolution or refresh rate",
    category: "display",
    symptoms: ["Low resolution at boot", "Can't select native resolution", "Stuck at 60Hz on high-refresh monitor"],
    causes: [
      { cause: "GPU driver not installed or using generic driver", probability: "high" },
      { cause: "Display cable doesn't support required bandwidth (HDMI 1.4 for 4K60)", probability: "high" },
      { cause: "EDID communication failure between monitor and GPU", probability: "medium" },
      { cause: "GPU VBIOS outdated", probability: "low" },
    ],
    diagnosticSteps: [
      "Install proper GPU driver (not Windows generic)",
      "Check cable version: HDMI 2.0+ for 4K60, DP 1.4 for 4K144",
      "Try DisplayPort instead of HDMI (higher bandwidth)",
      "Check monitor OSD for input settings",
      "Force resolution/refresh in GPU control panel",
    ],
    tools: ["Proper display cable", "GPU driver installer"],
    difficulty: 1,
    keywords: ["resolution", "refresh rate", "wrong res", "low resolution", "hz", "edid"],
  },
  {
    id: "bios-005",
    name: "BIOS flashback not working",
    category: "bios",
    symptoms: ["USB BIOS flashback LED doesn't blink", "Flashback starts but fails", "LED blinks then stops with error pattern"],
    causes: [
      { cause: "Wrong USB drive format (must be FAT32)", probability: "high" },
      { cause: "Wrong BIOS filename (must match manufacturer's required name exactly)", probability: "high" },
      { cause: "USB drive in wrong port (must be specific flashback port)", probability: "medium" },
      { cause: "BIOS file corrupt or wrong model", probability: "medium" },
    ],
    diagnosticSteps: [
      "Format USB as FAT32 (not exFAT/NTFS)",
      "Rename BIOS file to exact name from manual (e.g., MSI.ROM, ASUS.CAP)",
      "Use the specific USB port labeled for flashback (check manual)",
      "Use USB 2.0 drive — some boards don't support USB 3.0 for flashback",
      "Re-download BIOS file (may have been corrupted during download)",
      "Hold flashback button 3 seconds (don't tap)",
    ],
    tools: ["USB 2.0 drive", "Motherboard manual"],
    difficulty: 1,
    keywords: ["flashback", "bios flashback", "usb recovery", "bios recovery", "won't flash"],
  },
  {
    id: "periph-006",
    name: "NVMe SSD not detected",
    category: "peripheral",
    symptoms: ["M.2 NVMe drive not showing in BIOS", "Slot works with other drives", "Drive works in other systems"],
    causes: [
      { cause: "M.2 slot is SATA-only, not PCIe/NVMe capable", probability: "high" },
      { cause: "NVMe not seated fully in M.2 slot", probability: "high" },
      { cause: "M.2 slot shares lanes with occupied PCIe slot — disabled by BIOS", probability: "medium" },
      { cause: "BIOS doesn't support NVMe boot (older boards)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check motherboard manual — which M.2 slots support NVMe vs SATA",
      "Reseat NVMe drive — ensure gold contacts fully inserted, secure with screw",
      "Check if M.2 slot shares PCIe lanes with GPU slot",
      "Update BIOS to latest version",
      "Check BIOS storage configuration — NVMe may need to be enabled",
      "Try NVMe in different M.2 slot if available",
    ],
    tools: ["Motherboard manual", "M.2 screw"],
    difficulty: 1,
    keywords: ["nvme", "m.2", "ssd not detected", "nvme not found", "m2 slot"],
  },
  {
    id: "stab-004",
    name: "POST succeeds but system very slow",
    category: "stability",
    symptoms: ["Boot takes much longer than usual", "System runs but extremely sluggish", "High CPU usage at idle"],
    causes: [
      { cause: "Storage drive failing — high read/write latency", probability: "high" },
      { cause: "RAM running in single channel instead of dual", probability: "medium" },
      { cause: "CPU thermal throttling at startup", probability: "medium" },
      { cause: "Background malware or crypto miner", probability: "medium" },
      { cause: "BIOS set CPU to power-saving mode", probability: "low" },
    ],
    diagnosticSteps: [
      "Check storage drive health — SMART status",
      "Verify RAM is in dual channel: check CPU-Z or BIOS memory info",
      "Monitor CPU clock speed — if stuck low, check BIOS power settings",
      "Check Task Manager/top for unexpected CPU usage",
      "Run from Linux live USB — if fast there, OS/malware issue",
    ],
    tools: ["CrystalDiskInfo or smartmontools", "CPU-Z", "Linux live USB"],
    difficulty: 2,
    keywords: ["slow", "sluggish", "slow boot", "high latency", "throttle"],
  },
  {
    id: "pwr-007",
    name: "Burning smell from motherboard",
    category: "power",
    symptoms: ["Acrid electrical smell", "Visible smoke", "System may or may not still work"],
    causes: [
      { cause: "VRM MOSFET failure — shorted and overheated", probability: "high" },
      { cause: "Capacitor popped — electrolyte leak", probability: "high" },
      { cause: "PCB trace overcurrent — copper trace burned", probability: "medium" },
      { cause: "Foreign object shorting components", probability: "low" },
    ],
    diagnosticSteps: [
      "POWER OFF IMMEDIATELY — do not continue running",
      "Unplug PSU from wall",
      "Open case and identify source of smell/smoke — look near VRM, PCH, and PCIe slots",
      "Look for blackened/charred components",
      "Check for bulging or popped capacitors",
      "If VRM area: board may be repairable by replacing MOSFETs (advanced, BGA rework)",
      "If PCH area: board is likely not economically repairable",
    ],
    tools: ["Magnifying glass", "Nose", "Multimeter (after cooling, diode mode to find shorts)"],
    difficulty: 5,
    keywords: ["burning", "smoke", "smell", "burnt", "fire", "charred"],
  },
  {
    id: "boot-006",
    name: "Beep codes on startup",
    category: "boot",
    symptoms: ["Speaker beeps during POST", "System may or may not continue booting", "Pattern of long and short beeps"],
    causes: [
      { cause: "Specific hardware failure identified by BIOS beep code pattern", probability: "high" },
    ],
    diagnosticSteps: [
      "Count the beep pattern: number of long beeps, number of short beeps",
      "Identify BIOS vendor: AMI = short beeps, Award = long+short, Phoenix = groups of 3",
      "Common codes: 1 short = normal POST, 3 short (AMI) = RAM failure, 1 long 2 short = GPU failure",
      "Use 'biospy post-decode' with the count-based code or debug LED hex code",
      "Address the hardware identified by the beep code",
    ],
    tools: ["PC speaker/buzzer", "biospy post-decode"],
    difficulty: 2,
    keywords: ["beep", "beeping", "beep code", "speaker", "bios beep"],
  },
  {
    id: "periph-007",
    name: "CPU fan error on boot",
    category: "peripheral",
    symptoms: ["BIOS displays 'CPU Fan Error'", "System pauses requiring F1 to continue", "Fan is actually spinning"],
    causes: [
      { cause: "CPU fan connected to wrong header (CHA_FAN instead of CPU_FAN)", probability: "high" },
      { cause: "Fan RPM below BIOS minimum threshold (low-RPM quiet fans)", probability: "high" },
      { cause: "Fan cable not fully seated on CPU_FAN header", probability: "medium" },
      { cause: "AIO pump on CPU_FAN header reporting wrong RPM", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check that CPU fan is connected to CPU_FAN header (not CHA_FAN or SYS_FAN)",
      "Enter BIOS — set CPU fan speed threshold to 'Ignore' or lowest setting",
      "If AIO cooler: connect pump to AIO_PUMP header, radiator fan to CPU_FAN",
      "Check fan cable — 4-pin should be fully seated, PWM fans need all 4 pins",
      "Verify fan is actually spinning when system is on",
    ],
    tools: ["Motherboard manual (for fan header locations)"],
    difficulty: 1,
    keywords: ["cpu fan error", "fan error", "fan warning", "f1 to continue", "fan speed"],
  },
];

export function searchFailurePatterns(query: string): FailurePattern[] {
  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>();

  for (const word of words) {
    expandedTerms.add(word);
    for (const [, synonyms] of Object.entries(SYNONYMS)) {
      if (synonyms.some((s) => s.includes(word) || word.includes(s))) {
        for (const syn of synonyms) {
          expandedTerms.add(syn);
        }
      }
    }
  }

  const scored: Array<{ pattern: FailurePattern; score: number }> = [];

  for (const pattern of FAILURE_PATTERNS) {
    let score = 0;
    const searchableText = [
      pattern.name,
      ...pattern.symptoms,
      ...pattern.keywords,
      ...pattern.causes.map((c) => c.cause),
    ]
      .join(" ")
      .toLowerCase();

    for (const term of expandedTerms) {
      if (searchableText.includes(term)) {
        score += term.length;
      }
    }

    for (const word of words) {
      for (const kw of pattern.keywords) {
        if (kw.includes(word)) score += 5;
      }
    }

    if (score > 0) scored.push({ pattern, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.pattern);
}

export function getPatternsByCategory(category: string): FailurePattern[] {
  const cat = category.toLowerCase() as FailureCategory;
  return FAILURE_PATTERNS.filter((p) => p.category === cat);
}
