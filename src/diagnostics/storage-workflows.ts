/**
 * Storage device troubleshooting workflows for professional data recovery.
 * Covers SSD, HDD, NVMe, and firmware-level recovery procedures.
 */

export interface StorageWorkflowStep {
  id: string;
  instruction: string;
  yesNext: string | null;
  noNext: string | null;
  tip?: string;
}

export interface StorageWorkflowConclusion {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
}

export interface StorageWorkflow {
  id: string;
  name: string;
  description: string;
  category:
    | "ssd-recovery"
    | "hdd-recovery"
    | "firmware"
    | "data-recovery"
    | "diagnostics";
  difficulty: 1 | 2 | 3 | 4 | 5;
  requiredTools: string[];
  steps: StorageWorkflowStep[];
  conclusions: StorageWorkflowConclusion[];
}

export const STORAGE_WORKFLOWS: StorageWorkflow[] = [
  // ── 1. ssd-not-detected ──────────────────────────────────────────────
  {
    id: "ssd-not-detected",
    name: "SSD Not Detected",
    description:
      "Systematic diagnosis when an SSD is not recognized by the BIOS or OS. Covers SATA, NVMe, and M.2 form factors.",
    category: "ssd-recovery",
    difficulty: 2,
    requiredTools: ["multimeter", "SPI programmer (CH341A)", "thermal camera"],
    steps: [
      {
        id: "s1",
        instruction:
          "Enter BIOS/UEFI setup and check if the SSD appears in the storage device list. For NVMe, also check the NVMe configuration submenu.",
        yesNext: "c-intermittent-connection",
        noNext: "s2",
        tip: "Some BIOS versions hide NVMe drives under a separate Boot or PCIe menu — check all sections.",
      },
      {
        id: "s2",
        instruction:
          "Verify the BIOS storage mode setting. For SATA SSDs, confirm AHCI mode is enabled (not IDE/RAID). For NVMe, confirm PCIe/NVMe mode is enabled on the M.2 slot.",
        yesNext: "s3",
        noNext: "c-wrong-bios-mode",
      },
      {
        id: "s3",
        instruction:
          "Reseat the drive in its slot. For M.2, remove the screw, clean contacts with IPA, and reinsert firmly. For 2.5\" SATA, try a known-good cable and port. Does the drive appear now?",
        yesNext: "c-intermittent-connection",
        noNext: "s4",
      },
      {
        id: "s4",
        instruction:
          "Measure power at the drive connector. SATA: 5V and 3.3V rails present? NVMe M.2: 3.3V on pins 2 and 3? Use a multimeter on the slot or breakout board.",
        yesNext: "s5",
        noNext: "c-power-delivery-failure",
        tip: "On M.2 slots, some motherboards require a BIOS option to enable power to the second M.2 slot. Check before assuming hardware failure.",
      },
      {
        id: "s5",
        instruction:
          "Check if the SSD controller IC gets warm within 5 seconds of power-on (use thermal camera or finger). A cold controller suggests it is not initializing.",
        yesNext: "s6",
        noNext: "c-dead-controller",
      },
      {
        id: "s6",
        instruction:
          "Connect to the SSD's SPI ROM chip (typically 8-pin SOIC near the controller) using a CH341A programmer. Can you read a valid firmware image (non-0xFF, non-0x00)?",
        yesNext: "c-firmware-corruption",
        noNext: "c-dead-controller",
        tip: "If the SPI ROM reads all 0xFF, firmware may have been erased. A known-good dump for the same model/firmware revision can be reflashed to recover.",
      },
    ],
    conclusions: [
      {
        id: "c-intermittent-connection",
        title: "Intermittent Connection",
        description:
          "The drive is functional but has an unreliable physical connection. Clean the M.2 edge connector or replace the SATA cable/port. Monitor for recurrence.",
        severity: "warning",
      },
      {
        id: "c-wrong-bios-mode",
        title: "Incorrect BIOS Storage Mode",
        description:
          "The storage controller mode does not match the drive protocol. Switch to AHCI for SATA SSDs or enable NVMe/PCIe mode for NVMe drives. Reinstall OS storage drivers if changing modes on an existing installation.",
        severity: "info",
      },
      {
        id: "c-power-delivery-failure",
        title: "Power Delivery Failure",
        description:
          "The drive is not receiving correct supply voltage. Check motherboard power circuitry, fuses on the SATA power rail, or M.2 slot voltage regulators. On laptops, inspect the power enable FET for the M.2 slot.",
        severity: "critical",
      },
      {
        id: "c-dead-controller",
        title: "Dead SSD Controller",
        description:
          "The controller IC is non-functional. Data recovery requires desoldering NAND chips and reading them with a NAND reader (e.g., PC-3000 Flash). SPI ROM reflash will not help if the controller silicon is damaged.",
        severity: "critical",
      },
    ],
  },

  // ── 2. ssd-wrong-capacity ────────────────────────────────────────────
  {
    id: "ssd-wrong-capacity",
    name: "SSD Shows Wrong Capacity",
    description:
      "Diagnose SSDs reporting incorrect capacity — either 0 bytes, a fraction of rated size, or an absurdly large value.",
    category: "ssd-recovery",
    difficulty: 3,
    requiredTools: [
      "SPI programmer (CH341A)",
      "vendor diagnostic tool",
      "hdparm or smartctl",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Does the SSD report exactly 0 bytes / 0 sectors in BIOS or via `smartctl -i /dev/sdX`?",
        yesNext: "s2",
        noNext: "s3",
      },
      {
        id: "s2",
        instruction:
          "A zero-capacity report typically indicates a corrupted translator table or module corruption. Can you access the drive via vendor-specific diagnostic mode (e.g., Samsung UART, Phison MPTool)?",
        yesNext: "c-translator-rebuild",
        noNext: "c-firmware-module-damage",
        tip: "Do NOT write any data to the drive. A corrupted translator means the mapping between LBA and physical NAND pages is broken — writing will overwrite user data.",
      },
      {
        id: "s3",
        instruction:
          "Does the drive show a capacity that is a power-of-two fraction of the rated size (e.g., 128GB instead of 512GB)?",
        yesNext: "s4",
        noNext: "s5",
      },
      {
        id: "s4",
        instruction:
          "This pattern suggests one or more NAND CE (chip enable) lines are not responding. Use SMART extended attributes or vendor tools to check individual NAND die status. Are all dies reporting in?",
        yesNext: "c-translator-rebuild",
        noNext: "c-nand-die-failure",
      },
      {
        id: "s5",
        instruction:
          "The capacity is non-zero but incorrect. Read the SPI ROM firmware configuration sector. Does the stored capacity descriptor match the physical NAND configuration?",
        yesNext: "c-translator-rebuild",
        noNext: "c-firmware-module-damage",
        tip: "Some SSDs store capacity in multiple firmware modules (G-list, P-list, translator). All must agree. Mismatches cause the controller to fall back to a safe capacity.",
      },
    ],
    conclusions: [
      {
        id: "c-translator-rebuild",
        title: "Translator Table Rebuild Required",
        description:
          "The LBA-to-NAND mapping (translator) is corrupted. Use vendor-specific tools to rebuild the translator from NAND metadata. Data recovery success depends on NAND health and translator backup availability.",
        severity: "warning",
      },
      {
        id: "c-firmware-module-damage",
        title: "Firmware Module Damage",
        description:
          "Critical firmware modules (capacity descriptor, NAND configuration, or G-list) are damaged. SPI ROM reflash may restore correct capacity reporting, but user data access requires translator integrity. Professional recovery recommended.",
        severity: "critical",
      },
      {
        id: "c-nand-die-failure",
        title: "NAND Die Failure",
        description:
          "One or more NAND dies are unresponsive, causing reduced capacity. Data on the failed dies is likely unrecoverable without specialized NAND-level tools. Remaining data on healthy dies may be accessible via partial translator reconstruction.",
        severity: "critical",
      },
    ],
  },

  // ── 3. ssd-read-only-mode ────────────────────────────────────────────
  {
    id: "ssd-read-only-mode",
    name: "SSD Stuck in Read-Only Mode",
    description:
      "Diagnose and address an SSD that accepts read commands but rejects all writes. Common end-of-life or firmware protection behavior.",
    category: "ssd-recovery",
    difficulty: 3,
    requiredTools: [
      "smartctl",
      "vendor diagnostic tool",
      "SPI programmer (CH341A)",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Run `smartctl -A /dev/sdX` and check attribute 177 (Wear Leveling Count) or equivalent. Is the remaining life below 5%?",
        yesNext: "c-end-of-life",
        noNext: "s2",
        tip: "Immediately clone the drive with `ddrescue` before any further diagnostics. Read-only mode means the controller is protecting remaining data — the next failure mode is complete unresponsiveness.",
      },
      {
        id: "s2",
        instruction:
          "Check SMART attribute 171/172 (Program/Erase Fail Count). Are there a significant number of recent failures (non-zero and increasing)?",
        yesNext: "c-nand-wear-protection",
        noNext: "s3",
      },
      {
        id: "s3",
        instruction:
          "Attempt a Secure Erase via `hdparm --security-set-pass NULL /dev/sdX && hdparm --security-erase NULL /dev/sdX`. Does the drive accept the command and return to read-write mode?",
        yesNext: "s4",
        noNext: "s5",
        tip: "Secure Erase will destroy all data. Only attempt this after a full backup. Some controllers ignore Secure Erase in protection mode.",
      },
      {
        id: "s4",
        instruction:
          "The drive accepted Secure Erase. Write a test pattern and verify it reads back correctly. Does the drive sustain writes without re-entering read-only mode?",
        yesNext: "c-firmware-lock-cleared",
        noNext: "c-nand-wear-protection",
      },
      {
        id: "s5",
        instruction:
          "Access the SPI ROM via CH341A. Read the firmware configuration area and look for a write-protect flag or status register. Can you identify and clear a firmware-level write lock?",
        yesNext: "c-firmware-lock-cleared",
        noNext: "c-nand-wear-protection",
      },
    ],
    conclusions: [
      {
        id: "c-end-of-life",
        title: "SSD End of Life — Read-Only Protection",
        description:
          "The SSD has exhausted its rated write endurance and the controller has engaged read-only protection to preserve existing data. Clone all data immediately. The drive must be replaced and cannot be restored to write operation.",
        severity: "critical",
      },
      {
        id: "c-nand-wear-protection",
        title: "NAND Wear Protection Active",
        description:
          "The controller has detected excessive NAND program/erase failures and locked the drive to prevent data corruption. This is a hardware-level end-of-life condition. Data should be recovered immediately before the controller fails completely.",
        severity: "critical",
      },
      {
        id: "c-firmware-lock-cleared",
        title: "Firmware Write Lock Cleared",
        description:
          "The read-only condition was caused by a firmware-level lock, not NAND failure. The drive may be usable but should be monitored closely with SMART. Check for unexpected power loss or firmware bugs as root cause.",
        severity: "warning",
      },
    ],
  },

  // ── 4. bricked-ssd-firmware ──────────────────────────────────────────
  {
    id: "bricked-ssd-firmware",
    name: "Bricked SSD Firmware Recovery",
    description:
      "Recover an SSD bricked by a failed firmware update, power loss during write, or corrupted firmware modules.",
    category: "firmware",
    difficulty: 4,
    requiredTools: [
      "SPI programmer (CH341A)",
      "SOIC8 clip",
      "vendor firmware files",
      "serial/UART adapter",
      "fine-tip soldering iron",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Identify the SSD controller IC (Phison, SMI/Silicon Motion, Marvell, Samsung, Realtek, etc.) by reading the markings on the largest BGA/QFP chip. Can you determine the controller family?",
        yesNext: "s2",
        noNext: "c-unknown-controller",
      },
      {
        id: "s2",
        instruction:
          "Check if vendor-specific recovery tools exist for this controller (e.g., Phison UPTOOL/MPTool, SMI MPTool, Marvell FW Loader). Can you enter the controller's manufacturing/recovery mode via USB or SATA?",
        yesNext: "c-vendor-tool-recovery",
        noNext: "s3",
        tip: "Many controllers enter manufacturing mode automatically when firmware is corrupt — they enumerate as a USB or SATA device with a different PID/VID.",
      },
      {
        id: "s3",
        instruction:
          "Locate the SPI NOR flash chip (8-pin SOIC, typically Winbond 25Qxx or GigaDevice 25Qxx) near the controller. Attach a SOIC8 clip connected to a CH341A programmer. Can you read the contents?",
        yesNext: "s4",
        noNext: "s5",
        tip: "Power the SSD separately or desolder the SPI chip to avoid bus contention. Reading in-circuit with the controller powered may return corrupted data.",
      },
      {
        id: "s4",
        instruction:
          "Save the original ROM dump. Compare it against a known-good firmware image for this model. Are the firmware header and module structure intact, or is the image clearly corrupted (large 0xFF regions, missing signatures)?",
        yesNext: "s5",
        noNext: "s6",
        tip: "Always save the original dump even if corrupted. It may contain adaptive NAND parameters unique to this drive that cannot be regenerated.",
      },
      {
        id: "s5",
        instruction:
          "Some controllers support short-circuit recovery: briefly shorting specific pins on the controller or NAND to force boot into recovery mode. Is a documented short-pin procedure available for this controller?",
        yesNext: "c-short-pin-recovery",
        noNext: "s6",
      },
      {
        id: "s6",
        instruction:
          "Flash a known-good firmware image to the SPI ROM via CH341A. After flashing, reconnect the SSD. Does the controller boot and enumerate the drive?",
        yesNext: "c-reflash-success",
        noNext: "c-hardware-failure",
      },
    ],
    conclusions: [
      {
        id: "c-unknown-controller",
        title: "Unknown Controller — Manual Identification Needed",
        description:
          "The controller IC markings are unreadable or unfamiliar. Photograph the PCB and consult SSD controller databases (e.g., flashrom, USBDev.ru forums). Without identifying the controller, recovery tooling cannot be selected.",
        severity: "warning",
      },
      {
        id: "c-vendor-tool-recovery",
        title: "Vendor Tool Recovery Available",
        description:
          "The controller entered manufacturing mode and vendor tools can communicate with it. Use the appropriate MPTool to reflash firmware, rebuild NAND tables, and restore normal operation. Back up NAND contents first if possible.",
        severity: "info",
      },
      {
        id: "c-short-pin-recovery",
        title: "Short-Pin Recovery Mode",
        description:
          "The controller supports forced recovery via pin shorting. Follow the documented procedure exactly — typically shorting specific NAND data pins to GND during power-on for 1-2 seconds, then releasing. The controller should enter recovery mode for firmware download.",
        severity: "warning",
      },
      {
        id: "c-reflash-success",
        title: "SPI ROM Reflash Successful",
        description:
          "Firmware has been restored and the controller is booting. User data accessibility depends on NAND translator integrity. If data is not visible, a translator rebuild via vendor tools may be required as a follow-up step.",
        severity: "info",
      },
      {
        id: "c-hardware-failure",
        title: "Hardware-Level Controller Failure",
        description:
          "The controller does not boot even with known-good firmware. The controller silicon may be damaged (ESD, overvoltage, or manufacturing defect). Data recovery requires NAND chip-off and reading with a dedicated NAND reader.",
        severity: "critical",
      },
    ],
  },

  // ── 5. hdd-pcb-swap ──────────────────────────────────────────────────
  {
    id: "hdd-pcb-swap",
    name: "HDD PCB Swap Procedure",
    description:
      "Controlled procedure for swapping a failed HDD PCB with a compatible donor, including ROM chip transfer for adaptive data preservation.",
    category: "hdd-recovery",
    difficulty: 4,
    requiredTools: [
      "Torx T8 screwdriver",
      "soldering station (fine tip)",
      "SPI programmer (CH341A)",
      "SOIC8 clip",
      "hot air rework station",
      "flux",
      "multimeter",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Record the drive's model number, firmware revision (on the label), and PCB part number (printed on the PCB). Locate a donor PCB with an exact match on all three. Does the donor PCB match model, firmware revision, and PCB part number?",
        yesNext: "s2",
        noNext: "c-no-compatible-donor",
        tip: "Firmware revision is critical. Even the same model with a different firmware version will have incompatible adaptive data and microcode. A mismatched PCB can damage the head preamp.",
      },
      {
        id: "s2",
        instruction:
          "Identify the serial EEPROM or SPI flash on the patient PCB (usually an 8-pin SOIC chip, often marked 25xx or 95xx, located near the motor controller IC). Can you read the ROM contents using CH341A with a SOIC8 clip?",
        yesNext: "s3",
        noNext: "s4",
      },
      {
        id: "s3",
        instruction:
          "Save the ROM dump from the patient PCB. This contains adaptive calibration data (head parameters, servo adjustments, SMART data). Verify the dump is valid — not all 0x00 or 0xFF. Is the dump size correct for the chip (typically 256 bytes for EEPROM or 64KB+ for SPI flash)?",
        yesNext: "s5",
        noNext: "s4",
        tip: "The ROM adaptive data is unique to each physical drive. Without it, the donor PCB will not correctly control the heads and may cause platter scoring.",
      },
      {
        id: "s4",
        instruction:
          "The ROM cannot be read in-circuit. Desolder the ROM chip from the patient PCB using hot air at 280-300C with flux. Can you read the desoldered chip on a ZIF socket or clip adapter?",
        yesNext: "s5",
        noNext: "c-rom-unreadable",
      },
      {
        id: "s5",
        instruction:
          "Desolder the ROM chip from the donor PCB. Solder the patient's ROM chip onto the donor PCB (or flash the patient's ROM dump onto the donor's ROM chip). Verify by reading back. Does the ROM verify correctly on the donor PCB?",
        yesNext: "s6",
        noNext: "c-rom-unreadable",
      },
      {
        id: "s6",
        instruction:
          "Install the prepared donor PCB onto the patient drive. Connect power and data. Does the drive spin up, identify correctly, and show the correct model/serial in BIOS?",
        yesNext: "s7",
        noNext: "c-pcb-incompatible",
      },
      {
        id: "s7",
        instruction:
          "Attempt to read data from the drive. Clone using ddrescue with careful pass settings (no-scrape initially). Is data accessible and cloning progressing?",
        yesNext: "c-pcb-swap-success",
        noNext: "c-pcb-incompatible",
      },
    ],
    conclusions: [
      {
        id: "c-no-compatible-donor",
        title: "No Compatible Donor PCB Available",
        description:
          "An exact-match donor PCB could not be sourced. Check specialist suppliers (DonorDrives, HDDZone) or harvest from identical drives. Never use a PCB with a different firmware revision — it will have incompatible microcode and may damage heads.",
        severity: "warning",
      },
      {
        id: "c-rom-unreadable",
        title: "ROM Chip Unreadable or Damaged",
        description:
          "The adaptive data ROM cannot be read. Without adaptive calibration, the donor PCB cannot safely operate the patient drive's heads. Professional recovery with head-map calibration tools (PC-3000, MRT) is required.",
        severity: "critical",
      },
      {
        id: "c-pcb-incompatible",
        title: "PCB Incompatible Despite Matching Labels",
        description:
          "The donor PCB does not work despite matching identifiers. There may be hardware revisions not reflected in the part number, or internal head configuration differences. Try another donor with a serial number closer to the patient drive.",
        severity: "critical",
      },
      {
        id: "c-pcb-swap-success",
        title: "PCB Swap Successful — Data Accessible",
        description:
          "The donor PCB with transplanted ROM is functioning correctly. Clone the drive immediately and completely before powering down. Do not power-cycle unnecessarily. Once cloned, work from the clone image only.",
        severity: "info",
      },
    ],
  },

  // ── 6. hdd-clicking-triage ───────────────────────────────────────────
  {
    id: "hdd-clicking-triage",
    name: "HDD Clicking/Knocking Triage",
    description:
      "Diagnose repetitive clicking or knocking sounds from an HDD to distinguish between PCB failure, head failure, and platter damage.",
    category: "hdd-recovery",
    difficulty: 3,
    requiredTools: [
      "multimeter",
      "stethoscope or audio recorder",
      "known-good matching PCB",
      "oscilloscope (optional)",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Listen to the click pattern. Is it a rhythmic, repeating click-click-click (every 1-2 seconds) followed by the motor spinning down and restarting?",
        yesNext: "s2",
        noNext: "s3",
        tip: "Record the sound — the click pattern is diagnostic. A consistent rhythm indicates the controller is retrying head initialization. Random patterns suggest mechanical damage.",
      },
      {
        id: "s2",
        instruction:
          "With the drive powered off, measure resistance across the motor pins on the PCB connector (the multi-pin flex/pad connection). Are all motor phase resistances equal (typically 2-10 ohms) with no open circuits?",
        yesNext: "s3",
        noNext: "c-motor-failure",
      },
      {
        id: "s3",
        instruction:
          "Measure the preamp power supply voltage on the PCB (typically 5V or 3.3V VCC near the head flex connector). Is the voltage correct and stable during the click sequence?",
        yesNext: "s4",
        noNext: "c-pcb-voltage-fault",
      },
      {
        id: "s4",
        instruction:
          "If you have a known-good matching PCB with the patient's ROM transplanted, install it. Does the clicking persist with the known-good PCB?",
        yesNext: "s5",
        noNext: "c-pcb-voltage-fault",
      },
      {
        id: "s5",
        instruction:
          "The clicking persists with a known-good PCB, confirming an internal mechanical issue. Is the click pattern consistent and rhythmic (heads seeking but failing to read servo tracks)?",
        yesNext: "s6",
        noNext: "c-platter-damage",
      },
      {
        id: "s6",
        instruction:
          "A rhythmic seek-fail pattern with a good PCB indicates head failure. The heads cannot read servo information to position themselves. This is a cleanroom head-swap scenario. Can you confirm the drive has not been opened or dropped?",
        yesNext: "c-head-failure",
        noNext: "c-platter-damage",
        tip: "Do NOT continue powering the drive. Each click cycle risks the heads contacting the platters, causing scoring that makes data irrecoverable even after a head swap.",
      },
    ],
    conclusions: [
      {
        id: "c-pcb-voltage-fault",
        title: "PCB Voltage or Component Fault",
        description:
          "The clicking is caused by the PCB failing to deliver correct voltage to the head preamp or motor controller. A TVS diode may have shorted (common Seagate failure), or a voltage regulator has failed. Replace the failed component or swap the PCB with ROM transfer.",
        severity: "warning",
      },
      {
        id: "c-motor-failure",
        title: "Spindle Motor Failure",
        description:
          "The spindle motor has an open or shorted winding. The drive cannot spin the platters. Data recovery requires a platter transplant into a matching donor chassis in a cleanroom environment — this is a Class 100 procedure.",
        severity: "critical",
      },
      {
        id: "c-head-failure",
        title: "Read/Write Head Failure",
        description:
          "The heads are unable to read servo tracks and the actuator is seeking blindly. A cleanroom head swap is required using a donor head stack assembly from an identical drive (matching head count and firmware). Success rate is 60-80% depending on platter condition.",
        severity: "critical",
      },
      {
        id: "c-platter-damage",
        title: "Platter Surface Damage",
        description:
          "Evidence suggests the platters have physical damage (scoring, debris). Continued operation will worsen damage. Even with a head swap, data recovery is partial at best. A cleanroom assessment is mandatory before any further power-on.",
        severity: "critical",
      },
    ],
  },

  // ── 7. seagate-f3-terminal ───────────────────────────────────────────
  {
    id: "seagate-f3-terminal",
    name: "Seagate F3 Terminal Recovery",
    description:
      "Access the Seagate F3 diagnostic terminal via serial UART to repair firmware modules, clear SMART, and rebuild the translator on Seagate drives (7200.11 through current Barracuda/IronWolf).",
    category: "firmware",
    difficulty: 4,
    requiredTools: [
      "USB-to-TTL serial adapter (3.3V)",
      "terminal emulator (PuTTY/minicom)",
      "Torx T6 screwdriver",
      "motor contact tool or card separator",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Connect the serial adapter TX/RX/GND to the Seagate diagnostic port (exposed pads on the PCB, typically near the SATA connector). Set baud rate to 38400, 8N1. Power on the drive. Do you see the F3 T> prompt in the terminal?",
        yesNext: "s2",
        noNext: "c-no-terminal-access",
        tip: "If you see garbled text, verify TX/RX are not swapped and voltage is 3.3V (NOT 5V — this will damage the preamp). Some models use 115200 baud.",
      },
      {
        id: "s2",
        instruction:
          "At the F3 T> prompt, type `/2` then press Enter to enter Level 2. Type `Z` to display the firmware module status table. Are all modules listed as valid (no 'ERR' or missing entries)?",
        yesNext: "s4",
        noNext: "s3",
      },
      {
        id: "s3",
        instruction:
          "Corrupted modules detected. Before repair, create a backup of the System Area: at the F3 T> prompt, use commands to read modules to a log file. Have you backed up the SA modules?",
        yesNext: "s4",
        noNext: "s4",
        tip: "Even a partial SA backup is valuable. If the repair fails, the backup provides a fallback. Without it, a bad repair can make the drive permanently unrecoverable.",
      },
      {
        id: "s4",
        instruction:
          "To clear the SMART error log and G-List (if needed), enter Level 2 (`/2`) and execute the appropriate clear commands for this firmware family. Is the drive's firmware family Moose (CC), Grenada (DE), Pharaoh, or Rosewood?",
        yesNext: "s5",
        noNext: "s5",
      },
      {
        id: "s5",
        instruction:
          "Rebuild the translator: enter Level 2 and execute the translator regeneration command sequence (varies by family). After completion, power cycle the drive. Does the drive now identify with correct model and capacity?",
        yesNext: "s6",
        noNext: "c-sa-damage",
      },
      {
        id: "s6",
        instruction:
          "The drive identifies correctly. Attempt to read data. Mount read-only or clone with ddrescue. Is user data accessible?",
        yesNext: "c-f3-recovery-success",
        noNext: "c-sa-damage",
      },
    ],
    conclusions: [
      {
        id: "c-no-terminal-access",
        title: "F3 Terminal Not Accessible",
        description:
          "The serial diagnostic port is not responding. Verify wiring (TX→RX crossover), 3.3V levels, and baud rate. If the PCB is damaged, the UART transceiver may be non-functional. Try a PCB swap with ROM transfer as an alternative path.",
        severity: "warning",
      },
      {
        id: "c-sa-damage",
        title: "System Area Damage Beyond Terminal Repair",
        description:
          "The firmware damage is too extensive for F3 terminal repair. Multiple SA copies are corrupted or the translator cannot be rebuilt from remaining metadata. Professional tools (PC-3000 HDD, ACE Lab) with full SA editing capability are required.",
        severity: "critical",
      },
      {
        id: "c-f3-recovery-success",
        title: "F3 Terminal Recovery Successful",
        description:
          "Firmware modules have been repaired and user data is accessible. Clone the drive completely before any further use. The repaired firmware state may not be stable long-term — treat the drive as end-of-life after data recovery.",
        severity: "info",
      },
    ],
  },

  // ── 8. wd-rom-transfer ───────────────────────────────────────────────
  {
    id: "wd-rom-transfer",
    name: "Western Digital ROM Transfer",
    description:
      "Read and transfer the adaptive ROM data between WD HDD PCBs using a CH341A SPI programmer. Required for all modern WD PCB swaps.",
    category: "firmware",
    difficulty: 3,
    requiredTools: [
      "SPI programmer (CH341A)",
      "SOIC8 clip",
      "soldering station (for desoldering if needed)",
      "WD ROM editor tool",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Locate the ROM chip on the patient WD PCB. Modern WD drives use a serial flash (8-pin SOIC, usually 25xx series) near the Marvell or WD-branded main controller. Attach the SOIC8 clip and read the chip via CH341A. Did the read complete successfully with a valid (non-empty) dump?",
        yesNext: "s2",
        noNext: "c-rom-read-failure",
        tip: "Disconnect the PCB from the drive before reading. WD controllers can interfere with SPI bus reads. If using in-circuit reading, hold the controller in reset by grounding the reset pin.",
      },
      {
        id: "s2",
        instruction:
          "Verify the ROM dump integrity. WD ROMs contain calibration data, head maps, and adaptive parameters. Check for a valid header signature and that the file size matches the chip capacity (typically 128KB or 256KB). Is the dump valid?",
        yesNext: "s3",
        noNext: "c-rom-read-failure",
      },
      {
        id: "s3",
        instruction:
          "Identify the WD firmware family (Marvell 88i9xxx for older, custom WD ASIC for newer). The ROM structure varies by family. Does the donor PCB use the same controller/firmware family as the patient?",
        yesNext: "s4",
        noNext: "c-family-mismatch",
      },
      {
        id: "s4",
        instruction:
          "Read the donor PCB's ROM as a backup. Using a WD ROM editor, transplant the adaptive data sectors from the patient ROM into the donor ROM structure. Key sections: head adaptive parameters, servo calibration, and unique ID. Are the adaptive sections patched into the donor ROM?",
        yesNext: "s5",
        noNext: "c-family-mismatch",
        tip: "Do NOT overwrite the entire donor ROM with the patient's ROM. The donor ROM contains microcode that must match the donor PCB's hardware revision. Only transplant the adaptive data sectors.",
      },
      {
        id: "s5",
        instruction:
          "Flash the patched ROM to the donor PCB's ROM chip. Read back and verify the write. Does the verification pass (written data matches the patched image)?",
        yesNext: "s6",
        noNext: "c-rom-read-failure",
      },
      {
        id: "s6",
        instruction:
          "Install the donor PCB (with patched ROM) onto the patient drive. Power on. Does the drive spin up, identify with the correct model and serial number, and appear in the BIOS?",
        yesNext: "c-rom-transfer-success",
        noNext: "c-family-mismatch",
      },
    ],
    conclusions: [
      {
        id: "c-rom-read-failure",
        title: "ROM Read/Write Failure",
        description:
          "The ROM chip could not be read or written reliably. Check SOIC clip contact quality, verify the chip part number and correct voltage (3.3V vs 1.8V), and ensure no bus contention. If the chip is physically damaged, desolder and read on a socket adapter.",
        severity: "warning",
      },
      {
        id: "c-family-mismatch",
        title: "Firmware Family Mismatch",
        description:
          "The patient and donor PCBs use different controller families or ROM structures. The adaptive data cannot be directly transplanted. A donor with the exact same firmware family, revision, and head count is required.",
        severity: "critical",
      },
      {
        id: "c-rom-transfer-success",
        title: "ROM Transfer Successful",
        description:
          "The adaptive data has been transplanted and the donor PCB is operating the patient drive correctly. Clone all data immediately using ddrescue. The drive should not be used for continued storage — treat as a recovery-only operation.",
        severity: "info",
      },
    ],
  },

  // ── 9. nand-health-assessment ────────────────────────────────────────
  {
    id: "nand-health-assessment",
    name: "NAND Flash Health Assessment",
    description:
      "Comprehensive NAND health evaluation using SMART data, P/E cycle counts, ECC error rates, and pending sector analysis to predict remaining drive life.",
    category: "diagnostics",
    difficulty: 2,
    requiredTools: ["smartctl", "vendor SSD toolbox", "iostat or perfmon"],
    steps: [
      {
        id: "s1",
        instruction:
          "Run `smartctl -A /dev/sdX` and check the overall SMART health status. Does the drive report PASSED?",
        yesNext: "s2",
        noNext: "c-end-of-life",
      },
      {
        id: "s2",
        instruction:
          "Check SMART attribute 5 (Reallocated Sector Count) or NVMe equivalent (Available Spare / Spare Threshold). Is the reallocated sector count below the manufacturer's threshold (typically < 100 for healthy drives)?",
        yesNext: "s3",
        noNext: "s4",
        tip: "A rapidly increasing reallocation count (compare with Power_On_Hours) indicates accelerating NAND failure. Even if below threshold now, project forward.",
      },
      {
        id: "s3",
        instruction:
          "Check the P/E (Program/Erase) cycle count via attribute 177 (Wear Leveling Count) or vendor tools. Is the consumed endurance below 80% of the rated TBW (Terabytes Written)?",
        yesNext: "s4",
        noNext: "c-degrading",
      },
      {
        id: "s4",
        instruction:
          "Check SMART attribute 187 (Reported Uncorrectable Errors) and 188 (Command Timeout). For NVMe, check Media and Data Integrity Errors. Are uncorrectable errors at zero?",
        yesNext: "s5",
        noNext: "c-critical-health",
      },
      {
        id: "s5",
        instruction:
          "Check attribute 197 (Current Pending Sector Count) — sectors that failed reads and are awaiting reallocation. Is the pending sector count at zero?",
        yesNext: "s6",
        noNext: "c-degrading",
      },
      {
        id: "s6",
        instruction:
          "Check the raw ECC error correction rate (attribute 195 or 199) and write amplification factor (WAF, attribute 233 on some drives). Is the ECC rate stable and WAF below 3x?",
        yesNext: "c-healthy",
        noNext: "c-degrading",
      },
    ],
    conclusions: [
      {
        id: "c-healthy",
        title: "NAND Health: Good",
        description:
          "All SMART indicators are within normal ranges. The drive is healthy with substantial remaining endurance. Continue normal operation with periodic SMART monitoring (monthly recommended).",
        severity: "info",
      },
      {
        id: "c-degrading",
        title: "NAND Health: Degrading",
        description:
          "Early signs of NAND wear detected. Reallocated sectors or P/E cycles are approaching limits but the drive is still functional. Plan for replacement within 6-12 months. Increase backup frequency and monitor SMART weekly.",
        severity: "warning",
      },
      {
        id: "c-critical-health",
        title: "NAND Health: Critical",
        description:
          "Uncorrectable errors or command timeouts detected. Active data loss is occurring or imminent. Back up all data immediately and replace the drive. Do not store any new critical data on this device.",
        severity: "critical",
      },
      {
        id: "c-end-of-life",
        title: "NAND Health: End of Life",
        description:
          "SMART self-assessment reports FAILED or available spare is below threshold. The controller may engage read-only mode at any time. Extract all data with highest priority — power-off and use a USB bridge if needed to avoid firmware-initiated lockout.",
        severity: "critical",
      },
    ],
  },

  // ── 10. data-recovery-assessment ─────────────────────────────────────
  {
    id: "data-recovery-assessment",
    name: "Data Recovery Feasibility Assessment",
    description:
      "Structured assessment to determine the most appropriate recovery method and estimate success probability based on failure type and drive condition.",
    category: "data-recovery",
    difficulty: 2,
    requiredTools: [
      "smartctl",
      "ddrescue",
      "file system analysis tools (testdisk, photorec)",
      "multimeter",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Classify the failure type. Is the drive physically detectable by the BIOS/OS (appears as a storage device, even if unreadable)?",
        yesNext: "s2",
        noNext: "s4",
      },
      {
        id: "s2",
        instruction:
          "The drive is detected. Attempt to read the first sector (MBR/GPT) using `dd if=/dev/sdX bs=512 count=1`. Does the read succeed?",
        yesNext: "s3",
        noNext: "c-firmware-level-recovery",
        tip: "If reads succeed but are extremely slow (minutes per MB), this indicates degraded heads or media. Use ddrescue with aggressive timeouts to maximize data capture before total failure.",
      },
      {
        id: "s3",
        instruction:
          "Basic reads work. Is the file system recognizable? Check with `testdisk /dev/sdX` — does it find valid partition tables and file system structures?",
        yesNext: "c-logical-recovery",
        noNext: "c-filesystem-recovery",
      },
      {
        id: "s4",
        instruction:
          "The drive is not detected. Does it spin up (HDD) or power on (SSD — controller gets warm)?",
        yesNext: "c-firmware-level-recovery",
        noNext: "c-hardware-recovery",
      },
      {
        id: "s5",
        instruction:
          "Extended triage: if the drive powers on but is not detected, check for firmware-level issues using vendor diagnostics or serial terminal access before escalating to hardware recovery.",
        yesNext: "c-firmware-level-recovery",
        noNext: "c-hardware-recovery",
      },
    ],
    conclusions: [
      {
        id: "c-logical-recovery",
        title: "Logical Recovery — High Success Rate",
        description:
          "The drive hardware is functional and file system structures are present. Recovery involves partition/file system repair or file carving. Expected success rate: 90-99%. Tools: testdisk for partition recovery, photorec for file carving, or mount read-only and copy.",
        severity: "info",
      },
      {
        id: "c-filesystem-recovery",
        title: "File System Damage — Moderate Recovery",
        description:
          "The drive reads but file system structures are damaged or missing. Clone the entire drive first with ddrescue, then apply file system recovery tools to the clone. Expected success rate: 70-90% depending on extent of corruption.",
        severity: "warning",
      },
      {
        id: "c-firmware-level-recovery",
        title: "Firmware-Level Recovery Required",
        description:
          "The drive has power but does not properly identify or allow sector reads. Firmware modules, translator tables, or service area data may be corrupted. Vendor-specific tools or professional recovery (PC-3000) required. Expected success rate: 50-80%.",
        severity: "warning",
      },
      {
        id: "c-hardware-recovery",
        title: "Hardware Recovery Required",
        description:
          "The drive does not power on or spin up. PCB repair, head swap, or motor transplant in a cleanroom may be required. Expected success rate: 40-70% depending on failure type. Cost is significantly higher. Do not attempt DIY repairs on drives with irreplaceable data.",
        severity: "critical",
      },
    ],
  },

  // ── 11. nvme-thermal-throttling ──────────────────────────────────────
  {
    id: "nvme-thermal-throttling",
    name: "NVMe Thermal Throttling Diagnosis",
    description:
      "Diagnose and mitigate NVMe SSD thermal throttling that causes performance drops during sustained workloads.",
    category: "diagnostics",
    difficulty: 2,
    requiredTools: [
      "smartctl or nvme-cli",
      "thermal sensor/IR thermometer",
      "stress test tool (fio)",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Check the current NVMe temperature using `smartctl -A /dev/nvmeXn1` or `nvme smart-log /dev/nvmeX`. Is the idle temperature below 45C?",
        yesNext: "s2",
        noNext: "s3",
        tip: "NVMe composite temperature combines controller and NAND sensors. Some drives report individual sensor temps via `nvme smart-log -o json` — the controller is usually the hottest component.",
      },
      {
        id: "s2",
        instruction:
          "Run a sustained sequential write test: `fio --name=test --rw=write --bs=128k --size=10G --direct=1 --filename=/dev/nvmeXn1p1` (on a test partition only). Monitor temperature during the test. Does the temperature exceed 70C and does throughput drop during the test?",
        yesNext: "s3",
        noNext: "c-no-throttling",
      },
      {
        id: "s3",
        instruction:
          "Check the physical cooling setup. Is a heatsink installed on the NVMe drive? For M.2 slots, is there a motherboard heatsink or thermal pad making contact?",
        yesNext: "s4",
        noNext: "c-needs-heatsink",
      },
      {
        id: "s4",
        instruction:
          "Verify airflow over the NVMe heatsink. Is there active airflow (case fan, dedicated M.2 fan) directed at the NVMe drive location?",
        yesNext: "s5",
        noNext: "c-needs-airflow",
      },
      {
        id: "s5",
        instruction:
          "With heatsink and airflow both present, check the thermal throttle threshold in the drive's firmware. Use `nvme get-feature /dev/nvmeX -f 0x04` to read the thermal management feature. Is the throttle threshold set appropriately (typically 70-80C)?",
        yesNext: "c-needs-airflow",
        noNext: "c-adjust-thermal-limits",
      },
    ],
    conclusions: [
      {
        id: "c-no-throttling",
        title: "No Thermal Throttling Detected",
        description:
          "The NVMe drive maintains acceptable temperatures under sustained load. Current cooling is adequate. Continue monitoring temperatures seasonally or when ambient conditions change significantly.",
        severity: "info",
      },
      {
        id: "c-needs-heatsink",
        title: "Heatsink Required",
        description:
          "The NVMe drive is throttling due to insufficient passive cooling. Install an M.2 heatsink with a thermal pad. Aftermarket heatsinks typically reduce temps by 15-25C. Ensure the heatsink does not physically interfere with adjacent components or GPU backplates.",
        severity: "warning",
      },
      {
        id: "c-needs-airflow",
        title: "Inadequate Airflow",
        description:
          "The drive has a heatsink but insufficient airflow to dissipate heat under sustained load. Reposition case fans to direct airflow over the M.2 area, or install a dedicated 40mm fan mount for the NVMe heatsink. Consider relocating the drive to an M.2 slot with better airflow.",
        severity: "warning",
      },
      {
        id: "c-adjust-thermal-limits",
        title: "Adjust Thermal Throttle Threshold",
        description:
          "The firmware thermal throttle threshold may be set too aggressively. Use `nvme set-feature /dev/nvmeX -f 0x04` to adjust the TMT1 and TMT2 thresholds. Only increase by 5-10C and monitor for stability. Some drives allow per-sensor threshold configuration.",
        severity: "info",
      },
    ],
  },

  // ── 12. usb-bridge-recovery ──────────────────────────────────────────
  {
    id: "usb-bridge-recovery",
    name: "USB Bridge Recovery / Bypass",
    description:
      "Diagnose USB-to-SATA/NVMe bridge failures in external drives and bypass the bridge for direct data access.",
    category: "ssd-recovery",
    difficulty: 2,
    requiredTools: [
      "Torx/pentalobe screwdriver set",
      "SATA cable",
      "SATA-to-USB adapter (known good)",
      "M.2 to USB adapter (for NVMe)",
    ],
    steps: [
      {
        id: "s1",
        instruction:
          "Connect the external drive to USB. Check `dmesg` or Device Manager for enumeration. Does the USB bridge controller enumerate (even if the drive itself is not recognized as a storage device)?",
        yesNext: "s2",
        noNext: "s3",
        tip: "If the bridge enumerates but the drive does not appear, the bridge sees the drive but cannot communicate. This is usually a bridge firmware issue or a drive-side failure, not a cable problem.",
      },
      {
        id: "s2",
        instruction:
          "The bridge enumerates. Try a different USB cable and port (use USB 3.0 port for USB 3.0 drives). Some bridges fail on USB 2.0 fallback. Does the drive appear as a storage volume now?",
        yesNext: "c-cable-or-port-issue",
        noNext: "s3",
      },
      {
        id: "s3",
        instruction:
          "Open the external enclosure. Identify the internal drive interface: is it a standard 2.5\" SATA drive, M.2 SATA, M.2 NVMe, or a proprietary (soldered) connection?",
        yesNext: "s4",
        noNext: "c-proprietary-interface",
      },
      {
        id: "s4",
        instruction:
          "Remove the drive from the USB bridge board. Connect it directly: SATA drive to a SATA port on a desktop motherboard, or M.2 drive to an M.2 slot. Does the drive appear in BIOS when connected directly?",
        yesNext: "s5",
        noNext: "c-drive-failure",
        tip: "Some WD/Seagate external drives use hardware encryption on the USB bridge. Bypassing the bridge means data will appear encrypted. Check if the drive model is known to use bridge-level encryption before discarding the bridge.",
      },
      {
        id: "s5",
        instruction:
          "The drive works when connected directly, confirming the USB bridge is the point of failure. Can you access and read the partition table and files?",
        yesNext: "c-bridge-failure-confirmed",
        noNext: "c-drive-failure",
      },
    ],
    conclusions: [
      {
        id: "c-cable-or-port-issue",
        title: "USB Cable or Port Issue",
        description:
          "The drive works with a different cable or port. USB 3.0 drives are sensitive to cable quality and length. Replace the cable with a short, high-quality USB 3.0 cable. Avoid hubs and extension cables for external drives.",
        severity: "info",
      },
      {
        id: "c-bridge-failure-confirmed",
        title: "USB Bridge Failure — Drive Healthy",
        description:
          "The USB-to-SATA/NVMe bridge has failed but the drive itself is functional. Copy all data via the direct connection. Replace the enclosure or use a new USB adapter. Do not reuse the failed bridge board.",
        severity: "info",
      },
      {
        id: "c-proprietary-interface",
        title: "Proprietary Interface — Cannot Bypass",
        description:
          "The drive uses a proprietary connector or is soldered to the bridge board (common in some WD My Passport, Seagate Backup Plus models). The bridge cannot be bypassed without desoldering. If the bridge has failed, professional recovery from the NAND/platters is required.",
        severity: "critical",
      },
      {
        id: "c-drive-failure",
        title: "Drive-Level Failure (Not Bridge)",
        description:
          "The drive does not function even with a direct connection, confirming the failure is in the drive itself, not the USB bridge. Proceed with appropriate drive-specific diagnostics (SSD or HDD workflows) for further triage.",
        severity: "critical",
      },
    ],
  },
];

/**
 * Look up a single storage workflow by its ID.
 */
export function getStorageWorkflow(
  id: string,
): StorageWorkflow | undefined {
  return STORAGE_WORKFLOWS.find((w) => w.id === id);
}

/**
 * Return a summary list of all storage workflows.
 */
export function listStorageWorkflows(): Array<{
  id: string;
  name: string;
  category: string;
  difficulty: number;
}> {
  return STORAGE_WORKFLOWS.map((w) => ({
    id: w.id,
    name: w.name,
    category: w.category,
    difficulty: w.difficulty,
  }));
}

/**
 * Search workflows by keyword across id, name, description, and category.
 * Returns all workflows where the query matches (case-insensitive).
 */
export function searchStorageWorkflows(query: string): StorageWorkflow[] {
  const lower = query.toLowerCase();
  return STORAGE_WORKFLOWS.filter(
    (w) =>
      w.id.toLowerCase().includes(lower) ||
      w.name.toLowerCase().includes(lower) ||
      w.description.toLowerCase().includes(lower) ||
      w.category.toLowerCase().includes(lower),
  );
}
