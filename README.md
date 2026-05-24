# ratchet

Multi-protocol **hardware debug + programming toolkit** built on **CH341A / CH347** USB programmers.

SPI flash programming + BIOS analysis was the starting point. The current surface adds **I2C / UART / 1-Wire / passive SPI sniff / JTAG / SWD / CAN**, target-MCU programmers (**AVR ISP, STK500 / Arduino bootloader, 24Cxx EEPROM, 93xxx Microwire EEPROM, ESP32 / ESP8266 esptool, STM32 SWD, STM32 UART AN3155**), ARM debug (**ADIv5, Cortex-M halt/resume/step, ELF symbol-aware peek**), JTAG IDCODE chain + BSDL boundary scan, multi-channel logic analyzer with Saleae / sigrok export, and bridges for **Bus Pirate** + **slcan CAN**.

**Rust-first.** Single self-contained binary, custom libusb FFI, custom JSON-RPC MCP server, no Node runtime required.

Replaces AsProgrammer / NeoProgrammer for the SPI-flash path, and overlaps with flashrom / avrdude / esptool / stm32flash / OpenOCD-as-bit-bang for the broader hardware surface, with one binary, native USB, image analysis, knowledge-base diagnostics, real progress reporting, and a built-in MCP server for AI agents.

## Status

Pre-release. Goal-005 shipped the full multi-protocol surface; goals 006 / 007 rebranded and audited. Hardware-protocol code paths (D1 to D26) are implemented and unit-tested mock-backed. **No GitHub Releases are published yet**, so the only supported install route today is from source via `cargo install`.

## Install

### From source via cargo (the path that works today)

Requires Rust 1.82+ and libusb-1.0 installed (see [Requirements](#requirements)).

```bash
git clone https://github.com/jackulau/ratchet
cd ratchet/rust
cargo install --path ratchet-cli
cargo install --path ratchet-mcp
```

This installs `ratchet` and `ratchet-mcp` into `~/.cargo/bin/` (or the value of `CARGO_INSTALL_ROOT` if set). Both binaries are self-contained Rust executables; no Node, no Python.

If you prefer not to mix global state, install to a sandbox directory:

```bash
cargo install --path ratchet-cli --root /opt/ratchet
cargo install --path ratchet-mcp --root /opt/ratchet
export PATH="/opt/ratchet/bin:$PATH"
```

### From a checkout (no install)

```bash
git clone https://github.com/jackulau/ratchet
cd ratchet/rust
cargo build --release
# Binaries land at target/release/ratchet and target/release/ratchet-mcp
```

## Uninstall

### If you used `cargo install`

```bash
cargo uninstall ratchet-cli
cargo uninstall ratchet-mcp
```

If you used `--root /opt/ratchet` during install, pass the same root:

```bash
cargo uninstall ratchet-cli --root /opt/ratchet
cargo uninstall ratchet-mcp --root /opt/ratchet
```

### If you built from a checkout

Nothing to uninstall; delete the cloned directory. Optionally:

```bash
cd ratchet/rust && cargo clean    # remove build artifacts
cd .. && rm -rf ratchet           # remove the checkout
```

### Removing the Claude Desktop MCP registration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the platform equivalent and remove the `"ratchet"` entry under `mcpServers`. Restart Claude Desktop.

## Quick Start - SPI flash

```bash
# 1. Plug in CH341A programmer with chip in ZIF socket
ratchet status                # check connection
ratchet identify              # JEDEC ID + chip lookup

# 2. Read current BIOS (always do this first!)
ratchet read backup.bin       # dumps chip → file

# 3. Analyze what you read
ratchet analyze backup.bin

# 4. Flash new BIOS (auto-backs up current chip first)
ratchet write new_bios.bin

# 5. Verify
ratchet verify new_bios.bin
```

## Quick Start - multi-protocol

```bash
# I2C bus scan + read
ratchet i2c scan
ratchet i2c read 0x50 0x00 256

# JTAG IDCODE chain on unknown board
ratchet jtag scan

# SWD: halt Cortex-M and dump RAM
ratchet swd connect
ratchet swd halt
ratchet swd dump --addr 0x20000000 --len 0x1000

# Program ATmega328P via ISP
ratchet avr program firmware.hex

# Flash STM32 over SWD
ratchet stm32 swd-flash firmware.bin --addr 0x08000000

# Multi-channel logic capture, save Saleae .sal
ratchet la capture --channels 0,1,2,3 --rate 1M --duration 5s -o trace.sal

# CAN sniffing via slcan adapter
ratchet can sniff /dev/tty.usbmodem*
```

## Commands

`ratchet --help` exposes 39 top-level subcommands plus `help`. Groups:

| Group | Commands |
|-------|----------|
| Hardware | `status`, `detect`, `identify`, `monitor` |
| Chip ops | `read`, `write`, `verify`, `erase`, `region-erase`, `blank-check`, `sfdp`, `wp-status` |
| Analysis | `analyze`, `diff`, `checksum` |
| Knowledge base | `search`, `chip-info`, `post-decode`, `failure-search`, `voltage-reference` |
| Serial | `serial`, `serial-list` |
| Repair | `full-repair`, `full-backup`, `repl` |
| Self-test | `self-test` (also exposed as `--self-test` top-level flag) |
| I2C / UART / 1-Wire | `i2c scan/read/write/sniff`, `uart open/sniff`, `onewire scan` |
| JTAG / SWD | `jtag scan/bsdl-scan`, `swd connect/halt/dump` |
| Programmers | `avr program`, `arduino program`, `eeprom-i2c read/write`, `eeprom-microwire read/write`, `esp flash`, `stm32 swd-flash/uart-flash` |
| Instruments | `la capture/export`, `buspirate bridge`, `can sniff` |

Every inspection command supports `--json` for AgentEnvelope output:
`{ok, command, data?|error, nextAction?}`. Long-running commands also accept
`--ndjson` for line-delimited progress events.

```bash
ratchet status --json
ratchet chip-info ef4017 --json
ratchet analyze backup.bin --json | jq '.data.regions'
ratchet read backup.bin --ndjson
```

## Agent Interface (MCP)

ratchet ships a built-in **MCP server** (`ratchet-mcp`) so AI agents (Claude Desktop, mcp-cli, custom SDK clients) can drive the hardware directly. Hand-rolled JSON-RPC 2.0 over stdio. **30 tools total**: 18 SPI-flash / BIOS analysis tools + 12 multi-protocol hardware tools. Hardware-protocol handlers currently return placeholder JSON until live USB wiring lands; the dispatch surface, JSON-schema descriptors, and argument shapes are real.

```bash
ratchet-mcp                              # live mode (real USB)
RATCHET_FORCE_MOCK=1 ratchet-mcp         # mock mode (no hardware)
ratchet-mcp --list-tools                 # dump tool surface (one name per line)
```

Register with Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ratchet": {
      "command": "ratchet-mcp"
    }
  }
}
```

### Tools (selected)

| Tool | Purpose |
|------|---------|
| `detect` | Scan USB for CH34x programmers |
| `identify` | Read JEDEC ID + SFDP + DB lookup |
| `read_chip` / `write_chip` / `verify_chip` / `erase_chip` | SPI flash ops |
| `analyze_image` / `bios_regions` / `nvram_vars` | BIOS image inspection |
| `search_chips` / `chip_info` | 806-chip database |
| `post_decode` / `failure_search` / `voltage_reference` | Diagnostics knowledge base |
| `i2c_scan` / `i2c_read` / `i2c_write` | I2C bus ops |
| `uart_capture` | Two-channel UART sniff |
| `jtag_idcode_scan` | JTAG chain forensics |
| `swd_dump_ram` | ARM RAM dump over SWD |
| `avr_program` / `esp_flash` / `stm32_swd_flash` | Target-MCU programmers |
| `la_capture` | Multi-channel logic analyzer |
| `bus_pirate_proxy` / `can_sniff` | External-device bridges |

## Safety Features

ratchet refuses to let you brick your board:

- **Auto-backup** before every write. Original chip contents saved to a timestamped backup.
- **Verify-after-write** by default.
- **Blank file detection**: refuses to write all-0xFF or all-0x00 files.
- **File size check**: blocks writes that exceed chip capacity.
- **1.8V voltage gate**: flags 1.8V chips on stock CH341A (3.3V output).
- **Erase confirmation** required before destructive ops.
- **Post-read warnings**: alerts on blank (0xFF) or failed (0x00) reads.

## Architecture

```
rust/
├── ratchet-usb-sys   ← custom libusb FFI via bindgen (no rusb / nusb)
├── ratchet-usb       ← safe RAII wrapper, error mapping, bulk/control transfers
├── ratchet-core      ← chip db (806 chips), backends (mock/CH341A/CH347),
│                       BIOS analyzer, repair, NVRAM, UEFI, knowledge-base,
│                       protocols (I2C/UART/1-Wire/SPI-sniff/JTAG/SWD),
│                       programmers (AVR/STK500/24Cxx/93xxx/ESP/STM32),
│                       debug (ADIv5/Cortex-M/ELF/boundary-scan),
│                       instruments (logic-analyzer/export/Bus-Pirate/slcan),
│                       workflow pipeline, REPL state, agent envelope
├── ratchet-cli       ← clap-based CLI, 39 top-level subcommands + --self-test flag
├── ratchet-mcp       ← MCP JSON-RPC 2.0 server (30 tools, stdio)
└── ratchet-node      ← optional napi-rs bridge for Node consumers
```

**Fully native.** Direct SPI / I2C / UART / JTAG / SWD over libusb. No external tools shelled out. No `flashrom` / `avrdude` / `esptool` / `stm32flash` / `OpenOCD` dependency at runtime; ratchet is an alternative to those, not a wrapper around them.

## Supported Hardware

### Programmers

- **CH341A** (`1a86:5512`): most common, SPI + UIO bit-bang for I2C / JTAG / SWD / 1-Wire, ~$3 on AliExpress.
- **CH347** (`1a86:55db`, `55dc`, `55de`): newer, up to 60 MHz SPI, native I2C + UART, JTAG.
- **CH343** (`1a86:55d3`): UART serial-debug only.

### Flash Chips (806 in database)

Winbond, Macronix, GigaDevice, SST / Microchip, EON, Spansion / Cypress / Infineon, Micron / Numonyx, ISSI, AMIC, XMC, PUYA, ESMT, Intel, Atmel / Adesto, and more. Both 3.3V and 1.8V variants.

### Target MCUs

- **AVR**: ATmega328P (Arduino UNO), ATmega2560, ATtiny85, ATmega32U4 via ISP or STK500 bootloader.
- **STM32**: F0 / F1 / F2 / F3 / F4 / F7 / G0 / G4 / H7 / L0 / L4 / L5 via SWD or AN3155 UART bootloader.
- **ESP**: ESP8266, ESP32, ESP32-S2 / S3 / C3 / C6 via ROM bootloader + optional stub.
- **ARM Cortex-M**: generic debug surface (halt / resume / step / RAM dump) via SWD on any ADIv5-compliant target.

## Requirements

- **End user (cargo-install path)**: Rust 1.82+ and libusb-1.0 (system package).
- **macOS**: `brew install libusb`.
- **Linux (Debian / Ubuntu)**: `sudo apt install libusb-1.0-0-dev`.
- **Windows**: vcpkg-installed libusb for build; WinUSB driver via [Zadig](https://zadig.akeo.ie/) for runtime.

## History

This repo started life as `biosMCP`, a CH341A-focused BIOS chip programmer that replaced AsProgrammer / NeoProgrammer. The TypeScript prototype was fully replaced by a native Rust workspace in goal 004 (the `ts-final` git tag preserves the prior state). Goal 005 expanded the scope from SPI-flash-only into the multi-protocol hardware toolkit; goal 006 rebranded the project to `ratchet` to reflect the broader surface; goal 007 audited the full capability matrix; goal 008 added the LICENSE file and reconciled README claims with reality.

## License

MIT. See [LICENSE](LICENSE).
