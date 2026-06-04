# ratchet

Multi-protocol **hardware debug + programming toolkit** built on **CH341A / CH347** USB programmers.

SPI flash programming + BIOS analysis is the part that drives live silicon end to end today. On top of that sits a unit-tested protocol layer for **I2C / UART / 1-Wire / passive SPI sniff / JTAG / SWD / CAN**, target-MCU programmers (**AVR ISP, STK500 / Arduino bootloader, 24Cxx EEPROM, 93xxx Microwire EEPROM, ESP32 / ESP8266 esptool, STM32 SWD, STM32 UART AN3155**), ARM debug (**ADIv5, Cortex-M halt/resume/step, ELF symbol-aware peek**), JTAG IDCODE chain + BSDL boundary scan, a multi-channel logic-analyzer model with Saleae / sigrok export, and bridges for **Bus Pirate** + **slcan CAN**. The subset wired to live hardware from the CLI/MCP today is called out precisely in [Status](#status); commands without a live transport fail honestly rather than faking success.

**Rust-first.** Single self-contained binary, custom libusb FFI, custom JSON-RPC MCP server, no Node runtime required.

Replaces AsProgrammer / NeoProgrammer for the SPI-flash path, and overlaps with flashrom / avrdude / esptool / stm32flash / OpenOCD-as-bit-bang for the broader hardware surface, with one binary, native USB, image analysis, knowledge-base diagnostics, real progress reporting, and a built-in MCP server for AI agents.

## Status

Pre-release. Goal-005 shipped the multi-protocol scaffolding; goals 006 / 007 rebranded and audited; goals 008 / 010 reconciled the README with reality; goal 014 wired the genuinely-wireable protocol verbs to live hardware and made every remaining verb fail honestly instead of faking success; goal 015 made the SPI **write** path genuinely complete and safe on both programmers — real page-program with per-operation write-in-progress (WIP) polling, erase-before-program, read-back verify, automatic 4-byte addressing for chips over 16 MB, and a blank-image guard.

What drives live hardware today (CLI + MCP):
- **SPI flash + BIOS path, end to end.** `status`, `detect`, `identify`, `read`, `write`, `verify`, `erase`, `region-erase`, `blank-check`, `sfdp`, `wp-status`, `full-repair`, `full-backup` all run against the live backend (CH341A and CH347). `write` erases the affected sectors before programming (SPI program can only clear bits 1→0), programs page-by-page on page boundaries, polls the WIP status bit after every erase/program so it never races the busy chip, takes an automatic pre-write backup, and reads back to verify. `read`/`write`/`erase`/`verify` enter 4-byte addressing automatically on chips larger than 16 MB. `full-repair` drives `BackendPipelineAdapter`; `full-backup` is a full-chip read to a named file.
- **I2C, over CH341A bit-bang or CH347 native.** `i2c scan`, `i2c read`, `i2c write`, and `eeprom-i2c read/write` (24Cxx) construct the real `Ch341aI2c` / `Ch347I2c` master over the live bus.
- **JTAG IDCODE scan, over the CH347 JTAG engine.** `jtag idcode-scan` drives the real `Ch347Jtag` adapter (CH347 only; CH341A has no JTAG engine).
- **Backend auto-select.** `RATCHET_FORCE_MOCK=1` forces mock; otherwise `open_default()` probes CH347 (`1a86:55db`) then CH341A (`1a86:5512`), falling back to mock with a stderr warning. Protocol verbs use `open_raw_bus()`, which returns an honest error (never a silent mock fallback) when no device is present. `ratchet status` reports the live backend via the `backend` JSON field; `ratchet-node` picks up live silicon automatically.

Offline tools that need no hardware:
- `i2c sniff <trace.json>` decodes a captured (t_us, scl, sda) trace; `jtag bsdl-scan <file.bsdl>` parses a BSDL file and reports its boundary register; `la export <capture.json> <out> --format csv|jsonl` converts a capture; `serial-list` enumerates serial ports (POSIX); `repl` is a working stdin REPL over the SPI backend; plus all the pure analysis verbs (`analyze`, `diff`, `checksum`, `chip-info`, `search`, `post-decode`, `voltage-reference`).

What is NOT wired to live hardware yet (these fail honestly: non-zero exit / JSON-RPC error, never a fake success):
- `uart open/sniff`, `onewire scan/temp`, `swd connect/halt/resume/step/dump`, `avr signature/program/fuses/erase`, `eeprom-microwire read/write`, `esp detect/flash`, `stm32 swd-flash/uart-flash`, `la capture`, `buspirate bridge/probe`, `can sniff/send`. The protocol logic for each is implemented and unit-tested against a mock, but no live CH341A/CH347 transport adapter is wired (SWD/1-Wire/AVR-ISP/Microwire bit-bang, native UART RX, external serial/CAN devices). `monitor`, `serial` connect, and `failure-search` likewise return honest errors rather than placeholder envelopes.
- **No GitHub Releases are published yet**, so the only supported install route today is from source via `cargo install`.

470 unit + integration tests pass. The SPI write path is proven without hardware by a `LoopbackFlash` test bus that emulates a real SPI NOR chip behind the CH341A USB framing (full-duplex reads, erase/program with AND-into-flash semantics), so a write → read-back → verify round-trip is exercised end to end. Without hardware, the mock backend keeps the SPI-flash surface exercisable for development and CI; protocol verbs report honestly that a device is required.

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

## Fix your motherboard's BIOS

This is the end-to-end path for reflashing a corrupt or bricked motherboard BIOS with a
CH341A (the common ~$3 programmer) or a CH347.

**What you need**
- A CH341A or CH347 USB programmer and a SOIC-8 / SOIC-16 test clip (or a ZIF adapter if you
  desolder the chip). The BIOS flash is the 8-pin SPI chip near the chipset, usually a Winbond
  `W25Q…`, Macronix `MX25L…`, or GigaDevice `GD25Q…`.
- A **known-good BIOS image** for your exact board revision — download it from the motherboard
  vendor's support page, or keep the backup `ratchet` makes in step 2.
- **Voltage check:** most BIOS chips are 3.3 V (what a stock CH341A drives). Some are 1.8 V and
  need a level-shifter adapter — `ratchet chip-info <chip>` reports the chip's voltage so you can
  check before connecting.

**Steps** (clip onto the chip with the board powered off and unplugged):

```bash
# 1. Confirm the programmer + chip are talking.
ratchet status                # programmer detected? which backend?
ratchet identify              # reads the JEDEC ID and looks the chip up in the 806-chip DB

# 2. Back up the current contents FIRST — always, even if the BIOS looks dead.
ratchet read backup.bin       # full-chip dump → file
ratchet analyze backup.bin    # optional: UEFI volumes, ME region, integrity

# 3. Flash the known-good image. This automatically:
#      • saves a timestamped backup of the current chip,
#      • erases the affected sectors, then programs page-by-page,
#      • polls the write-in-progress bit after every operation, and
#      • reads the chip back and verifies it matches the file.
ratchet write new_bios.bin

# 4. Re-verify independently (optional — `write` already verified).
ratchet verify new_bios.bin
```

`write` refuses an all-0xFF or all-0x00 image (a blank/failed dump that would wipe the chip) and
refuses an image larger than the chip. If anything goes wrong mid-write, your original is in the
timestamped backup printed by step 3. To recover a board after a bad flash, just
`ratchet write backup.bin` from that file.

**One-shot pipeline.** `ratchet full-repair --reference new_bios.bin` runs the whole thing —
connection-quality check → double-verify read → health analysis → repair → write → post-write
verify — as a single guided workflow.

### Verifying on real hardware

CI and the test suite prove the protocol byte-for-byte without a programmer (see
[Status](#status)), but to confirm against your own board:

```bash
ratchet detect                       # programmer enumerates on USB
ratchet identify --json | jq .data   # JEDEC id matches the chip silk-screen / DB
ratchet read a.bin && ratchet read b.bin && diff a.bin b.bin   # two reads are identical (stable clip)
ratchet write new_bios.bin           # success=true verified=true in the output
```

## Quick Start - multi-protocol

These drive live hardware today (or run offline where noted). Each returns a
non-zero exit and an honest message if no device is present.

```bash
# I2C bus scan + register read (live CH341A / CH347)
ratchet i2c scan
ratchet i2c read --addr 0x50 --reg 0x00 --len 256

# 24Cxx I2C EEPROM dump / restore (live)
ratchet eeprom-i2c read --addr 0x50 --part 24c256 dump.bin
ratchet eeprom-i2c write --addr 0x50 --part 24c256 dump.bin

# JTAG IDCODE chain (live, CH347 only)
ratchet jtag idcode-scan

# Offline: decode a captured I2C trace / parse a BSDL file / convert a capture
ratchet i2c sniff trace.json
ratchet jtag bsdl-scan part.bsdl
ratchet la export capture.json out.csv --format csv

# Enumerate serial ports (POSIX)
ratchet serial-list
```

Verbs whose live transport is not yet wired (`uart`, `onewire`, `swd`, `avr`,
`eeprom-microwire`, `esp`, `stm32`, `la capture`, `buspirate`, `can`) exit
non-zero with an explanation; they never print a fake success. See
[Status](#status).

## Commands

`ratchet --help` exposes 39 top-level subcommands plus `help`. Status legend:
**[live]** drives hardware (honest error if no device), **[offline]** needs no
hardware, **[n/w]** not wired to a live transport yet (exits non-zero, never
fakes success).

| Group | Commands |
|-------|----------|
| Hardware | `status` [live], `detect` [live], `identify` [live], `monitor` [n/w] |
| Chip ops | `read` `write` `verify` `erase` `region-erase` `blank-check` `sfdp` `wp-status` [live] |
| Analysis | `analyze` `diff` `checksum` [offline] |
| Knowledge base | `search` `chip-info` `post-decode` `voltage-reference` [offline]; `failure-search` [n/w] |
| Serial | `serial-list` [offline]; `serial` connect [n/w] |
| Repair | `full-repair` [live], `full-backup` [live], `repl` [live] |
| Self-test | `self-test` (also `--self-test` flag) [offline, mock] |
| I2C | `i2c scan/read/write` [live], `i2c sniff` [offline], `eeprom-i2c read/write` [live] |
| JTAG | `jtag idcode-scan` [live, CH347], `jtag bsdl-scan` [offline] |
| Instruments | `la export` [offline]; `la capture` [n/w] |
| Not wired yet | `uart open/sniff`, `onewire scan/temp`, `swd connect/halt/resume/step/dump`, `avr signature/program/fuses/erase`, `eeprom-microwire read/write`, `esp detect/flash`, `stm32 swd-flash/uart-flash`, `buspirate bridge/probe`, `can sniff/send` [n/w] |

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

ratchet ships a built-in **MCP server** (`ratchet-mcp`) so AI agents (Claude Desktop, mcp-cli, custom SDK clients) can connect to the tool surface over stdio. Hand-rolled JSON-RPC 2.0. **30 tools total**: 18 SPI-flash / BIOS analysis tools + 12 hardware-protocol tools. The SPI-flash/BIOS tools and `i2c_scan` / `i2c_read` / `i2c_write` / `jtag_idcode_scan` run against the live backend (or an honest JSON-RPC error when no device is present); the remaining hardware tools return an honest JSON-RPC error until their transport is wired (they never return a fake success). The JSON-RPC dispatch, schema descriptors, and argument shapes are real.

```bash
ratchet-mcp                              # start the server (stdio; live backend, mock fallback)
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
| `i2c_scan` / `i2c_read` / `i2c_write` | I2C bus ops (live) |
| `jtag_idcode_scan` | JTAG chain forensics (live, CH347) |
| `uart_capture` | Two-channel UART sniff (not wired; honest error) |
| `swd_dump_ram` | ARM RAM dump over SWD (not wired; honest error) |
| `avr_program` / `esp_flash` / `stm32_swd_flash` | Target-MCU programmers (not wired; honest error) |
| `la_capture` | Multi-channel logic analyzer (not wired; honest error) |
| `bus_pirate_proxy` / `can_sniff` | External-device bridges (not wired; honest error) |

## Safety Features

ratchet is built to not brick your board. Every item below is enforced in code (see
`backends/` and `tasks/cli-smoke.sh`):

- **Auto-backup before every write.** The current chip is dumped to a timestamped file before
  programming. Opt out with `--skip-backup`.
- **Read-back verify after every write.** `write` reads the chip back and compares it to the
  file; the result is reported as `verified`. Opt out with `--skip-verify`.
- **Erase-before-program + WIP polling.** Sectors are erased before programming (SPI program can
  only clear bits 1→0), and the write-in-progress status bit is polled after every erase and page
  program, so the next command never races a still-busy chip (chip-erase can take tens of seconds).
- **Blank-image guard.** `write` refuses an all-0xFF or all-0x00 image — a blank or failed dump
  that would wipe a working BIOS. Use `erase` to intentionally blank a chip.
- **Capacity check.** Writes larger than the chip are rejected, not silently truncated.
- **Automatic 4-byte addressing** on chips over 16 MB, so large BIOS images aren't half-addressed.
- **Post-read flags.** `read` reports `all_ff` / `all_zero` so a blank (0xFF) or dead (0x00) read
  is obvious in the output.

Advisory (not an automatic block): `identify` / `chip-info` report the chip's rated voltage so you
can confirm a 1.8 V part isn't being driven by a stock 3.3 V CH341A before you connect. `erase` is
a direct destructive verb (no interactive prompt) — it's meant for scripting/agents — but `write`'s
automatic pre-write backup means a normal reflash is always recoverable.

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
- **macOS**: `brew install libusb`. The CH341A / CH347 are vendor-specific USB devices, so macOS
  loads no kernel driver for them and libusb (via IOKit) opens them directly — no kext, no Zadig,
  no extra entitlements when you run `ratchet` from a terminal. If the build can't find libusb,
  make sure Homebrew's `lib`/`include` are on the pkg-config path
  (`export PKG_CONFIG_PATH="$(brew --prefix libusb)/lib/pkgconfig"`). If a programmer doesn't
  enumerate, replug it and re-run `ratchet detect`.
- **Linux (Debian / Ubuntu)**: `sudo apt install libusb-1.0-0-dev`. For non-root access add a
  udev rule for `1a86:5512` (CH341A) / `1a86:55db` (CH347), or run with `sudo`.
- **Windows**: vcpkg-installed libusb for build; WinUSB driver via [Zadig](https://zadig.akeo.ie/) for runtime.

## History

This repo started life as `biosMCP`, a CH341A-focused BIOS chip programmer that replaced AsProgrammer / NeoProgrammer. The TypeScript prototype was fully replaced by a native Rust workspace in goal 004 (the `ts-final` git tag preserves the prior state). Goal 005 expanded the scope from SPI-flash-only into the multi-protocol hardware toolkit; goal 006 rebranded the project to `ratchet` to reflect the broader surface; goal 007 audited the full capability matrix; goal 008 added the LICENSE file and reconciled README claims with reality; goal 014 wired the genuinely-wireable protocol verbs (I2C, I2C EEPROM, JTAG IDCODE, plus offline trace/BSDL/capture tools and a working REPL) to live hardware, replaced every remaining fake-success stub with an honest non-zero failure, and tightened the read/repair/scan hot paths; goal 015 completed the SPI **write** path that actually repairs a motherboard — real page-program with write-in-progress polling, erase-before-write, read-back verify, automatic 4-byte addressing over 16 MB, and a blank-image guard, all on both CH341A and CH347 (the CH341A write/verify were previously unimplemented stubs), and rewrote the stale CLI smoke test to drive the real `ratchet` binary.

## License

MIT. See [LICENSE](LICENSE).
