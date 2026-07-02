# ratchet

A hardware debug and flash-programming toolkit for CH341A and CH347 USB programmers.

Its core is SPI flash programming and BIOS analysis, the path that drives live silicon end to end. Around it sits a unit-tested protocol layer (I2C, UART, 1-Wire, passive SPI sniff, JTAG, SWD, CAN), target-MCU programmers (AVR ISP, STK500 / Arduino bootloader, 24Cxx and 93xxx EEPROM, ESP32 / ESP8266, STM32 over SWD and AN3155 UART), an ARM debug surface (ADIv5, Cortex-M halt/resume/step, ELF-aware memory peek), JTAG IDCODE and BSDL boundary scan, a logic-analyzer model with Saleae / sigrok export, and Bus Pirate / slcan CAN bridges.

Not all of that is wired to live hardware yet. [Status](#status) marks every command `[live]`, `[offline]`, or `[n/w]` (not wired). The rule throughout: a command with no live transport exits non-zero with a clear message; it never fakes success.

Written in Rust: a single self-contained binary with custom libusb FFI and a hand-rolled JSON-RPC MCP server, no Node or Python runtime. It replaces AsProgrammer and NeoProgrammer on the SPI-flash path, and covers ground otherwise split across flashrom, avrdude, esptool, stm32flash, and OpenOCD: native USB, image analysis, a knowledge base of diagnostics, and a built-in MCP server for AI agents.

## Status

Pre-release. No GitHub Releases are published yet, so the only install route today is from source (see [Install](#install)).

What drives live hardware today (CLI + MCP):

- **SPI flash + BIOS, end to end.** `status`, `detect`, `identify`, `read`, `write`, `verify`, `erase`, `region-erase`, `blank-check`, `sfdp`, `wp-status`, `full-repair`, and `full-backup` run against a live CH341A or CH347. `write` erases the affected sectors first (SPI program can only clear bits 1→0), programs page by page, polls the write-in-progress (WIP) bit after every erase and program so it never races a busy chip, takes an automatic pre-write backup, and reads back to verify. Chips larger than 16 MB switch to 4-byte addressing automatically. `full-repair` runs the guided pipeline; `full-backup` is a full-chip read to a named file.
- **I2C**, over CH341A bit-bang or CH347 native. `i2c scan`, `i2c read`, `i2c write`, and `eeprom-i2c read/write` (24Cxx) use the real `Ch341aI2c` / `Ch347I2c` master over the live bus.
- **JTAG IDCODE scan**, over the CH347 JTAG engine (CH341A has none). `jtag idcode-scan` drives the real `Ch347Jtag` adapter.
- **Backend auto-select.** `open_default()` probes CH347 (`1a86:55db`), then CH341A (`1a86:5512`), then falls back to mock with a stderr warning; `RATCHET_FORCE_MOCK=1` forces mock. Protocol verbs use `open_raw_bus()`, which returns an honest error rather than a silent mock fallback when no device is present. `ratchet status` reports the active backend in its `backend` JSON field.

Offline tools that need no hardware:

- `i2c sniff <trace.json>` decodes a captured (t_us, scl, sda) trace; `jtag bsdl-scan <file.bsdl>` parses a BSDL file and reports its boundary register; `la export <capture.json> <out> --format csv|jsonl` converts a capture; `serial-list` enumerates serial ports (POSIX); `repl` is a stdin REPL over the SPI backend; plus the analysis verbs `analyze`, `diff`, `checksum`, `chip-info`, `search`, `post-decode`, and `voltage-reference`.

Not wired to live hardware yet: `uart`, `onewire`, `swd`, `avr`, `eeprom-microwire`, `esp`, `stm32`, `la capture`, `buspirate`, `can`, plus `monitor`, `serial` connect, and `failure-search`. Each one's protocol logic is implemented and unit-tested against a mock, but no live CH341A/CH347 transport adapter is wired for it yet (SWD / 1-Wire / AVR-ISP / Microwire bit-bang, native UART RX, external serial/CAN devices). They exit non-zero (or return a JSON-RPC error), never a fake success.

The destructive paths are hardened: a short USB read is a hard error instead of silent zero-padding; erase and write refuse write-protected silicon, unknown-capacity chips, and a silently-selected mock backend; 4-byte mode is always exited after use; whole-range reads stream inside a single chip-select assertion. The SPI write path is proven without hardware by a `LoopbackFlash` test bus that emulates an SPI NOR chip behind the CH341A USB framing (full-duplex reads, erase/program with AND-into-flash semantics), so a write → read-back → verify round-trip runs end to end. The mock backend keeps the SPI-flash surface exercisable in CI when no device is attached. 498 unit and integration tests pass.

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
- A known-good BIOS image for your exact board revision - download it from the motherboard
  vendor's support page, or keep the backup `ratchet` makes in step 2.
- **Voltage check:** most BIOS chips are 3.3 V (what a stock CH341A drives). Some are 1.8 V and
  need a level-shifter adapter - `ratchet chip-info <chip>` reports the chip's voltage so you can
  check before connecting.

**Steps** (clip onto the chip with the board powered off and unplugged):

```bash
# 1. Confirm the programmer + chip are talking.
ratchet status                # programmer detected? which backend?
ratchet identify              # reads the JEDEC ID and looks the chip up in the 806-chip DB

# 2. Back up the current contents FIRST - always, even if the BIOS looks dead.
ratchet read backup.bin       # full-chip dump → file
ratchet analyze backup.bin    # optional: UEFI volumes, ME region, integrity

# 3. Flash the known-good image. This automatically:
#      • saves a timestamped backup of the current chip,
#      • erases the affected sectors, then programs page-by-page,
#      • polls the write-in-progress bit after every operation, and
#      • reads the chip back and verifies it matches the file.
ratchet write new_bios.bin

# 4. Re-verify independently (optional - `write` already verified).
ratchet verify new_bios.bin
```

`write` refuses an all-0xFF or all-0x00 image (a blank/failed dump that would wipe the chip) and
refuses an image larger than the chip. If anything goes wrong mid-write, your original is in the
timestamped backup printed by step 3. To recover a board after a bad flash, just
`ratchet write backup.bin` from that file.

**One-shot pipeline.** `ratchet full-repair --reference new_bios.bin` runs the whole thing -
connection-quality check → double-verify read → health analysis → repair → write → post-write
verify - as a single guided workflow.

### Verifying on real hardware

CI (`.github/workflows/ci.yml`: fmt, clippy `-D warnings`, full test suite, strict doc
build, and both smoke suites under `RATCHET_FORCE_MOCK=1`) and the test suite prove the
protocol byte-for-byte without a programmer (see [Status](#status)), but to confirm
against your own board:

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

Verbs whose live transport isn't wired yet (`uart`, `onewire`, `swd`, `avr`,
`eeprom-microwire`, `esp`, `stm32`, `la capture`, `buspirate`, `can`) exit
non-zero with an explanation (see [Status](#status)).

## Commands

`ratchet --help` exposes 40 top-level subcommands plus `help`. Status legend:
`[live]` drives hardware (honest error if no device), `[offline]` needs no
hardware, `[n/w]` not wired to a live transport yet (exits non-zero, never
fakes success).

| Group | Commands |
|-------|----------|
| Hardware | `status` [live], `detect` [live], `identify` [live], `monitor` [n/w] |
| Chip ops | `read` `write` `verify` `erase` `region-erase` `blank-check` `sfdp` `wp-status` `wp-disable` [live] |
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
`{ok, command, data?|error, nextAction?}`.

```bash
ratchet status --json
ratchet chip-info ef4017 --json
ratchet analyze backup.bin --json | jq '.data.regions'
```

## Agent Interface (MCP)

ratchet ships a built-in MCP server (`ratchet-mcp`) that exposes the tool surface to AI agents
(Claude Desktop, mcp-cli, custom SDK clients) over stdio, using hand-rolled JSON-RPC 2.0. It
serves 31 tools: 19 for SPI-flash / BIOS analysis and 12 for hardware protocols. The
SPI-flash/BIOS tools plus `i2c_scan`, `i2c_read`, `i2c_write`, and `jtag_idcode_scan` run against
the live backend; the remaining hardware tools return a JSON-RPC error until their transport is
wired. The JSON-RPC dispatch, schema descriptors, and argument shapes are real.

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
| `wp_disable` | Clear block-protect bits (confirm-gated) |
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
- **Gateable exit codes.** `verify` exits non-zero on a mismatch and `blank-check` exits
  non-zero when the chip is not blank (the JSON envelope is still emitted first), so shell
  scripts can branch on them like flashrom.
- **`wp-disable` remedy.** A `write protected` refusal has an in-tool fix: `wp-disable`
  clears the block-protect bits (confirm-gated on MCP, destructive-gated on the CLI) and
  exits non-zero if protection survives (a hardware WP pin or OTP lock).
- **Erase-before-program + WIP polling.** Sectors are erased before programming (SPI program can
  only clear bits 1→0), and the write-in-progress status bit is polled after every erase and page
  program, so the next command never races a still-busy chip (chip-erase can take tens of seconds).
- **Blank-image guard.** `write` refuses an all-0xFF or all-0x00 image - a blank or failed dump
  that would wipe a working BIOS. Use `erase` to intentionally blank a chip.
- **Capacity check.** Writes larger than the chip are rejected, not silently truncated; chips the
  database cannot size (`unknown chip capacity`) are refused outright instead of written blind.
- **Write-protect guard.** Erase and write refuse a chip whose block-protect bits are set
  (`write protected`) - protected silicon silently ignores program commands, which would
  otherwise read as a fake success.
- **No silent mock writes.** The CLI `write`/`erase`/`region-erase`/`full-repair` verbs and the
  MCP `write_chip`/`erase_chip`/`region_erase` tools refuse to run when the factory silently fell
  back to the mock backend (no programmer attached); only an explicit `RATCHET_FORCE_MOCK=1`
  allows it. Destructive-op JSON carries a `backend` field so agents can tell silicon from mock.
- **MCP confirm gate.** The destructive MCP tools require `"confirm": true` in their arguments;
  calls without it get a JSON-RPC error, so an agent can never write or erase by accident.
- **Short-read detection.** A USB transfer that delivers fewer bytes than requested is a hard
  `short transfer` error, never zero-padded data - protecting reads, verifies, and backups.
- **Automatic 4-byte addressing** on chips over 16 MB, so large BIOS images aren't half-addressed
  - and 4-byte mode is always exited when the operation completes, so the chip is never left
  misaddressing for the next tool (or the board itself).
- **Backup no-clobber.** `full-backup` refuses to overwrite an existing
  `ratchet-backup-<chip>.bin` without `--force` - it may be your only copy of a working BIOS.
- **Post-read flags.** `read` reports `all_ff` / `all_zero` so a blank (0xFF) or dead (0x00) read
  is obvious in the output.

Advisory (not an automatic block): `identify` / `chip-info` report the chip's rated voltage so you
can confirm a 1.8 V part isn't being driven by a stock 3.3 V CH341A before you connect. The CLI
`erase` verb has no interactive prompt (it's meant for scripting; the MCP surface has the confirm
gate instead) - but `write`'s automatic pre-write backup means a normal reflash is always
recoverable.

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
├── ratchet-cli       ← clap-based CLI, 40 top-level subcommands + --self-test flag
├── ratchet-mcp       ← MCP JSON-RPC 2.0 server (31 tools, stdio)
└── ratchet-node      ← optional napi-rs bridge for Node consumers
```

Fully native: direct SPI / I2C / UART / JTAG / SWD over libusb, with nothing shelled out at
runtime. ratchet is an alternative to flashrom / avrdude / esptool / stm32flash / OpenOCD, not a
wrapper around them.

## Supported Hardware

### Programmers

- **CH341A** (`1a86:5512`): most common, SPI plus bit-bang I2C, ~$3 on AliExpress. (The JTAG/SWD/1-Wire bit-bang transports are not wired; those verbs fail honestly.)
- **CH347** (`1a86:55db`, `55de`): newer, up to 60 MHz SPI, native I2C + UART, JTAG. (The HID-mode CH347 variant uses a different endpoint layout and is not supported.)
- **CH343** (`1a86:55d3`): recognized in `serial-list` enumeration only; the `serial connect` verb is not wired.

### Flash Chips (806 in database)

Winbond, Macronix, GigaDevice, SST / Microchip, EON, Spansion / Cypress / Infineon, Micron / Numonyx, ISSI, AMIC, XMC, PUYA, ESMT, Intel, Atmel / Adesto, and more. Both 3.3 V and 1.8 V variants.

### Target MCUs

- **AVR**: ATmega328P (Arduino UNO), ATmega2560, ATtiny85, ATmega32U4 via ISP or STK500 bootloader.
- **STM32**: F0 / F1 / F2 / F3 / F4 / F7 / G0 / G4 / H7 / L0 / L4 / L5 via SWD or AN3155 UART bootloader.
- **ESP**: ESP8266, ESP32, ESP32-S2 / S3 / C3 / C6 via ROM bootloader + optional stub.
- **ARM Cortex-M**: generic debug surface (halt / resume / step / RAM dump) via SWD on any ADIv5-compliant target.

## Requirements

- **End user (cargo-install path)**: Rust 1.82+ and libusb-1.0 (system package).
- **macOS**: `brew install libusb`. The CH341A / CH347 are vendor-specific USB devices, so macOS
  loads no kernel driver for them and libusb (via IOKit) opens them directly - no kext, no Zadig,
  no extra entitlements when you run `ratchet` from a terminal. If the build can't find libusb,
  make sure Homebrew's `lib`/`include` are on the pkg-config path
  (`export PKG_CONFIG_PATH="$(brew --prefix libusb)/lib/pkgconfig"`). If a programmer doesn't
  enumerate, replug it and re-run `ratchet detect`.
- **Linux (Debian / Ubuntu)**: `sudo apt install libusb-1.0-0-dev`. For non-root access add a
  udev rule for `1a86:5512` (CH341A) / `1a86:55db` (CH347), or run with `sudo`.
- **Windows**: vcpkg-installed libusb for build; WinUSB driver via [Zadig](https://zadig.akeo.ie/) for runtime.

## History

ratchet began as **biosMCP**, a CH341A-focused BIOS programmer built to replace AsProgrammer and
NeoProgrammer. The original TypeScript prototype was rewritten as a native Rust workspace (the
prior state is preserved at the `ts-final` git tag), then grew from a SPI-flash-only tool into the
broader multi-protocol toolkit and was renamed ratchet to match its wider scope.

## License

MIT. See [LICENSE](LICENSE).
