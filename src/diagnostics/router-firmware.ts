/**
 * Router/Switch Firmware Layout Database & Recovery Procedures
 *
 * Reference data for router SPI flash layouts, partition tables,
 * and step-by-step recovery procedures for bricked network equipment.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface RouterPartition {
  name: string;
  offset: string;
  size: string;
  description: string;
}

export interface RouterFirmwareLayout {
  id: string;
  brand: string;
  series: string;
  flashChip: string;
  flashSize: string;
  partitions: RouterPartition[];
  bootloader: string;
  recoveryMethod: string;
  spiProgrammable: boolean;
  notes: string;
  keywords: string[];
}

export interface RouterRecoveryProcedure {
  id: string;
  name: string;
  brand: string;
  category:
    | "tftp-recovery"
    | "serial-console"
    | "spi-flash"
    | "failsafe-mode"
    | "jtag";
  description: string;
  steps: string[];
  requiredTools: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Brand / synonym mapping
// ---------------------------------------------------------------------------

export const ROUTER_SYNONYMS: Record<string, string> = {
  "tp-link": "tp-link",
  tplink: "tp-link",
  "tp link": "tp-link",
  archer: "tp-link",
  netgear: "netgear",
  nighthawk: "netgear",
  ubiquiti: "ubiquiti",
  ubnt: "ubiquiti",
  unifi: "ubiquiti",
  edgerouter: "ubiquiti",
  mikrotik: "mikrotik",
  routerboard: "mikrotik",
  routeros: "mikrotik",
  rb: "mikrotik",
  openwrt: "openwrt",
  lede: "openwrt",
  cisco: "cisco",
  linksys: "cisco",
  wrt: "cisco",
  asus: "asus",
  "rt-ax": "asus",
  "rt-ac": "asus",
  merlin: "asus",
};

// ---------------------------------------------------------------------------
// Firmware layout database
// ---------------------------------------------------------------------------

export const ROUTER_FIRMWARE_LAYOUTS: RouterFirmwareLayout[] = [
  // ── TP-Link ────────────────────────────────────────────────────────────
  {
    id: "tplink-archer-c7-v5",
    brand: "tp-link",
    series: "Archer C7 v5",
    flashChip: "W25Q128FV",
    flashSize: "16MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x020000",
        description: "U-Boot bootloader (128 KB)",
      },
      {
        name: "firmware",
        offset: "0x020000",
        size: "0xF90000",
        description: "TP-Link firmware image — kernel + rootfs (15.5 MB)",
      },
      {
        name: "config",
        offset: "0xFB0000",
        size: "0x040000",
        description: "User configuration / soft config (256 KB)",
      },
      {
        name: "art",
        offset: "0xFF0000",
        size: "0x010000",
        description:
          "Atheros Radio Test — wireless calibration data (64 KB). NEVER erase.",
      },
    ],
    bootloader: "U-Boot (Qualcomm/Atheros variant)",
    recoveryMethod: "TFTP recovery or SPI flash",
    spiProgrammable: true,
    notes:
      "QCA9563 SoC. ART partition contains per-unit wireless calibration — always back up before flashing. SOIC-8 clip fits the W25Q128.",
    keywords: [
      "archer",
      "c7",
      "qca9563",
      "qualcomm",
      "w25q128",
      "16mb",
      "openwrt",
      "tp-link",
      "soic8",
    ],
  },
  {
    id: "tplink-wr841n",
    brand: "tp-link",
    series: "TL-WR841N v13",
    flashChip: "GD25Q32 / W25Q32",
    flashSize: "4MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x020000",
        description: "U-Boot bootloader (128 KB)",
      },
      {
        name: "firmware",
        offset: "0x020000",
        size: "0x3C0000",
        description: "Firmware — kernel + squashfs rootfs (3.75 MB)",
      },
      {
        name: "art",
        offset: "0x3F0000",
        size: "0x010000",
        description: "Atheros Radio Test — wireless calibration (64 KB)",
      },
    ],
    bootloader: "U-Boot (Qualcomm/Atheros variant)",
    recoveryMethod: "TFTP recovery or SPI flash",
    spiProgrammable: true,
    notes:
      "QCA9533 SoC. Only 4 MB flash — modern OpenWrt barely fits. Consider imagebuilder with minimal packages. SOIC-8 package.",
    keywords: [
      "wr841n",
      "841",
      "qca9533",
      "4mb",
      "w25q32",
      "gd25q32",
      "budget",
      "tp-link",
    ],
  },
  {
    id: "tplink-archer-ax50",
    brand: "tp-link",
    series: "Archer AX50",
    flashChip: "W25Q128JV",
    flashSize: "16MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x040000",
        description: "U-Boot bootloader (256 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x040000",
        size: "0x010000",
        description: "U-Boot environment variables (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x050000",
        size: "0xF60000",
        description: "Firmware image — kernel + rootfs (15.375 MB)",
      },
      {
        name: "config",
        offset: "0xFB0000",
        size: "0x040000",
        description: "User configuration data (256 KB)",
      },
      {
        name: "art",
        offset: "0xFF0000",
        size: "0x010000",
        description: "Calibration / ART data (64 KB)",
      },
    ],
    bootloader: "U-Boot (Intel/Lantiq variant)",
    recoveryMethod: "TFTP recovery or SPI flash",
    spiProgrammable: true,
    notes:
      "Intel WAV654 (Lantiq GRX350). Wi-Fi 6 router. The SPI NOR holds the full firmware; no separate NAND. SOIC-8 W25Q128.",
    keywords: [
      "ax50",
      "archer",
      "wifi6",
      "ax",
      "intel",
      "wav654",
      "grx350",
      "w25q128",
      "tp-link",
    ],
  },

  // ── Netgear ────────────────────────────────────────────────────────────
  {
    id: "netgear-r7800",
    brand: "netgear",
    series: "R7800 / X4S Nighthawk",
    flashChip: "MX30LF2G18AC (NAND) + MX25L1606E (NOR)",
    flashSize: "32MB NAND + 2MB SPI NOR",
    partitions: [
      {
        name: "sbl1",
        offset: "0x000000",
        size: "0x040000",
        description: "Secondary bootloader stage 1 on SPI NOR (256 KB)",
      },
      {
        name: "mibib",
        offset: "0x040000",
        size: "0x020000",
        description: "Multiple Image Boot Info Block on SPI NOR (128 KB)",
      },
      {
        name: "sbl2",
        offset: "0x060000",
        size: "0x040000",
        description: "Secondary bootloader stage 2 on SPI NOR (256 KB)",
      },
      {
        name: "sbl3",
        offset: "0x0A0000",
        size: "0x040000",
        description: "Secondary bootloader stage 3 on SPI NOR (256 KB)",
      },
      {
        name: "u-boot",
        offset: "0x0E0000",
        size: "0x060000",
        description: "U-Boot on SPI NOR (384 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x140000",
        size: "0x020000",
        description: "U-Boot environment on SPI NOR (128 KB)",
      },
      {
        name: "firmware0",
        offset: "NAND 0x0000000",
        size: "0x1E00000",
        description: "Primary firmware on NAND (30 MB)",
      },
      {
        name: "firmware1",
        offset: "NAND 0x1E00000",
        size: "0x1E00000",
        description: "Secondary firmware (dual boot) on NAND (30 MB)",
      },
    ],
    bootloader: "Qualcomm SBL chain + U-Boot",
    recoveryMethod: "Nmrpflash, TFTP recovery, or SPI flash of NOR chip",
    spiProgrammable: true,
    notes:
      "IPQ8065 dual-core Krait. Two-chip design: 2 MB SPI NOR (MX25L1606E, SOIC-8) holds bootloader chain; 32 MB parallel NAND holds firmware. For SPI programmer recovery, dump/restore the NOR chip. NAND requires JTAG or Nmrpflash.",
    keywords: [
      "r7800",
      "x4s",
      "nighthawk",
      "ipq8065",
      "nand",
      "nor",
      "dual",
      "netgear",
      "qualcomm",
      "nmrpflash",
    ],
  },
  {
    id: "netgear-r6220",
    brand: "netgear",
    series: "R6220",
    flashChip: "W25N01GV (NAND)",
    flashSize: "128MB SPI NAND",
    partitions: [
      {
        name: "bootloader",
        offset: "0x0000000",
        size: "0x0100000",
        description: "U-Boot bootloader (1 MB)",
      },
      {
        name: "u-boot-env",
        offset: "0x0100000",
        size: "0x0080000",
        description: "U-Boot environment (512 KB)",
      },
      {
        name: "factory",
        offset: "0x0180000",
        size: "0x0080000",
        description: "Factory / calibration data (512 KB)",
      },
      {
        name: "firmware",
        offset: "0x0200000",
        size: "0x2000000",
        description: "Firmware — UBI volume with kernel + rootfs (32 MB)",
      },
      {
        name: "config",
        offset: "0x2200000",
        size: "0x0400000",
        description: "User configuration / NVRAM (4 MB)",
      },
    ],
    bootloader: "U-Boot (MediaTek variant)",
    recoveryMethod: "Nmrpflash or serial console + TFTP",
    spiProgrammable: false,
    notes:
      "MT7621 SoC. SPI NAND uses UBI/UBIFS — raw SPI flash writes will not work without UBI-aware tools. Nmrpflash is the easiest software recovery method. Serial console at 57600 baud (not the usual 115200).",
    keywords: [
      "r6220",
      "mt7621",
      "mediatek",
      "nand",
      "ubi",
      "nmrpflash",
      "netgear",
    ],
  },
  {
    id: "netgear-wndr3700",
    brand: "netgear",
    series: "WNDR3700 v1",
    flashChip: "MX25L6405D / S25FL064P",
    flashSize: "8MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x040000",
        description: "U-Boot bootloader (256 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x040000",
        size: "0x010000",
        description: "U-Boot environment (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x050000",
        size: "0x7A0000",
        description: "Firmware — kernel + squashfs rootfs (7.625 MB)",
      },
      {
        name: "art",
        offset: "0x7F0000",
        size: "0x010000",
        description:
          "Atheros Radio Test — wireless calibration for both radios (64 KB)",
      },
    ],
    bootloader: "U-Boot (Atheros variant)",
    recoveryMethod: "TFTP recovery or SPI flash",
    spiProgrammable: true,
    notes:
      "AR7161 + AR9220 + AR9223 (dual-radio). Classic OpenWrt target. SOIC-8 flash chip, easy to clip. 8 MB gives decent room for OpenWrt.",
    keywords: [
      "wndr3700",
      "ar7161",
      "atheros",
      "8mb",
      "classic",
      "openwrt",
      "netgear",
      "soic8",
    ],
  },

  // ── Ubiquiti ───────────────────────────────────────────────────────────
  {
    id: "ubiquiti-uap-ac-pro",
    brand: "ubiquiti",
    series: "UniFi AP AC Pro (UAP-AC-PRO)",
    flashChip: "MX25L12835F / W25Q128",
    flashSize: "16MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x060000",
        description: "U-Boot bootloader (384 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x060000",
        size: "0x010000",
        description: "U-Boot environment (64 KB)",
      },
      {
        name: "kernel0",
        offset: "0x070000",
        size: "0x7C0000",
        description: "Kernel image — primary (7.75 MB)",
      },
      {
        name: "kernel1",
        offset: "0x830000",
        size: "0x7C0000",
        description: "Kernel image — fallback (7.75 MB)",
      },
      {
        name: "cfg",
        offset: "0xFF0000",
        size: "0x010000",
        description: "Board configuration and EEPROM data (64 KB)",
      },
    ],
    bootloader: "U-Boot (Qualcomm/Atheros variant)",
    recoveryMethod: "TFTP recovery (set TFTP server, power cycle) or SPI flash",
    spiProgrammable: true,
    notes:
      "QCA9563 + QCA9880 SoC. Dual kernel partitions for safe firmware upgrade. UBNT uses custom U-Boot with autorecovery TFTP. cfg partition holds board-specific data (MAC, region) — preserve it.",
    keywords: [
      "uap",
      "unifi",
      "ac-pro",
      "qca9563",
      "ubiquiti",
      "ubnt",
      "16mb",
      "access-point",
      "soic8",
    ],
  },
  {
    id: "ubiquiti-er-x",
    brand: "ubiquiti",
    series: "EdgeRouter X (ER-X)",
    flashChip: "GD5F1GQ4UC (NAND) or MX30LF1G",
    flashSize: "256MB SPI NAND",
    partitions: [
      {
        name: "bootloader",
        offset: "0x0000000",
        size: "0x0100000",
        description: "U-Boot bootloader (1 MB)",
      },
      {
        name: "bootloader-env",
        offset: "0x0100000",
        size: "0x0080000",
        description: "U-Boot environment (512 KB)",
      },
      {
        name: "factory",
        offset: "0x0180000",
        size: "0x0080000",
        description: "Factory calibration / EEPROM (512 KB)",
      },
      {
        name: "kernel0",
        offset: "0x0200000",
        size: "0x4000000",
        description: "Primary firmware — UBI volume (64 MB)",
      },
      {
        name: "kernel1",
        offset: "0x4200000",
        size: "0x4000000",
        description: "Secondary firmware — UBI volume (64 MB)",
      },
      {
        name: "config",
        offset: "0x8200000",
        size: "0x1000000",
        description: "Configuration data (16 MB)",
      },
    ],
    bootloader: "U-Boot (MediaTek variant)",
    recoveryMethod:
      "Serial console + TFTP, or UART U-Boot shell to reflash via tftpboot",
    spiProgrammable: false,
    notes:
      "MT7621 SoC. NAND flash with UBI — not directly SPI-programmable with a clip. Recovery requires UART serial console (115200 baud, 3.3V TTL). Dual firmware partitions for failover.",
    keywords: [
      "er-x",
      "edgerouter",
      "mt7621",
      "nand",
      "ubi",
      "ubiquiti",
      "ubnt",
      "uart",
    ],
  },

  // ── MikroTik ───────────────────────────────────────────────────────────
  {
    id: "mikrotik-hap-ac2",
    brand: "mikrotik",
    series: "hAP ac² (RBD52G-5HacD2HnD-TC)",
    flashChip: "W25Q128FV",
    flashSize: "16MB",
    partitions: [
      {
        name: "routerboot",
        offset: "0x000000",
        size: "0x010000",
        description: "RouterBOOT stage 1 (64 KB)",
      },
      {
        name: "hard-config",
        offset: "0x010000",
        size: "0x010000",
        description:
          "Hardware configuration — serial, MAC, license (64 KB). NEVER erase.",
      },
      {
        name: "routerboot2",
        offset: "0x020000",
        size: "0x010000",
        description: "RouterBOOT backup / stage 2 (64 KB)",
      },
      {
        name: "soft-config",
        offset: "0x030000",
        size: "0x010000",
        description: "Soft configuration (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x040000",
        size: "0xFC0000",
        description: "RouterOS firmware YAFFS2 (15.75 MB)",
      },
    ],
    bootloader: "RouterBOOT",
    recoveryMethod: "Netinstall via Ethernet, or SPI flash",
    spiProgrammable: true,
    notes:
      "MT7621 SoC. hard-config contains the RouterOS license key and board identity — losing it means losing the license. Always back up the full flash before writing. Netinstall is the official MikroTik recovery tool.",
    keywords: [
      "hap",
      "ac2",
      "mikrotik",
      "routerboard",
      "routerboot",
      "mt7621",
      "netinstall",
      "w25q128",
      "routeros",
    ],
  },
  {
    id: "mikrotik-rb750gr3",
    brand: "mikrotik",
    series: "hEX (RB750Gr3)",
    flashChip: "W25Q128FV",
    flashSize: "16MB",
    partitions: [
      {
        name: "routerboot",
        offset: "0x000000",
        size: "0x010000",
        description: "RouterBOOT primary (64 KB)",
      },
      {
        name: "hard-config",
        offset: "0x010000",
        size: "0x010000",
        description:
          "Hardware config — serial, MAC, license key (64 KB). NEVER erase.",
      },
      {
        name: "routerboot-backup",
        offset: "0x020000",
        size: "0x010000",
        description: "RouterBOOT backup copy (64 KB)",
      },
      {
        name: "soft-config",
        offset: "0x030000",
        size: "0x010000",
        description: "Soft configuration — user settings (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x040000",
        size: "0xFC0000",
        description: "RouterOS firmware (15.75 MB)",
      },
    ],
    bootloader: "RouterBOOT",
    recoveryMethod: "Netinstall via Ethernet, or SPI flash",
    spiProgrammable: true,
    notes:
      "MT7621 SoC. Identical flash layout to hAP ac². Netinstall over Ethernet (hold reset, boot, connect Netinstall on Windows/Wine). SOIC-8 W25Q128 for direct SPI access.",
    keywords: [
      "rb750",
      "hex",
      "mikrotik",
      "routerboard",
      "routerboot",
      "mt7621",
      "netinstall",
      "w25q128",
      "routeros",
    ],
  },

  // ── OpenWrt generic ────────────────────────────────────────────────────
  {
    id: "openwrt-4mb-nor",
    brand: "openwrt",
    series: "Generic 4MB SPI NOR layout",
    flashChip: "W25Q32 / GD25Q32 / MX25L3206E",
    flashSize: "4MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x030000",
        description: "U-Boot bootloader (192 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x030000",
        size: "0x010000",
        description: "U-Boot environment (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x040000",
        size: "0x3B0000",
        description:
          "OpenWrt sysupgrade image — kernel + squashfs + jffs2 overlay (3.6875 MB)",
      },
      {
        name: "art",
        offset: "0x3F0000",
        size: "0x010000",
        description: "ART / calibration data (64 KB)",
      },
    ],
    bootloader: "U-Boot",
    recoveryMethod: "SPI flash or TFTP",
    spiProgrammable: true,
    notes:
      "4 MB is the minimum for OpenWrt 23.x — extremely tight. No room for LuCI web interface or many packages. Use imagebuilder to strip unneeded packages. Consider upgrading the flash chip to 8 or 16 MB if the board supports it.",
    keywords: [
      "openwrt",
      "4mb",
      "generic",
      "nor",
      "minimal",
      "squashfs",
      "jffs2",
    ],
  },
  {
    id: "openwrt-16mb-nor",
    brand: "openwrt",
    series: "Generic 16MB SPI NOR layout",
    flashChip: "W25Q128 / MX25L12835F / IS25LP128",
    flashSize: "16MB",
    partitions: [
      {
        name: "u-boot",
        offset: "0x000000",
        size: "0x040000",
        description: "U-Boot bootloader (256 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x040000",
        size: "0x010000",
        description: "U-Boot environment (64 KB)",
      },
      {
        name: "firmware",
        offset: "0x050000",
        size: "0xFA0000",
        description:
          "OpenWrt sysupgrade image — kernel + squashfs + jffs2 overlay (15.625 MB)",
      },
      {
        name: "art",
        offset: "0xFF0000",
        size: "0x010000",
        description: "ART / calibration data (64 KB)",
      },
    ],
    bootloader: "U-Boot",
    recoveryMethod: "SPI flash or TFTP",
    spiProgrammable: true,
    notes:
      "16 MB is the sweet spot for OpenWrt — plenty of room for LuCI, multiple packages, and overlay storage. Most modern targets use this size or larger.",
    keywords: [
      "openwrt",
      "16mb",
      "generic",
      "nor",
      "comfortable",
      "w25q128",
      "standard",
    ],
  },
  {
    id: "openwrt-nand-generic",
    brand: "openwrt",
    series: "Generic NAND layout (UBI)",
    flashChip: "NAND (various) + small SPI NOR for bootloader",
    flashSize: "128MB+ NAND",
    partitions: [
      {
        name: "spi-nor-bootloader",
        offset: "NOR 0x000000",
        size: "0x100000",
        description:
          "Bootloader on separate SPI NOR chip (1 MB) — often a small SOIC-8",
      },
      {
        name: "ubi",
        offset: "NAND 0x000000",
        size: "variable",
        description:
          "UBI volume spanning NAND — contains kernel and rootfs as UBI volumes",
      },
      {
        name: "kernel",
        offset: "UBI vol 0",
        size: "~4MB",
        description: "Kernel image inside UBI volume",
      },
      {
        name: "rootfs",
        offset: "UBI vol 1",
        size: "remaining",
        description: "Root filesystem (squashfs or UBIFS) inside UBI volume",
      },
    ],
    bootloader: "U-Boot (with UBI support)",
    recoveryMethod: "Serial console + TFTP, or JTAG",
    spiProgrammable: false,
    notes:
      "NAND devices use UBI for wear leveling and bad block management. Cannot be flashed with a raw SPI programmer — the NOR bootloader chip can be, but the NAND requires UBI-aware tools. Recovery typically via serial console U-Boot shell.",
    keywords: [
      "openwrt",
      "nand",
      "ubi",
      "ubifs",
      "generic",
      "large",
      "serial",
    ],
  },

  // ── Cisco / Linksys ────────────────────────────────────────────────────
  {
    id: "linksys-wrt1900acs",
    brand: "cisco",
    series: "Linksys WRT1900ACS",
    flashChip: "Micron MT29F1G08ABAEA (NAND)",
    flashSize: "128MB NAND",
    partitions: [
      {
        name: "u-boot",
        offset: "0x0000000",
        size: "0x0100000",
        description: "U-Boot bootloader (1 MB)",
      },
      {
        name: "u-boot-env",
        offset: "0x0100000",
        size: "0x0040000",
        description: "U-Boot environment (256 KB)",
      },
      {
        name: "firmware-primary",
        offset: "0x0200000",
        size: "0x3200000",
        description: "Primary firmware partition — kernel + rootfs (50 MB)",
      },
      {
        name: "firmware-alt",
        offset: "0x3400000",
        size: "0x3200000",
        description:
          "Alternate firmware partition — dual boot fallback (50 MB)",
      },
      {
        name: "nvram",
        offset: "0x6600000",
        size: "0x0100000",
        description: "NVRAM — non-volatile settings (1 MB)",
      },
      {
        name: "art",
        offset: "0x6700000",
        size: "0x0100000",
        description: "Calibration / ART data (1 MB)",
      },
      {
        name: "syscfg",
        offset: "0x6800000",
        size: "0x1800000",
        description: "System configuration area (24 MB)",
      },
    ],
    bootloader: "U-Boot (Marvell variant)",
    recoveryMethod:
      "Serial console + TFTP, or Linksys web recovery mode (power on with reset held)",
    spiProgrammable: false,
    notes:
      "Marvell Armada 385 dual-core ARM. 128 MB NAND — not SPI-programmable with a clip. Dual firmware partitions allow safe A/B upgrades. Serial console at 115200 baud, 3.3V TTL on J10 header.",
    keywords: [
      "wrt1900",
      "acs",
      "linksys",
      "marvell",
      "armada",
      "nand",
      "dual",
      "openwrt",
      "cisco",
    ],
  },
  {
    id: "linksys-ea8300",
    brand: "cisco",
    series: "Linksys EA8300 Max-Stream",
    flashChip: "W25N256GV / MX25L25635F",
    flashSize: "32MB SPI NOR",
    partitions: [
      {
        name: "sbl1",
        offset: "0x0000000",
        size: "0x0040000",
        description: "Qualcomm SBL1 (256 KB)",
      },
      {
        name: "mibib",
        offset: "0x0040000",
        size: "0x0020000",
        description: "Multiple Image Boot Info Block (128 KB)",
      },
      {
        name: "qsee",
        offset: "0x0060000",
        size: "0x0060000",
        description: "Qualcomm Secure Execution Environment (384 KB)",
      },
      {
        name: "u-boot",
        offset: "0x00C0000",
        size: "0x0060000",
        description: "U-Boot bootloader (384 KB)",
      },
      {
        name: "u-boot-env",
        offset: "0x0120000",
        size: "0x0020000",
        description: "U-Boot environment (128 KB)",
      },
      {
        name: "firmware",
        offset: "0x0140000",
        size: "0x1E00000",
        description: "Firmware — kernel + rootfs (30 MB)",
      },
      {
        name: "art",
        offset: "0x1F40000",
        size: "0x0040000",
        description: "Calibration data for tri-band radios (256 KB)",
      },
    ],
    bootloader: "Qualcomm SBL + U-Boot",
    recoveryMethod: "Serial console + TFTP, or SPI flash",
    spiProgrammable: true,
    notes:
      "IPQ4019 (quad-core ARM). 32 MB SPI NOR — large enough for full OpenWrt with many packages. Qualcomm secure boot chain must be intact. SOIC-16 or WSON-8 package depending on revision.",
    keywords: [
      "ea8300",
      "linksys",
      "ipq4019",
      "qualcomm",
      "32mb",
      "tri-band",
      "nor",
      "cisco",
    ],
  },

  // ── Asus ───────────────────────────────────────────────────────────────
  {
    id: "asus-rt-ax86u",
    brand: "asus",
    series: "RT-AX86U",
    flashChip: "TC58NVG1S3HTA00 (NAND)",
    flashSize: "256MB NAND",
    partitions: [
      {
        name: "cfe",
        offset: "0x0000000",
        size: "0x0100000",
        description: "CFE (Common Firmware Environment) bootloader (1 MB)",
      },
      {
        name: "nvram",
        offset: "0x0100000",
        size: "0x0100000",
        description: "NVRAM — non-volatile runtime settings (1 MB)",
      },
      {
        name: "firmware-primary",
        offset: "0x0200000",
        size: "0x6400000",
        description: "Primary firmware — TRX image with kernel + rootfs (100 MB)",
      },
      {
        name: "firmware-secondary",
        offset: "0x6600000",
        size: "0x6400000",
        description: "Secondary firmware — dual boot fallback (100 MB)",
      },
      {
        name: "asus-config",
        offset: "0xCA00000",
        size: "0x1000000",
        description:
          "Asus configuration / user settings / persistent storage (16 MB)",
      },
      {
        name: "boot-flags",
        offset: "0xDA00000",
        size: "0x0100000",
        description: "Boot flags — active partition selector (1 MB)",
      },
    ],
    bootloader: "CFE (Broadcom Common Firmware Environment)",
    recoveryMethod:
      "Asus Rescue Mode (power on with reset held, TFTP to 192.168.1.1), or serial console CFE shell",
    spiProgrammable: false,
    notes:
      "BCM4908 quad-core ARM. 256 MB NAND — not SPI-programmable. Asus Rescue Mode is the primary recovery method (hold reset 10s during power on, LED blinks slowly, TFTP firmware.trx to 192.168.1.1). CFE serial console at 115200 baud. Asuswrt-Merlin is a popular third-party firmware.",
    keywords: [
      "rt-ax86u",
      "ax86u",
      "asus",
      "broadcom",
      "bcm4908",
      "nand",
      "cfe",
      "merlin",
      "rescue",
    ],
  },
];

// ---------------------------------------------------------------------------
// Recovery procedures database
// ---------------------------------------------------------------------------

export const ROUTER_RECOVERY_PROCEDURES: RouterRecoveryProcedure[] = [
  // ── TFTP Recovery ──────────────────────────────────────────────────────
  {
    id: "tftp-tplink",
    name: "TP-Link TFTP Recovery",
    brand: "tp-link",
    category: "tftp-recovery",
    description:
      "Standard TP-Link recovery via built-in TFTP client in bootloader. The router requests a firmware file from a TFTP server on power-up while the reset button is held.",
    steps: [
      "Download the correct firmware from TP-Link support (must match hardware version exactly).",
      "Rename the firmware file to match the expected name (e.g., ArcherC7v5_tp_recovery.bin — check TP-Link wiki for exact name).",
      "Set your PC's IP to 192.168.0.66 with subnet 255.255.255.0 and gateway 192.168.0.1.",
      "Install and start a TFTP server (tftpd-hpa on Linux, Tftpd64 on Windows). Place the firmware file in the TFTP root directory.",
      "Connect an Ethernet cable directly from your PC to a LAN port on the router (not WAN).",
      "Press and hold the reset/WPS button on the router.",
      "While holding reset, power on the router. Continue holding for 6-8 seconds until the WPS LED flashes rapidly.",
      "Release the reset button. The router will request the firmware via TFTP and begin flashing.",
      "Wait 3-5 minutes. Do NOT power off. The router will reboot automatically when complete.",
      "Verify by accessing 192.168.0.1 in a browser after reboot.",
    ],
    requiredTools: [
      "TFTP server software (tftpd-hpa / Tftpd64)",
      "Ethernet cable",
      "Correct firmware file for exact hardware version",
    ],
    difficulty: 2,
    keywords: [
      "tp-link",
      "tplink",
      "tftp",
      "recovery",
      "brick",
      "unbrick",
      "reset",
      "192.168.0.66",
    ],
  },
  {
    id: "tftp-netgear",
    name: "Netgear Nmrpflash / TFTP Recovery",
    brand: "netgear",
    category: "tftp-recovery",
    description:
      "Netgear routers use NMRP (Netgear Management Resource Protocol) for firmware recovery. The open-source nmrpflash tool automates the process.",
    steps: [
      "Download nmrpflash from https://github.com/jclehner/nmrpflash (or install via package manager).",
      "Download the correct firmware .img or .chk file from Netgear support.",
      "Connect your PC directly to a LAN port on the router via Ethernet. Disable Wi-Fi on your PC.",
      "Put the router into recovery mode: power off, hold the reset button, power on. Wait for the power LED to blink amber/green.",
      "Run: nmrpflash -L  to find your network interface name.",
      "Run: nmrpflash -i <interface> -f <firmware.img>  (may require root/admin).",
      "nmrpflash will discover the router via NMRP, upload the firmware, and report progress.",
      "Wait for nmrpflash to report success. The router will reboot automatically.",
      "If nmrpflash times out, try again within 2 minutes of powering on the router — the NMRP window is time-limited.",
    ],
    requiredTools: [
      "nmrpflash (open-source tool)",
      "Ethernet cable",
      "Correct firmware file from Netgear",
    ],
    difficulty: 2,
    keywords: [
      "netgear",
      "nmrpflash",
      "nmrp",
      "tftp",
      "recovery",
      "nighthawk",
      "brick",
    ],
  },
  {
    id: "tftp-ubiquiti",
    name: "Ubiquiti TFTP Recovery",
    brand: "ubiquiti",
    category: "tftp-recovery",
    description:
      "Ubiquiti devices (UniFi APs, EdgeRouters) have a built-in TFTP recovery mode activated by holding the reset button during power-on.",
    steps: [
      "Download the correct firmware .bin file from ui.com/download.",
      "Set your PC's IP to 192.168.1.20 with subnet 255.255.255.0.",
      "Start a TFTP server on your PC with the firmware file in the root directory.",
      "Connect your PC to the device's main Ethernet port (port 0 / PoE port for APs).",
      "Power off the device. Press and hold the reset button.",
      "Apply power (plug in PoE for APs, or power adapter for EdgeRouters). Continue holding reset.",
      "For UniFi APs: hold reset until the LED cycles through white-blue-off (~10 seconds). Release.",
      "For EdgeRouters: hold reset for 10-15 seconds until the port LEDs flash together. Release.",
      "The device will request firmware.bin (or the model-specific filename) via TFTP from 192.168.1.20.",
      "Wait 3-5 minutes for flashing to complete. Do not interrupt power.",
      "Device will reboot to factory defaults. Re-adopt in UniFi Controller or reconfigure.",
    ],
    requiredTools: [
      "TFTP server software",
      "Ethernet cable (or PoE injector for APs)",
      "Correct firmware .bin file",
    ],
    difficulty: 2,
    keywords: [
      "ubiquiti",
      "ubnt",
      "unifi",
      "edgerouter",
      "tftp",
      "recovery",
      "192.168.1.20",
    ],
  },

  // ── Serial Console ─────────────────────────────────────────────────────
  {
    id: "serial-uart-generic",
    name: "Generic UART Serial Console Access",
    brand: "generic",
    category: "serial-console",
    description:
      "Access the router's serial console via UART pads on the PCB. Most routers expose TX, RX, GND, and sometimes VCC pads for debugging.",
    steps: [
      "Open the router case. Locate the UART header — usually 4 pads or a pin header labeled TX, RX, GND, VCC (or J1, J2, etc.).",
      "Identify the pads: GND (continuity with ground plane), VCC (3.3V — do NOT connect), TX (outputs serial data), RX (receives data).",
      "Connect a USB-to-UART adapter (e.g., FTDI FT232, CP2102, CH340G) at 3.3V logic level. NEVER use 5V — it will damage the SoC.",
      "Wire: Router TX -> Adapter RX, Router RX -> Adapter TX, Router GND -> Adapter GND. Do NOT connect VCC.",
      "Open a serial terminal: screen /dev/ttyUSB0 115200 (Linux/macOS) or PuTTY on Windows.",
      "Common baud rates: 115200 (most common), 57600 (some Netgear), 9600 (rare). Settings: 8N1 (8 data bits, no parity, 1 stop bit).",
      "Power on the router. You should see bootloader output followed by kernel boot messages.",
      "If you see garbled text, try different baud rates. If no output at all, swap TX and RX wires.",
      "To interact with the bootloader, you need to press a key during the early boot countdown (see U-Boot interrupt procedure).",
    ],
    requiredTools: [
      "USB-to-UART adapter (3.3V logic — FTDI FT232RL, CP2102, CH340G)",
      "Dupont jumper wires or soldering iron for headerless boards",
      "Serial terminal software (screen, minicom, PuTTY)",
      "Multimeter (to identify pads)",
    ],
    difficulty: 3,
    keywords: [
      "uart",
      "serial",
      "console",
      "tx",
      "rx",
      "gnd",
      "115200",
      "ttl",
      "3.3v",
      "debug",
      "ftdi",
    ],
  },
  {
    id: "serial-uboot-interrupt",
    name: "U-Boot Bootloader Shell Access",
    brand: "generic",
    category: "serial-console",
    description:
      "Interrupt the U-Boot boot process to access the bootloader command shell. From the U-Boot shell you can TFTP flash firmware, erase partitions, or examine flash contents.",
    steps: [
      "Establish a serial console connection (see UART Serial Console Access procedure).",
      "Power on the router and watch the serial output carefully.",
      "When you see 'Hit any key to stop autoboot' (or similar countdown), press Enter, Space, or any key rapidly.",
      "Some vendors use a specific key: 'tpl' for TP-Link, '1' or '2' for some Qualcomm boards. If a generic key does not work, try these.",
      "You should see a U-Boot prompt: 'ar7240>' or 'IPQ40xx>' or 'MT7621 #' or 'ath>' depending on the SoC.",
      "Useful commands: 'printenv' (show environment), 'setenv' (set variable), 'saveenv' (persist changes).",
      "To TFTP flash: 'setenv ipaddr 192.168.1.1' then 'setenv serverip 192.168.1.2' then 'tftpboot 0x80060000 firmware.bin'.",
      "After TFTP download: 'erase 0x9f050000 +0xFA0000' (erase firmware partition), then 'cp.b 0x80060000 0x9f050000 $filesize' (write).",
      "Run 'bootm' or 'reset' to boot the new firmware.",
      "WARNING: Incorrect erase/write addresses will brick the device further. Always verify partition offsets for your specific model.",
    ],
    requiredTools: [
      "UART serial connection (already established)",
      "TFTP server with firmware file",
      "Ethernet cable connected to the router",
      "Partition map for the specific router model",
    ],
    difficulty: 4,
    keywords: [
      "u-boot",
      "uboot",
      "bootloader",
      "shell",
      "interrupt",
      "autoboot",
      "tftpboot",
      "serial",
      "command",
    ],
  },
  {
    id: "serial-cfe-recovery",
    name: "Broadcom CFE Recovery (Asus / older Linksys)",
    brand: "asus",
    category: "serial-console",
    description:
      "Broadcom-based routers (Asus, older Linksys WRT) use CFE (Common Firmware Environment) as their bootloader. CFE has a minimal recovery mode accessible via serial console.",
    steps: [
      "Establish UART serial connection at 115200 baud, 8N1, 3.3V.",
      "Power on and rapidly press Ctrl+C during the CFE countdown (typically 3 seconds).",
      "You should see 'CFE>' prompt.",
      "To enter web recovery: 'setenv ipaddr 192.168.1.1' then 'saveenv' then type 'web' — this starts a minimal HTTP server for firmware upload.",
      "Alternatively, use TFTP: 'ifconfig eth0 -addr=192.168.1.1 -mask=255.255.255.0'.",
      "Then: 'flash -noheader 192.168.1.2:firmware.trx flash1.trx' — this downloads and flashes from your TFTP server.",
      "Wait for the flash to complete. CFE will report progress.",
      "Type 'reboot' or power cycle to boot the new firmware.",
      "For Asus routers: the rescue mode (hold reset 10s on power-on) also activates CFE's TFTP listener on 192.168.1.1, which is easier than serial.",
    ],
    requiredTools: [
      "UART serial connection (3.3V)",
      "TFTP server or web browser for CFE web recovery",
      "Firmware file in .trx format (for Asus/Broadcom)",
    ],
    difficulty: 3,
    keywords: [
      "cfe",
      "broadcom",
      "asus",
      "linksys",
      "wrt",
      "ctrl-c",
      "recovery",
      "trx",
      "rescue",
    ],
  },

  // ── SPI Flash ──────────────────────────────────────────────────────────
  {
    id: "spi-flash-direct",
    name: "Direct SPI Flash Programming (CH341A / CH347)",
    brand: "generic",
    category: "spi-flash",
    description:
      "Use a CH341A or CH347 USB SPI programmer with a SOIC-8 clip to directly read/write the flash chip on the router PCB. This is biospy's primary use case for router recovery.",
    steps: [
      "Identify the SPI flash chip on the router PCB. It is typically a SOIC-8 package near the SoC, labeled W25Qxxx, MX25Lxxx, GD25Qxxx, etc.",
      "IMPORTANT: Disconnect all power from the router. The SPI programmer supplies its own power to the flash chip via the SOIC-8 clip.",
      "Attach the SOIC-8 test clip to the flash chip. Pin 1 is indicated by a dot on the chip. Ensure good contact on all 8 pins.",
      "Connect the clip to your CH341A or CH347 programmer. Match the pin 1 orientation.",
      "Run: biospy read --output backup.bin  to create a full backup of the current flash contents.",
      "Verify the backup: biospy verify --file backup.bin  — ensure the read is consistent (read twice and compare).",
      "CRITICAL: Store the backup safely. It contains the ART/calibration partition, which is unique to this specific unit.",
      "Prepare the new firmware: for a full flash image, it must include bootloader + firmware + ART. For firmware-only, use dd to splice it into the backup at the correct offset.",
      "Example splice: dd if=openwrt-sysupgrade.bin of=backup.bin bs=1 seek=$((0x050000)) conv=notrunc  (adjust offset for your model).",
      "Flash: biospy write --file full-image.bin  — this writes the entire flash contents.",
      "Verify: biospy verify --file full-image.bin  — read back and compare.",
      "Remove the clip, reconnect power, and test. The router should boot with the new firmware.",
    ],
    requiredTools: [
      "CH341A or CH347 USB SPI programmer",
      "SOIC-8 test clip (Pomona 5250 or equivalent)",
      "biospy CLI tool",
      "Firmware image file",
      "dd or hex editor for image manipulation",
    ],
    difficulty: 3,
    keywords: [
      "spi",
      "flash",
      "programmer",
      "ch341a",
      "ch347",
      "soic8",
      "clip",
      "read",
      "write",
      "backup",
      "biospy",
      "direct",
    ],
  },
  {
    id: "spi-soic8-clip",
    name: "SOIC-8 Clip Usage and Troubleshooting",
    brand: "generic",
    category: "spi-flash",
    description:
      "Detailed procedure for using a SOIC-8 test clip (Pomona 5250 or similar) to connect to SPI NOR flash chips on router PCBs. Covers common issues and troubleshooting.",
    steps: [
      "Identify flash chip orientation: pin 1 has a dot, notch, or circle on the chip package. Pin 1 is CS# (chip select).",
      "SOIC-8 SPI NOR pinout: 1=CS#, 2=DO (MISO), 3=WP#, 4=GND, 5=DI (MOSI), 6=CLK, 7=HOLD#, 8=VCC.",
      "Clean the chip leads with isopropyl alcohol (IPA) and a brush. Flux residue or corrosion causes bad contact.",
      "Align the clip with pin 1 and press firmly. The clip should grip all 8 leads evenly.",
      "If the clip does not grip well: (a) try approaching from a different angle, (b) remove nearby capacitors temporarily if they block access, (c) solder thin wires to the pads as a last resort.",
      "Common read failures: (a) 0xFF everywhere = no contact or chip not powered, (b) 0x00 everywhere = wrong chip or SoC interfering, (c) inconsistent reads = poor contact on one pin.",
      "If reads are inconsistent: remove the clip, reattach, and try again. Read 3 times and compare with md5sum.",
      "SoC interference: some SoCs hold the SPI bus even when powered off. Lifting the CS# pin (pin 1) from the SoC side or desoldering the chip may be required.",
      "For CH341A at 3.3V: ensure your CH341A has the 3.3V modification if the chip is 3.3V-only (most are). The stock CH341A outputs ~5V on VCC, which can damage 3.3V flash chips.",
      "For CH347: no voltage modification needed — CH347 outputs clean 3.3V natively.",
    ],
    requiredTools: [
      "SOIC-8 test clip (Pomona 5250 or compatible)",
      "CH341A (3.3V modded) or CH347 programmer",
      "Isopropyl alcohol and brush",
      "Multimeter for continuity and voltage checks",
    ],
    difficulty: 3,
    keywords: [
      "soic8",
      "clip",
      "pomona",
      "5250",
      "contact",
      "troubleshoot",
      "pin",
      "orientation",
      "cs",
      "miso",
      "mosi",
    ],
  },
  {
    id: "spi-full-backup",
    name: "Full Flash Backup Before Any Write",
    brand: "generic",
    category: "spi-flash",
    description:
      "Essential procedure: always create and verify a full flash backup before writing anything. The backup preserves calibration data, MAC addresses, and bootloader configuration that cannot be recovered otherwise.",
    steps: [
      "Connect the SPI programmer and SOIC-8 clip as described in the direct SPI flash procedure.",
      "Read the full flash: biospy read --output router-backup-1.bin",
      "Read again: biospy read --output router-backup-2.bin",
      "Compare: diff router-backup-1.bin router-backup-2.bin  OR  md5sum router-backup-1.bin router-backup-2.bin",
      "If the files differ, the clip contact is unreliable. Remove and reattach the clip, then repeat from step 2.",
      "If the files match, the backup is trustworthy. Store both copies in separate locations.",
      "Extract and separately back up critical partitions: dd if=router-backup-1.bin of=art-backup.bin bs=1 skip=$((ART_OFFSET)) count=$((ART_SIZE))",
      "Label the backup with the router model, date, MAC address (from the router label), and flash chip model.",
      "NEVER skip this step. The ART/calibration partition is factory-programmed and unique to each unit. Without it, the wireless radios will not function correctly (or at all).",
    ],
    requiredTools: [
      "SPI programmer + SOIC-8 clip (already connected)",
      "biospy CLI tool",
      "Sufficient disk space for 2x flash size",
      "md5sum / sha256sum for verification",
    ],
    difficulty: 2,
    keywords: [
      "backup",
      "full",
      "dump",
      "read",
      "verify",
      "art",
      "calibration",
      "mac",
      "preserve",
      "safety",
    ],
  },

  // ── Failsafe / Vendor Recovery ─────────────────────────────────────────
  {
    id: "failsafe-openwrt",
    name: "OpenWrt Failsafe Mode",
    brand: "openwrt",
    category: "failsafe-mode",
    description:
      "OpenWrt includes a failsafe mode that boots a minimal system from the read-only squashfs partition, ignoring all user configuration. Useful when a misconfiguration locks you out.",
    steps: [
      "Connect your PC to a LAN port on the router via Ethernet.",
      "Power on the router and watch the LEDs.",
      "During boot, rapidly press a button to trigger failsafe. The method varies: press and release the reset button when a specific LED starts flashing (usually 1-2 seconds into boot), or press a key on the serial console when prompted with 'Press the [f] key and hit [enter] to enter failsafe mode'.",
      "If successful, the LED will flash rapidly in a distinctive pattern (varies by device).",
      "Set your PC's IP to 192.168.1.2/24.",
      "SSH or Telnet to 192.168.1.1 (depending on OpenWrt version): ssh root@192.168.1.1",
      "In failsafe mode, the overlay filesystem (jffs2) is not mounted. User changes are invisible.",
      "To reset all settings: run 'firstboot' then 'reboot'. This erases the jffs2 overlay and returns to defaults.",
      "To mount the overlay and fix specific settings: run 'mount_root' then edit /etc/config/ files manually.",
      "After fixing, run 'reboot' to restart with the corrected configuration.",
    ],
    requiredTools: [
      "Ethernet cable",
      "SSH or Telnet client",
      "Knowledge of which LED/button triggers failsafe on the specific device",
    ],
    difficulty: 2,
    keywords: [
      "openwrt",
      "failsafe",
      "locked",
      "out",
      "reset",
      "firstboot",
      "jffs2",
      "overlay",
      "misconfiguration",
    ],
  },
  {
    id: "failsafe-mikrotik-netinstall",
    name: "MikroTik Netinstall Recovery",
    brand: "mikrotik",
    category: "failsafe-mode",
    description:
      "MikroTik's Netinstall tool reinstalls RouterOS over Ethernet. Works even when the router is completely bricked (as long as RouterBOOT is intact).",
    steps: [
      "Download Netinstall from mikrotik.com/download (Windows .exe or Wine-compatible).",
      "Download the correct RouterOS .npk package for your architecture (e.g., routeros-7.x-mipsbe.npk for MT7621 devices).",
      "Connect your PC directly to the router's Ethernet port 1 (boot port) with a cable.",
      "Set your PC's IP to 192.168.88.2/24 (or any IP in the same subnet you will configure in Netinstall).",
      "Run Netinstall. In the 'Net Booting' section, check 'Boot Server enabled' and set the server IP to 192.168.88.2.",
      "Browse to select the .npk file(s) you downloaded.",
      "Power off the router. Press and hold the reset button.",
      "Power on the router while holding reset. Hold for 15-20 seconds until the device appears in Netinstall's device list.",
      "Release reset. Select the device in Netinstall, set the target IP (e.g., 192.168.88.3), and click 'Install'.",
      "Wait for the installation to complete. Netinstall will show progress.",
      "The router will reboot with factory-default RouterOS. Default login: admin / (empty password).",
      "WARNING: Netinstall reformats the firmware partition. User configuration is lost. hard-config (license, MAC) is preserved.",
    ],
    requiredTools: [
      "MikroTik Netinstall software (Windows or Wine)",
      "Ethernet cable",
      "RouterOS .npk package file",
    ],
    difficulty: 2,
    keywords: [
      "mikrotik",
      "netinstall",
      "routeros",
      "routerboard",
      "reinstall",
      "boot",
      "server",
      "npk",
      "recovery",
    ],
  },
  {
    id: "failsafe-ubiquiti-reset",
    name: "Ubiquiti Factory Reset via Reset Button",
    brand: "ubiquiti",
    category: "failsafe-mode",
    description:
      "Ubiquiti devices support a hardware reset to factory defaults by holding the reset button. This restores the stock firmware configuration without reflashing.",
    steps: [
      "Locate the reset button on the device (small pinhole on UniFi APs, recessed button on EdgeRouters).",
      "With the device powered on and fully booted, press and hold the reset button using a pin or paperclip.",
      "Hold for 10+ seconds. On UniFi APs, the LED will change color (often to flashing white).",
      "Release the button. The device will reboot to factory defaults.",
      "For UniFi APs: the device will enter adoption mode (broadcasting default SSID or waiting for controller discovery).",
      "For EdgeRouters: default IP is 192.168.1.1, login admin/ubnt.",
      "If this does not work (device is bricked, not booting), use the TFTP recovery method instead.",
    ],
    requiredTools: [
      "Pin or paperclip for reset button",
      "Ethernet cable for re-configuration after reset",
    ],
    difficulty: 1,
    keywords: [
      "ubiquiti",
      "ubnt",
      "reset",
      "factory",
      "defaults",
      "button",
      "unifi",
      "edgerouter",
    ],
  },

  // ── JTAG ───────────────────────────────────────────────────────────────
  {
    id: "jtag-atheros-qca",
    name: "JTAG Recovery for Atheros/QCA Routers",
    brand: "generic",
    category: "jtag",
    description:
      "JTAG provides the lowest-level access to the router's CPU and memory bus. It can recover devices where even the bootloader is corrupted. Requires a JTAG adapter and knowledge of the target's JTAG pinout.",
    steps: [
      "Identify the JTAG header on the PCB. Atheros/QCA routers typically have a 14-pin or 12-pin EJTAG header (2x7 or 2x6 pin grid, 2.54mm pitch). Some boards have unpopulated pads.",
      "If pads are unpopulated, solder a pin header. Standard MIPS EJTAG pinout: 1=TRST#, 3=TDI, 5=TDO, 7=TMS, 9=TCK, 11=SRST#, 13=DINT. Even pins are GND or VCC.",
      "Connect a JTAG adapter. Recommended: FT2232H-based adapter (fast), or a USB Blaster clone. Avoid parallel-port adapters (slow and unreliable).",
      "Install OpenOCD: apt install openocd (Linux) or brew install openocd (macOS).",
      "Create an OpenOCD configuration file for your target. Example for AR9344:\n  interface ftdi\n  ftdi_vid_pid 0x0403 0x6010\n  adapter_khz 500\n  transport select jtag\n  target create ar9344.cpu mips_m4k -chain-position ar9344.cpu",
      "Run: openocd -f your-config.cfg  — OpenOCD should detect the TAP and halt the CPU.",
      "From a separate terminal, connect via telnet: telnet localhost 4444",
      "To read flash: 'flash read_bank 0 backup.bin' (if flash driver is configured) or use 'mdw' to manually read memory-mapped flash regions.",
      "To write bootloader: 'flash write_image erase u-boot.bin 0x9F000000' (adjust base address for your SoC's flash mapping).",
      "Reset the CPU: 'reset run' — the device should boot with the restored bootloader.",
      "JTAG is the last resort. If JTAG fails, the CPU itself may be damaged.",
    ],
    requiredTools: [
      "JTAG adapter (FT2232H-based recommended)",
      "OpenOCD software",
      "Soldering iron (for unpopulated JTAG headers)",
      "JTAG pinout reference for the specific router",
      "Bootloader binary (U-Boot or CFE)",
    ],
    difficulty: 5,
    keywords: [
      "jtag",
      "ejtag",
      "openocd",
      "atheros",
      "qca",
      "mips",
      "tap",
      "debug",
      "last-resort",
      "bootloader",
      "corrupt",
    ],
  },
  {
    id: "jtag-openocd-config",
    name: "OpenOCD Configuration for Common Router SoCs",
    brand: "generic",
    category: "jtag",
    description:
      "Reference configurations and tips for using OpenOCD with common router SoCs (Atheros, Qualcomm, MediaTek). Covers adapter setup, clock speed, and flash drivers.",
    steps: [
      "Install OpenOCD 0.12+ for best SoC support. Older versions may lack drivers for newer targets.",
      "Adapter selection: FT2232H is the gold standard (fast, reliable, widely supported). Set adapter speed to 500 KHz initially, increase to 2-4 MHz after confirming connectivity.",
      "Atheros AR71xx/AR9xxx: MIPS 24K/74K core. Use 'target create ... mips_m4k'. Flash is memory-mapped at 0x9F000000. SPI flash driver: 'flash bank ... cfi'.",
      "Qualcomm IPQ40xx: ARM Cortex-A7 quad-core. Use 'target create ... cortex_a'. May require SRST for reliable halt. DAP-based access.",
      "MediaTek MT7621: MIPS 1004Kc dual-core. Use 'target create ... mips_m4k'. JTAG clock must be <2 MHz. SPI flash at 0xBC000000.",
      "Broadcom BCM47xx/BCM49xx: MIPS 74K or ARM Cortex-A. Older BCM47xx use 'target create ... mips_m4k'. BCM49xx ARM targets use 'cortex_a'.",
      "Common issues: (a) 'Error: JTAG scan chain interrogation failed' — check wiring, ensure TRST# and SRST# are connected, try lower clock. (b) 'Error: no flash driver' — add appropriate flash bank configuration.",
      "After connecting, always verify with 'targets' and 'mdw 0x0 4' to confirm you can read memory.",
      "For SPI flash access through JTAG, you may need to bit-bang the SPI protocol via GPIO if no native SPI flash driver exists for the target.",
    ],
    requiredTools: [
      "OpenOCD 0.12+",
      "FT2232H JTAG adapter",
      "Target-specific configuration files",
      "Datasheet for the specific router SoC",
    ],
    difficulty: 5,
    keywords: [
      "openocd",
      "config",
      "configuration",
      "ft2232",
      "adapter",
      "atheros",
      "qualcomm",
      "mediatek",
      "broadcom",
      "jtag",
      "setup",
    ],
  },
];

// ---------------------------------------------------------------------------
// Search / lookup helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a query string for matching: lowercase, collapse whitespace.
 */
function normalizeQuery(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Resolve brand synonyms for a term. Returns the canonical brand name
 * if found, otherwise returns the original term.
 */
function resolveSynonym(term: string): string {
  return ROUTER_SYNONYMS[term] ?? term;
}

/**
 * Score a record's keyword list against a set of query tokens.
 * Each keyword matched by any token earns 1 point.
 * A token that matches the brand earns 2 extra points.
 */
function scoreKeywords(
  keywords: string[],
  tokens: string[],
  brand: string,
): number {
  let score = 0;
  for (const token of tokens) {
    const resolved = resolveSynonym(token);
    if (resolved === brand) {
      score += 2;
    }
    for (const kw of keywords) {
      if (kw.includes(token) || token.includes(kw)) {
        score += 1;
      }
    }
  }
  return score;
}

/**
 * Search the router firmware layout database by free-text query.
 * Returns matching layouts sorted by relevance score (descending).
 */
export function lookupRouterFirmware(query: string): RouterFirmwareLayout[] {
  const norm = normalizeQuery(query);
  if (norm.length === 0) return [];

  const tokens = norm.split(" ");

  const scored: Array<{ layout: RouterFirmwareLayout; score: number }> = [];

  for (const layout of ROUTER_FIRMWARE_LAYOUTS) {
    let score = scoreKeywords(tokens, tokens, layout.brand);

    // Direct substring match on id / series gives bonus
    const seriesLower = layout.series.toLowerCase();
    const idLower = layout.id;
    for (const token of tokens) {
      if (seriesLower.includes(token)) score += 3;
      if (idLower.includes(token)) score += 3;
    }

    // Re-score keywords properly (first call above used tokens for both args)
    score = 0;
    for (const token of tokens) {
      const resolved = resolveSynonym(token);
      if (resolved === layout.brand) score += 2;
      for (const kw of layout.keywords) {
        if (kw.includes(token) || token.includes(kw)) score += 1;
      }
      if (seriesLower.includes(token)) score += 3;
      if (idLower.includes(token)) score += 3;
    }

    if (score > 0) {
      scored.push({ layout, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.layout);
}

/**
 * Search recovery procedures by free-text query.
 * Returns matching procedures sorted by relevance score (descending).
 */
export function searchRouterRecovery(
  query: string,
): RouterRecoveryProcedure[] {
  const norm = normalizeQuery(query);
  if (norm.length === 0) return [];

  const tokens = norm.split(" ");

  const scored: Array<{
    procedure: RouterRecoveryProcedure;
    score: number;
  }> = [];

  for (const procedure of ROUTER_RECOVERY_PROCEDURES) {
    let score = 0;
    const nameLower = procedure.name.toLowerCase();
    const descLower = procedure.description.toLowerCase();
    const idLower = procedure.id;

    for (const token of tokens) {
      const resolved = resolveSynonym(token);
      if (
        resolved === procedure.brand ||
        (procedure.brand === "generic" && resolved !== token)
      ) {
        score += 2;
      }
      for (const kw of procedure.keywords) {
        if (kw.includes(token) || token.includes(kw)) score += 1;
      }
      if (nameLower.includes(token)) score += 3;
      if (idLower.includes(token)) score += 2;
      if (descLower.includes(token)) score += 1;
      if (token === procedure.category) score += 4;
    }

    if (score > 0) {
      scored.push({ procedure, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.procedure);
}

/**
 * Get all firmware layouts for a specific brand.
 * Accepts brand names and common synonyms.
 */
export function getRouterByBrand(brand: string): RouterFirmwareLayout[] {
  const resolved = resolveSynonym(normalizeQuery(brand));
  return ROUTER_FIRMWARE_LAYOUTS.filter((l) => l.brand === resolved);
}

/**
 * Get all recovery procedures for a specific brand.
 * Accepts brand names and common synonyms. Also includes
 * generic procedures that apply to all brands.
 */
export function getRecoveryByBrand(brand: string): RouterRecoveryProcedure[] {
  const resolved = resolveSynonym(normalizeQuery(brand));
  return ROUTER_RECOVERY_PROCEDURES.filter(
    (p) => p.brand === resolved || p.brand === "generic",
  );
}
