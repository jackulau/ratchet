// ── Interfaces ────────────────────────────────────────────────────────────────

export interface McuInfo {
  id: string;
  manufacturer: string;
  family: string;
  partNumber: string;
  core: string;
  flashSize: string;
  ramSize: string;
  package: string;
  programmingInterface: string[];
  voltage: string;
  spiFlashable: boolean;
  bootloaderRecovery: string;
  keywords: string[];
}

export interface JtagPinout {
  id: string;
  name: string;
  connector: string;
  pins: Array<{ pin: number; signal: string; description: string }>;
  voltage: string;
  notes: string;
}

export interface EmbeddedFailurePattern {
  id: string;
  name: string;
  category: "flash-corruption" | "bootloader" | "power" | "clock" | "communication" | "protection";
  symptoms: string[];
  causes: Array<{ cause: string; probability: "high" | "medium" | "low" }>;
  diagnosticSteps: string[];
  repairProcedure: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
}

export interface PoEController {
  id: string;
  name: string;
  manufacturer: string;
  type: "pse" | "pd" | "both";
  standard: string;
  ports: number;
  maxPower: string;
  interface: string;
  diagnosticRegisters: string[];
  commonIssues: string[];
  keywords: string[];
}

// ── Synonym map ──────────────────────────────────────────────────────────────

export const EMBEDDED_SYNONYMS: ReadonlyMap<string, string[]> = new Map<string, string[]>([
  ["stm32", ["stm", "st", "stmicro", "stmicroelectronics", "arm", "cortex"]],
  ["esp32", ["espressif", "esp", "xtensa", "risc-v", "riscv", "wifi", "bluetooth", "ble"]],
  ["atmega", ["atmel", "avr", "arduino", "mega", "uno", "isp"]],
  ["nrf52", ["nordic", "nrf", "bluetooth", "ble", "thread", "zigbee", "matter"]],
  ["rp2040", ["raspberry", "pico", "rp", "rp2350"]],
  ["pic", ["microchip", "pic18", "pic32", "mips", "icsp"]],
  ["renesas", ["ra6m5", "rx65n", "rxv2", "automotive", "industrial"]],
  ["jtag", ["swd", "swdio", "swclk", "tdi", "tdo", "tms", "tck", "debug"]],
  ["bootloader", ["boot", "dfu", "isp", "uart boot", "usb boot", "recovery"]],
  ["flash", ["program", "erase", "write", "read", "firmware", "hex", "bin"]],
  ["protection", ["rdp", "approtect", "lock bits", "security", "fuse", "read protect"]],
  ["poe", ["power over ethernet", "802.3af", "802.3at", "802.3bt", "pse", "pd"]],
  ["brownout", ["undervoltage", "power dip", "bod", "low voltage"]],
  ["crystal", ["xtal", "oscillator", "hse", "lse", "clock source"]],
  ["pll", ["phase locked loop", "clock multiply", "dpll", "hpll"]],
  ["corruption", ["corrupt", "brick", "bricked", "bad flash", "checksum", "crc"]],
]);

// ── MCU Database ─────────────────────────────────────────────────────────────

export const MCU_DATABASE: readonly McuInfo[] = [
  // ── STM32 ──
  {
    id: "stm32f103c8t6",
    manufacturer: "STMicroelectronics",
    family: "STM32F1",
    partNumber: "STM32F103C8T6",
    core: "ARM Cortex-M3",
    flashSize: "64KB",
    ramSize: "20KB",
    package: "LQFP-48",
    programmingInterface: ["SWD", "JTAG", "UART Bootloader"],
    voltage: "2.0V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "Hold BOOT0 high on reset to enter UART/USB DFU bootloader. Connect PA9/PA10 for UART or use ST-Link SWD. System memory bootloader is factory-programmed and cannot be erased.",
    keywords: ["stm32", "blue pill", "f103", "cortex-m3", "stm32f103", "maple mini", "arm"],
  },
  {
    id: "stm32f411ceu6",
    manufacturer: "STMicroelectronics",
    family: "STM32F4",
    partNumber: "STM32F411CEU6",
    core: "ARM Cortex-M4F",
    flashSize: "512KB",
    ramSize: "128KB",
    package: "UFQFPN-48",
    programmingInterface: ["SWD", "JTAG", "UART Bootloader", "USB DFU"],
    voltage: "1.7V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "Hold BOOT0 high on reset for UART/USB DFU bootloader. SWD via PA13/PA14. Supports USB DFU natively when BOOT0 is asserted.",
    keywords: ["stm32", "black pill", "f411", "cortex-m4", "stm32f411", "weact", "arm", "dfu"],
  },
  {
    id: "stm32f407vgt6",
    manufacturer: "STMicroelectronics",
    family: "STM32F4",
    partNumber: "STM32F407VGT6",
    core: "ARM Cortex-M4F",
    flashSize: "1MB",
    ramSize: "192KB",
    package: "LQFP-100",
    programmingInterface: ["SWD", "JTAG", "UART Bootloader", "USB DFU"],
    voltage: "1.8V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "BOOT0 high + reset for system bootloader. Discovery board has onboard ST-Link for SWD. Supports UART, USB DFU, CAN, and I2C bootloader protocols.",
    keywords: ["stm32", "discovery", "f407", "cortex-m4", "stm32f407", "stm32f4discovery", "arm"],
  },
  {
    id: "stm32l476rgt6",
    manufacturer: "STMicroelectronics",
    family: "STM32L4",
    partNumber: "STM32L476RGT6",
    core: "ARM Cortex-M4F",
    flashSize: "1MB",
    ramSize: "128KB",
    package: "LQFP-64",
    programmingInterface: ["SWD", "JTAG", "UART Bootloader", "USB DFU"],
    voltage: "1.71V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "BOOT0 pin or option byte for bootloader entry. Low-power modes may interfere with SWD if device enters STOP/STANDBY before debugger attaches. Use nRST + connect under reset.",
    keywords: ["stm32", "low power", "l476", "cortex-m4", "stm32l4", "nucleo", "arm", "ultra-low-power"],
  },
  {
    id: "stm32h743zit6",
    manufacturer: "STMicroelectronics",
    family: "STM32H7",
    partNumber: "STM32H743ZIT6",
    core: "ARM Cortex-M7",
    flashSize: "2MB",
    ramSize: "1MB",
    package: "LQFP-144",
    programmingInterface: ["SWD", "JTAG", "UART Bootloader", "USB DFU"],
    voltage: "1.62V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "BOOT0 pin for bootloader entry. Dual-bank flash supports live firmware update. High-speed SWD via ST-Link V3. Complex power domain requires proper VDDA/VDDH supply for programming.",
    keywords: ["stm32", "h743", "cortex-m7", "stm32h7", "high performance", "arm", "dual bank"],
  },

  // ── ESP32 ──
  {
    id: "esp32-wroom-32",
    manufacturer: "Espressif",
    family: "ESP32",
    partNumber: "ESP32-WROOM-32",
    core: "Xtensa LX6 Dual-Core",
    flashSize: "4MB (external SPI)",
    ramSize: "520KB SRAM",
    package: "Module (18x25.5mm)",
    programmingInterface: ["UART Bootloader", "SPI (external flash)"],
    voltage: "2.2V - 3.6V",
    spiFlashable: true,
    bootloaderRecovery: "Hold GPIO0 low during reset to enter UART download mode. External SPI flash (typically W25Q32) can be read/written directly via CH341A. esptool.py for UART programming.",
    keywords: ["esp32", "wroom", "wifi", "bluetooth", "ble", "espressif", "xtensa", "iot", "spi flash"],
  },
  {
    id: "esp32-s3-wroom-1",
    manufacturer: "Espressif",
    family: "ESP32-S3",
    partNumber: "ESP32-S3-WROOM-1",
    core: "Xtensa LX7 Dual-Core + AI Accelerator",
    flashSize: "8MB (external SPI, up to 16MB)",
    ramSize: "512KB SRAM + 8MB PSRAM (optional)",
    package: "Module (18x25.5mm)",
    programmingInterface: ["UART Bootloader", "USB-JTAG", "USB Serial/JTAG", "SPI (external flash)"],
    voltage: "3.0V - 3.6V",
    spiFlashable: true,
    bootloaderRecovery: "GPIO0 low + reset for UART download. Native USB-JTAG on GPIO19/GPIO20 for debugging without external adapter. USB Serial/JTAG allows flashing via USB CDC.",
    keywords: ["esp32-s3", "s3", "wifi", "bluetooth", "ble", "espressif", "xtensa", "ai", "usb", "vector"],
  },
  {
    id: "esp32-c3-mini-1",
    manufacturer: "Espressif",
    family: "ESP32-C3",
    partNumber: "ESP32-C3-MINI-1",
    core: "RISC-V Single-Core (160MHz)",
    flashSize: "4MB (external SPI)",
    ramSize: "400KB SRAM",
    package: "Module (13.2x16.6mm)",
    programmingInterface: ["UART Bootloader", "USB Serial/JTAG", "SPI (external flash)"],
    voltage: "3.0V - 3.6V",
    spiFlashable: true,
    bootloaderRecovery: "GPIO9 low + reset for UART download mode. Built-in USB Serial/JTAG on GPIO18/GPIO19. RISC-V core uses different toolchain than Xtensa variants.",
    keywords: ["esp32-c3", "c3", "risc-v", "riscv", "wifi", "ble", "espressif", "low cost"],
  },

  // ── ATmega ──
  {
    id: "atmega328p",
    manufacturer: "Microchip (Atmel)",
    family: "ATmega",
    partNumber: "ATmega328P",
    core: "AVR 8-bit",
    flashSize: "32KB",
    ramSize: "2KB SRAM",
    package: "DIP-28 / TQFP-32",
    programmingInterface: ["ISP (SPI)", "HVPP (High-Voltage Parallel)", "UART Bootloader (Arduino)"],
    voltage: "1.8V - 5.5V",
    spiFlashable: false,
    bootloaderRecovery: "ISP via SPI pins (MOSI/MISO/SCK/RST). If fuses are misconfigured, use HVPP (12V on RST) to recover. Arduino bootloader occupies top 512B-2KB of flash. Burn bootloader via ISP to restore.",
    keywords: ["atmega328p", "arduino uno", "avr", "atmel", "isp", "nano", "pro mini"],
  },
  {
    id: "atmega2560",
    manufacturer: "Microchip (Atmel)",
    family: "ATmega",
    partNumber: "ATmega2560",
    core: "AVR 8-bit",
    flashSize: "256KB",
    ramSize: "8KB SRAM",
    package: "TQFP-100",
    programmingInterface: ["ISP (SPI)", "JTAG", "HVPP", "UART Bootloader (Arduino)"],
    voltage: "1.8V - 5.5V",
    spiFlashable: false,
    bootloaderRecovery: "ISP via SPI header or JTAG. Has full JTAG support unlike ATmega328P. Bootloader (stk500v2) is 8KB. HVPP requires 12V on RST for fuse recovery.",
    keywords: ["atmega2560", "arduino mega", "avr", "atmel", "jtag", "isp"],
  },
  {
    id: "attiny85",
    manufacturer: "Microchip (Atmel)",
    family: "ATtiny",
    partNumber: "ATtiny85",
    core: "AVR 8-bit",
    flashSize: "8KB",
    ramSize: "512B SRAM",
    package: "DIP-8 / SOIC-8",
    programmingInterface: ["ISP (SPI)", "HVSP (High-Voltage Serial)"],
    voltage: "1.8V - 5.5V",
    spiFlashable: false,
    bootloaderRecovery: "ISP via SPI (uses PB0-PB2 + RST). HVSP recovery with 12V on RST if RSTDISBL fuse set. Micronucleus bootloader enables USB programming via V-USB on PB3/PB4 (Digispark).",
    keywords: ["attiny85", "attiny", "avr", "digispark", "tiny", "8-pin", "soic"],
  },

  // ── nRF52 ──
  {
    id: "nrf52832",
    manufacturer: "Nordic Semiconductor",
    family: "nRF52",
    partNumber: "nRF52832",
    core: "ARM Cortex-M4F",
    flashSize: "512KB",
    ramSize: "64KB",
    package: "QFN-48 / WLCSP",
    programmingInterface: ["SWD"],
    voltage: "1.7V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "SWD via SWDIO/SWCLK. If APPROTECT is enabled, full chip erase required to regain debug access (erases all flash). Nordic DFU bootloader supports OTA updates via BLE. Use nrfjprog or J-Link.",
    keywords: ["nrf52832", "nrf52", "nordic", "ble", "bluetooth", "swd", "softdevice"],
  },
  {
    id: "nrf52840",
    manufacturer: "Nordic Semiconductor",
    family: "nRF52",
    partNumber: "nRF52840",
    core: "ARM Cortex-M4F",
    flashSize: "1MB",
    ramSize: "256KB",
    package: "aQFN-73 / WLCSP",
    programmingInterface: ["SWD", "USB DFU"],
    voltage: "1.7V - 5.5V (with internal regulator)",
    spiFlashable: false,
    bootloaderRecovery: "SWD via J-Link or CMSIS-DAP. Native USB for DFU bootloader (Adafruit UF2 or Nordic DFU). APPROTECT recovery requires full erase. Supports Thread, Zigbee, and BLE 5.0 stacks.",
    keywords: ["nrf52840", "nrf52", "nordic", "ble", "bluetooth", "usb", "thread", "zigbee", "dongle", "matter"],
  },
  {
    id: "nrf5340",
    manufacturer: "Nordic Semiconductor",
    family: "nRF53",
    partNumber: "nRF5340",
    core: "Dual ARM Cortex-M33 (Application + Network)",
    flashSize: "1MB (App) + 256KB (Net)",
    ramSize: "512KB (App) + 64KB (Net)",
    package: "aQFN-94 / WLCSP",
    programmingInterface: ["SWD"],
    voltage: "1.7V - 5.5V",
    spiFlashable: false,
    bootloaderRecovery: "SWD access to both application and network cores independently. APPROTECT on each core separately. MCUboot bootloader recommended for secure OTA. TrustZone for ARM on application core.",
    keywords: ["nrf5340", "nrf53", "nordic", "ble 5.3", "dual core", "trustzone", "cortex-m33"],
  },

  // ── RP2040 / RP2350 ──
  {
    id: "rp2040",
    manufacturer: "Raspberry Pi",
    family: "RP2040",
    partNumber: "RP2040",
    core: "Dual ARM Cortex-M0+",
    flashSize: "External SPI (typically 2-16MB)",
    ramSize: "264KB SRAM",
    package: "QFN-56 (7x7mm)",
    programmingInterface: ["SWD", "USB UF2 Bootloader", "SPI (external flash)"],
    voltage: "1.8V - 3.3V (core: 1.1V internal regulator)",
    spiFlashable: true,
    bootloaderRecovery: "Hold BOOTSEL button while plugging USB to enter UF2 mass-storage bootloader. ROM bootloader is permanent and cannot be bricked. SWD via GPIO pads. External SPI flash can be reprogrammed directly via CH341A.",
    keywords: ["rp2040", "raspberry pi", "pico", "uf2", "pio", "cortex-m0+", "spi flash"],
  },
  {
    id: "rp2350",
    manufacturer: "Raspberry Pi",
    family: "RP2350",
    partNumber: "RP2350",
    core: "Dual ARM Cortex-M33 / Hazard3 RISC-V (switchable)",
    flashSize: "External SPI (typically 2-16MB)",
    ramSize: "520KB SRAM",
    package: "QFN-60 (7x7mm)",
    programmingInterface: ["SWD", "USB UF2 Bootloader", "SPI (external flash)"],
    voltage: "1.8V - 3.3V",
    spiFlashable: true,
    bootloaderRecovery: "BOOTSEL button + USB for UF2 bootloader (same as RP2040). Dual architecture (ARM/RISC-V) selectable at boot. ROM bootloader is permanent. Supports secure boot with OTP fuses.",
    keywords: ["rp2350", "raspberry pi", "pico 2", "uf2", "cortex-m33", "risc-v", "hazard3", "spi flash"],
  },

  // ── PIC ──
  {
    id: "pic18f4550",
    manufacturer: "Microchip",
    family: "PIC18",
    partNumber: "PIC18F4550",
    core: "PIC18 8-bit",
    flashSize: "32KB",
    ramSize: "2KB SRAM",
    package: "DIP-40 / TQFP-44",
    programmingInterface: ["ICSP", "USB Bootloader"],
    voltage: "2.0V - 5.5V",
    spiFlashable: false,
    bootloaderRecovery: "ICSP via PGC/PGD pins (requires Vpp on MCLR). USB bootloader (HID-based) if pre-programmed. PICkit programmer for ICSP. Code protection bits can prevent readback but not reprogramming.",
    keywords: ["pic18f4550", "pic18", "pic", "microchip", "usb", "icsp", "dip-40"],
  },
  {
    id: "pic32mx795f512l",
    manufacturer: "Microchip",
    family: "PIC32MX",
    partNumber: "PIC32MX795F512L",
    core: "MIPS M4K 32-bit",
    flashSize: "512KB",
    ramSize: "128KB SRAM",
    package: "TQFP-100",
    programmingInterface: ["JTAG", "ICSP", "USB Bootloader"],
    voltage: "2.3V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "JTAG for full debug access. ICSP via PGC/PGD pins. Microchip AN1388 USB HID bootloader. JTAG supports boundary scan for board-level testing.",
    keywords: ["pic32mx", "pic32", "mips", "microchip", "jtag", "ethernet", "usb host"],
  },

  // ── Renesas ──
  {
    id: "ra6m5",
    manufacturer: "Renesas",
    family: "RA6",
    partNumber: "RA6M5 (R7FA6M5BH3CFC)",
    core: "ARM Cortex-M33 + TrustZone",
    flashSize: "2MB",
    ramSize: "512KB SRAM",
    package: "LQFP-176 / BGA-224",
    programmingInterface: ["SWD", "JTAG", "UART/USB Bootloader"],
    voltage: "1.6V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "SWD/JTAG via Renesas E2 emulator or J-Link. Factory boot firmware supports UART and USB programming. MD pin controls boot mode. TrustZone secure/non-secure flash regions.",
    keywords: ["ra6m5", "renesas", "cortex-m33", "trustzone", "automotive", "industrial", "ra"],
  },
  {
    id: "rx65n",
    manufacturer: "Renesas",
    family: "RX65N",
    partNumber: "RX65N (R5F565NEDxFP)",
    core: "RXv2 32-bit",
    flashSize: "2MB",
    ramSize: "640KB SRAM",
    package: "LQFP-176 / BGA-177",
    programmingInterface: ["JTAG", "FINE (single-wire)", "UART Bootloader"],
    voltage: "2.7V - 3.6V",
    spiFlashable: false,
    bootloaderRecovery: "JTAG or FINE (single-wire debug) via E2 emulator. MD pin low on reset for boot mode (UART programming). ID code protection can lock debug access; requires matching 16-byte ID.",
    keywords: ["rx65n", "renesas", "rxv2", "industrial", "hmi", "ethernet", "tft"],
  },
] as const;

// ── JTAG Pinouts ─────────────────────────────────────────────────────────────

export const JTAG_PINOUTS: readonly JtagPinout[] = [
  {
    id: "arm-20pin",
    name: "ARM 20-pin Standard JTAG",
    connector: "2x10 pin header (0.1\" / 2.54mm pitch)",
    pins: [
      { pin: 1, signal: "VTref", description: "Target reference voltage (input to debugger)" },
      { pin: 2, signal: "VCC", description: "Target supply voltage (optional, some debuggers)" },
      { pin: 3, signal: "nTRST", description: "JTAG reset (active low, optional)" },
      { pin: 4, signal: "GND", description: "Ground" },
      { pin: 5, signal: "TDI", description: "Test Data In (to target)" },
      { pin: 6, signal: "GND", description: "Ground" },
      { pin: 7, signal: "TMS", description: "Test Mode Select" },
      { pin: 8, signal: "GND", description: "Ground" },
      { pin: 9, signal: "TCK", description: "Test Clock" },
      { pin: 10, signal: "GND", description: "Ground" },
      { pin: 11, signal: "RTCK", description: "Return Test Clock (adaptive clocking)" },
      { pin: 12, signal: "GND", description: "Ground" },
      { pin: 13, signal: "TDO", description: "Test Data Out (from target)" },
      { pin: 14, signal: "GND", description: "Ground" },
      { pin: 15, signal: "nRST", description: "Target reset (active low)" },
      { pin: 16, signal: "GND", description: "Ground" },
      { pin: 17, signal: "NC", description: "Not connected (DBGRQ on some)" },
      { pin: 18, signal: "GND", description: "Ground" },
      { pin: 19, signal: "NC", description: "Not connected (DBGACK on some)" },
      { pin: 20, signal: "GND", description: "Ground" },
    ],
    voltage: "1.2V - 5.0V (level shifted by debugger)",
    notes: "Standard ARM JTAG connector. Used by J-Link, ST-Link (with adapter), ULINK, and most ARM debuggers. Even pins are all GND for signal integrity.",
  },
  {
    id: "arm-10pin-cortex-debug",
    name: "ARM 10-pin Cortex Debug (SWD)",
    connector: "2x5 pin header (0.05\" / 1.27mm pitch)",
    pins: [
      { pin: 1, signal: "VTref", description: "Target reference voltage" },
      { pin: 2, signal: "SWDIO/TMS", description: "SWD data / JTAG TMS" },
      { pin: 3, signal: "GND", description: "Ground" },
      { pin: 4, signal: "SWCLK/TCK", description: "SWD clock / JTAG TCK" },
      { pin: 5, signal: "GND", description: "Ground" },
      { pin: 6, signal: "SWO/TDO", description: "SWD trace output / JTAG TDO" },
      { pin: 7, signal: "KEY", description: "Keying pin (no connect / removed pin)" },
      { pin: 8, signal: "TDI", description: "JTAG TDI (NC for SWD-only)" },
      { pin: 9, signal: "GND", description: "Ground (or nRST on some)" },
      { pin: 10, signal: "nRST", description: "Target reset (active low)" },
    ],
    voltage: "1.2V - 3.6V",
    notes: "Compact connector for Cortex-M targets. Supports both SWD (2-wire) and JTAG (5-wire). Pin 7 is keyed (missing) to prevent reversed insertion. Most STM32 boards use this.",
  },
  {
    id: "avr-6pin-isp",
    name: "AVR 6-pin ISP",
    connector: "2x3 pin header (0.1\" / 2.54mm pitch)",
    pins: [
      { pin: 1, signal: "MISO", description: "Master In Slave Out (data from target)" },
      { pin: 2, signal: "VCC", description: "Target supply voltage (3.3V or 5V)" },
      { pin: 3, signal: "SCK", description: "SPI Clock" },
      { pin: 4, signal: "MOSI", description: "Master Out Slave In (data to target)" },
      { pin: 5, signal: "RST", description: "Target reset (active low)" },
      { pin: 6, signal: "GND", description: "Ground" },
    ],
    voltage: "1.8V - 5.5V",
    notes: "Standard AVR ISP header. Used by USBasp, AVR ISP mkII, Arduino as ISP. Directly programs flash, EEPROM, and fuses. RST must be available (not disabled by RSTDISBL fuse).",
  },
  {
    id: "mips-ejtag-14pin",
    name: "MIPS EJTAG 14-pin",
    connector: "2x7 pin header (0.1\" / 2.54mm pitch)",
    pins: [
      { pin: 1, signal: "nTRST", description: "JTAG reset (active low)" },
      { pin: 2, signal: "GND", description: "Ground" },
      { pin: 3, signal: "TDI", description: "Test Data In" },
      { pin: 4, signal: "GND", description: "Ground" },
      { pin: 5, signal: "TDO", description: "Test Data Out" },
      { pin: 6, signal: "GND", description: "Ground" },
      { pin: 7, signal: "TMS", description: "Test Mode Select" },
      { pin: 8, signal: "GND", description: "Ground" },
      { pin: 9, signal: "TCK", description: "Test Clock" },
      { pin: 10, signal: "GND", description: "Ground" },
      { pin: 11, signal: "nRST", description: "System reset (active low)" },
      { pin: 12, signal: "DINT", description: "Debug interrupt (active low)" },
      { pin: 13, signal: "VIO", description: "I/O reference voltage" },
      { pin: 14, signal: "GND", description: "Ground" },
    ],
    voltage: "1.8V - 3.3V",
    notes: "Common on MIPS-based routers (Broadcom, Atheros, MediaTek SoCs). DINT pin forces debug exception. Some router boards use non-standard pin orders; always verify with board silkscreen.",
  },
  {
    id: "esp32-jtag",
    name: "ESP32 JTAG (WROOM-32 Default)",
    connector: "GPIO pads (no dedicated header)",
    pins: [
      { pin: 12, signal: "TDI", description: "Test Data In (GPIO12)" },
      { pin: 13, signal: "TCK", description: "Test Clock (GPIO13)" },
      { pin: 14, signal: "TMS", description: "Test Mode Select (GPIO14)" },
      { pin: 15, signal: "TDO", description: "Test Data Out (GPIO15)" },
    ],
    voltage: "3.3V",
    notes: "JTAG on ESP32 shares pins with other peripherals. GPIO12 (TDI) also controls flash voltage (VDD_SDIO) — pulling high at boot selects 1.8V flash, which may cause boot failure on 3.3V flash modules. ESP32-S3 and ESP32-C3 have dedicated USB-JTAG.",
  },
] as const;

// ── Embedded Failure Patterns ────────────────────────────────────────────────

export const EMBEDDED_FAILURE_PATTERNS: readonly EmbeddedFailurePattern[] = [
  // ── Flash Corruption ──
  {
    id: "ef-flash-power-glitch",
    name: "Flash write interrupted by power glitch",
    category: "flash-corruption",
    symptoms: [
      "Device boots to blank screen or hangs at startup",
      "Partial firmware image visible in flash dump",
      "CRC/checksum mismatch on firmware verification",
      "Flash read returns mix of valid data and 0xFF (erased) regions",
    ],
    causes: [
      { cause: "Power loss during firmware update / OTA", probability: "high" },
      { cause: "Unstable USB power supply during programming", probability: "medium" },
      { cause: "Brown-out during flash erase cycle", probability: "medium" },
      { cause: "Watchdog reset during flash write", probability: "low" },
    ],
    diagnosticSteps: [
      "Dump flash contents and compare against known-good firmware image",
      "Check for partially erased sectors (mix of programmed and 0xFF data)",
      "Verify power supply stability with oscilloscope during programming",
      "Check brown-out detection (BOD) configuration in option bytes / fuses",
    ],
    repairProcedure: "Erase entire flash and reprogram with known-good firmware image. If using external SPI flash (ESP32, RP2040), desolder and program with CH341A. Enable brown-out detection in firmware to prevent future occurrences.",
    difficulty: 2,
    keywords: ["power glitch", "flash corrupt", "partial write", "crc mismatch", "bricked", "ota fail"],
  },
  {
    id: "ef-flash-page-corruption",
    name: "Flash page corruption from wear or defect",
    category: "flash-corruption",
    symptoms: [
      "Specific functionality fails while rest of firmware works",
      "Data corruption in configuration / NVS / EEPROM emulation region",
      "Intermittent crashes at consistent code addresses",
      "Bit errors that worsen over time in specific flash pages",
    ],
    causes: [
      { cause: "Flash endurance limit exceeded (100K+ erase cycles on hot pages)", probability: "high" },
      { cause: "Manufacturing defect in specific flash block", probability: "medium" },
      { cause: "ESD damage to flash array", probability: "low" },
    ],
    diagnosticSteps: [
      "Read flash multiple times and compare for consistency (bit flips indicate wear)",
      "Map which pages/sectors show corruption",
      "Check NVS / EEPROM emulation write frequency in application code",
      "Verify flash ECC status registers if available (STM32H7, nRF53)",
    ],
    repairProcedure: "Reprogram firmware. If specific pages are defective, remap configuration storage to healthy sectors. For wear-related failures, implement wear leveling in NVS. If flash is beyond recovery, replace the MCU.",
    difficulty: 3,
    keywords: ["page corrupt", "bit flip", "wear out", "nvs corrupt", "eeprom", "endurance"],
  },
  {
    id: "ef-flash-protection-locked",
    name: "Flash write/read protection accidentally enabled",
    category: "flash-corruption",
    symptoms: [
      "Programmer reports 'protected' or 'locked' error",
      "Flash reads back as all zeros or all ones",
      "SWD/JTAG connection succeeds but flash operations fail",
      "Cannot erase or program specific sectors",
    ],
    causes: [
      { cause: "Write protection bits set in option bytes (STM32 WRP)", probability: "high" },
      { cause: "Firmware enabled protection as anti-tamper measure", probability: "medium" },
      { cause: "Incorrect option byte programming", probability: "medium" },
    ],
    diagnosticSteps: [
      "Read option bytes / protection status registers",
      "Check if protection is per-sector or global",
      "Determine if protection is reversible (STM32 RDP Level 1 vs Level 2)",
      "Verify write protection bits in flash control registers",
    ],
    repairProcedure: "For STM32: remove write protection via option byte modification through SWD (STM32CubeProgrammer). For sector protection, clear WRP bits. Note: removing RDP Level 1 triggers mass erase. RDP Level 2 is permanent.",
    difficulty: 3,
    keywords: ["protection", "locked", "write protect", "wrp", "option bytes", "cannot program"],
  },

  // ── Bootloader ──
  {
    id: "ef-boot-invalid-jump",
    name: "Bootloader jumped to invalid application address",
    category: "bootloader",
    symptoms: [
      "Device resets immediately after bootloader banner/splash",
      "HardFault or undefined instruction exception in crash log",
      "Boot loop with no application output",
      "Bootloader runs fine but application never starts",
    ],
    causes: [
      { cause: "Application image not present at expected flash address", probability: "high" },
      { cause: "Wrong linker script / vector table offset in application", probability: "high" },
      { cause: "Application stack pointer (first word of vector table) invalid", probability: "medium" },
      { cause: "Application compiled for wrong MCU variant", probability: "low" },
    ],
    diagnosticSteps: [
      "Read first 8 bytes at application start address (SP + Reset vector)",
      "Verify SP points to valid RAM range",
      "Verify Reset vector points to valid flash address",
      "Check bootloader jump condition logic (version check, CRC, magic number)",
    ],
    repairProcedure: "Reflash application with correct linker settings (VTOR offset matching bootloader expectations). Verify vector table alignment. If bootloader is custom, add fallback to stay in bootloader on invalid application header.",
    difficulty: 3,
    keywords: ["invalid jump", "hardfault", "boot loop", "vector table", "vtor", "linker script"],
  },
  {
    id: "ef-boot-crc-mismatch",
    name: "Bootloader CRC / checksum verification failure",
    category: "bootloader",
    symptoms: [
      "Bootloader reports CRC error and refuses to launch application",
      "OTA update completed but device won't boot new firmware",
      "Device stuck in bootloader / DFU mode after update",
      "Bootloader log shows expected vs actual checksum mismatch",
    ],
    causes: [
      { cause: "Firmware image truncated during transfer", probability: "high" },
      { cause: "CRC algorithm mismatch between build tool and bootloader", probability: "medium" },
      { cause: "Flash corruption during write", probability: "medium" },
      { cause: "Endianness mismatch in CRC storage", probability: "low" },
    ],
    diagnosticSteps: [
      "Read full application image from flash",
      "Compute CRC using same algorithm as bootloader (CRC32, CRC16, SHA256)",
      "Compare against stored checksum location",
      "Verify image length matches expected size",
    ],
    repairProcedure: "Reflash firmware via bootloader or SWD/JTAG. Ensure build system embeds correct CRC at expected offset. Verify CRC polynomial matches bootloader implementation. For OTA, add retry + rollback mechanism.",
    difficulty: 2,
    keywords: ["crc", "checksum", "verification fail", "integrity", "ota fail", "dfu stuck"],
  },
  {
    id: "ef-boot-fuse-protection",
    name: "Bootloader entry blocked by protection fuse",
    category: "bootloader",
    symptoms: [
      "Cannot enter bootloader via BOOT0 pin or button",
      "USB DFU device not detected when expected",
      "UART bootloader does not respond to sync byte",
      "Device always boots application, ignoring boot mode pins",
    ],
    causes: [
      { cause: "nBOOT_SEL option bit disables BOOT0 pin (STM32)", probability: "high" },
      { cause: "BOR level too low causing unreliable boot pin sampling", probability: "medium" },
      { cause: "Boot pin pulled by external circuit", probability: "medium" },
      { cause: "System memory boot disabled in option bytes", probability: "low" },
    ],
    diagnosticSteps: [
      "Read option bytes via SWD to check boot configuration",
      "Measure BOOT0 pin voltage level during reset",
      "Check nSWBOOT0 and nBOOT0 bits in option bytes",
      "Verify external pullup/pulldown on BOOT0 pin",
    ],
    repairProcedure: "Use SWD/JTAG to modify option bytes and re-enable BOOT0 pin boot selection. Clear nBOOT_SEL to allow hardware BOOT0 pin. If SWD is also locked, this may require RDP level regression (mass erase).",
    difficulty: 3,
    keywords: ["boot0", "fuse", "option byte", "cannot enter bootloader", "dfu not detected"],
  },

  // ── Power ──
  {
    id: "ef-power-brownout-flash",
    name: "Brown-out causing flash corruption during write",
    category: "power",
    symptoms: [
      "Random firmware corruption after power instability events",
      "Configuration data lost after power glitches",
      "Flash corruption correlates with motor/relay activation on same supply",
      "Device works fine on bench but corrupts in field deployment",
    ],
    causes: [
      { cause: "Inadequate decoupling on VDD pins during flash write", probability: "high" },
      { cause: "Shared power supply with inductive loads (motors, relays, solenoids)", probability: "high" },
      { cause: "BOD threshold set below minimum flash programming voltage", probability: "medium" },
      { cause: "Insufficient bulk capacitance on power rail", probability: "medium" },
    ],
    diagnosticSteps: [
      "Monitor VDD with oscilloscope during flash write operations",
      "Check for voltage dips during motor/relay switching",
      "Verify BOD level matches flash minimum programming voltage",
      "Measure decoupling capacitor ESR and ripple under load",
    ],
    repairProcedure: "Add bulk capacitance (100uF+) near MCU VDD. Set BOD threshold above flash minimum voltage (typically 2.1V for 3.3V parts). Separate MCU power from inductive loads with dedicated regulator. Add flyback diodes on relays.",
    difficulty: 2,
    keywords: ["brownout", "power dip", "flash corrupt", "motor", "relay", "decoupling", "bod"],
  },
  {
    id: "ef-power-unstable-vdd",
    name: "Unstable VDD preventing reliable flash operations",
    category: "power",
    symptoms: [
      "Flash programming fails intermittently",
      "Verification errors after programming (random bit differences)",
      "Works with one programmer/power source but not another",
      "Current consumption spikes during flash erase cause voltage drop",
    ],
    causes: [
      { cause: "USB power source cannot supply peak current during flash erase (50-100mA spikes)", probability: "high" },
      { cause: "LDO regulator dropout during peak current draw", probability: "medium" },
      { cause: "Long/thin wires to target causing voltage drop", probability: "medium" },
      { cause: "VDDA not properly supplied (required for flash on some STM32)", probability: "low" },
    ],
    diagnosticSteps: [
      "Measure VDD at MCU pins (not at connector) during flash erase/write",
      "Check VDDA supply separately if present",
      "Try external bench power supply instead of USB",
      "Verify regulator output capacitor and load regulation spec",
    ],
    repairProcedure: "Use stable bench power supply for programming. Add 10-100uF capacitor close to MCU VDD pins. Ensure VDDA is properly connected (not floating). Use short, thick wires from programmer to target.",
    difficulty: 2,
    keywords: ["unstable vdd", "programming fail", "verification error", "voltage drop", "current spike"],
  },

  // ── Clock ──
  {
    id: "ef-clock-crystal-fail",
    name: "External crystal not starting or unstable",
    category: "clock",
    symptoms: [
      "MCU does not start (no code execution at all)",
      "MCU runs but at wrong speed (baud rates wrong, timers off)",
      "HSE timeout error in firmware (falls back to HSI)",
      "Works at room temperature but fails in cold or heat",
    ],
    causes: [
      { cause: "Crystal load capacitors wrong value (too high kills oscillation)", probability: "high" },
      { cause: "PCB trace length to crystal too long (adds parasitic capacitance)", probability: "medium" },
      { cause: "Crystal damaged during soldering (heat exposure)", probability: "medium" },
      { cause: "Moisture ingress in crystal package", probability: "low" },
    ],
    diagnosticSteps: [
      "Probe OSC_IN pin with oscilloscope (expect clean sine/square wave at crystal frequency)",
      "Check crystal load capacitor values against datasheet recommendation",
      "Measure startup time (should be < 10ms for most crystals)",
      "Try firmware with HSI (internal oscillator) to confirm MCU is alive",
    ],
    repairProcedure: "Replace crystal and load capacitors with datasheet-recommended values. Keep PCB traces short (< 10mm). Add ground guard ring around crystal pads. If crystal consistently fails, switch to MEMS oscillator for better reliability.",
    difficulty: 2,
    keywords: ["crystal", "xtal", "hse", "oscillator", "not starting", "clock fail", "load capacitor"],
  },
  {
    id: "ef-clock-pll-lock",
    name: "PLL lock failure preventing system clock",
    category: "clock",
    symptoms: [
      "MCU hangs during clock configuration (before main loop)",
      "System clock frequency incorrect (peripherals run at wrong speed)",
      "HardFault immediately after clock switch to PLL",
      "PLL lock timeout in system init code",
    ],
    causes: [
      { cause: "PLL input frequency out of valid range", probability: "high" },
      { cause: "PLL multiplier/divider configuration exceeds max VCO frequency", probability: "high" },
      { cause: "Flash wait states not configured before increasing clock speed", probability: "medium" },
      { cause: "VDD below minimum voltage for target PLL frequency", probability: "low" },
    ],
    diagnosticSteps: [
      "Check PLL input frequency is within datasheet limits",
      "Verify VCO output frequency = PLL_IN x N / M is within allowed range",
      "Confirm flash wait states are set BEFORE switching to PLL",
      "Check voltage scaling mode matches target frequency",
    ],
    repairProcedure: "Fix PLL configuration: ensure input frequency, VCO range, and output dividers are all within datasheet limits. Set flash wait states before increasing HCLK. Use STM32CubeMX or vendor config tool to generate valid clock tree.",
    difficulty: 3,
    keywords: ["pll", "lock fail", "clock config", "vco", "wait states", "system clock", "hardfault"],
  },
  {
    id: "ef-clock-wrong-config",
    name: "Wrong clock configuration bricking device",
    category: "clock",
    symptoms: [
      "Device appears completely dead after firmware update",
      "SWD/JTAG connection extremely slow or times out",
      "UART output is garbage (wrong baud rate)",
      "Debug probe reports 'cannot read target' after clock change",
    ],
    causes: [
      { cause: "Firmware configured HSE but board has no external crystal", probability: "high" },
      { cause: "SWD clock derived from misconfigured system clock (too fast for probe)", probability: "medium" },
      { cause: "Clock source switched but prescalers not set, exceeding max frequency", probability: "medium" },
      { cause: "Peripheral clock gate disabled for debug port", probability: "low" },
    ],
    diagnosticSteps: [
      "Try connecting SWD under reset (hold nRST low, connect, then release)",
      "Use slowest SWD clock speed on debugger",
      "Check if device has external crystal/oscillator populated",
      "Try power-cycling while holding debug connection",
    ],
    repairProcedure: "Connect via SWD with 'connect under reset' mode at lowest clock speed. Halt CPU before clock init code runs. Reprogram with correct clock configuration. For STM32, option bytes can force HSI boot.",
    difficulty: 4,
    keywords: ["wrong clock", "bricked", "swd slow", "connect under reset", "no crystal", "hse fail"],
  },

  // ── Communication ──
  {
    id: "ef-comm-swd-rdp",
    name: "SWD locked by RDP / read-out protection",
    category: "communication",
    symptoms: [
      "SWD probe detects target but cannot read flash",
      "STM32CubeProgrammer shows 'RDP Level 1' or 'RDP Level 2'",
      "Debug connection immediately dropped after attach",
      "Can erase but cannot read back (Level 1)",
    ],
    causes: [
      { cause: "Production firmware enabled RDP for IP protection", probability: "high" },
      { cause: "Accidental RDP activation during option byte modification", probability: "medium" },
      { cause: "Security-focused bootloader enabled RDP on first boot", probability: "medium" },
    ],
    diagnosticSteps: [
      "Check RDP level via SWD option byte read (if Level 1, readable; Level 2, not)",
      "Attempt to read option bytes (possible at RDP Level 1)",
      "Verify if target is STM32 and which RDP level",
      "Check if firmware source is available for reprogramming after mass erase",
    ],
    repairProcedure: "RDP Level 1: regression to Level 0 possible via option byte modification BUT triggers full mass erase (all flash data lost). RDP Level 2: PERMANENT, device debug port is permanently disabled. No recovery possible; replace the MCU chip.",
    difficulty: 4,
    keywords: ["rdp", "read protection", "swd locked", "debug locked", "level 2", "mass erase"],
  },
  {
    id: "ef-comm-jtag-fuse",
    name: "JTAG disabled by fuse bit",
    category: "communication",
    symptoms: [
      "JTAG probe reports 'no target detected'",
      "Device ID reads as 0x00000000 or 0xFFFFFFFF on JTAG scan",
      "Device worked previously with JTAG but no longer responds",
      "SWD works but JTAG does not (on STM32)",
    ],
    causes: [
      { cause: "JTAG pins reassigned to GPIO in firmware (STM32 AFIO MAPR)", probability: "high" },
      { cause: "JTAG disable fuse set (ATmega JTAGEN fuse)", probability: "high" },
      { cause: "Debug port disabled by security configuration", probability: "medium" },
      { cause: "JTAG TMS/TCK pins held by external circuit", probability: "low" },
    ],
    diagnosticSteps: [
      "Try SWD instead of JTAG (STM32 supports both independently)",
      "Check fuse bits via ISP if AVR (JTAGEN fuse must be programmed for JTAG)",
      "Verify JTAG pin connections and voltage levels",
      "Try JTAG scan at different clock speeds",
    ],
    repairProcedure: "For STM32: use SWD instead, or modify firmware to not remap JTAG pins. For AVR: program JTAGEN fuse via ISP. For security-locked devices: may require full erase or device replacement.",
    difficulty: 3,
    keywords: ["jtag disabled", "fuse", "no target", "jtagen", "pin remap", "afio"],
  },
  {
    id: "ef-comm-uart-boot-pin",
    name: "UART bootloader entry pin misconfigured",
    category: "communication",
    symptoms: [
      "Cannot enter UART bootloader mode despite correct procedure",
      "No response to UART sync byte (0x7F for STM32)",
      "Device boots normally instead of entering bootloader",
      "UART bootloader works on some boards but not others",
    ],
    causes: [
      { cause: "BOOT0 pin not properly pulled high (floating or weak pullup)", probability: "high" },
      { cause: "BOOT0 sampled before pin reaches valid logic level (slow rise time)", probability: "medium" },
      { cause: "Wrong UART pins used (not the bootloader UART instance)", probability: "medium" },
      { cause: "Baud rate auto-detect fails due to noisy UART line", probability: "low" },
    ],
    diagnosticSteps: [
      "Measure BOOT0 pin voltage during reset (must be > VIH threshold)",
      "Verify correct UART instance (STM32: typically USART1 PA9/PA10 or USART2)",
      "Send 0x7F sync byte and check for ACK (0x79)",
      "Check if nBOOT_SEL option bit overrides hardware BOOT0 pin",
    ],
    repairProcedure: "Use strong pullup (10K to VDD) on BOOT0 instead of floating wire. Verify correct UART pins from reference manual (varies by STM32 family). Add 100ms delay after reset before sending sync byte. Use SWD as alternative.",
    difficulty: 2,
    keywords: ["uart bootloader", "boot0", "sync byte", "0x7f", "cannot enter boot", "no response"],
  },

  // ── Protection ──
  {
    id: "ef-prot-stm32-rdp2",
    name: "STM32 RDP Level 2 permanently locked",
    category: "protection",
    symptoms: [
      "SWD/JTAG completely non-functional (no target ID)",
      "STM32CubeProgrammer reports 'RDP Level 2'",
      "Cannot connect via any debug interface",
      "UART/USB bootloader also disabled",
    ],
    causes: [
      { cause: "Intentional production lockdown for IP protection", probability: "high" },
      { cause: "Accidental RDP Level 2 programming (irreversible mistake)", probability: "medium" },
      { cause: "Malicious firmware locked device permanently", probability: "low" },
    ],
    diagnosticSteps: [
      "Attempt SWD connection — will fail if RDP Level 2",
      "Try UART bootloader (also disabled at RDP Level 2)",
      "This is a permanent, non-reversible state",
      "Verify by checking JTAG ID response (no response = likely Level 2)",
    ],
    repairProcedure: "RDP Level 2 is PERMANENT and IRREVERSIBLE. The chip must be physically replaced. Desolder the STM32 and solder a new one. There is absolutely no software or hardware method to recover from RDP Level 2.",
    difficulty: 5,
    keywords: ["rdp level 2", "permanent lock", "irreversible", "chip replacement", "bricked forever"],
  },
  {
    id: "ef-prot-nrf52-approtect",
    name: "nRF52 APPROTECT / flash security enabled",
    category: "protection",
    symptoms: [
      "SWD connection fails or immediately disconnects",
      "J-Link reports 'cannot halt CPU'",
      "nrfjprog --recover fails or reports protection",
      "Device runs application but debug is blocked",
    ],
    causes: [
      { cause: "APPROTECT enabled in UICR (User Information Configuration Registers)", probability: "high" },
      { cause: "Secure bootloader enabled protection on first boot", probability: "medium" },
      { cause: "Production programming enabled access port protection", probability: "medium" },
    ],
    diagnosticSteps: [
      "Try nrfjprog --recover (performs CTRL-AP mass erase)",
      "Check if device responds to CTRL-AP (control access port)",
      "Verify J-Link firmware is up to date (older versions may fail recovery)",
      "Check if nRF5340 — has separate APPROTECT per core",
    ],
    repairProcedure: "Use nrfjprog --recover or J-Link Commander 'exec EnableEraseAllOnConnect' to mass erase via CTRL-AP. This erases ALL flash but restores debug access. For nRF5340, each core must be recovered separately.",
    difficulty: 3,
    keywords: ["approtect", "nrf52", "access port", "ctrl-ap", "mass erase", "recover", "uicr"],
  },
  {
    id: "ef-prot-atmega-lockbits",
    name: "ATmega lock bits preventing read/program",
    category: "protection",
    symptoms: [
      "ISP can detect device but flash read returns 0x00 or 0xFF",
      "Verification fails after programming (cannot read back)",
      "avrdude reports 'verification error' on flash read",
      "Device runs existing firmware but cannot be reprogrammed",
    ],
    causes: [
      { cause: "Lock bits set to prevent flash/EEPROM readback", probability: "high" },
      { cause: "BLB (Boot Lock Bits) preventing bootloader section access", probability: "medium" },
      { cause: "Lock bits set by Arduino bootloader burn process inadvertently", probability: "low" },
    ],
    diagnosticSteps: [
      "Read lock bits via ISP: avrdude -c usbasp -p m328p -U lock:r:-:h",
      "Check if chip erase is possible (lock bits are cleared by chip erase)",
      "Verify ISP connection (lock bits do not prevent ISP detection, only readback)",
      "Determine if bootloader lock bits (BLB) or application lock bits are set",
    ],
    repairProcedure: "Perform chip erase via ISP (avrdude -e). This clears all lock bits AND erases all flash + EEPROM. Then reprogram firmware and set lock bits to desired level. Cannot selectively clear lock bits without full erase.",
    difficulty: 2,
    keywords: ["lock bits", "atmega", "avr", "readback", "verification error", "chip erase", "blb"],
  },
] as const;

// ── PoE Controllers ──────────────────────────────────────────────────────────

export const POE_CONTROLLERS: readonly PoEController[] = [
  {
    id: "tps23861",
    name: "TPS23861",
    manufacturer: "Texas Instruments",
    type: "pse",
    standard: "IEEE 802.3at (PoE+)",
    ports: 4,
    maxPower: "30W per port",
    interface: "I2C",
    diagnosticRegisters: [
      "Power Status (0x10) — port power good/fault status",
      "Detection Status (0x0C) — PD detection results per port",
      "Fault Status (0x11) — overcurrent, thermal, UVLO faults",
      "Current Sense (0x30-0x37) — per-port current measurement",
      "Voltage Sense (0x38-0x3F) — per-port voltage measurement",
    ],
    commonIssues: [
      "Port stuck in detection mode — check sense resistor connections",
      "Overcurrent shutdown — verify PD power class negotiation",
      "I2C communication failure — check pullup resistors and address pins",
      "One port not powering — check high-side MOSFET gate driver circuit",
      "False detection — increase detection threshold or add filtering",
    ],
    keywords: ["tps23861", "ti", "texas instruments", "pse", "poe+", "802.3at", "i2c", "4-port"],
  },
  {
    id: "ltc4266",
    name: "LTC4266",
    manufacturer: "Analog Devices (Linear Technology)",
    type: "pse",
    standard: "IEEE 802.3at (PoE+)",
    ports: 4,
    maxPower: "30W per port",
    interface: "SPI",
    diagnosticRegisters: [
      "Interrupt Status (0x00) — global interrupt flags",
      "Detection Status (0x0B) — detection/classification results",
      "Power Status (0x10) — port power on/off status",
      "Fault Status (0x05) — per-port fault indicators",
      "Current/Voltage (0x2C-0x37) — ADC measurements per port",
    ],
    commonIssues: [
      "SPI communication — verify CPOL=0, CPHA=0 mode and chip select timing",
      "Classification mismatch — PD may present wrong class, check classification current",
      "Port cycling — thermal shutdown from inadequate heatsinking",
      "Inrush current tripping — adjust ICUT resistor value",
      "Detection failure on long cable — increase detection voltage/time",
    ],
    keywords: ["ltc4266", "analog devices", "linear", "pse", "poe+", "802.3at", "spi", "4-port"],
  },
  {
    id: "ltc4291",
    name: "LTC4291",
    manufacturer: "Analog Devices (Linear Technology)",
    type: "pse",
    standard: "IEEE 802.3bt (PoE++, Type 3/4)",
    ports: 4,
    maxPower: "90W per port",
    interface: "SPI",
    diagnosticRegisters: [
      "Port Status (0x10-0x13) — per-port state machine status",
      "Fault Register (0x14) — overcurrent, overvoltage, thermal faults",
      "Power Measurement (0x30-0x4F) — high-resolution power/current/voltage per port",
      "802.3bt Negotiation (0x50-0x5F) — autoclass and type negotiation results",
      "Temperature (0x60) — die temperature measurement",
    ],
    commonIssues: [
      "90W port not delivering full power — check 4-pair cabling and both PSE alternatives",
      "Autoclass negotiation failure — verify PD supports 802.3bt Type 3/4",
      "High-power port thermal shutdown — improve PCB copper pour and heatsinking",
      "Voltage droop on long cable runs — check cable gauge (Cat6A recommended for 90W)",
      "Dual-signature PD not detected — ensure both alternatives are enabled in config",
    ],
    keywords: ["ltc4291", "analog devices", "pse", "poe++", "802.3bt", "spi", "90w", "type 4"],
  },
  {
    id: "tps2372",
    name: "TPS2372",
    manufacturer: "Texas Instruments",
    type: "pd",
    standard: "IEEE 802.3at (PoE+ PD)",
    ports: 1,
    maxPower: "25.5W",
    interface: "Classification resistor + Power Good GPIO",
    diagnosticRegisters: [
      "No addressable registers (analog PD controller)",
      "Power Good output pin — high when power is valid",
      "Classification pin — set class via external resistor",
      "UVLO threshold — set via external resistor divider",
    ],
    commonIssues: [
      "Not being detected — verify signature resistance (25K nominal)",
      "Wrong power class — check classification resistor value",
      "Power Good not asserting — check UVLO threshold and input capacitor",
      "Inrush current protection tripping PSE — add soft-start capacitor",
      "Hot-swap MOSFET failing — verify gate driver and SOA rating",
    ],
    keywords: ["tps2372", "ti", "pd", "powered device", "poe+", "802.3at", "25w"],
  },
  {
    id: "ltc4279",
    name: "LTC4279",
    manufacturer: "Analog Devices (Linear Technology)",
    type: "pd",
    standard: "IEEE 802.3bt (PoE++ PD, Type 3/4)",
    ports: 1,
    maxPower: "71W",
    interface: "I2C + Classification GPIO",
    diagnosticRegisters: [
      "Status Register (0x00) — power state, classification result",
      "Power Measurement (0x02-0x03) — input voltage and current",
      "Autoclass Register (0x04) — 802.3bt autoclass negotiation status",
      "Fault Register (0x05) — overvoltage, overcurrent, thermal flags",
    ],
    commonIssues: [
      "Only receiving 30W instead of 71W — PSE may not support 802.3bt, check negotiation",
      "Autoclass failure — verify PD presents correct class signature during classification",
      "Dual-signature detection failure — check both Alt-A and Alt-B transformer connections",
      "DC-DC converter instability — input capacitor must handle 36-57V input range",
      "I2C readback unreliable — add 100pF filter caps on SDA/SCL near chip",
    ],
    keywords: ["ltc4279", "analog devices", "pd", "powered device", "poe++", "802.3bt", "71w", "type 4"],
  },
  {
    id: "si3452",
    name: "Si3452",
    manufacturer: "Skyworks Solutions",
    type: "pse",
    standard: "IEEE 802.3bt (PoE++, Type 3/4)",
    ports: 4,
    maxPower: "90W per port",
    interface: "I2C / SPI (configurable)",
    diagnosticRegisters: [
      "Port Status (0x00-0x03) — per-port power/detection/fault status",
      "System Status (0x10) — global chip status, temperature, supply",
      "Power Budget (0x20-0x27) — per-port power budget allocation",
      "Measurement Registers (0x30-0x47) — voltage/current/power per port",
      "Event Log (0x50-0x5F) — timestamped fault event history",
    ],
    commonIssues: [
      "Interface selection — verify SPI/I2C mode pin configuration at powerup",
      "Power budget exceeded — total system power shared across all ports",
      "Event log overflow — poll regularly to prevent missed fault events",
      "802.3bt negotiation timeout — increase LLDP timeout on managed switch",
      "Port priority conflict — configure port priority for graceful power shedding",
    ],
    keywords: ["si3452", "skyworks", "silicon labs", "pse", "poe++", "802.3bt", "90w", "4-port"],
  },
] as const;

// ── Lookup / Search Functions ────────────────────────────────────────────────

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/[-_]/g, "");
}

function expandQueryTerms(query: string): string[] {
  const normalized = normalizeQuery(query);
  const terms: string[] = [normalized];

  for (const [_key, synonyms] of EMBEDDED_SYNONYMS) {
    for (const syn of synonyms) {
      if (normalized.includes(normalizeQuery(syn))) {
        terms.push(normalizeQuery(_key));
        for (const s of synonyms) {
          terms.push(normalizeQuery(s));
        }
        break;
      }
    }
    if (normalized.includes(normalizeQuery(_key))) {
      for (const s of synonyms) {
        terms.push(normalizeQuery(s));
      }
    }
  }

  return [...new Set(terms)];
}

function matchesTerms(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeQuery(text);
  return terms.some((term) => normalized.includes(term));
}

export function lookupMcu(query: string): McuInfo[] {
  const terms = expandQueryTerms(query);

  return MCU_DATABASE.filter((mcu) => {
    const searchable = [
      mcu.id,
      mcu.manufacturer,
      mcu.family,
      mcu.partNumber,
      mcu.core,
      mcu.package,
      mcu.bootloaderRecovery,
      ...mcu.programmingInterface,
      ...mcu.keywords,
    ].join(" ");

    return matchesTerms(searchable, terms);
  });
}

export function getJtagPinout(name: string): JtagPinout | undefined {
  const normalized = normalizeQuery(name);

  return JTAG_PINOUTS.find((p) => {
    return (
      normalizeQuery(p.id).includes(normalized) ||
      normalizeQuery(p.name).includes(normalized) ||
      normalizeQuery(p.connector).includes(normalized)
    );
  });
}

export function listJtagPinouts(): Array<{ id: string; name: string; connector: string }> {
  return JTAG_PINOUTS.map((p) => ({
    id: p.id,
    name: p.name,
    connector: p.connector,
  }));
}

export function searchEmbeddedFailures(query: string): EmbeddedFailurePattern[] {
  const terms = expandQueryTerms(query);

  return EMBEDDED_FAILURE_PATTERNS.filter((pattern) => {
    const searchable = [
      pattern.id,
      pattern.name,
      pattern.category,
      pattern.repairProcedure,
      ...pattern.symptoms,
      ...pattern.causes.map((c) => c.cause),
      ...pattern.diagnosticSteps,
      ...pattern.keywords,
    ].join(" ");

    return matchesTerms(searchable, terms);
  });
}

export function getEmbeddedFailuresByCategory(
  category: EmbeddedFailurePattern["category"],
): EmbeddedFailurePattern[] {
  return EMBEDDED_FAILURE_PATTERNS.filter((pattern) => pattern.category === category);
}

export function lookupPoEController(query: string): PoEController[] {
  const terms = expandQueryTerms(query);

  return POE_CONTROLLERS.filter((ctrl) => {
    const searchable = [
      ctrl.id,
      ctrl.name,
      ctrl.manufacturer,
      ctrl.type,
      ctrl.standard,
      ctrl.interface,
      ctrl.maxPower,
      ...ctrl.diagnosticRegisters,
      ...ctrl.commonIssues,
      ...ctrl.keywords,
    ].join(" ");

    return matchesTerms(searchable, terms);
  });
}
