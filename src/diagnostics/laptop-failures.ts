export type LaptopFailureCategory =
  | "power"
  | "display"
  | "keyboard"
  | "audio"
  | "network"
  | "usb"
  | "storage"
  | "battery"
  | "boot"
  | "thermal";

export interface LaptopFailureCause {
  cause: string;
  probability: "high" | "medium" | "low";
}

export interface LaptopFailurePattern {
  id: string;
  name: string;
  category: LaptopFailureCategory;
  symptoms: string[];
  causes: LaptopFailureCause[];
  diagnosticSteps: string[];
  tools: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

const LAPTOP_SYNONYMS: Record<string, string[]> = {
  power: ["power", "dead", "won't turn on", "no power", "doesn't charge", "charger"],
  display: ["display", "screen", "lcd", "panel", "backlight", "dim", "flickering", "blank"],
  keyboard: ["keyboard", "keys", "key", "typing", "stuck key", "ghosting", "trackpad", "touchpad"],
  audio: ["audio", "sound", "speaker", "headphone", "mic", "microphone", "volume"],
  network: ["wifi", "wireless", "bluetooth", "network", "internet", "connection", "lan"],
  usb: ["usb", "port", "ports", "thunderbolt", "usb-c", "type-c", "hub"],
  storage: ["storage", "ssd", "hdd", "nvme", "m.2", "disk", "drive"],
  battery: ["battery", "charge", "charging", "swollen", "drain", "capacity", "plugged in"],
  boot: ["boot", "startup", "post", "bios", "won't start", "no boot", "stuck"],
  thermal: ["thermal", "hot", "overheating", "fan", "fan noise", "throttle", "temperature"],
};

export const LAPTOP_FAILURE_PATTERNS: LaptopFailurePattern[] = [
  // ═══════════════════════════════════════════════
  // POWER (no power, charger issues, DC jack)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-pwr-001",
    name: "Completely dead — no LEDs, no charge indicator",
    category: "power",
    symptoms: [
      "No LEDs when charger plugged in",
      "No response to power button",
      "Charger LED may or may not be on",
    ],
    causes: [
      { cause: "Faulty charger or wrong voltage/wattage adapter", probability: "high" },
      { cause: "DC jack broken or loose solder joints", probability: "high" },
      { cause: "Mainboard short circuit near power input", probability: "medium" },
      { cause: "Blown charging MOSFET or fuse on mainboard", probability: "medium" },
      { cause: "EC (Embedded Controller) firmware hang — not toggling power rails", probability: "low" },
    ],
    diagnosticSteps: [
      "Test charger output with multimeter — verify correct voltage (e.g. 19V for most laptops)",
      "Check DC jack barrel for bent center pin or cracked solder on mainboard",
      "Try removing battery and booting on AC only",
      "Measure standby voltage on mainboard (3.3VALW / 5VALW rails)",
      "If USB-C PD charging: test with a known-good USB-C PD charger rated for laptop wattage",
      "Disconnect all peripherals, remove RAM and storage, attempt power-on for minimal POST",
    ],
    tools: ["Multimeter", "Known-good charger", "Small screwdriver set"],
    difficulty: 2,
    keywords: ["dead laptop", "no power", "won't turn on", "charger", "dc jack", "no led"],
  },
  {
    id: "lpt-pwr-002",
    name: "Powers on briefly then shuts off",
    category: "power",
    symptoms: [
      "Fan spins for 1-3 seconds then stops",
      "Power LED blinks then goes off",
      "May cycle on/off repeatedly",
    ],
    causes: [
      { cause: "RAM not seated or failed", probability: "high" },
      { cause: "CPU or GPU short circuit triggering overcurrent protection", probability: "medium" },
      { cause: "Charger wattage too low — can't sustain power draw", probability: "medium" },
      { cause: "Mainboard VRM failure", probability: "medium" },
      { cause: "BIOS corruption preventing POST", probability: "low" },
    ],
    diagnosticSteps: [
      "Remove and reseat RAM modules — try one stick at a time",
      "Verify charger wattage matches laptop requirement (check bottom label)",
      "Disconnect battery and boot on AC only",
      "Listen for beep codes or check LED blink patterns (manufacturer-specific diagnostic codes)",
      "If available, try external BIOS flash via SPI header with CH341A/CH347",
    ],
    tools: ["Multimeter", "Correct wattage charger", "CH341A/CH347 (for BIOS recovery)"],
    difficulty: 3,
    keywords: ["brief power", "shuts off", "cycles", "blinks", "fan spin stop"],
  },

  // ═══════════════════════════════════════════════
  // DISPLAY (no backlight, flickering, artifacts)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-disp-001",
    name: "No backlight — faint image visible with flashlight",
    category: "display",
    symptoms: [
      "Screen appears completely black",
      "Faint image visible when shining flashlight at screen",
      "External monitor works normally",
    ],
    causes: [
      { cause: "Failed backlight driver circuit on mainboard", probability: "high" },
      { cause: "Damaged eDP cable — backlight wires broken at hinge", probability: "high" },
      { cause: "LCD panel backlight LEDs failed", probability: "medium" },
      { cause: "Lid switch stuck or Hall sensor malfunction reporting lid closed", probability: "low" },
    ],
    diagnosticSteps: [
      "Shine flashlight at screen angle — if desktop visible, backlight is the issue",
      "Connect external monitor to confirm GPU is functional",
      "Check eDP cable at hinge area for damage (most common break point)",
      "Measure backlight voltage at LCD connector — should see 20-50V depending on panel",
      "Check if closing/opening lid rapidly changes behavior (lid switch issue)",
      "Try pressing Fn + brightness up key in case brightness set to zero",
    ],
    tools: ["Flashlight", "External monitor", "Multimeter", "Laptop disassembly tools"],
    difficulty: 3,
    keywords: ["no backlight", "dark screen", "faint image", "flashlight test", "backlight"],
  },
  {
    id: "lpt-disp-002",
    name: "Screen flickering or intermittent blackouts",
    category: "display",
    symptoms: [
      "Screen flickers during use",
      "Display cuts out when adjusting lid angle",
      "Intermittent black screen then recovers",
    ],
    causes: [
      { cause: "Damaged eDP cable — intermittent contact at hinge flex point", probability: "high" },
      { cause: "Loose eDP connector on mainboard", probability: "medium" },
      { cause: "GPU driver issue causing display resets", probability: "medium" },
      { cause: "LCD panel connector worn or corroded", probability: "low" },
    ],
    diagnosticSteps: [
      "Slowly adjust lid angle — if flicker correlates with angle, eDP cable is damaged",
      "Connect external monitor — if external is stable, issue is internal display path",
      "Reseat eDP cable connector on mainboard",
      "Update GPU drivers and test",
      "If angle-dependent: replace eDP cable (route through hinge)",
    ],
    tools: ["External monitor", "Laptop disassembly tools", "Replacement eDP cable"],
    difficulty: 3,
    keywords: ["flickering", "flicker", "intermittent", "blackout", "lid angle", "edp cable"],
  },

  // ═══════════════════════════════════════════════
  // KEYBOARD (dead keys, ghosting, liquid damage)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-kb-001",
    name: "Keyboard not responding — all keys dead",
    category: "keyboard",
    symptoms: [
      "No keyboard input detected",
      "External USB keyboard works",
      "Keyboard backlight may still work",
    ],
    causes: [
      { cause: "Keyboard ribbon cable loose or disconnected", probability: "high" },
      { cause: "Keyboard ribbon cable damaged at fold point", probability: "medium" },
      { cause: "Keyboard controller on mainboard failed", probability: "medium" },
      { cause: "Liquid damage corroding keyboard connector", probability: "medium" },
    ],
    diagnosticSteps: [
      "Test with external USB keyboard to confirm system is functional",
      "Reseat keyboard ribbon cable on mainboard",
      "Inspect ribbon cable for tears, creases, or corrosion",
      "Check BIOS — if keyboard works in BIOS but not OS, driver issue",
      "Look for signs of liquid damage near keyboard connector",
    ],
    tools: ["External USB keyboard", "Laptop disassembly tools", "Isopropyl alcohol"],
    difficulty: 2,
    keywords: ["keyboard dead", "no keys", "keyboard not working", "ribbon cable"],
  },
  {
    id: "lpt-kb-002",
    name: "Specific keys stuck or typing wrong characters",
    category: "keyboard",
    symptoms: [
      "Certain keys always pressed (ghosting)",
      "Wrong characters appear when typing",
      "Key physically stuck down",
      "Random key presses without touching keyboard",
    ],
    causes: [
      { cause: "Debris or liquid residue under key switch", probability: "high" },
      { cause: "Liquid damage causing short circuits on keyboard membrane", probability: "high" },
      { cause: "Keyboard membrane traces corroded", probability: "medium" },
      { cause: "Worn key switch mechanism", probability: "low" },
    ],
    diagnosticSteps: [
      "Remove keycap and clean underneath with isopropyl alcohol",
      "Check for visible liquid damage or corrosion on keyboard membrane",
      "Test in BIOS or OS keyboard tester to identify exact stuck/shorted keys",
      "Disconnect internal keyboard and use external to confirm issue is keyboard-only",
      "If liquid damage: keyboard replacement is usually required",
    ],
    tools: ["Keycap puller", "Isopropyl alcohol", "Compressed air", "External keyboard"],
    difficulty: 2,
    keywords: ["stuck key", "ghosting", "wrong character", "phantom key", "liquid spill"],
  },

  // ═══════════════════════════════════════════════
  // AUDIO (no sound, crackling, mic issues)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-audio-001",
    name: "No audio output — speakers and headphone jack silent",
    category: "audio",
    symptoms: [
      "No sound from internal speakers",
      "No sound from headphone jack",
      "Audio device shows in OS but no output",
    ],
    causes: [
      { cause: "Audio driver not installed or corrupted", probability: "high" },
      { cause: "Audio codec chip failure (Realtek ALC series common)", probability: "medium" },
      { cause: "Speaker cable disconnected from mainboard", probability: "medium" },
      { cause: "Headphone jack stuck in 'headphone mode' — internal switch jammed", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check OS audio settings — correct output device selected, not muted",
      "Reinstall audio driver from manufacturer website",
      "Test in Linux live USB — if audio works, driver issue",
      "Insert and remove headphone plug several times (may unstick jack detection switch)",
      "Open laptop and check speaker cable connection to mainboard",
      "If codec chip failed: USB audio adapter as workaround",
    ],
    tools: ["Linux live USB", "USB audio adapter", "Laptop disassembly tools"],
    difficulty: 2,
    keywords: ["no audio", "no sound", "speakers dead", "mute", "audio codec"],
  },
  {
    id: "lpt-audio-002",
    name: "Crackling or distorted audio",
    category: "audio",
    symptoms: [
      "Audio pops and crackles during playback",
      "Distorted sound at any volume",
      "Crackling worse under CPU load",
    ],
    causes: [
      { cause: "Audio driver DPC latency issue", probability: "high" },
      { cause: "Speaker cone physically damaged", probability: "medium" },
      { cause: "Loose speaker cable connection", probability: "medium" },
      { cause: "Electrical interference from mainboard to audio traces", probability: "low" },
    ],
    diagnosticSteps: [
      "Test with headphones — if clean audio on headphones, speaker hardware issue",
      "Run LatencyMon to check DPC latency (>1000us causes audio glitches)",
      "Update audio driver and disable audio enhancements",
      "Reseat speaker cable connection",
      "If speaker damage: replacement speakers are usually inexpensive",
    ],
    tools: ["Headphones", "LatencyMon", "Laptop disassembly tools"],
    difficulty: 2,
    keywords: ["crackling", "distorted", "popping", "audio glitch", "speaker damage"],
  },

  // ═══════════════════════════════════════════════
  // NETWORK (WiFi, Bluetooth, Ethernet)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-net-001",
    name: "WiFi not detecting any networks",
    category: "network",
    symptoms: [
      "No WiFi networks visible",
      "WiFi adapter not detected in OS",
      "Airplane mode LED may be on",
    ],
    causes: [
      { cause: "WiFi disabled via hardware switch or Fn key combination", probability: "high" },
      { cause: "WiFi antenna cables disconnected (common after disassembly)", probability: "high" },
      { cause: "WiFi M.2 card not seated properly", probability: "medium" },
      { cause: "WiFi card failure", probability: "medium" },
      { cause: "BIOS whitelist rejecting non-OEM WiFi card", probability: "low" },
    ],
    diagnosticSteps: [
      "Check for hardware WiFi switch on laptop body or Fn + WiFi key",
      "Verify WiFi adapter appears in Device Manager / lspci",
      "Open laptop and verify antenna cables (usually 2: black and white) are connected to WiFi card",
      "Reseat WiFi M.2 card",
      "Try a known-good WiFi card if available",
      "Check BIOS for WiFi enable/disable setting and whitelist restrictions",
    ],
    tools: ["Laptop disassembly tools", "Known-good WiFi card (same interface)"],
    difficulty: 2,
    keywords: ["no wifi", "wifi dead", "no networks", "wireless", "airplane mode", "antenna"],
  },
  {
    id: "lpt-net-002",
    name: "WiFi intermittent disconnections",
    category: "network",
    symptoms: [
      "WiFi drops connection periodically",
      "Signal strength fluctuates",
      "Disconnects when laptop is moved or lid adjusted",
    ],
    causes: [
      { cause: "WiFi antenna cable loose or partially disconnected", probability: "high" },
      { cause: "WiFi card power management aggressively sleeping", probability: "high" },
      { cause: "Damaged antenna wire (routed through hinge, breaks over time)", probability: "medium" },
      { cause: "Driver bug causing periodic disconnection", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disable WiFi power saving: Device Manager > WiFi adapter > Power Management > uncheck 'Allow to turn off'",
      "Check antenna cable connections inside laptop",
      "If disconnects correlate with lid movement: antenna cable damaged at hinge",
      "Update WiFi driver from manufacturer (not Windows Update generic)",
      "Test with a USB WiFi adapter to confirm issue is internal card/antenna",
    ],
    tools: ["USB WiFi adapter (diagnostic)", "Laptop disassembly tools"],
    difficulty: 2,
    keywords: ["wifi drops", "disconnect", "intermittent wifi", "signal drop", "wifi unstable"],
  },

  // ═══════════════════════════════════════════════
  // USB (dead ports, intermittent, power delivery)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-usb-001",
    name: "USB port not recognizing devices",
    category: "usb",
    symptoms: [
      "Devices not detected when plugged in",
      "USB device works on other ports or other computers",
      "No power on USB port (phone doesn't charge)",
    ],
    causes: [
      { cause: "Physical damage to USB port — bent pins or cracked solder", probability: "high" },
      { cause: "ESD damage to USB controller", probability: "medium" },
      { cause: "USB controller disabled in BIOS", probability: "medium" },
      { cause: "Blown USB port fuse on mainboard", probability: "medium" },
    ],
    diagnosticSteps: [
      "Test with multiple USB devices (keyboard, mouse, flash drive)",
      "Inspect port with flashlight for bent pins or debris",
      "Check BIOS — ensure USB controllers are enabled",
      "Measure 5V on USB port pins with multimeter (pin 1 and 4)",
      "If no voltage: trace USB fuse on mainboard (SMD fuse near port)",
      "Test in Linux live USB to rule out OS/driver issue",
    ],
    tools: ["Multimeter", "Flashlight", "Multiple USB test devices", "Linux live USB"],
    difficulty: 2,
    keywords: ["usb dead", "usb not working", "port dead", "no usb power", "usb not recognized"],
  },
  {
    id: "lpt-usb-002",
    name: "USB-C / Thunderbolt port not charging or no data",
    category: "usb",
    symptoms: [
      "USB-C charger not recognized",
      "Charges slowly or not at all",
      "External display via USB-C doesn't work",
      "Thunderbolt devices not detected",
    ],
    causes: [
      { cause: "USB-C cable not rated for PD or Thunderbolt (cheap cables)", probability: "high" },
      { cause: "Charger wattage below laptop requirement", probability: "high" },
      { cause: "USB-C port CC pins damaged — can't negotiate PD", probability: "medium" },
      { cause: "Thunderbolt controller firmware needs update", probability: "medium" },
      { cause: "Not all USB-C ports on laptop support charging or Thunderbolt", probability: "medium" },
    ],
    diagnosticSteps: [
      "Verify charger supports USB PD at required wattage (check laptop specs)",
      "Try a certified USB-C cable rated for the needed protocol",
      "Check laptop manual — which USB-C ports support charging vs data-only",
      "Update Thunderbolt firmware via manufacturer utility",
      "Test with a known-good USB-C PD charger and cable combination",
      "Inspect USB-C port for debris or bent pins (use magnification)",
    ],
    tools: ["Known-good USB-C PD charger", "Certified USB-C cable", "Magnifying glass"],
    difficulty: 2,
    keywords: ["usb-c", "type-c", "thunderbolt", "pd charging", "usb-c not charging"],
  },

  // ═══════════════════════════════════════════════
  // STORAGE (drive not detected, slow, clicking)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-stor-001",
    name: "Internal SSD/HDD not detected",
    category: "storage",
    symptoms: [
      "BIOS shows no storage device",
      "OS installer can't find drive",
      "Drive was working previously",
    ],
    causes: [
      { cause: "M.2 SSD not fully seated in slot", probability: "high" },
      { cause: "SSD/HDD failure — controller or NAND died", probability: "high" },
      { cause: "SATA cable damaged (2.5\" HDD/SSD laptops)", probability: "medium" },
      { cause: "M.2 slot incompatibility (SATA M.2 in NVMe-only slot or vice versa)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Enter BIOS and check if drive appears in storage device list",
      "Reseat M.2 SSD — remove screw, pull out, reinsert firmly",
      "For 2.5\" drives: check SATA ribbon cable for damage or loose connection",
      "Try the drive in another laptop or USB enclosure to test",
      "Check if M.2 slot supports SATA, NVMe, or both (motherboard manual)",
      "Check SMART data if drive is partially detected",
    ],
    tools: ["Small screwdriver", "USB drive enclosure", "Another computer for testing"],
    difficulty: 2,
    keywords: ["drive not detected", "ssd missing", "no storage", "nvme not found", "hdd dead"],
  },

  // ═══════════════════════════════════════════════
  // BATTERY (not charging, swollen, rapid drain)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-bat-001",
    name: "Battery not charging — plugged in, not charging",
    category: "battery",
    symptoms: [
      "Charger connected but battery percentage not increasing",
      "OS shows 'Plugged in, not charging'",
      "Battery stuck at a specific percentage",
    ],
    causes: [
      { cause: "Battery charge threshold set in BIOS/software (Lenovo Vantage, Dell Power Manager)", probability: "high" },
      { cause: "Battery worn out — exceeded cycle count limit, BMS refusing charge", probability: "high" },
      { cause: "Charger wattage insufficient — powers laptop but can't charge simultaneously", probability: "medium" },
      { cause: "Battery connector corrosion or loose connection", probability: "medium" },
      { cause: "EC firmware bug — incorrect battery state reporting", probability: "low" },
    ],
    diagnosticSteps: [
      "Check battery health: OS battery report (powercfg /batteryreport on Windows)",
      "Check manufacturer power management software for charge thresholds",
      "Verify charger wattage matches or exceeds laptop specification",
      "Try different charger to rule out charger degradation",
      "Power off laptop, disconnect battery, reconnect, and test",
      "EC reset: remove battery and charger, hold power button 30 seconds, reconnect",
    ],
    tools: ["Correct wattage charger", "Battery report tool", "Laptop disassembly tools"],
    difficulty: 2,
    keywords: ["not charging", "plugged in", "battery stuck", "charge threshold", "won't charge"],
  },
  {
    id: "lpt-bat-002",
    name: "Swollen battery — trackpad raised, case bulging",
    category: "battery",
    symptoms: [
      "Laptop case no longer sits flat",
      "Trackpad raised or clicking on its own",
      "Bottom panel bulging",
      "Case difficult to close",
    ],
    causes: [
      { cause: "Battery cell gas buildup from degradation — REPLACE IMMEDIATELY", probability: "high" },
    ],
    diagnosticSteps: [
      "STOP USING THE LAPTOP — swollen batteries are a fire/explosion risk",
      "Do NOT puncture or attempt to flatten the battery",
      "Power off the laptop and do not charge it",
      "Carefully remove the bottom panel and disconnect the battery",
      "Dispose of swollen battery at an authorized recycling center — NOT in regular trash",
      "Order replacement battery (OEM or quality third-party with correct connector and voltage)",
    ],
    tools: ["Laptop disassembly tools", "Anti-static bag for battery transport"],
    difficulty: 2,
    keywords: ["swollen battery", "bulging", "puffed battery", "trackpad raised", "battery expanding"],
  },
  {
    id: "lpt-bat-003",
    name: "Battery drains extremely fast",
    category: "battery",
    symptoms: [
      "Battery life much shorter than expected",
      "Battery drains in 1-2 hours on light use",
      "Battery percentage drops rapidly",
    ],
    causes: [
      { cause: "Battery degraded — design capacity significantly reduced from wear", probability: "high" },
      { cause: "Background process consuming excessive CPU/GPU (crypto miner, runaway app)", probability: "high" },
      { cause: "Display brightness at maximum", probability: "medium" },
      { cause: "Discrete GPU active when not needed (not switching to iGPU)", probability: "medium" },
      { cause: "Hardware component drawing excessive power (shorted USB, faulty WiFi card)", probability: "low" },
    ],
    diagnosticSteps: [
      "Check battery health — compare current capacity to design capacity",
      "Check running processes for high CPU usage (Task Manager / top)",
      "Verify GPU switching is working (Optimus/AMD Switchable should use iGPU at idle)",
      "Reduce display brightness and test battery life",
      "Check power plan settings — ensure balanced or power saver mode",
      "If battery health <60% of design capacity: replace battery",
    ],
    tools: ["Battery report tool", "Task Manager / Activity Monitor", "HWiNFO or similar"],
    difficulty: 1,
    keywords: ["battery drain", "short battery life", "fast drain", "battery dies quickly"],
  },

  // ═══════════════════════════════════════════════
  // BOOT (no POST, boot loop, BIOS issues)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-boot-001",
    name: "Laptop stuck in boot loop",
    category: "boot",
    symptoms: [
      "Laptop logo appears then restarts",
      "Never reaches OS",
      "May show different errors each cycle",
    ],
    causes: [
      { cause: "Corrupt OS installation or failed update", probability: "high" },
      { cause: "Failing SSD/HDD — boot sector errors", probability: "medium" },
      { cause: "RAM instability — passes initial POST but fails during OS load", probability: "medium" },
      { cause: "BIOS settings incompatible with installed OS (UEFI/Legacy mismatch)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Enter BIOS (usually F2/Del at logo) — if BIOS is accessible, basic hardware is OK",
      "Try booting to Safe Mode (hold Shift during Windows boot)",
      "Boot from USB Linux live disk — if stable, issue is OS or storage",
      "Run memtest86 from USB — any errors indicate RAM failure",
      "Check storage drive SMART data for errors",
      "Clear CMOS and load BIOS defaults",
    ],
    tools: ["Linux live USB", "Memtest86 USB", "OS recovery media"],
    difficulty: 2,
    keywords: ["boot loop", "restarting", "won't boot", "stuck booting", "restart cycle"],
  },
  {
    id: "lpt-boot-002",
    name: "BIOS corrupt — laptop won't POST after update",
    category: "boot",
    symptoms: [
      "Laptop dead after BIOS update attempt",
      "Power LED on but no display, no POST",
      "Was working immediately before update",
    ],
    causes: [
      { cause: "BIOS update interrupted — partial write to SPI flash", probability: "high" },
      { cause: "Wrong BIOS version flashed (different model or revision)", probability: "high" },
      { cause: "SPI flash chip partially erased", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check if laptop has BIOS recovery mode (e.g., Ctrl+Esc on HP, Fn+R on Lenovo at power-on)",
      "If no built-in recovery: locate SPI flash chip on mainboard",
      "Use CH341A/CH347 with SOIC8 clip to read current (corrupted) BIOS",
      "Download correct BIOS from manufacturer — extract the raw ROM file if packaged in installer",
      "Flash correct BIOS with 'biospy write correct_bios.bin'",
      "Verify flash with 'biospy verify correct_bios.bin'",
    ],
    tools: ["CH341A or CH347 programmer", "SOIC8 clip", "biospy CLI tool"],
    difficulty: 4,
    keywords: ["bios corrupt", "failed bios update", "bricked laptop", "no post after update"],
  },

  // ═══════════════════════════════════════════════
  // THERMAL (overheating, fan noise, throttling)
  // ═══════════════════════════════════════════════

  {
    id: "lpt-therm-001",
    name: "Laptop overheating and throttling",
    category: "thermal",
    symptoms: [
      "Laptop extremely hot to touch (palm rest, bottom)",
      "Performance drops under sustained load",
      "Fan running at maximum speed constantly",
      "CPU clock speed drops under load (visible in HWiNFO)",
    ],
    causes: [
      { cause: "Dried-out thermal paste between CPU/GPU and heatsink", probability: "high" },
      { cause: "Clogged heatsink fins — dust buildup blocking airflow", probability: "high" },
      { cause: "Fan intake/exhaust vents blocked (soft surface use)", probability: "medium" },
      { cause: "Fan failing — not spinning at full RPM", probability: "medium" },
      { cause: "Heat pipe degraded — lost heat transfer fluid", probability: "low" },
    ],
    diagnosticSteps: [
      "Monitor CPU/GPU temperatures under load (HWiNFO, lm-sensors)",
      "Throttling temp: Intel ~100C, AMD ~95C — if hitting these, thermal issue confirmed",
      "Check air vents for dust blockage — compressed air from exhaust side",
      "Open laptop and inspect heatsink fins for dust mat",
      "Replace thermal paste with quality compound (e.g., Thermal Grizzly Kryonaut)",
      "Verify fan spins freely and reaches expected RPM",
    ],
    tools: ["Compressed air", "Thermal paste", "HWiNFO or lm-sensors", "Laptop disassembly tools"],
    difficulty: 3,
    keywords: ["overheating", "hot", "throttling", "fan loud", "thermal paste", "dust"],
  },
  {
    id: "lpt-therm-002",
    name: "Fan not spinning or making grinding noise",
    category: "thermal",
    symptoms: [
      "No fan noise at all under load",
      "Grinding or rattling sound from fan",
      "System overheats and shuts down",
    ],
    causes: [
      { cause: "Fan bearing worn out — needs replacement", probability: "high" },
      { cause: "Fan cable disconnected from mainboard", probability: "medium" },
      { cause: "Fan blocked by debris or cable", probability: "medium" },
      { cause: "Fan controller circuit failed on mainboard", probability: "low" },
    ],
    diagnosticSteps: [
      "Listen for fan during boot — most laptops spin fan briefly at POST",
      "Open laptop and check fan cable connection to mainboard",
      "Spin fan by hand — should rotate freely without grinding",
      "Check for debris or cables caught in fan blades",
      "If fan not spinning and cable is connected: test fan with 5V directly to rule out mainboard",
      "Order replacement fan (model-specific part number from manufacturer)",
    ],
    tools: ["Laptop disassembly tools", "Replacement fan", "Can of compressed air"],
    difficulty: 2,
    keywords: ["fan dead", "fan noise", "grinding fan", "no fan", "fan not spinning", "rattling"],
  },

  // ═══════════════════════════════════════════════
  // POWER — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-pwr-003",
    name: "Charger LED dims or blinks when plugged into laptop",
    category: "power",
    symptoms: [
      "Charger LED goes off or dims when connected",
      "Charger works on other laptops",
      "Burning smell from laptop power input area",
    ],
    causes: [
      { cause: "Short circuit on mainboard near power input — charger enters protection mode", probability: "high" },
      { cause: "Shorted MOSFET or capacitor on power input rail", probability: "high" },
      { cause: "DC jack shorted internally", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disconnect charger immediately if burning smell detected",
      "Test charger on another laptop to confirm charger is OK",
      "Measure resistance across power input pins on mainboard — low resistance indicates short",
      "Use thermal camera or IPA freeze spray to locate shorted component",
      "Common short locations: MOSFET near power jack, ceramic caps near charging IC",
    ],
    tools: ["Multimeter", "Thermal camera / freeze spray", "Replacement MOSFET/capacitors"],
    difficulty: 4,
    keywords: ["charger dims", "charger blinks", "short circuit", "burning smell", "charger protection"],
  },
  {
    id: "lpt-pwr-004",
    name: "Only powers on when battery disconnected",
    category: "power",
    symptoms: [
      "Works on AC with battery disconnected",
      "Dies immediately when battery connected",
      "Battery may show 0% or abnormal voltage",
    ],
    causes: [
      { cause: "Battery BMS fault — cells over-discharged or unbalanced", probability: "high" },
      { cause: "Battery cell internal short pulling power rail down", probability: "medium" },
      { cause: "Charging IC shuts down due to battery fault detection", probability: "medium" },
    ],
    diagnosticSteps: [
      "Measure battery voltage at connector — should match cell count * 3.7V nominal",
      "If voltage is 0V or very low (<3V per cell): battery BMS has disconnected cells",
      "Try known-good battery if available",
      "Check if charging IC reports fault via EC status",
      "Battery below 2.5V per cell may be unrecoverable",
    ],
    tools: ["Multimeter", "Known-good battery", "Battery voltage chart"],
    difficulty: 2,
    keywords: ["battery disconnect", "only ac power", "battery short", "dies with battery"],
  },
  {
    id: "lpt-pwr-005",
    name: "Powers on but no BIOS/POST — power LED stays on",
    category: "power",
    symptoms: [
      "Power LED lit solid",
      "Fan runs continuously",
      "No display output at all",
      "No beep codes",
    ],
    causes: [
      { cause: "CPU not receiving correct voltage from VRM", probability: "high" },
      { cause: "RAM slot or memory controller failure", probability: "high" },
      { cause: "BIOS SPI flash corrupted", probability: "medium" },
      { cause: "CPU BGA solder joint failure (rare on modern laptops)", probability: "low" },
    ],
    diagnosticSteps: [
      "Measure CPU VRM output rail — should be ~1.0-1.8V depending on platform",
      "Try each RAM slot individually with known-good RAM",
      "Attempt BIOS recovery via manufacturer method",
      "If SPI header available: dump BIOS with CH341A and verify checksum",
      "Connect external monitor to rule out display-only failure",
    ],
    tools: ["Multimeter", "Known-good RAM", "CH341A/CH347 programmer", "External monitor"],
    difficulty: 4,
    keywords: ["no post", "no bios", "fan runs no display", "power led solid", "no boot screen"],
  },
  {
    id: "lpt-pwr-006",
    name: "Laptop only charges when powered off",
    category: "power",
    symptoms: [
      "Battery charges while laptop is off",
      "Battery stops charging or drains when laptop is on",
      "Laptop runs on AC but battery percentage decreases during use",
    ],
    causes: [
      { cause: "Charger wattage too low — can power laptop OR charge, not both", probability: "high" },
      { cause: "Charging IC thermal throttling under combined load", probability: "medium" },
      { cause: "Power path MOSFET partially failed", probability: "medium" },
    ],
    diagnosticSteps: [
      "Verify charger wattage: laptop wattage requirement (bottom label) vs charger output",
      "Try higher-wattage OEM charger",
      "Monitor charging IC temperature with thermal camera during use",
      "Check if problem occurs only under heavy CPU/GPU load",
    ],
    tools: ["Correct wattage charger", "Thermal camera", "Multimeter"],
    difficulty: 2,
    keywords: ["charges off only", "not charging while on", "low wattage charger", "battery drains plugged in"],
  },
  {
    id: "lpt-pwr-007",
    name: "Random shutdowns under load",
    category: "power",
    symptoms: [
      "Laptop turns off abruptly during heavy tasks",
      "No BSOD — instant power off",
      "More frequent when running games or compiling",
    ],
    causes: [
      { cause: "Thermal shutdown — CPU/GPU exceeding thermal limit", probability: "high" },
      { cause: "VRM overload — inadequate power delivery under sustained load", probability: "medium" },
      { cause: "Battery can't supply peak current demand", probability: "medium" },
      { cause: "Charger intermittent contact dropping power briefly", probability: "low" },
    ],
    diagnosticSteps: [
      "Monitor CPU/GPU temps leading up to shutdown (HWiNFO logging)",
      "Check if shutdowns happen on AC only, battery only, or both",
      "Measure charger connector for intermittent contact",
      "Stress test with monitoring: Prime95 + FurMark simultaneously",
      "Clean heatsink and replace thermal paste to rule out thermal",
    ],
    tools: ["HWiNFO", "Thermal paste", "Multimeter", "Stress test software"],
    difficulty: 3,
    keywords: ["random shutdown", "shuts off under load", "instant power off", "crash under load"],
  },

  // ═══════════════════════════════════════════════
  // DISPLAY — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-disp-003",
    name: "Vertical or horizontal lines on display",
    category: "display",
    symptoms: [
      "Colored lines running vertically or horizontally on screen",
      "Lines may appear only at certain lid angles",
      "Lines may be present from boot (not just in OS)",
    ],
    causes: [
      { cause: "LCD panel TAB bond failure (lines always present, specific location)", probability: "high" },
      { cause: "eDP cable damage — partial signal loss causing line artifacts", probability: "high" },
      { cause: "GPU output failure (lines on external monitor too)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Connect external monitor — if lines appear on external too, GPU is the cause",
      "If lines on internal only: press gently on LCD bezel edges — if lines change, TAB bond issue",
      "Adjust lid angle slowly — if lines correlate with angle, eDP cable damaged",
      "TAB bond failures are panel-level: requires panel replacement",
      "Check if lines are present in BIOS screen (rules out OS/driver cause)",
    ],
    tools: ["External monitor", "Replacement LCD panel", "eDP cable"],
    difficulty: 3,
    keywords: ["lines on screen", "vertical lines", "horizontal lines", "lcd lines", "display artifacts"],
  },
  {
    id: "lpt-disp-004",
    name: "External monitor not detected via HDMI/DP",
    category: "display",
    symptoms: [
      "No output on external monitor",
      "External monitor shows 'no signal'",
      "Internal display works fine",
    ],
    causes: [
      { cause: "HDMI/DP port physical damage or bent pins", probability: "high" },
      { cause: "Display output driver issue (Intel/AMD/NVIDIA)", probability: "medium" },
      { cause: "HDMI/DP level shifter IC failed on mainboard", probability: "medium" },
      { cause: "Cable or adapter not compatible (passive vs active DP adapter)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Try different cable and different external monitor",
      "Inspect HDMI/DP port for bent pins with flashlight",
      "Test in BIOS — if external works in BIOS but not OS, driver issue",
      "For USB-C to HDMI: ensure adapter supports DP Alt Mode",
      "Check display settings: Win+P to cycle display modes",
    ],
    tools: ["Known-good HDMI/DP cable", "External monitor", "Flashlight"],
    difficulty: 2,
    keywords: ["no external display", "hdmi not working", "no signal", "displayport dead", "monitor not detected"],
  },
  {
    id: "lpt-disp-005",
    name: "Display has white spots or pressure marks",
    category: "display",
    symptoms: [
      "Bright white spots visible on dark backgrounds",
      "Pressure marks or clouding on screen",
      "Spots may grow over time",
    ],
    causes: [
      { cause: "Physical pressure damage to LCD layers (backpack pressure, lid closed on object)", probability: "high" },
      { cause: "LCD backlight diffuser sheet damaged", probability: "medium" },
      { cause: "Manufacturing defect in panel (dead LED in backlight array)", probability: "low" },
    ],
    diagnosticSteps: [
      "Display solid black and solid white backgrounds to map all spots",
      "Spots from pressure damage are permanent — panel replacement required",
      "If spots appeared after transport: check what pressed against lid",
      "Single bright spot may be stuck pixel — try pixel-fixing software first",
    ],
    tools: ["Replacement LCD panel", "Pixel test patterns"],
    difficulty: 2,
    keywords: ["white spots", "pressure marks", "screen damage", "bright spots", "clouding"],
  },
  {
    id: "lpt-disp-006",
    name: "Screen turns pink/green tint or color shift",
    category: "display",
    symptoms: [
      "Entire screen has pink, green, or yellow tint",
      "Colors look washed out or wrong",
      "May appear intermittently",
    ],
    causes: [
      { cause: "eDP cable partially damaged — some color channels lost", probability: "high" },
      { cause: "LCD panel degradation (CCFL aging on older laptops)", probability: "medium" },
      { cause: "GPU output issue — color channel failure", probability: "medium" },
      { cause: "Display color profile corrupted in OS", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check external monitor — if colors normal on external, issue is internal panel/cable",
      "Reset display color profile in OS settings",
      "Adjust lid angle — if tint changes, eDP cable fault",
      "Boot to BIOS/live USB to rule out OS color profile",
      "If CCFL backlight (older laptop): CCFL tube near end of life",
    ],
    tools: ["External monitor", "Color calibration tool"],
    difficulty: 3,
    keywords: ["pink screen", "green tint", "color shift", "wrong colors", "tinted display"],
  },
  {
    id: "lpt-disp-007",
    name: "Laptop lid closes but display stays on / doesn't wake",
    category: "display",
    symptoms: [
      "Closing lid doesn't turn off display",
      "Opening lid doesn't wake laptop",
      "Lid detection unreliable",
    ],
    causes: [
      { cause: "Hall effect sensor (lid sensor) magnet displaced or failed", probability: "high" },
      { cause: "OS power settings overriding lid behavior", probability: "high" },
      { cause: "Lid sensor cable disconnected after repair", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check OS power settings for lid close action",
      "Use a small magnet near the palm rest (where lid magnet sits) — display should turn off",
      "If magnet triggers sleep: lid magnet in screen bezel has moved or fallen out",
      "Check if lid sensor cable is connected on mainboard",
    ],
    tools: ["Small magnet (for testing)", "Laptop disassembly tools"],
    difficulty: 1,
    keywords: ["lid sensor", "display won't sleep", "lid close", "won't wake", "hall sensor"],
  },

  // ═══════════════════════════════════════════════
  // KEYBOARD — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-kb-003",
    name: "Trackpad click not working or erratic cursor",
    category: "keyboard",
    symptoms: [
      "Trackpad moves cursor but click doesn't register",
      "Cursor jumps randomly during use",
      "Trackpad works intermittently",
    ],
    causes: [
      { cause: "Swollen battery pushing up on trackpad from below", probability: "high" },
      { cause: "Trackpad ribbon cable loose", probability: "medium" },
      { cause: "Liquid damage under trackpad", probability: "medium" },
      { cause: "Trackpad driver conflict (Windows precision vs OEM driver)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check for swollen battery — look for bulging bottom panel or raised trackpad",
      "Test with external mouse to confirm system works",
      "Boot to BIOS — if trackpad works there, driver issue in OS",
      "Reseat trackpad ribbon cable",
      "Clean trackpad surface (oils/moisture cause erratic behavior on some panels)",
    ],
    tools: ["External mouse", "Laptop disassembly tools", "Isopropyl alcohol"],
    difficulty: 2,
    keywords: ["trackpad", "touchpad", "click not working", "cursor jumping", "erratic mouse"],
  },
  {
    id: "lpt-kb-004",
    name: "Keyboard backlight not working",
    category: "keyboard",
    symptoms: [
      "Keyboard backlight doesn't turn on",
      "Some zones lit, others dark",
      "Backlight flickers",
    ],
    causes: [
      { cause: "Backlight disabled via Fn key combination", probability: "high" },
      { cause: "Keyboard backlight ribbon cable not connected", probability: "medium" },
      { cause: "Backlight LED strip failure in specific zone", probability: "medium" },
      { cause: "EC firmware not controlling backlight PWM", probability: "low" },
    ],
    diagnosticSteps: [
      "Press Fn + backlight key (varies by brand) to cycle backlight levels",
      "Check BIOS settings for keyboard backlight option",
      "If partial lighting: LED strip failure, replace keyboard assembly",
      "Reseat keyboard ribbon cable (backlight may be separate cable on some models)",
    ],
    tools: ["Laptop disassembly tools"],
    difficulty: 1,
    keywords: ["backlight off", "keyboard light", "kb backlight", "no illumination"],
  },
  {
    id: "lpt-kb-005",
    name: "Keyboard typing by itself — phantom inputs",
    category: "keyboard",
    symptoms: [
      "Random characters appear without touching keyboard",
      "Specific keys repeat endlessly",
      "Issue may stop temporarily after pressing affected key",
    ],
    causes: [
      { cause: "Liquid damage causing intermittent shorts in keyboard membrane", probability: "high" },
      { cause: "Keyboard connector corrosion or contamination", probability: "medium" },
      { cause: "EC glitch sending false key scan codes", probability: "low" },
    ],
    diagnosticSteps: [
      "Disconnect internal keyboard and use external — confirms keyboard is source",
      "Inspect keyboard connector and ribbon for corrosion",
      "If liquid damage history: keyboard replacement required",
      "EC reset (power drain + CMOS clear) may fix firmware glitch",
    ],
    tools: ["External USB keyboard", "Laptop disassembly tools", "Isopropyl alcohol"],
    difficulty: 2,
    keywords: ["phantom typing", "auto typing", "ghost keys", "keyboard by itself", "random input"],
  },

  // ═══════════════════════════════════════════════
  // AUDIO — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-audio-003",
    name: "Microphone not working — not detected or very quiet",
    category: "audio",
    symptoms: [
      "Internal mic not detected by OS or apps",
      "Mic input extremely quiet or silent",
      "External mic works but internal doesn't",
    ],
    causes: [
      { cause: "Microphone disabled in OS privacy/audio settings", probability: "high" },
      { cause: "Mic cable disconnected (often routed through display bezel)", probability: "medium" },
      { cause: "MEMS microphone failed (common after liquid exposure)", probability: "medium" },
      { cause: "Audio codec mic input bias voltage missing", probability: "low" },
    ],
    diagnosticSteps: [
      "Check OS privacy settings — ensure mic access is enabled for apps",
      "Set mic as default recording device and boost levels",
      "Boot Linux live USB — if mic works there, driver/settings issue",
      "Mic is often mounted in display bezel — check display cable connections",
      "Test with external mic in headphone/mic combo jack",
    ],
    tools: ["Linux live USB", "External microphone", "Audio recording app"],
    difficulty: 2,
    keywords: ["mic dead", "microphone not working", "no mic input", "mic quiet", "recording failed"],
  },
  {
    id: "lpt-audio-004",
    name: "Headphone jack not detecting headphones",
    category: "audio",
    symptoms: [
      "Audio plays through speakers even with headphones plugged in",
      "Headphones not recognized as audio device",
      "Works with some headphones but not others",
    ],
    causes: [
      { cause: "Headphone jack detection switch worn or stuck", probability: "high" },
      { cause: "Debris inside headphone jack preventing full insertion", probability: "high" },
      { cause: "TRRS vs TRS incompatibility (4-pole vs 3-pole plug)", probability: "medium" },
      { cause: "Audio codec jack detection circuit failure", probability: "low" },
    ],
    diagnosticSteps: [
      "Inspect jack with flashlight for debris (lint common in pocket-carried laptops)",
      "Try multiple headphones to rule out plug issue",
      "Insert and remove plug several times to exercise detection switch",
      "Clean jack with thin tool wrapped in cloth dipped in IPA",
      "If TRRS vs TRS: try adapter or different headphones",
    ],
    tools: ["Flashlight", "Multiple headphones", "Isopropyl alcohol", "Thin cleaning tool"],
    difficulty: 1,
    keywords: ["headphone jack", "headphones not detected", "audio through speakers", "jack stuck"],
  },

  // ═══════════════════════════════════════════════
  // NETWORK — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-net-003",
    name: "Bluetooth not working or not detecting devices",
    category: "network",
    symptoms: [
      "Bluetooth toggle missing from settings",
      "Can't discover nearby Bluetooth devices",
      "Bluetooth was working previously",
    ],
    causes: [
      { cause: "Bluetooth driver missing or corrupted", probability: "high" },
      { cause: "WiFi/BT combo card antenna disconnected (BT shares antenna)", probability: "medium" },
      { cause: "BIOS has Bluetooth disabled", probability: "medium" },
      { cause: "Bluetooth module failed on WiFi/BT combo card", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check Device Manager for Bluetooth adapter (may show under hidden devices)",
      "Reinstall WiFi/BT driver from manufacturer (WiFi and BT usually same card)",
      "Check BIOS for Bluetooth enable/disable setting",
      "Test in Linux live USB — if BT works there, driver issue",
      "If combo card: reseat M.2 WiFi card and antenna connections",
    ],
    tools: ["Linux live USB", "Known-good WiFi/BT card"],
    difficulty: 2,
    keywords: ["bluetooth dead", "bt not working", "no bluetooth", "can't pair", "bluetooth missing"],
  },
  {
    id: "lpt-net-004",
    name: "Ethernet port not working — no link light",
    category: "network",
    symptoms: [
      "No link LED when ethernet cable plugged in",
      "Cable works on other devices",
      "Network adapter not showing in OS",
    ],
    causes: [
      { cause: "Ethernet port physical damage (bent pins, cracked solder)", probability: "high" },
      { cause: "Ethernet PHY/transformer on mainboard failed", probability: "medium" },
      { cause: "Network driver not installed", probability: "medium" },
      { cause: "RJ45 jack broken from cable yank damage", probability: "medium" },
    ],
    diagnosticSteps: [
      "Inspect RJ45 port for bent pins or physical damage",
      "Test with known-good ethernet cable",
      "Check Device Manager for ethernet adapter",
      "USB ethernet adapter as workaround if port is dead",
      "Port replacement may require mainboard-level soldering",
    ],
    tools: ["Known-good ethernet cable", "USB ethernet adapter", "Flashlight"],
    difficulty: 2,
    keywords: ["ethernet dead", "lan not working", "no link", "rj45", "wired network"],
  },
  {
    id: "lpt-net-005",
    name: "WiFi very slow despite strong signal",
    category: "network",
    symptoms: [
      "WiFi connected with full bars but slow speeds",
      "Speed much worse than other devices on same network",
      "Downloads stall or time out frequently",
    ],
    causes: [
      { cause: "WiFi card only connecting at 2.4GHz instead of 5GHz", probability: "high" },
      { cause: "WiFi card antenna cables swapped (main/aux)", probability: "medium" },
      { cause: "Power saving mode limiting WiFi throughput", probability: "medium" },
      { cause: "WiFi card supporting older standard (802.11n) on 802.11ac/ax network", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check connection details: band (2.4 vs 5GHz) and link speed",
      "Disable WiFi power saving in adapter advanced settings",
      "Verify antenna cables are connected (main on port 1, aux on port 2)",
      "Run speed test and compare to phone/other device on same network",
      "Consider upgrading WiFi card (Intel AX200/AX210 widely compatible)",
    ],
    tools: ["Speed test tool", "Laptop disassembly tools", "WiFi analyzer app"],
    difficulty: 1,
    keywords: ["slow wifi", "wifi slow", "low speed", "wifi throttled", "poor wifi performance"],
  },
  {
    id: "lpt-net-006",
    name: "WiFi card not recognized after BIOS update or card swap",
    category: "network",
    symptoms: [
      "WiFi adapter disappeared after BIOS update",
      "New WiFi card not detected",
      "Error 'wireless device not found' in BIOS",
    ],
    causes: [
      { cause: "BIOS WiFi whitelist rejecting non-OEM card (common on Lenovo/HP)", probability: "high" },
      { cause: "M.2 key type mismatch (A+E key vs M key)", probability: "medium" },
      { cause: "BIOS update disabled WiFi in settings", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check BIOS for WiFi enable setting",
      "If whitelist: flash modified BIOS with whitelist removed or use OEM-approved card",
      "Verify card M.2 key type matches slot (WiFi uses A+E key)",
      "Lenovo: some ThinkPads have FRU whitelist in BIOS — need FRU-matching card",
      "HP: BIOS whitelist can sometimes be cleared via Fn+Tab at POST",
    ],
    tools: ["Compatible WiFi card", "BIOS whitelist removal tool (if applicable)"],
    difficulty: 3,
    keywords: ["wifi whitelist", "card not detected", "wifi after bios update", "incompatible wifi"],
  },

  // ═══════════════════════════════════════════════
  // USB — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-usb-003",
    name: "USB devices disconnect and reconnect randomly",
    category: "usb",
    symptoms: [
      "USB disconnect/reconnect sound plays repeatedly",
      "External drives dismount randomly",
      "Mouse or keyboard loses connection briefly",
    ],
    causes: [
      { cause: "USB port physical wear — loose connector", probability: "high" },
      { cause: "USB power management aggressively suspending ports", probability: "high" },
      { cause: "Insufficient USB bus power for device", probability: "medium" },
      { cause: "USB controller driver issue", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disable USB selective suspend in Power Options advanced settings",
      "Try different USB cable (cables degrade over time)",
      "Test device on different port and different computer",
      "Check if port physically loose — wiggle plug gently",
      "Use powered USB hub to rule out power issue",
    ],
    tools: ["Known-good USB cable", "Powered USB hub", "Different USB devices"],
    difficulty: 1,
    keywords: ["usb disconnect", "usb reconnect", "intermittent usb", "usb dropping", "device disconnects"],
  },
  {
    id: "lpt-usb-004",
    name: "All USB ports dead simultaneously",
    category: "usb",
    symptoms: [
      "No USB ports working at all",
      "Nothing enumerates in Device Manager",
      "Ports were all working before",
    ],
    causes: [
      { cause: "USB controller disabled in BIOS", probability: "high" },
      { cause: "Windows driver corruption (USB root hub)", probability: "high" },
      { cause: "USB controller hardware failure on chipset/PCH", probability: "medium" },
      { cause: "Mainboard fuse for USB power bus blown", probability: "medium" },
    ],
    diagnosticSteps: [
      "Enter BIOS — check USB controller enable setting",
      "Test with Linux live USB (boot from USB if possible — proves USB works at hardware level)",
      "If Linux works: reinstall USB drivers in Windows",
      "If no USB in BIOS either: hardware failure",
      "Measure 5V on USB port pins to verify power delivery",
    ],
    tools: ["Linux live USB", "Multimeter"],
    difficulty: 3,
    keywords: ["all usb dead", "no usb ports", "usb controller failure", "every port dead"],
  },

  // ═══════════════════════════════════════════════
  // STORAGE — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-stor-002",
    name: "SSD detected but extremely slow",
    category: "storage",
    symptoms: [
      "Boot takes minutes instead of seconds",
      "File operations crawl",
      "SMART reports high wear or reallocated sectors",
    ],
    causes: [
      { cause: "SSD NAND wear — drive in degraded mode due to worn cells", probability: "high" },
      { cause: "NVMe SSD running in SATA or PCIe x1 mode instead of x4", probability: "medium" },
      { cause: "AHCI mode not enabled in BIOS (running in IDE emulation)", probability: "medium" },
      { cause: "SSD thermal throttling due to no heatsink", probability: "medium" },
      { cause: "Firmware bug on SSD controller", probability: "low" },
    ],
    diagnosticSteps: [
      "Check SMART data: media wearout, reallocated sectors, pending sectors",
      "Run CrystalDiskMark or fio — compare to expected speeds for model",
      "Check BIOS: SATA mode should be AHCI, NVMe link speed should be x4",
      "Monitor SSD temperature during benchmark — throttles above 70-80C typically",
      "Update SSD firmware from manufacturer website",
    ],
    tools: ["CrystalDiskMark", "SMART monitoring tool", "SSD manufacturer firmware tool"],
    difficulty: 2,
    keywords: ["slow ssd", "ssd degraded", "slow boot", "ssd performance", "nand wear"],
  },
  {
    id: "lpt-stor-003",
    name: "HDD making clicking sounds",
    category: "storage",
    symptoms: [
      "Repetitive clicking from HDD area",
      "Drive not detected or detected intermittently",
      "Click of death — head repeatedly seeks and retracts",
    ],
    causes: [
      { cause: "HDD head assembly failure — click of death", probability: "high" },
      { cause: "HDD platter damage from drop or vibration", probability: "high" },
      { cause: "HDD PCB controller failure", probability: "medium" },
      { cause: "Weak power delivery to HDD motor (SATA power cable issue)", probability: "low" },
    ],
    diagnosticSteps: [
      "DO NOT repeatedly power on — each attempt risks further platter damage",
      "If data is critical: professional data recovery (clean room required)",
      "Try freezer trick ONLY as last resort for non-critical data (zip-lock bag, 1 hour)",
      "Check SATA cable connection and try different SATA port",
      "PCB swap only works with exact same model/firmware revision HDD",
    ],
    tools: ["Known-good SATA cable", "USB HDD enclosure for testing"],
    difficulty: 5,
    keywords: ["clicking", "click of death", "hdd noise", "drive clicking", "head crash"],
  },
  {
    id: "lpt-stor-004",
    name: "NVMe SSD not detected in M.2 slot",
    category: "storage",
    symptoms: [
      "M.2 NVMe SSD not showing in BIOS",
      "SATA M.2 SSD works in same slot but NVMe doesn't (or vice versa)",
      "SSD works in another computer's M.2 slot",
    ],
    causes: [
      { cause: "M.2 slot keying or protocol mismatch — slot is SATA-only but SSD is NVMe", probability: "high" },
      { cause: "SSD not fully inserted or mounting screw missing", probability: "medium" },
      { cause: "BIOS NVMe support missing or disabled", probability: "medium" },
      { cause: "M.2 slot PCIe lanes not routed (some laptops have second slot with no traces)", probability: "low" },
    ],
    diagnosticSteps: [
      "Check laptop specs: which M.2 slots support NVMe vs SATA vs both",
      "Verify M.2 key type: M-key (NVMe), B+M key (usually SATA), B-key (SATA only)",
      "Reseat SSD fully and ensure screw holds it flat",
      "Try SSD in USB NVMe enclosure on another computer to verify it works",
      "Check BIOS for NVMe controller enable setting",
    ],
    tools: ["Correct M.2 screw", "USB NVMe enclosure", "Another computer for testing"],
    difficulty: 2,
    keywords: ["nvme not detected", "m.2 not found", "ssd compatibility", "nvme vs sata", "m.2 slot"],
  },
  {
    id: "lpt-stor-005",
    name: "Laptop freezes intermittently — storage timeout",
    category: "storage",
    symptoms: [
      "System freezes for seconds then resumes",
      "Event log shows disk timeout errors",
      "Freezes become more frequent over time",
    ],
    causes: [
      { cause: "SSD firmware bug causing brief controller lockups", probability: "high" },
      { cause: "Failing SSD — NAND page read errors causing retries", probability: "high" },
      { cause: "SATA cable intermittent contact", probability: "medium" },
      { cause: "Power delivery issue to SSD during peak current draw", probability: "low" },
    ],
    diagnosticSteps: [
      "Check SMART data for read error rate and command timeout counts",
      "Update SSD firmware to latest version",
      "Check Windows Event Viewer for disk timeout events (Event ID 129, 153)",
      "Try different M.2 slot or SATA cable if applicable",
      "Back up data immediately — intermittent freezes often precede drive failure",
    ],
    tools: ["SMART monitoring tool", "SSD firmware update utility", "Event Viewer"],
    difficulty: 3,
    keywords: ["intermittent freeze", "disk timeout", "system hangs", "storage freeze", "ssd hang"],
  },
  {
    id: "lpt-stor-006",
    name: "Second HDD/SSD caddy drive not detected",
    category: "storage",
    symptoms: [
      "Optical drive replaced with HDD caddy but drive not detected",
      "Second M.2 slot SSD not showing",
      "Only primary drive visible in BIOS",
    ],
    causes: [
      { cause: "HDD caddy interface mismatch (SATA III caddy with SATA I port)", probability: "high" },
      { cause: "Optical bay SATA port disabled in BIOS", probability: "medium" },
      { cause: "HDD caddy connection pins not making contact", probability: "medium" },
      { cause: "Second M.2 slot not wired for data (power-only WWAN slot)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Verify caddy interface matches optical drive interface (usually SATA II or III)",
      "Check BIOS for secondary SATA port enable setting",
      "Try the drive directly in primary slot to confirm drive works",
      "For M.2 WWAN slots: check if pinout supports SATA or NVMe data",
      "Clean caddy connector pins with IPA",
    ],
    tools: ["HDD caddy (correct interface)", "Isopropyl alcohol"],
    difficulty: 2,
    keywords: ["second drive", "caddy", "optical bay", "hdd caddy", "second m.2", "wwan slot"],
  },

  // ═══════════════════════════════════════════════
  // BATTERY — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-bat-004",
    name: "Battery percentage jumps erratically",
    category: "battery",
    symptoms: [
      "Battery shows 80% then drops to 30% suddenly",
      "Percentage jumps up after dropping",
      "Inaccurate time remaining estimate",
    ],
    causes: [
      { cause: "Battery fuel gauge out of calibration — cells imbalanced", probability: "high" },
      { cause: "Battery degradation — individual cells at different capacities", probability: "high" },
      { cause: "EC battery calibration data stale", probability: "medium" },
    ],
    diagnosticSteps: [
      "Run battery calibration: charge to 100%, drain to 0%, charge to 100% (many OEM tools do this)",
      "Check battery health report — compare design capacity to current capacity",
      "If battery <50% health: replace battery",
      "EC reset may help recalibrate fuel gauge",
      "Lenovo Vantage and Dell Power Manager have built-in calibration tools",
    ],
    tools: ["Battery calibration tool", "Battery health monitor"],
    difficulty: 1,
    keywords: ["battery jumps", "percentage inaccurate", "erratic battery", "battery calibration", "gauge wrong"],
  },
  {
    id: "lpt-bat-005",
    name: "Laptop powers off at 20-40% battery",
    category: "battery",
    symptoms: [
      "Sudden shutdown while battery still shows significant charge",
      "Always dies at roughly same percentage",
      "Battery calibration doesn't fix it",
    ],
    causes: [
      { cause: "Battery cells degraded — voltage drops below cutoff under load despite reported capacity", probability: "high" },
      { cause: "Battery BMS voltage threshold triggering early shutdown", probability: "medium" },
      { cause: "High power draw under load causes voltage sag on weak cells", probability: "medium" },
    ],
    diagnosticSteps: [
      "Monitor battery voltage (not just percentage) under load — HWiNFO or similar",
      "If voltage drops rapidly under load, cells can't sustain current",
      "Battery capacity may read >50% health but cells have high internal resistance",
      "Replace battery — this symptom indicates cell degradation beyond calibration",
    ],
    tools: ["HWiNFO / battery voltage monitor", "Replacement battery"],
    difficulty: 2,
    keywords: ["dies at 30%", "early shutdown", "battery sag", "voltage drop", "premature shutdown"],
  },
  {
    id: "lpt-bat-006",
    name: "Battery detected at 0% — won't charge past 0%",
    category: "battery",
    symptoms: [
      "Battery shows 0% permanently",
      "Laptop runs on AC power only",
      "'Plugged in, charging' shown but percentage stays 0%",
    ],
    causes: [
      { cause: "Battery BMS tripped — cells over-discharged below recovery threshold", probability: "high" },
      { cause: "Battery communication failure (SMBus) — EC can't read charge level", probability: "medium" },
      { cause: "Charging IC not actually sending current to battery", probability: "medium" },
    ],
    diagnosticSteps: [
      "Measure battery voltage at connector — if near 0V, BMS has disconnected",
      "If voltage is reasonable (>10V for 3S): communication issue between battery and EC",
      "Try battery in another same-model laptop to isolate battery vs mainboard",
      "Some batteries with tripped BMS can be revived via direct cell charging (advanced)",
      "Usually: replace battery",
    ],
    tools: ["Multimeter", "Known-good battery", "Replacement battery"],
    difficulty: 3,
    keywords: ["stuck at 0%", "won't charge", "battery 0%", "over-discharged", "dead battery"],
  },

  // ═══════════════════════════════════════════════
  // BOOT — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-boot-003",
    name: "Laptop beeps on startup — diagnostic beep codes",
    category: "boot",
    symptoms: [
      "Repetitive beeping pattern at power-on",
      "No display output — just beeps",
      "Pattern: short and long beeps in specific sequence",
    ],
    causes: [
      { cause: "RAM failure or not detected (most common beep pattern)", probability: "high" },
      { cause: "GPU failure (specific beep patterns per BIOS vendor)", probability: "medium" },
      { cause: "CPU error", probability: "low" },
    ],
    diagnosticSteps: [
      "Count beep pattern: e.g., 1 long 3 short = GPU (AMI), 3 beeps = RAM (Award)",
      "Look up beep code for specific BIOS vendor (AMI, Phoenix, Insyde)",
      "For RAM beeps: remove all RAM, reseat one stick at a time",
      "For GPU beeps: if discrete GPU, may need reflow or replacement",
      "Record exact beep pattern (long vs short, count, pauses) for accurate lookup",
    ],
    tools: ["Known-good RAM", "biospy post-codes command for beep code lookup"],
    difficulty: 2,
    keywords: ["beep codes", "beeping", "startup beeps", "bios beep", "diagnostic beep"],
  },
  {
    id: "lpt-boot-004",
    name: "Blue screen (BSOD) during boot or shortly after login",
    category: "boot",
    symptoms: [
      "BSOD with stop code during Windows boot",
      "BSOD occurs in same place every boot",
      "Safe mode may or may not work",
    ],
    causes: [
      { cause: "Driver incompatibility or corruption", probability: "high" },
      { cause: "Failing storage drive causing read errors", probability: "medium" },
      { cause: "RAM failure causing data corruption", probability: "medium" },
      { cause: "Windows system file corruption", probability: "medium" },
    ],
    diagnosticSteps: [
      "Note exact BSOD stop code (e.g., IRQL_NOT_LESS_OR_EQUAL, PAGE_FAULT)",
      "Boot to Safe Mode — if stable, driver issue",
      "Run memtest86 — any errors indicate RAM failure",
      "Boot from Linux live USB — if stable, not hardware",
      "Run sfc /scannow and DISM from recovery command prompt",
      "Check storage SMART data for errors",
    ],
    tools: ["Memtest86 USB", "Linux live USB", "Windows recovery media"],
    difficulty: 2,
    keywords: ["bsod", "blue screen", "stop error", "crash on boot", "windows crash"],
  },
  {
    id: "lpt-boot-005",
    name: "Laptop boots to black screen with cursor only",
    category: "boot",
    symptoms: [
      "Windows logo shown, then black screen with movable cursor",
      "Ctrl+Alt+Del may or may not respond",
      "Screen stays black indefinitely",
    ],
    causes: [
      { cause: "Windows Explorer shell failed to load", probability: "high" },
      { cause: "GPU driver crash during desktop initialization", probability: "high" },
      { cause: "Corrupted user profile", probability: "medium" },
      { cause: "Malware replacing shell or startup process", probability: "medium" },
    ],
    diagnosticSteps: [
      "Ctrl+Shift+Esc to open Task Manager — if it opens, File > Run > explorer.exe",
      "Boot to Safe Mode and update/reinstall GPU driver",
      "Create new user profile to rule out profile corruption",
      "If recent Windows update: rollback via recovery options",
      "Run malware scan from Safe Mode",
    ],
    tools: ["Windows recovery media", "Safe Mode", "Malware scanner"],
    difficulty: 2,
    keywords: ["black screen cursor", "no desktop", "explorer crash", "cursor only", "shell failure"],
  },
  {
    id: "lpt-boot-006",
    name: "UEFI Secure Boot violation — won't boot OS",
    category: "boot",
    symptoms: [
      "Security boot fail or Secure Boot violation message",
      "OS installer won't boot from USB",
      "Can't boot Linux dual-boot after Windows update",
    ],
    causes: [
      { cause: "Secure Boot keys don't match OS bootloader signature", probability: "high" },
      { cause: "Boot mode mismatch: UEFI OS on Legacy-mode BIOS or vice versa", probability: "high" },
      { cause: "Windows update revoked old Secure Boot keys (shim/GRUB affected)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Enter BIOS and check Secure Boot status",
      "Disable Secure Boot temporarily to test if OS boots",
      "Check boot mode: UEFI vs Legacy (CSM) — must match how OS was installed",
      "For Linux: update shim and GRUB bootloader, re-enroll keys",
      "Reset Secure Boot keys to defaults in BIOS if custom keys were loaded",
    ],
    tools: ["BIOS/UEFI settings"],
    difficulty: 2,
    keywords: ["secure boot", "boot violation", "uefi boot fail", "can't boot linux", "secure boot error"],
  },
  {
    id: "lpt-boot-007",
    name: "Stuck at manufacturer logo — no progress",
    category: "boot",
    symptoms: [
      "Laptop shows brand logo but never progresses",
      "No loading spinner or progress dots",
      "Not a boot loop — just frozen at logo",
    ],
    causes: [
      { cause: "USB device causing boot hang (bad USB firmware or device)", probability: "high" },
      { cause: "Storage device controller hang during enumeration", probability: "medium" },
      { cause: "BIOS attempting to boot from non-bootable device", probability: "medium" },
      { cause: "BIOS/UEFI firmware partially corrupted", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disconnect ALL USB devices and try again",
      "If progresses without USB devices: reconnect one at a time to find culprit",
      "Try entering BIOS (F2/Del) — if BIOS accessible, hardware is OK",
      "Change boot order in BIOS to skip network/USB boot",
      "Clear CMOS to reset BIOS to defaults",
      "If stuck even in BIOS: firmware may be corrupted — try BIOS recovery mode",
    ],
    tools: ["BIOS access (F2/Del/Esc key)"],
    difficulty: 2,
    keywords: ["stuck at logo", "frozen boot", "logo hang", "no progress", "boot hang"],
  },

  // ═══════════════════════════════════════════════
  // THERMAL — additional patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-therm-003",
    name: "Fan runs at full speed immediately on power-on",
    category: "thermal",
    symptoms: [
      "Fan at 100% from the moment laptop turns on",
      "Never slows down regardless of workload",
      "Temperature readings may be normal or absent",
    ],
    causes: [
      { cause: "Thermal sensor disconnected or failed — EC defaults to max fan for safety", probability: "high" },
      { cause: "EC firmware bug after BIOS update", probability: "medium" },
      { cause: "Thermal paste dried completely — sensor reading very high from idle", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check CPU temperature reading — if showing -1, 0, or 255: sensor issue",
      "If temp is genuinely high at idle (>80C): thermal paste needs replacement",
      "Try EC reset: remove battery/AC, hold power 30 seconds",
      "If started after BIOS update: try rolling back to previous BIOS version",
      "Check thermal sensor cable connection on mainboard",
    ],
    tools: ["HWiNFO / lm-sensors", "Thermal paste", "Laptop disassembly tools"],
    difficulty: 3,
    keywords: ["fan full speed", "fan 100%", "fan always on", "max fan", "fan won't slow"],
  },
  {
    id: "lpt-therm-004",
    name: "Laptop extremely hot but fan not spinning",
    category: "thermal",
    symptoms: [
      "Case very hot to touch",
      "No fan noise at all",
      "Laptop throttles severely or shuts down",
    ],
    causes: [
      { cause: "Fan motor failed — bearing seized or winding open", probability: "high" },
      { cause: "Fan power cable disconnected from mainboard", probability: "medium" },
      { cause: "Fan controller MOSFET failed on mainboard", probability: "low" },
    ],
    diagnosticSteps: [
      "Open laptop and check if fan spins when powered (observe at POST)",
      "Check fan cable connection to mainboard FAN header",
      "Spin fan by hand — should rotate freely",
      "Measure fan voltage at header with multimeter (should see 3.3-5V or PWM signal)",
      "If cable OK and power present but fan dead: replace fan",
    ],
    tools: ["Laptop disassembly tools", "Multimeter", "Replacement fan"],
    difficulty: 2,
    keywords: ["hot no fan", "fan dead hot", "thermal no fan", "overheating silent"],
  },
  {
    id: "lpt-therm-005",
    name: "Laptop thermal throttles despite recent repaste",
    category: "thermal",
    symptoms: [
      "Performance drops under load even after fresh thermal paste",
      "Temperatures still hit throttle limit",
      "Throttling starts within minutes of load",
    ],
    causes: [
      { cause: "Heatsink not making proper contact — uneven mounting pressure", probability: "high" },
      { cause: "Heatsink fins still clogged with dust (repasted but didn't clean)", probability: "high" },
      { cause: "VRM or other components overheating (not just CPU/GPU)", probability: "medium" },
      { cause: "Thermal pads on VRM/VRAM missing or wrong thickness", probability: "medium" },
      { cause: "Power limit set too high in BIOS/throttlestop causing excess heat", probability: "low" },
    ],
    diagnosticSteps: [
      "Verify heatsink screws are tightened in correct order (X-pattern) and evenly",
      "Remove heatsink and check paste spread pattern — should be even with full coverage",
      "Clean heatsink fins thoroughly — compressed air from exhaust side",
      "Check VRM thermal pads — must be correct thickness to contact heatsink",
      "Monitor VRM temperature with HWiNFO (if sensor available)",
      "Try undervolting CPU/GPU to reduce heat (ThrottleStop or BIOS)",
    ],
    tools: ["Thermal paste", "Thermal pads (various thickness)", "Compressed air", "HWiNFO"],
    difficulty: 3,
    keywords: ["still hot after repaste", "throttle after repaste", "heatsink contact", "vrm overheating"],
  },

  // ═══════════════════════════════════════════════
  // POWER — more patterns
  // ═══════════════════════════════════════════════

  {
    id: "lpt-pwr-008",
    name: "Laptop won't power on without battery (AC only fails)",
    category: "power",
    symptoms: [
      "Runs fine on battery",
      "No power when on AC adapter alone (battery removed)",
      "Charges battery fine but can't run without it",
    ],
    causes: [
      { cause: "Charger IC requires battery for power path bootstrapping", probability: "high" },
      { cause: "Charger output voltage too low without battery to stabilize rail", probability: "medium" },
      { cause: "EC firmware requires battery presence to enable power sequence", probability: "medium" },
    ],
    diagnosticSteps: [
      "Some laptops by design require battery present to power on (common on ultrabooks)",
      "Check manufacturer documentation for AC-only operation support",
      "Try with a partially charged battery connected",
      "If battery is completely dead: charge it externally or try a new battery",
    ],
    tools: ["Known-good battery", "Manufacturer documentation"],
    difficulty: 1,
    keywords: ["no power ac only", "needs battery", "won't start without battery", "ac only dead"],
  },
  {
    id: "lpt-pwr-009",
    name: "Power button LED on but laptop appears dead",
    category: "power",
    symptoms: [
      "Power LED lit (solid or blinking)",
      "No fan, no display, no disk activity",
      "External monitor shows nothing",
    ],
    causes: [
      { cause: "EC powered but not starting power-on sequence — EC hang", probability: "high" },
      { cause: "Standby voltage present but main power rails not being triggered", probability: "medium" },
      { cause: "CPU or RAM preventing POST completion", probability: "medium" },
    ],
    diagnosticSteps: [
      "EC reset: hold power button 30-60 seconds, disconnect all power, wait 30 seconds",
      "Remove all RAM and attempt power on — should get beep codes if EC/CPU alive",
      "Check for LED blink patterns — many brands use blink codes for diagnostics",
      "Measure main power rails: 3.3V, 5V, VCORE — if standby present but main rails dead, VRM issue",
      "Try BIOS recovery key combo for your brand",
    ],
    tools: ["Multimeter", "Known-good RAM"],
    difficulty: 3,
    keywords: ["led on no boot", "power led but dead", "ec hang", "standby only", "no fan no screen"],
  },

  // ═══════════════════════════════════════════════
  // DISPLAY — additional
  // ═══════════════════════════════════════════════

  {
    id: "lpt-disp-008",
    name: "Touchscreen not responding to touch",
    category: "display",
    symptoms: [
      "Display works normally but touch input ignored",
      "Touch was working previously",
      "Pen/stylus may or may not work",
    ],
    causes: [
      { cause: "Touch digitizer cable loose or disconnected", probability: "high" },
      { cause: "Touch driver not loaded or disabled", probability: "high" },
      { cause: "Screen protector or case interfering with touch sensor", probability: "medium" },
      { cause: "Digitizer flex cable damaged at hinge", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check Device Manager for HID-compliant touch screen (may be disabled)",
      "Enable touch screen device if disabled in Device Manager",
      "Remove screen protector and test",
      "Reseat digitizer cable connection on mainboard",
      "Test in BIOS/UEFI if touch is supported there (some models)",
    ],
    tools: ["Laptop disassembly tools"],
    difficulty: 2,
    keywords: ["touch not working", "touchscreen dead", "digitizer", "no touch input", "touch unresponsive"],
  },

  // ═══════════════════════════════════════════════
  // BOOT — additional
  // ═══════════════════════════════════════════════

  {
    id: "lpt-boot-008",
    name: "Laptop powers on but immediately powers off (no fan spin)",
    category: "boot",
    symptoms: [
      "Power LED flashes for less than 1 second",
      "No fan spin at all",
      "May hear faint relay click then nothing",
    ],
    causes: [
      { cause: "Critical short circuit triggering instant overcurrent protection", probability: "high" },
      { cause: "EC detecting fault condition and aborting power sequence", probability: "medium" },
      { cause: "Insufficient input power — charger or battery can't supply initial surge", probability: "medium" },
    ],
    diagnosticSteps: [
      "Disconnect battery and try AC only (and vice versa)",
      "Measure input current from charger at plug moment — high current spike = short",
      "Remove all removable components (RAM, SSD, WiFi) and test with bare minimum",
      "If powers on with components removed: add back one at a time to isolate",
      "Measure resistance on main power rails — abnormally low = short on that rail",
    ],
    tools: ["Multimeter", "Clamp meter or USB power meter"],
    difficulty: 4,
    keywords: ["instant off", "immediate shutdown", "sub-second", "overcurrent", "power flash"],
  },

  // ═══════════════════════════════════════════════
  // STORAGE — additional
  // ═══════════════════════════════════════════════

  {
    id: "lpt-stor-007",
    name: "OS not found / no bootable device after drive clone",
    category: "storage",
    symptoms: [
      "Laptop shows 'No bootable device' after cloning to new drive",
      "Clone completed successfully but won't boot",
      "BIOS sees new drive but can't boot from it",
    ],
    causes: [
      { cause: "Boot mode mismatch: source was MBR/Legacy but BIOS is set to UEFI (or vice versa)", probability: "high" },
      { cause: "EFI system partition not cloned or not marked active", probability: "high" },
      { cause: "Clone to different size drive — partition table not updated", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check BIOS boot mode (UEFI vs Legacy/CSM) matches source drive partition style",
      "Verify EFI system partition exists and is flagged as ESP",
      "Try boot repair: Windows Recovery > bootrec /fixboot /fixmbr",
      "For UEFI: rebuild BCD store from recovery command prompt",
      "Ensure partition is marked active (MBR) or ESP GUID is correct (GPT)",
    ],
    tools: ["Windows recovery USB", "Disk partition tool (diskpart/gdisk)"],
    difficulty: 2,
    keywords: ["no bootable device", "clone won't boot", "boot after clone", "os not found", "efi missing"],
  },

  // ═══════════════════════════════════════════════
  // Additional patterns to reach 65+
  // ═══════════════════════════════════════════════

  {
    id: "lpt-net-007",
    name: "Bluetooth pairs but no audio to BT headphones",
    category: "network",
    symptoms: [
      "Bluetooth headphones pair successfully",
      "Audio plays through speakers instead of headphones",
      "Headphones show connected but no sound",
    ],
    causes: [
      { cause: "Bluetooth audio profile not selected (A2DP not activated)", probability: "high" },
      { cause: "Audio output device not switched to Bluetooth in OS", probability: "high" },
      { cause: "Bluetooth audio service disabled or crashed", probability: "medium" },
      { cause: "Headphones connected as hands-free (HSP) instead of media (A2DP)", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check audio output settings — select Bluetooth device as default output",
      "If showing as 'Hands-Free': disconnect, remove device, re-pair",
      "Restart Bluetooth service (services.msc on Windows)",
      "Ensure headphones are in pairing mode and not connected to another device",
    ],
    tools: ["OS audio settings", "Bluetooth settings"],
    difficulty: 1,
    keywords: ["bluetooth audio", "bt headphones", "no bluetooth sound", "bluetooth no audio"],
  },
  {
    id: "lpt-audio-005",
    name: "Audio works through one speaker only",
    category: "audio",
    symptoms: [
      "Sound only from left or right speaker",
      "Balance slider doesn't fix it",
      "Both speakers worked before",
    ],
    causes: [
      { cause: "Speaker cable disconnected on one side", probability: "high" },
      { cause: "One speaker driver blown (physical damage to cone/coil)", probability: "medium" },
      { cause: "Audio codec channel output failure", probability: "low" },
    ],
    diagnosticSteps: [
      "Test with headphones — if both channels work in headphones, speaker hardware issue",
      "Open laptop and check speaker cable connections (left and right may be separate)",
      "Test each speaker by swapping connectors (if possible) to isolate dead speaker vs dead channel",
      "Replace failed speaker — usually inexpensive laptop-specific part",
    ],
    tools: ["Headphones", "Laptop disassembly tools", "Replacement speaker"],
    difficulty: 2,
    keywords: ["one speaker", "mono audio", "left speaker", "right speaker", "unbalanced audio"],
  },
  {
    id: "lpt-kb-006",
    name: "Laptop keyboard types wrong layout (e.g., US vs UK vs EU)",
    category: "keyboard",
    symptoms: [
      "Some keys produce wrong symbols",
      "@ and \" swapped, or other symbol mismatches",
      "Physical key labels don't match output",
    ],
    causes: [
      { cause: "OS keyboard layout set to wrong region", probability: "high" },
      { cause: "Replacement keyboard was wrong regional variant", probability: "medium" },
      { cause: "BIOS keyboard setting overriding OS layout", probability: "low" },
    ],
    diagnosticSteps: [
      "Check OS keyboard layout settings — change to match physical keyboard (e.g., US, UK, DE)",
      "If replacement keyboard: verify FRU/part number matches original regional variant",
      "Remove extra keyboard layouts from OS language settings",
      "Some ThinkPads: check BIOS for keyboard layout setting",
    ],
    tools: ["OS keyboard settings"],
    difficulty: 1,
    keywords: ["wrong layout", "keyboard layout", "symbols wrong", "@ key wrong", "regional keyboard"],
  },
];

export function searchLaptopFailurePatterns(query: string): LaptopFailurePattern[] {
  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>();

  for (const word of words) {
    expandedTerms.add(word);
    for (const [, synonyms] of Object.entries(LAPTOP_SYNONYMS)) {
      if (synonyms.some((s) => s.includes(word) || word.includes(s))) {
        for (const syn of synonyms) {
          expandedTerms.add(syn);
        }
      }
    }
  }

  const scored: Array<{ pattern: LaptopFailurePattern; score: number }> = [];

  for (const pattern of LAPTOP_FAILURE_PATTERNS) {
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

export function getLaptopPatternsByCategory(category: string): LaptopFailurePattern[] {
  const cat = category.toLowerCase() as LaptopFailureCategory;
  return LAPTOP_FAILURE_PATTERNS.filter((p) => p.category === cat);
}
