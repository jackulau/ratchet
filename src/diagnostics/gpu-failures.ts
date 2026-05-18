export type GpuFailureCategory =
  | "artifacts"
  | "no-display"
  | "fan"
  | "crash"
  | "memory"
  | "power"
  | "thermal"
  | "driver";

export interface GpuFailureCause {
  cause: string;
  probability: "high" | "medium" | "low";
}

export interface GpuFailurePattern {
  id: string;
  name: string;
  category: GpuFailureCategory;
  symptoms: string[];
  causes: GpuFailureCause[];
  diagnosticSteps: string[];
  tools: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

const GPU_SYNONYMS: Record<string, string[]> = {
  artifacts: ["artifacts", "corruption", "glitch", "snow", "static", "dots", "lines", "garbled", "distorted"],
  "no-display": ["no display", "blank", "black screen", "no output", "no signal", "no video", "no image"],
  fan: ["fan", "fans", "spinning", "noise", "rpm", "bearing", "whine"],
  crash: ["crash", "freeze", "hang", "tdr", "timeout", "bsod", "black screen crash", "lockup"],
  memory: ["memory", "vram", "gddr", "hbm", "ram", "ecc"],
  power: ["power", "vrm", "mosfet", "voltage", "pcie power", "12v", "draw"],
  thermal: ["thermal", "hot", "heat", "temperature", "throttle", "overheat", "thermal paste"],
  driver: ["driver", "nvidia driver", "amd driver", "ddu", "update", "rollback"],
};

export const GPU_FAILURE_PATTERNS: GpuFailurePattern[] = [
  // ═══ ARTIFACTS ═══
  {
    id: "gpu-art-001",
    name: "Screen-wide colored dots/snow at all times",
    category: "artifacts",
    symptoms: ["Random colored dots across entire screen", "Present from POST/BIOS screen", "Dots don't change with GPU load", "Same artifacts on all outputs"],
    causes: [
      { cause: "VRAM chip failure — stuck/flipped bits in framebuffer", probability: "high" },
      { cause: "VRAM solder joint failure (BGA)", probability: "medium" },
      { cause: "VRAM voltage rail degraded (MVDD too low)", probability: "low" },
    ],
    diagnosticSteps: ["Check if artifacts present in BIOS — if yes, hardware issue (not driver)", "Test each display output — if all show same artifacts, GPU/VRAM fault", "Run VRAM test (OCCT GPU memory test or mods) to identify failing chip", "Check VRAM temperatures — overheating VRAM causes artifacts"],
    tools: ["OCCT / GPU memory test", "Thermal camera", "External monitor"],
    difficulty: 4,
    keywords: ["colored dots", "snow", "static", "vram failure", "pixel corruption"],
  },
  {
    id: "gpu-art-002",
    name: "Texture corruption — missing or garbled textures in 3D",
    category: "artifacts",
    symptoms: ["Textures appear stretched, missing, or replaced with garbage", "Geometric shapes intact but textures wrong", "Worse in specific games or 3D applications", "May only appear after GPU warms up"],
    causes: [
      { cause: "VRAM degradation — intermittent bit errors in texture memory", probability: "high" },
      { cause: "GPU driver bug or shader compiler issue", probability: "medium" },
      { cause: "GPU core clock instability — texture fetch errors", probability: "medium" },
    ],
    diagnosticSteps: ["Test with DDU + clean driver install to rule out driver issue", "Run GPU memory test to check VRAM integrity", "Try reducing memory clock by 100-200MHz — if fixed, VRAM degrading", "Check if temp-dependent — if appears after warmup, thermal VRAM issue"],
    tools: ["DDU (Display Driver Uninstaller)", "OCCT GPU memory test", "MSI Afterburner (clock adjustment)"],
    difficulty: 3,
    keywords: ["texture corruption", "garbled textures", "missing textures", "texture glitch"],
  },
  {
    id: "gpu-art-003",
    name: "Horizontal or vertical line artifacts during 3D rendering",
    category: "artifacts",
    symptoms: ["Lines appear during gaming or GPU-accelerated tasks", "Lines may flash or move", "Not present at desktop idle", "Disappear when GPU load drops"],
    causes: [
      { cause: "GPU core clock too high — computation errors at high frequency", probability: "high" },
      { cause: "VRM ripple causing core voltage instability under load", probability: "medium" },
      { cause: "GPU die degradation — transistors failing at high clock", probability: "medium" },
    ],
    diagnosticSteps: ["Reduce GPU core clock by 50-100MHz — if fixed, clock instability", "Check VRM thermals with thermal camera during artifact", "Increase GPU core voltage slightly (+25mV) to test if stable", "If no overclock applied and still artifacts: GPU die or VRM degradation"],
    tools: ["MSI Afterburner", "Thermal camera", "3DMark for reproducible test"],
    difficulty: 3,
    keywords: ["line artifacts", "rendering artifacts", "3d artifacts", "geometry lines"],
  },
  {
    id: "gpu-art-004",
    name: "Screen goes pink/green/single color randomly",
    category: "artifacts",
    symptoms: ["Entire screen turns one color (often green or pink)", "May recover after a few seconds or require reboot", "Happens at random — not load-dependent"],
    causes: [
      { cause: "Display cable or connection issue (DP/HDMI)", probability: "high" },
      { cause: "GPU output driver failure for specific color channel", probability: "medium" },
      { cause: "VRAM corruption in display output buffer", probability: "medium" },
    ],
    diagnosticSteps: ["Try different display cable and port first", "Test different display output (HDMI vs DP vs DVI)", "If same artifact on all outputs: GPU hardware issue", "Check GPU event log for errors during color event"],
    tools: ["Known-good display cables", "External monitor", "GPU-Z event log"],
    difficulty: 2,
    keywords: ["green screen", "pink screen", "color screen", "display color"],
  },
  {
    id: "gpu-art-005",
    name: "Flickering or flashing blocks during video playback",
    category: "artifacts",
    symptoms: ["Block artifacts during hardware-decoded video", "Only during video playback, not 3D rendering", "May affect specific codecs (H.264, HEVC, AV1)"],
    causes: [
      { cause: "Hardware video decoder block on GPU partially failed", probability: "medium" },
      { cause: "Driver issue with hardware video decode acceleration", probability: "high" },
      { cause: "VRAM issue in decode buffer area", probability: "low" },
    ],
    diagnosticSteps: ["Disable hardware acceleration in video player", "Test with different video player (VLC, MPC-HC, browser)", "Try disabling GPU hardware decode in driver settings", "If software decode works fine: hardware decoder or driver issue"],
    tools: ["Multiple video players", "GPU driver settings"],
    difficulty: 2,
    keywords: ["video artifacts", "playback glitch", "decode error", "video corruption", "block artifacts"],
  },
  {
    id: "gpu-art-006",
    name: "Geometric distortion — stretched or misplaced polygons",
    category: "artifacts",
    symptoms: ["3D geometry stretched to infinity or displaced", "Triangles/polygons in wrong positions", "May affect all 3D or specific scenes"],
    causes: [
      { cause: "GPU core computation errors — shader/rasterizer unit failure", probability: "high" },
      { cause: "Overclocked GPU core beyond stability margin", probability: "medium" },
      { cause: "GPU die degradation from prolonged high-temperature operation", probability: "medium" },
    ],
    diagnosticSteps: ["Reduce GPU core clock to well below stock", "Geometric artifacts often indicate GPU die issue, not VRAM", "Test with FurMark or 3DMark — reproducible geometric errors = hardware", "Check GPU die thermal paste — poor contact causes hotspots that degrade die"],
    tools: ["FurMark", "3DMark", "MSI Afterburner", "Thermal paste"],
    difficulty: 4,
    keywords: ["geometry distortion", "stretched polygons", "polygon glitch", "vertex error"],
  },

  // ═══ NO DISPLAY ═══
  {
    id: "gpu-nd-001",
    name: "GPU fans spin but no display output at all",
    category: "no-display",
    symptoms: ["Fans spin at boot", "No display on any output", "System may boot to OS (keyboard/HDD activity)", "Monitor says 'No Signal'"],
    causes: [
      { cause: "GPU BIOS/VBIOS corrupt — can't initialize display", probability: "high" },
      { cause: "GPU die failure — no POST", probability: "medium" },
      { cause: "PCIe bus communication failure", probability: "medium" },
      { cause: "Auxiliary VRM failure (PLL/1.8V rail) preventing initialization", probability: "medium" },
    ],
    diagnosticSteps: ["Try iGPU output if available (remove GPU, use motherboard video)", "Check if system beeps or shows error with GPU installed", "Reseat GPU in PCIe slot — clean gold contacts with eraser", "Try GPU in another system/slot to isolate", "Check auxiliary VRM rails with multimeter (1.8V, 0.9V PLL)"],
    tools: ["Multimeter", "Another system for testing", "Pencil eraser for contacts"],
    difficulty: 3,
    keywords: ["no signal", "no display gpu", "fans spin no video", "gpu no output"],
  },
  {
    id: "gpu-nd-002",
    name: "Display works in BIOS but goes black when OS loads driver",
    category: "no-display",
    symptoms: ["BIOS/UEFI screen visible", "OS boot logo visible", "Screen goes black when display driver initializes", "Safe mode works fine"],
    causes: [
      { cause: "Display driver crash during initialization", probability: "high" },
      { cause: "GPU partially functional — works in basic mode but fails at full clock", probability: "medium" },
      { cause: "Resolution/refresh rate not supported by monitor (driver sets wrong mode)", probability: "medium" },
    ],
    diagnosticSteps: ["Boot to Safe Mode — if display works, driver issue", "DDU in safe mode, then clean install driver", "Try older driver version — may be compatibility issue", "If no driver works: GPU hardware partially failed (works in VESA mode only)"],
    tools: ["DDU (Display Driver Uninstaller)", "Safe Mode boot"],
    difficulty: 2,
    keywords: ["black screen driver", "no display after boot", "safe mode works", "driver black screen"],
  },
  {
    id: "gpu-nd-003",
    name: "One display output dead — others work",
    category: "no-display",
    symptoms: ["Specific HDMI/DP/DVI port produces no output", "Other ports on same GPU work fine", "Known-good cable and monitor tested"],
    causes: [
      { cause: "Port physical damage — bent pins or cracked solder", probability: "high" },
      { cause: "Level shifter/retimer IC for that port failed", probability: "medium" },
      { cause: "ESD damage to specific port's protection circuit", probability: "medium" },
    ],
    diagnosticSteps: ["Inspect port with flashlight for bent pins or debris", "Test with known-good cable rated for that port's spec", "If DP: some ports are DP++ vs standard DP — check compatibility", "Port-specific IC failure requires board-level repair"],
    tools: ["Flashlight", "Known-good cables", "Another monitor"],
    difficulty: 3,
    keywords: ["dead port", "hdmi dead", "displayport dead", "one output broken"],
  },
  {
    id: "gpu-nd-004",
    name: "GPU not detected in system — not in Device Manager/lspci",
    category: "no-display",
    symptoms: ["GPU completely invisible to system", "Not in BIOS, Device Manager, or lspci", "PCIe slot works with other cards", "GPU fans may or may not spin"],
    causes: [
      { cause: "GPU PCIe interface failure — can't enumerate on bus", probability: "high" },
      { cause: "12V power not reaching GPU — fuse blown or connector issue", probability: "high" },
      { cause: "PCIe gold finger contact issue — dirty or oxidized", probability: "medium" },
      { cause: "BIOS setting disabling PCIe slot (bifurcation, slot disable)", probability: "low" },
    ],
    diagnosticSteps: ["Reseat GPU — clean gold contacts with pencil eraser", "Check PCIe power cables are fully seated", "Try different PCIe slot", "Check GPU input fuse with multimeter (continuity)", "Try in another system entirely"],
    tools: ["Pencil eraser", "Multimeter", "Known-good PCIe power cables"],
    difficulty: 3,
    keywords: ["gpu not detected", "invisible gpu", "not in device manager", "pcie not found"],
  },
  {
    id: "gpu-nd-005",
    name: "Display output flickers or drops signal intermittently",
    category: "no-display",
    symptoms: ["Screen goes black briefly then returns", "DP/HDMI signal drops for 1-3 seconds", "Worse at higher resolutions or refresh rates", "May trigger Windows 'display driver stopped responding'"],
    causes: [
      { cause: "Display cable not rated for bandwidth (4K 144Hz needs good DP 1.4 cable)", probability: "high" },
      { cause: "GPU display output circuit marginal at high bandwidth", probability: "medium" },
      { cause: "Monitor handshake issue (HDCP, EDID)", probability: "medium" },
    ],
    diagnosticSteps: ["Try certified high-bandwidth cable (VESA-certified DP, Premium HDMI)", "Lower resolution or refresh rate — if stable, bandwidth issue", "Disable HDR if enabled — reduces bandwidth headroom", "Check monitor firmware update availability"],
    tools: ["Certified display cable", "Another monitor for testing"],
    difficulty: 1,
    keywords: ["signal drop", "display flicker", "hdmi drop", "dp flicker", "intermittent display"],
  },

  // ═══ FAN ═══
  {
    id: "gpu-fan-001",
    name: "GPU fans not spinning at all",
    category: "fan",
    symptoms: ["Fans completely stationary", "GPU overheats and throttles or shuts down", "Fan connector is plugged in"],
    causes: [
      { cause: "Fan header cable disconnected (check after cleaning or disassembly)", probability: "high" },
      { cause: "0 RPM/silent mode active — fans don't spin below ~50°C by design", probability: "high" },
      { cause: "Fan motor bearing seized", probability: "medium" },
      { cause: "Fan controller circuit on GPU PCB failed", probability: "low" },
    ],
    diagnosticSteps: ["Check if card has 0 RPM mode — run a GPU load to raise temp above 50°C", "Check fan cable connector to GPU PCB — reseat it", "Spin fan by hand — should rotate freely", "Set manual fan curve to 100% via MSI Afterburner — if no spin, hardware fault"],
    tools: ["MSI Afterburner (fan control)", "FurMark (GPU load)"],
    difficulty: 1,
    keywords: ["fan not spinning", "gpu fan dead", "no fan", "fan stopped"],
  },
  {
    id: "gpu-fan-002",
    name: "GPU fan always at 100% from power-on",
    category: "fan",
    symptoms: ["Fan at maximum speed from the moment system powers on", "Never slows down regardless of temperature", "Very loud"],
    causes: [
      { cause: "VBIOS corruption — fan controller defaults to full speed as safety", probability: "high" },
      { cause: "GPU temperature sensor failed — reading very high or -1", probability: "medium" },
      { cause: "Fan control circuit on PCB failed to open (stuck full speed)", probability: "medium" },
    ],
    diagnosticSteps: ["Check GPU temperature in software — if shows -1 or 511°C, sensor failed", "Try reflashing VBIOS with correct version for card model", "If temp reads normally: fan control circuit may be failed", "Some cards: temp sensor is a thermistor near GPU die — check connection"],
    tools: ["GPU-Z (temperature monitoring)", "VBIOS flash tools (nvflash, amdvbflash)"],
    difficulty: 3,
    keywords: ["fan 100%", "fan full speed", "fan always on", "loud gpu fan", "fan max"],
  },
  {
    id: "gpu-fan-003",
    name: "GPU fan making grinding/clicking noise",
    category: "fan",
    symptoms: ["Grinding, clicking, or rattling from GPU fan", "Noise may be speed-dependent", "Fan still moves but sounds rough"],
    causes: [
      { cause: "Fan bearing worn out — sleeve bearing most common failure", probability: "high" },
      { cause: "Fan blade hitting shroud or cable", probability: "medium" },
      { cause: "Debris caught in fan blades", probability: "medium" },
    ],
    diagnosticSteps: ["Identify which fan is noisy (dual/triple fan cards)", "Check for cables or debris blocking fan blades", "Spin fan by hand — grinding = bearing failure", "Replacement fans available for most GPU models (check connector type)"],
    tools: ["Replacement fan (model-specific connector — 4-pin, 2-pin varies)", "Small screwdriver"],
    difficulty: 1,
    keywords: ["fan noise", "grinding", "clicking", "rattling", "bearing noise"],
  },

  // ═══ CRASH ═══
  {
    id: "gpu-crash-001",
    name: "Driver timeout (TDR) — display driver stopped responding",
    category: "crash",
    symptoms: ["Screen goes black then recovers with 'Display driver stopped responding' message", "More frequent under GPU load", "Event log shows 'Display driver nvlddmkm/amdkmdag stopped responding and has recovered'"],
    causes: [
      { cause: "Unstable GPU overclock (core or memory)", probability: "high" },
      { cause: "Driver bug — specific game/application triggers TDR", probability: "high" },
      { cause: "Power supply unable to deliver clean power under peak GPU draw", probability: "medium" },
      { cause: "GPU hardware degradation — TDR at stock clocks", probability: "medium" },
    ],
    diagnosticSteps: ["Reset all overclocks to stock (core, memory, voltage)", "DDU and clean install latest driver", "Try older driver version (check release notes for fixes)", "Monitor GPU clocks during crash — if downclock before crash, power issue", "Test PSU with known-good unit if crashes persist at stock"],
    tools: ["DDU", "MSI Afterburner (clock monitoring)", "HWiNFO (power monitoring)"],
    difficulty: 2,
    keywords: ["tdr", "driver timeout", "driver stopped responding", "nvlddmkm", "amdkmdag"],
  },
  {
    id: "gpu-crash-002",
    name: "System freeze requiring hard reboot under GPU load",
    category: "crash",
    symptoms: ["Complete system lock — no mouse, no keyboard", "Screen frozen or goes black", "Only resolved by power button hold", "Happens during gaming, rendering, or GPU compute"],
    causes: [
      { cause: "GPU power delivery failure causing PCIe bus hang", probability: "high" },
      { cause: "Overheating — GPU or VRM reaching thermal shutdown", probability: "medium" },
      { cause: "PSU overcurrent protection tripping momentarily", probability: "medium" },
      { cause: "GPU die hard fault — unrecoverable hardware error", probability: "medium" },
    ],
    diagnosticSteps: ["Monitor temps before crash (use HWiNFO logging)", "Check PSU wattage vs system power draw (GPU + CPU combined)", "Reduce GPU power limit to 80% via driver/Afterburner", "Test with different PSU to rule out power supply", "Stress test CPU alone, then GPU alone — identify which causes hang"],
    tools: ["HWiNFO (logging mode)", "PSU calculator", "MSI Afterburner (power limit)"],
    difficulty: 3,
    keywords: ["system freeze", "hard lock", "hard reboot", "gpu hang", "complete freeze"],
  },
  {
    id: "gpu-crash-003",
    name: "BSOD with VIDEO_TDR_FAILURE or VIDEO_SCHEDULER_INTERNAL_ERROR",
    category: "crash",
    symptoms: ["Blue screen with GPU-related stop code", "May happen during gaming, video playback, or even idle", "Specific stop codes: VIDEO_TDR_FAILURE, VIDEO_SCHEDULER_INTERNAL_ERROR, THREAD_STUCK_IN_DEVICE_DRIVER"],
    causes: [
      { cause: "GPU driver corruption or incompatibility", probability: "high" },
      { cause: "GPU hardware fault causing unrecoverable error", probability: "medium" },
      { cause: "VRAM failure triggering kernel-mode driver crash", probability: "medium" },
      { cause: "PCIe bus error from poor slot contact", probability: "low" },
    ],
    diagnosticSteps: ["DDU in safe mode, clean install driver", "Check Windows Event Viewer for preceding errors before BSOD", "Run GPU memory test — VRAM errors can cause kernel crashes", "Reseat GPU and check PCIe contacts", "Try GPU in different PCIe slot"],
    tools: ["DDU", "OCCT GPU memory test", "WhoCrashed (minidump analyzer)"],
    difficulty: 2,
    keywords: ["bsod gpu", "video tdr failure", "video scheduler", "blue screen gpu"],
  },
  {
    id: "gpu-crash-004",
    name: "Application crashes with GPU error but system stays up",
    category: "crash",
    symptoms: ["Game or application crashes to desktop", "Error mentions GPU, DirectX, Vulkan, or OpenGL", "System continues running — not a full crash", "Other applications unaffected"],
    causes: [
      { cause: "Application bug or engine issue with specific GPU/driver combo", probability: "high" },
      { cause: "Insufficient VRAM for application at current settings", probability: "medium" },
      { cause: "GPU overclock unstable for this specific workload", probability: "medium" },
    ],
    diagnosticSteps: ["Check application bug tracker for known GPU issues", "Lower graphics settings (especially VRAM-heavy: textures, resolution)", "Monitor VRAM usage — if hitting capacity, reduce settings", "Try different graphics API if available (DX11 vs DX12, Vulkan vs OpenGL)"],
    tools: ["GPU-Z (VRAM monitoring)", "Application bug tracker", "Driver settings"],
    difficulty: 1,
    keywords: ["app crash", "game crash", "directx error", "vulkan crash", "opengl error"],
  },

  // ═══ MEMORY ═══
  {
    id: "gpu-mem-001",
    name: "GPU memory errors detected in test/compute workload",
    category: "memory",
    symptoms: ["ECC errors reported (datacenter GPUs)", "OCCT GPU memory test finds errors", "Compute workloads produce incorrect results", "Errors increase with higher memory clock"],
    causes: [
      { cause: "VRAM chip cell degradation — worn from heavy use (mining, compute)", probability: "high" },
      { cause: "Memory clock overclock exceeding chip stability", probability: "high" },
      { cause: "VRAM thermal issue — errors appear at temperature", probability: "medium" },
      { cause: "Memory voltage (MVDD) slightly low — marginal operation", probability: "low" },
    ],
    diagnosticSteps: ["Run OCCT GPU memory test — note which memory regions fail", "Reduce memory clock 100-200MHz and retest", "Monitor VRAM temperature — if errors correlate with temp, thermal issue", "Replace VRAM thermal pads (often too thin from factory)", "If errors at stock clock: VRAM chip failure, needs replacement"],
    tools: ["OCCT GPU memory test", "HWiNFO (VRAM temp)", "Thermal pads"],
    difficulty: 3,
    keywords: ["vram errors", "memory test fail", "ecc errors", "gpu memory failure"],
  },
  {
    id: "gpu-mem-002",
    name: "GPU reports wrong VRAM capacity",
    category: "memory",
    symptoms: ["GPU-Z shows less VRAM than card should have", "e.g., 8GB card shows as 4GB or 6GB", "Performance affected in VRAM-heavy tasks"],
    causes: [
      { cause: "One or more VRAM chips completely dead — not responding to memory controller", probability: "high" },
      { cause: "VBIOS misconfigured for wrong memory map", probability: "medium" },
      { cause: "Memory controller partially failed on GPU die", probability: "low" },
    ],
    diagnosticSteps: ["Check GPU-Z for reported VRAM vs spec — confirm mismatch", "VRAM chips are in parallel — dead chip reduces total capacity proportionally", "Thermal camera: check if all VRAM chips warm up — cold chip = dead", "If dead chip identified: BGA rework to replace (advanced)", "Reflash correct VBIOS to rule out configuration issue"],
    tools: ["GPU-Z", "Thermal camera", "BGA rework station (for repair)"],
    difficulty: 4,
    keywords: ["wrong vram", "less memory", "vram capacity", "missing vram"],
  },
  {
    id: "gpu-mem-003",
    name: "Memory clock won't hold stock speed — downclock or crash",
    category: "memory",
    symptoms: ["GPU memory clock drops below stock during load", "Crashes when memory clock is at stock", "Stable at lower memory speeds"],
    causes: [
      { cause: "VRAM chip degradation — can't run at rated speed anymore", probability: "high" },
      { cause: "VRAM power rail (MVDD) drooping under load", probability: "medium" },
      { cause: "VRAM thermal throttling — temp sensor limiting clock", probability: "medium" },
    ],
    diagnosticSteps: ["Monitor memory clock and VRAM temp under load", "If clock drops with temp: improve VRAM cooling (better thermal pads)", "If clock drops without thermal cause: VRAM or MVDD rail degraded", "Try VBIOS with looser memory timings if available"],
    tools: ["HWiNFO (mem clock + temp monitoring)", "Thermal pads (1-2mm, thermal conductivity >6 W/mK)"],
    difficulty: 3,
    keywords: ["memory downclock", "mem clock drop", "memory instability", "vram throttle"],
  },

  // ═══ POWER ═══
  {
    id: "gpu-pwr-001",
    name: "GPU not detected after power surge or PSU failure",
    category: "power",
    symptoms: ["GPU was working, now dead after electrical event", "PSU failure, power outage, or lightning", "Other components may also be damaged"],
    causes: [
      { cause: "12V input fuse on GPU blown from surge", probability: "high" },
      { cause: "VRM MOSFET failed from overvoltage on 12V rail", probability: "high" },
      { cause: "PCIe interface ESD protection triggered permanently", probability: "medium" },
      { cause: "GPU die damaged from overvoltage propagation", probability: "medium" },
    ],
    diagnosticSteps: ["Check 12V input fuse on GPU PCB (near PCIe power connector)", "Measure resistance on 12V input — low = fuse intact, open = blown", "Check VRM output for shorts to ground", "If fuse intact: check VRM MOSFETs for shorts", "Visual inspection for burned/discolored components"],
    tools: ["Multimeter", "Visual inspection (magnification)"],
    difficulty: 4,
    keywords: ["power surge", "psu failure", "dead after outage", "gpu after surge"],
  },
  {
    id: "gpu-pwr-002",
    name: "PCIe power connector issues — card not getting enough power",
    category: "power",
    symptoms: ["GPU crashes under load but works at idle", "Nvidia: 'GPU has fallen off the bus' in Event Viewer", "AMD: black screen under load", "PSU power cables are modular and may be mixed"],
    causes: [
      { cause: "Wrong PSU cables used (NEVER mix modular cables between PSU brands)", probability: "high" },
      { cause: "PCIe power cable damaged or loose at GPU end", probability: "high" },
      { cause: "Using daisy-chain PCIe cable instead of two separate cables", probability: "medium" },
      { cause: "PSU 12V rail overloaded by GPU + other components", probability: "medium" },
    ],
    diagnosticSteps: ["VERIFY modular cables match PSU brand and model — wrong cables can kill GPU", "Use separate PCIe cables from PSU (not daisy-chain) for high-power GPUs", "Reseat all power connections at both PSU and GPU ends", "Measure 12V at GPU connector under load with multimeter", "If 12V drops below 11.4V under load: PSU can't deliver enough"],
    tools: ["Multimeter", "Correct PSU cables", "Known-good PSU for testing"],
    difficulty: 2,
    keywords: ["pcie power", "power cable", "daisy chain", "modular cable", "12v rail"],
  },
  {
    id: "gpu-pwr-003",
    name: "GPU VRM failure — burning smell or visible damage",
    category: "power",
    symptoms: ["Burning smell from GPU area", "Visible burn marks on PCB", "GPU suddenly stopped working", "MOSFET or inductor physically damaged"],
    causes: [
      { cause: "MOSFET failure — short circuit causing thermal runaway", probability: "high" },
      { cause: "Overcurrent from GPU die short", probability: "medium" },
      { cause: "Poor thermal design — VRM overheated and failed", probability: "medium" },
    ],
    diagnosticSteps: ["DO NOT power on if burning smell — risk of further damage", "Visual inspection: identify burned component", "Check VRM output for short to ground", "If MOSFET blown: may be replaceable if GPU die is OK", "Check GPU die for secondary damage from VRM failure"],
    tools: ["Multimeter", "Thermal camera", "BGA rework station", "Replacement MOSFETs"],
    difficulty: 5,
    keywords: ["vrm failure", "burning smell", "burned mosfet", "gpu vrm", "smoke"],
  },
  {
    id: "gpu-pwr-004",
    name: "GPU draws excessive power — PSU overload",
    category: "power",
    symptoms: ["System shuts down during heavy GPU load", "PSU fan screams at full speed", "Tripping breaker or UPS", "HWiNFO shows power draw exceeding card rating"],
    causes: [
      { cause: "VBIOS power limit set too high (after mod or overclock)", probability: "high" },
      { cause: "PSU wattage insufficient for GPU + rest of system", probability: "high" },
      { cause: "GPU VRM fault — can't regulate, passes through uncontrolled", probability: "low" },
    ],
    diagnosticSteps: ["Check GPU power draw in HWiNFO — compare to TDP spec", "If overclocked: reset to stock settings", "Calculate total system power and verify PSU has 20% headroom", "Check if power limit was modded in VBIOS", "Test with higher-wattage PSU"],
    tools: ["HWiNFO", "PSU wattage calculator", "Kill-A-Watt meter"],
    difficulty: 2,
    keywords: ["excessive power", "psu overload", "high power draw", "system shutdown"],
  },

  // ═══ THERMAL ═══
  {
    id: "gpu-therm-001",
    name: "GPU throttling — temperature hits limit under load",
    category: "thermal",
    symptoms: ["GPU clock drops under sustained load", "Temperature reaches 83-90°C+ depending on GPU", "Performance degrades over time during gaming session"],
    causes: [
      { cause: "Dried thermal paste between GPU die and heatsink", probability: "high" },
      { cause: "Heatsink fins clogged with dust", probability: "high" },
      { cause: "Inadequate case airflow — GPU recycling hot air", probability: "medium" },
      { cause: "Factory thermal paste application poor (common on budget cards)", probability: "medium" },
    ],
    diagnosticSteps: ["Monitor GPU temp under load — if hitting throttle point, thermal issue", "Clean heatsink fins with compressed air", "Replace thermal paste on GPU die (use quality paste: Thermal Grizzly, Noctua NT-H1)", "Improve case airflow — ensure intake and exhaust fans working", "Consider undervolting GPU to reduce heat while maintaining performance"],
    tools: ["Thermal paste", "Compressed air", "HWiNFO (temp monitoring)"],
    difficulty: 2,
    keywords: ["gpu throttle", "gpu hot", "temperature limit", "thermal throttle"],
  },
  {
    id: "gpu-therm-002",
    name: "Hot spot temperature much higher than edge temperature",
    category: "thermal",
    symptoms: ["GPU die 'hot spot' temp 15-25°C higher than 'edge' temp", "Hot spot causes throttling even when edge temp seems OK", "Common on RTX 3000/4000 and RX 6000/7000 series"],
    causes: [
      { cause: "Heatsink mounting pressure uneven — poor contact at die center", probability: "high" },
      { cause: "Thermal paste insufficient — void in center of die", probability: "high" },
      { cause: "GPU die warped (concave or convex) — center doesn't contact heatsink", probability: "medium" },
    ],
    diagnosticSteps: ["Check hotspot vs edge temp in HWiNFO — delta should be <15°C ideally", "Repaste with liquid metal for best results (careful — conductive!)", "Check heatsink mounting screws for even tightness", "Use thicker thermal paste application for warped dies (covers gap)", "Consider thermal pad shim behind GPU die to increase mounting pressure"],
    tools: ["Thermal paste (or liquid metal for advanced users)", "Thermal pads (backplate shim)"],
    difficulty: 3,
    keywords: ["hotspot", "hot spot", "junction temperature", "die temperature", "uneven heat"],
  },
  {
    id: "gpu-therm-003",
    name: "VRAM overheating — memory junction temperature too high",
    category: "thermal",
    symptoms: ["VRAM/memory junction temp exceeds 100°C (GDDR6X especially)", "Performance drops when VRAM throttles", "Aftermarket cooler may not cover VRAM adequately"],
    causes: [
      { cause: "VRAM thermal pads too thin — not making contact with heatsink", probability: "high" },
      { cause: "Stock thermal pads degraded from heat cycling", probability: "high" },
      { cause: "Aftermarket heatsink doesn't contact VRAM (design gap)", probability: "medium" },
    ],
    diagnosticSteps: ["Monitor VRAM temp (HWiNFO — 'GPU Memory Junction Temperature')", "GDDR6X normal: 80-95°C. Above 100°C: pad replacement needed", "Replace thermal pads with high-quality (Gelid Ultimate, Thermalright Odyssey)", "Measure required thickness: 1.0mm, 1.5mm, 2.0mm, or 3.0mm depends on card", "After pad replacement: verify VRAM temp drops by 10-20°C"],
    tools: ["Thermal pads (correct thickness)", "HWiNFO", "Calipers (to measure pad thickness)"],
    difficulty: 2,
    keywords: ["vram hot", "memory temperature", "gddr6x thermal", "thermal pads"],
  },
  {
    id: "gpu-therm-004",
    name: "GPU cooler degraded — heat pipe dry or detached",
    category: "thermal",
    symptoms: ["GPU temps higher than when card was new", "Heatsink fins cool to touch despite GPU die being hot", "Thermal paste replacement didn't help"],
    causes: [
      { cause: "Heat pipe working fluid evaporated (manufacturing defect or age)", probability: "high" },
      { cause: "Heat pipe lost vacuum seal — oxidation visible at sealed end", probability: "medium" },
      { cause: "Heat pipe-to-base plate joint cracked — heat not transferring", probability: "medium" },
    ],
    diagnosticSteps: ["After repaste: if fins stay cool while die is hot, heat pipe isn't transferring", "Inspect heat pipe ends for discoloration or damage", "A working heat pipe should be warm along its entire length when die is hot", "Heat pipe repair is not practical — replacement cooler needed", "Consider aftermarket GPU cooler (Arctic Accelero, Raijintek Morpheus) or AIO liquid cooler"],
    tools: ["Aftermarket GPU cooler", "Thermal paste"],
    difficulty: 3,
    keywords: ["heat pipe", "cooler degraded", "fins cold", "heat pipe failure"],
  },
  {
    id: "gpu-therm-005",
    name: "VRM components overheating — MOSFET or inductor very hot",
    category: "thermal",
    symptoms: ["VRM area extremely hot (>100°C measured with thermal camera)", "GPU throttles but die temp seems OK", "May trigger overcurrent protection under load"],
    causes: [
      { cause: "VRM heatsink/thermal pad not making contact", probability: "high" },
      { cause: "Phase imbalance — one phase carrying too much current", probability: "medium" },
      { cause: "Undersized VRM for GPU power draw (budget card design)", probability: "medium" },
    ],
    diagnosticSteps: ["Thermal camera on VRM area during load — identify hottest component", "Check VRM thermal pad contact with heatsink", "Replace VRM thermal pads with correct thickness", "If one phase much hotter: that phase is carrying excess current (imbalance)", "Power limit reduction can reduce VRM stress"],
    tools: ["Thermal camera", "Thermal pads", "MSI Afterburner (power limit)"],
    difficulty: 3,
    keywords: ["vrm overheat", "mosfet hot", "inductor hot", "vrm thermal"],
  },

  // ═══ DRIVER ═══
  {
    id: "gpu-drv-001",
    name: "Performance regression after driver update",
    category: "driver",
    symptoms: ["FPS drops in games after updating GPU driver", "Previously smooth games now stutter", "Benchmark scores lower than before update"],
    causes: [
      { cause: "New driver has regression for specific GPU model or game", probability: "high" },
      { cause: "Driver reset custom settings during update", probability: "medium" },
      { cause: "New driver enables features that increase GPU load (RT, DLSS changes)", probability: "medium" },
    ],
    diagnosticSteps: ["DDU and install previous driver version that worked", "Check driver release notes for known issues with your GPU", "Verify NVIDIA Control Panel / AMD Radeon settings after update", "Disable any newly-enabled features (e.g., RT, DLSS, Radeon Anti-Lag)"],
    tools: ["DDU", "Previous driver installer", "GPU benchmark for comparison"],
    difficulty: 1,
    keywords: ["driver regression", "fps drop update", "performance loss", "driver downgrade"],
  },
  {
    id: "gpu-drv-002",
    name: "GPU driver fails to install — error during setup",
    category: "driver",
    symptoms: ["Driver installer fails with error code", "NVIDIA: 'NVIDIA Installer failed'", "AMD: 'Error 1603' or similar", "Incomplete driver installation"],
    causes: [
      { cause: "Old driver remnants conflicting — incomplete previous uninstall", probability: "high" },
      { cause: "Antivirus blocking driver components during install", probability: "medium" },
      { cause: "Windows Update installing conflicting generic driver simultaneously", probability: "medium" },
    ],
    diagnosticSteps: ["Boot to Safe Mode", "Run DDU to completely remove all GPU driver traces", "Disable antivirus temporarily during install", "Disable Windows Update temporarily (gpedit or services)", "Install driver from manufacturer website (not Windows Update)", "Reboot and re-enable antivirus and Windows Update"],
    tools: ["DDU", "Safe Mode", "Manufacturer driver download"],
    difficulty: 1,
    keywords: ["install failed", "driver error", "installer error", "can't install driver"],
  },
  {
    id: "gpu-drv-003",
    name: "GPU driver causes system instability on specific games only",
    category: "driver",
    symptoms: ["One or a few specific games crash or have artifacts", "Other games and benchmarks work fine", "Started after game or driver update"],
    causes: [
      { cause: "Driver shader compiler bug for specific game's shaders", probability: "high" },
      { cause: "Game uses GPU feature not properly supported by current driver", probability: "medium" },
      { cause: "Shader cache corruption", probability: "medium" },
    ],
    diagnosticSteps: ["Delete shader cache (NVIDIA: %LOCALAPPDATA%\\NVIDIA\\DXCache, AMD: %LOCALAPPDATA%\\AMD\\DxCache)", "Try both newer and older driver versions", "Check game forums for driver compatibility reports", "Disable shader pre-compilation if available in driver settings"],
    tools: ["File explorer (shader cache deletion)", "Driver installer"],
    difficulty: 1,
    keywords: ["specific game crash", "shader bug", "game crash driver", "shader cache"],
  },
  {
    id: "gpu-drv-004",
    name: "Black screen after GPU driver install — no display at all",
    category: "driver",
    symptoms: ["Screen goes black after driver installation and reboot", "Keyboard/mouse LEDs still on (system running)", "Can't get to Safe Mode easily"],
    causes: [
      { cause: "Driver installed incompatible with GPU model/revision", probability: "high" },
      { cause: "Multi-GPU setup conflicting (iGPU + dGPU)", probability: "medium" },
      { cause: "Monitor resolution/refresh set to unsupported mode by driver", probability: "medium" },
    ],
    diagnosticSteps: ["Boot to Safe Mode (hold Shift+click Restart if accessible, or interrupt boot 3 times)", "In Safe Mode: DDU to remove problematic driver", "Install known-working driver version", "If iGPU+dGPU: connect monitor to iGPU output to access Safe Mode", "Check BIOS: set primary display to iGPU if dGPU driver causes black screen"],
    tools: ["DDU", "Safe Mode", "iGPU display output"],
    difficulty: 2,
    keywords: ["black screen driver install", "no display after driver", "driver black screen"],
  },

  // ═══ ADDITIONAL PATTERNS ═══
  {
    id: "gpu-fan-004",
    name: "GPU fan speed stuck at fixed RPM — won't change",
    category: "fan",
    symptoms: ["Fan runs at fixed speed regardless of temperature", "Fan curve software has no effect", "Fan was adjustable before"],
    causes: [
      { cause: "VBIOS fan profile corrupted or flashed with wrong version", probability: "high" },
      { cause: "Fan PWM control circuit on PCB failed — stuck at one duty cycle", probability: "medium" },
      { cause: "Fan tach signal wire broken — controller can't read RPM so defaults to fixed speed", probability: "medium" },
    ],
    diagnosticSteps: ["Try MSI Afterburner manual fan control — if no response, hardware issue", "Reflash correct VBIOS for card model", "Check fan cable — 4-pin fans use PWM on pin 4, tach on pin 3", "If 3-pin fan: controlled by voltage, check if voltage changes with load"],
    tools: ["MSI Afterburner", "VBIOS flash tools", "Multimeter"],
    difficulty: 2,
    keywords: ["fan stuck", "fixed rpm", "fan won't change", "pwm broken"],
  },
  {
    id: "gpu-fan-005",
    name: "Coil whine under GPU load",
    category: "fan",
    symptoms: ["High-pitched electrical buzzing from GPU area", "Sound intensity varies with GPU load/FPS", "Loudest at extremely high FPS (uncapped menus)", "Not mechanical — not from fan"],
    causes: [
      { cause: "Inductor magnetostriction in VRM — normal but varies by unit", probability: "high" },
      { cause: "Ceramic capacitor piezoelectric effect", probability: "medium" },
    ],
    diagnosticSteps: ["Cap FPS to monitor refresh rate (V-Sync or frame limiter)", "Identify source: listen closely to inductors vs capacitors", "Apply hot glue or thermal pad to dampen vibrating inductor", "Some units are worse than others — manufacturing variation"],
    tools: ["V-Sync or frame limiter", "Thermal pad (dampening)"],
    difficulty: 1,
    keywords: ["coil whine", "buzzing", "electrical noise", "inductor noise", "gpu whine"],
  },
  {
    id: "gpu-mem-004",
    name: "VRAM artifacts only at high temperature",
    category: "memory",
    symptoms: ["Clean image at idle/light load", "Artifacts appear after 5-15 minutes of heavy load", "Artifacts worsen as VRAM temp climbs", "Artifacts disappear if GPU cools down"],
    causes: [
      { cause: "VRAM chip marginal — fails at elevated temperature", probability: "high" },
      { cause: "VRAM thermal pad not making contact — chip exceeds spec temp", probability: "high" },
      { cause: "VRAM solder joint intermittent at temp (BGA expansion)", probability: "medium" },
    ],
    diagnosticSteps: ["Monitor VRAM junction temperature during artifact appearance", "Replace VRAM thermal pads with correct thickness and good thermal conductivity (>8 W/mK)", "If still fails after pad replacement: VRAM chip degraded", "Reduce memory clock 100-200MHz as temporary mitigation"],
    tools: ["Thermal pads", "HWiNFO (VRAM temp)", "MSI Afterburner"],
    difficulty: 3,
    keywords: ["temp artifacts", "heat artifacts", "vram overheat artifacts", "thermal vram"],
  },
  {
    id: "gpu-mem-005",
    name: "GPU passes memtest at stock but fails with any memory overclock",
    category: "memory",
    symptoms: ["Stable at stock memory clock", "Any memory OC causes errors or crashes", "Previously could overclock memory"],
    causes: [
      { cause: "VRAM chip degradation — no overclock margin remaining", probability: "high" },
      { cause: "Memory voltage (MVDD) slightly below optimal", probability: "medium" },
      { cause: "Signal integrity degraded — higher frequency can't propagate cleanly", probability: "medium" },
    ],
    diagnosticSteps: ["Test at stock: if passes, chip works but at limit", "Check VRAM manufacturer/speed grade (GPU-Z shows memory type)", "SK Hynix chips historically worse overclockers than Samsung", "Accept stock speeds or try VBIOS with slightly higher MVDD"],
    tools: ["GPU-Z", "OCCT GPU memory test"],
    difficulty: 2,
    keywords: ["no memory overclock", "memory oc fails", "vram oc unstable", "can't overclock memory"],
  },
  {
    id: "gpu-crash-005",
    name: "GPU crashes during specific compute workloads (CUDA/OpenCL)",
    category: "crash",
    symptoms: ["Crashes during CUDA or OpenCL compute tasks", "Mining, ML training, or video rendering crashes", "Gaming may work fine — only compute fails"],
    causes: [
      { cause: "VRAM errors under sustained compute access patterns", probability: "high" },
      { cause: "GPU core silicon defect exposed by compute workload pattern", probability: "medium" },
      { cause: "Driver compute stack bug", probability: "medium" },
      { cause: "Insufficient power delivery for sustained 100% compute load", probability: "medium" },
    ],
    diagnosticSteps: ["Run GPU memory test first — compute is VRAM-intensive", "Monitor power draw — compute can sustain higher avg power than gaming", "Try reducing core and memory clocks", "Test with different driver version — compute drivers sometimes differ from game drivers"],
    tools: ["OCCT GPU memory test", "HWiNFO (power monitoring)", "MSI Afterburner"],
    difficulty: 3,
    keywords: ["cuda crash", "opencl crash", "compute crash", "mining crash", "ml training crash"],
  },
  {
    id: "gpu-nd-006",
    name: "GPU display output works in Linux but not Windows (or vice versa)",
    category: "no-display",
    symptoms: ["Display works in one OS but not another", "BIOS/UEFI screen works fine", "Problem starts when OS loads its GPU driver"],
    causes: [
      { cause: "Driver issue in the failing OS", probability: "high" },
      { cause: "Different display output initialization between OS drivers", probability: "medium" },
      { cause: "Secure Boot or firmware incompatibility with one OS's GPU driver", probability: "low" },
    ],
    diagnosticSteps: ["If works in Linux, not Windows: DDU and clean install Windows driver", "If works in Windows, not Linux: check kernel version and mesa/NVIDIA driver version", "Try different kernel boot parameters (nomodeset, nvidia-drm.modeset=1)", "Check if Secure Boot is affecting driver loading"],
    tools: ["DDU (Windows)", "Linux boot parameters", "Driver installers"],
    difficulty: 2,
    keywords: ["linux only", "windows only", "os specific", "driver os mismatch"],
  },
  {
    id: "gpu-pwr-005",
    name: "GPU power limit locked — can't adjust TDP",
    category: "power",
    symptoms: ["Power limit slider greyed out or has no effect", "GPU throttles at lower power than expected", "Overclock tools show 0% power limit adjustment available"],
    causes: [
      { cause: "VBIOS has locked power limit (OEM/laptop VBIOS)", probability: "high" },
      { cause: "NVIDIA power limit lock via firmware (Founders Edition some gens)", probability: "medium" },
      { cause: "Driver or software not reading VBIOS power tables correctly", probability: "low" },
    ],
    diagnosticSteps: ["Check if VBIOS allows power limit adjustment (GPU-Z shows power limits)", "Some VBIOS can be flashed with unlocked version (check TPU VBIOS database)", "For laptops: power limit is typically locked for thermal/safety reasons", "MorePowerTool (AMD) or NVIDIA Inspector can sometimes bypass soft limits"],
    tools: ["GPU-Z", "MorePowerTool (AMD)", "VBIOS database (techpowerup)"],
    difficulty: 2,
    keywords: ["power limit locked", "tdp locked", "can't change power limit", "power limit stuck"],
  },
  {
    id: "gpu-art-007",
    name: "Screen corruption only at specific resolution or refresh rate",
    category: "artifacts",
    symptoms: ["Artifacts at 4K 144Hz but not at 4K 60Hz", "Works at 1080p but corrupted at 1440p", "Different refresh rates show different artifact severity"],
    causes: [
      { cause: "Display cable bandwidth limit — not rated for high resolution+refresh", probability: "high" },
      { cause: "GPU display output circuit marginal at high pixel clock", probability: "medium" },
      { cause: "Monitor firmware issue at specific mode", probability: "low" },
    ],
    diagnosticSteps: ["Try certified high-bandwidth cable (DP 1.4 HBR3 or HDMI 2.1)", "Lower refresh rate and test — if clean, bandwidth issue", "Try different display output port on GPU", "Test with different monitor to isolate GPU vs monitor"],
    tools: ["Certified cable (VESA-certified DP, Ultra High Speed HDMI)"],
    difficulty: 1,
    keywords: ["resolution artifacts", "refresh rate artifacts", "bandwidth artifacts", "cable artifacts"],
  },
  {
    id: "gpu-crash-006",
    name: "GPU driver crash after sleep/hibernate resume",
    category: "crash",
    symptoms: ["Screen blank or corrupted after waking from sleep", "TDR error after resume", "Requires reboot to restore display", "Works fine if sleep/hibernate is never used"],
    causes: [
      { cause: "GPU driver fails to reinitialize correctly after S3/S4 resume", probability: "high" },
      { cause: "VRAM contents not properly restored after sleep", probability: "medium" },
      { cause: "PCIe link training fails on resume — GPU not responding", probability: "medium" },
    ],
    diagnosticSteps: ["Update to latest GPU driver — sleep/resume fixes are common in updates", "Try disabling 'Link State Power Management' in Windows power settings", "In BIOS: check PCIe ASPM setting — try disabling", "If specific to S4 (hibernate): disable hibernate and use shutdown instead"],
    tools: ["GPU driver update", "Power settings (LSPM)", "BIOS settings (ASPM)"],
    difficulty: 2,
    keywords: ["sleep crash", "hibernate crash", "resume crash", "wake crash", "s3 resume"],
  },
  {
    id: "gpu-therm-006",
    name: "GPU backplate extremely hot",
    category: "thermal",
    symptoms: ["Metal backplate too hot to touch comfortably (>60°C)", "Backplate transfers heat to nearby components", "PCB visible through thermal camera as hot zone"],
    causes: [
      { cause: "Backplate thermal pad transfers heat from PCB to backplate (by design on some cards)", probability: "high" },
      { cause: "No thermal pad between PCB and backplate — trapped hot air", probability: "medium" },
      { cause: "VRAM on back of PCB without adequate cooling", probability: "medium" },
    ],
    diagnosticSteps: ["Check if backplate has thermal pads to VRAM on PCB backside", "Add thermal pads between PCB back components and backplate if missing", "Ensure backplate is not insulating — should conduct heat away, not trap it", "Consider replacing backplate with one that has active cooling or better contact"],
    tools: ["Thermal pads (1.5-2.0mm)", "Thermal camera"],
    difficulty: 2,
    keywords: ["hot backplate", "backplate thermal", "pcb heat", "back of gpu hot"],
  },
  {
    id: "gpu-drv-005",
    name: "GPU detected as 'Microsoft Basic Display Adapter'",
    category: "driver",
    symptoms: ["Device Manager shows 'Microsoft Basic Display Adapter' instead of GPU name", "Very low resolution, no 3D acceleration", "GPU driver won't install ('compatible hardware not found')"],
    causes: [
      { cause: "GPU driver completely missing — Windows using generic driver", probability: "high" },
      { cause: "GPU not properly enumerated on PCIe — bad contact or slot issue", probability: "medium" },
      { cause: "GPU VBIOS corrupted — device ID not readable", probability: "medium" },
    ],
    diagnosticSteps: ["Download correct driver from NVIDIA/AMD website and install manually", "If driver installer says 'no compatible hardware': GPU not properly detected", "Reseat GPU, clean PCIe contacts", "Check Device Manager > Hidden devices for ghost GPU entries — remove them", "If VBIOS corrupt: flash correct VBIOS via secondary GPU or iGPU"],
    tools: ["DDU", "Manufacturer driver download", "GPU-Z (if accessible)"],
    difficulty: 2,
    keywords: ["basic display adapter", "generic driver", "no gpu driver", "microsoft basic"],
  },
];

export function searchGpuFailurePatterns(query: string): GpuFailurePattern[] {
  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms = new Set<string>();

  for (const word of words) {
    expandedTerms.add(word);
    for (const [, synonyms] of Object.entries(GPU_SYNONYMS)) {
      if (synonyms.some(s => s.includes(word) || word.includes(s))) {
        for (const syn of synonyms) expandedTerms.add(syn);
      }
    }
  }

  const scored: Array<{ pattern: GpuFailurePattern; score: number }> = [];

  for (const pattern of GPU_FAILURE_PATTERNS) {
    let score = 0;
    const searchableText = [
      pattern.name,
      ...pattern.symptoms,
      ...pattern.keywords,
      ...pattern.causes.map(c => c.cause),
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

export function getGpuPatternsByCategory(category: string): GpuFailurePattern[] {
  const cat = category.toLowerCase() as GpuFailureCategory;
  return GPU_FAILURE_PATTERNS.filter(p => p.category === cat);
}
