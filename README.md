<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img src="docs/assets/logo-light.svg" alt="" width="88" height="88">
</picture>

<h1>ratchet<br><sub>BIOS recovery and SPI flash programming with CH341A / CH347</sub></h1>

Back up, analyze, and reflash a motherboard's BIOS chip from the terminal,<br>
or let an AI agent drive it through the built-in MCP server.

[![CI](https://github.com/jackulau/ratchet/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jackulau/ratchet/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jackulau/ratchet?color=blue)](https://github.com/jackulau/ratchet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust 1.88+](https://img.shields.io/badge/rust-1.88%2B-orange.svg?logo=rust)](rust/Cargo.toml)
[![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)](#requirements)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/jackulau/ratchet?style=flat&logo=github)](https://github.com/jackulau/ratchet/stargazers)

[Install](#install) ·
[Recover a BIOS](#recover-a-motherboard-bios) ·
[Commands](#commands) ·
[MCP server](#agent-interface-mcp) ·
[Safety](#safety) ·
[Contributing](#contributing)

</div>

---

ratchet is an open-source Rust toolkit for backing up, analyzing, and reflashing motherboard BIOS / UEFI SPI flash with CH341A and CH347 USB programmers. It can help with corrupt firmware or a board bricked by a failed flash. It does not diagnose every cause of a board that will not boot.

It is a single native binary: its own libusb bindings, its own SPI / I2C / JTAG drivers, and a hand-rolled MCP server. Nothing is shelled out to flashrom, and there is no Node or Python runtime.

> [!TIP]
> **ratchet is ready to use, and easy to try.** The SPI flash and BIOS path drives live CH341A and CH347 programmers end to end, and the same SPI flash workflow runs against a built-in mock programmer, so you can walk through it before you touch a board: `RATCHET_FORCE_MOCK=1 ratchet self-test`. As with any flashing tool, keep your own backup of the chip before you write to it.
>
> **Adding support is easy too.** A new flash chip is one JSON entry in [`chips.json`](rust/ratchet-core/data/chips.json), and the test suite needs no hardware. See [Contributing](#contributing).

**Start with your task:**

- [Recover a corrupt or bricked motherboard BIOS](#recover-a-motherboard-bios)
- [Program a WSON8 BIOS chip: probe, voltage, backup, and verification](docs/wson8-bios-recovery.md)
- [Troubleshoot macOS USB access](docs/macos-usb-permissions.md)
- [Project background and BIOS recovery overview](https://jacklau.dev/blog/ratchet/)

## Highlights

- **The whole recovery path in one tool.** Identify the chip, take a backup, inspect the image, write, and verify, with one guided command (`full-repair`) or step by step.
- **Built to not brick your board.** By default a write starts from a saved backup of the chip and ends with a read-back check. Blank images, oversized images, write-protected chips, and chips of unknown size are refused. See [Safety](#safety).
- **Rides out a bad clip.** On a CH341A, reads and writes work in resumable chunks and wait for a flickering probe to make contact again instead of failing or returning garbage.
- **Knows the silicon.** A database of 806 flash chips, SFDP sizing on the CH341A for parts that are not listed, and automatic 4-byte addressing above 16 MB.
- **Understands the image.** UEFI volumes, flash regions, NVRAM variables, integrity checks, byte-level diffs, and a POST-code decoder.
- **Ready for agents.** `ratchet-mcp` exposes 31 tools over MCP, and every destructive tool requires an explicit `"confirm": true`. Every CLI inspection command speaks `--json`.
- **Honest about what works.** A command whose hardware transport is not wired yet exits non-zero with a clear message. Nothing fakes success.

## A quick look

These commands need no programmer, so you can try them right after installing:

```console
$ ratchet search W25Q128
W25Q128JV      Winbond        jedec=ef4018 size=16 MB v=3.3V
W25Q128FW      Winbond        jedec=ef6018 size=16 MB v=1.8V
W25Q128BV      Winbond        jedec=ef4018 size=16 MB v=3.3V
W25Q128FV      Winbond        jedec=ef4018 size=16 MB v=3.3V
W25Q128JW-IM   Winbond        jedec=ef8018 size=16 MB v=1.8V
W25Q128RV      Winbond        jedec=ef4018 size=16 MB v=3.3V

$ ratchet post-decode 55
Uefi ERROR  [55] Memory not installed  -  no SPD detected
  - RAM not seated
  - Dead DIMM slot
  - Broken SPD EEPROM

$ ratchet chip-info ef4018 --json
{"ok":true,"command":"chip-info","data":{"name":"W25Q128JV","vendor":"Winbond","jedecId":"ef4018","sizeBytes":16777216,"type":"spi","pageSize":256,"sectorSize":4096,"blockSize":65536,"voltage":3.3,"needs4ByteAddr":false,"voltageMin":2.7,"voltageMax":3.6,"maxClockMhz":133}}
```

With a programmer attached, the core loop is four commands:

```bash
ratchet identify            # which chip is this?
ratchet read backup.bin     # save what is on it
ratchet write new_bios.bin  # backup, erase, program, read back
ratchet verify new_bios.bin # confirm independently
```

## Install

### Pre-built binaries (Linux and macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/jackulau/ratchet/main/install.sh | bash
```

The installer picks the newest [release](https://github.com/jackulau/ratchet/releases) for your machine (x86_64 or aarch64 Linux, Apple silicon or Intel macOS), verifies the download against the release's `SHA256SUMS`, and installs `ratchet` and `ratchet-mcp` into `/usr/local/bin`, or `~/.local/bin` if that is not writable. Set `RATCHET_INSTALL_DIR` to choose the directory and `RATCHET_VERSION` (for example `v2.0.0`) to pin a version.

On Linux the binaries need the libusb runtime: `sudo apt install libusb-1.0-0` on Debian / Ubuntu. macOS needs nothing extra.

### Build from source

The build needs Rust 1.88 or newer, libusb-1.0, pkg-config, and libclang (used to generate the libusb bindings).

**1. Install the build dependencies**

| Platform | Command |
|----------|---------|
| macOS | `brew install libusb pkgconf` (libclang ships with the Xcode command line tools) |
| Debian / Ubuntu | `sudo apt install libusb-1.0-0-dev pkg-config clang` |
| Arch | `sudo pacman -S libusb pkgconf clang` |

**2. Build and install**

```bash
git clone https://github.com/jackulau/ratchet
cd ratchet/rust
cargo install --path ratchet-cli   # the `ratchet` CLI
cargo install --path ratchet-mcp   # the `ratchet-mcp` MCP server (optional)
```

Both binaries land in `~/.cargo/bin/`.

### Check it works

```bash
ratchet --version
ratchet status       # reports the programmer it found, or the mock backend if none is attached
```

On Linux, install the udev rule so you do not need `sudo` to reach the programmer:

```bash
curl -fsSL https://raw.githubusercontent.com/jackulau/ratchet/main/packaging/70-ratchet.rules \
  | sudo tee /etc/udev/rules.d/70-ratchet.rules >/dev/null
sudo udevadm control --reload-rules && sudo udevadm trigger
```

<details>
<summary>Other ways to build, and how to uninstall</summary>

**Install into a separate directory**

```bash
cargo install --path ratchet-cli --root /opt/ratchet
cargo install --path ratchet-mcp --root /opt/ratchet
export PATH="/opt/ratchet/bin:$PATH"
```

**Run from a checkout without installing**

```bash
cd ratchet/rust
cargo build --release
# Binaries: target/release/ratchet and target/release/ratchet-mcp
```

**Uninstall**

```bash
# installed with install.sh (use the directory the installer reported)
rm -f /usr/local/bin/ratchet /usr/local/bin/ratchet-mcp

# installed with cargo; add --root /opt/ratchet if you installed with --root
cargo uninstall ratchet-cli ratchet-mcp
```

If you built from a checkout, delete the cloned directory. If you registered the MCP server with Claude Desktop, remove the `"ratchet"` entry under `mcpServers` in its config file and restart it.

</details>

<a id="fix-your-motherboards-bios"></a>

## Recover a motherboard BIOS

This is the SPI flash path for reflashing a corrupt motherboard BIOS, or recovering after a failed BIOS update, with a CH341A or CH347. A board that will not boot can also have power, CPU, RAM, or other hardware faults that reflashing will not fix.

### What you need

- **A programmer and the right connection for the chip's package.** A CH341A or CH347, plus a SOIC-8 / SOIC-16 clip for chips with exposed legs, a matching **WSON8 / WSON-8 probe** for leadless pads, or a socket or breakout for a desoldered chip. A SOIC clip cannot grip WSON pads. See the [WSON8 BIOS recovery guide](docs/wson8-bios-recovery.md).
- **A raw SPI flash image for your exact board and revision.** It must keep the board-specific data the firmware needs. A vendor BIOS download may be an update capsule or a single region, not a full-chip image you can write directly. Keep the original backup even if the current firmware is corrupt.

> [!WARNING]
> **Check the voltage before you connect anything.** Confirm the full part number against the datasheet, the adapter pinout, the chip supply, and the SPI signal levels. WSON8 describes a package, not a voltage, and some parts need a 1.8 V level-shifting adapter. `ratchet voltage-reference <jedec-id>` and the `v=` column of `ratchet search` report the rated voltage from the database, but ratchet cannot measure your programmer. Some CH341A boards supply 3.3 V while driving signals at unsafe higher levels; see [flashrom's CH341A/B hardware notes](https://flashrom.org/supported_hw/supported_prog/ch341ab.html).

### Steps

Disconnect the board's external power and batteries as its service instructions describe, then attach the matching clip or probe.

```bash
# 1. Confirm the programmer and the chip are talking.
ratchet status                # programmer detected? which backend?
ratchet identify              # reads the JEDEC ID and looks the chip up in the database

# 2. Establish stable contact and keep two matching full-chip dumps FIRST.
ratchet monitor --samples 20 --interval-ms 100
ratchet read backup.bin
ratchet read backup-check.bin
cmp backup.bin backup-check.bin   # must match; investigate all-FF or all-zero dumps
ratchet analyze backup.bin        # optional: UEFI volumes, ME region, integrity

# 3. Write the prepared raw image once the backup and image checks pass.
#    By default this backs up, erases, programs, polls WIP, and verifies.
ratchet write new_bios.bin

# 4. Require an independent successful verification before restoring power.
ratchet verify new_bios.bin
```

`ratchet full-repair --reference new_bios.bin` runs the same path as one guided workflow: connection-quality check, double-verified read, health analysis, repair, write, and post-write verify.

### If the probe will not hold contact

On the CH341A backend, reads save completed chunks and wait for contact to come back. Use smaller chunks and a longer wait for a marginal probe, and re-run the same command to resume:

```bash
ratchet read backup.bin --chunk-kb 16 --patience 300
```

### Things to know

- `write` refuses an all-0xFF or all-0x00 image (a blank or failed dump that would wipe the chip) and an image larger than the chip.
- Keep `backup.bin` somewhere separate and check the backup path that `write` reports. CH341A writes reuse a stable backup keyed by chip ID and size, while CH347 writes create a timestamped backup. Do not assume an existing automatic backup came from this particular board.
- If a write fails, keep the board powered off until the intended image has been written and verified. Restoring an original dump that was already corrupt does not guarantee recovery.

### Verifying on real hardware

CI and the test suite prove the protocol byte for byte without a programmer. To confirm against your own board:

```bash
ratchet detect                       # programmer enumerates on USB
ratchet identify --json | jq .data   # JEDEC ID matches the chip marking and the database
ratchet read a.bin && ratchet read b.bin && diff a.bin b.bin   # two reads are identical (stable clip)
ratchet write new_bios.bin           # success=true verified=true in the output
```

## Status

What drives real hardware today, what runs offline, and what is not wired yet:

| Area | State | Commands |
|------|-------|----------|
| SPI flash and BIOS | **Live** on CH341A and CH347 | `status` `detect` `identify` `monitor` `read` `write` `verify` `erase` `region-erase` `blank-check` `sfdp` `wp-status` `wp-disable` `full-repair` `full-backup` `repl` |
| I2C and 24Cxx EEPROM | **Live** (CH341A bit-bang, CH347 native) | `i2c scan` `i2c read` `i2c write` `eeprom-i2c read` `eeprom-i2c write` |
| JTAG IDCODE scan | **Live**, CH347 only | `jtag idcode-scan` |
| Image analysis and knowledge base | **Offline**, no hardware needed | `analyze` `diff` `checksum` `search` `chip-info` `post-decode` `voltage-reference` |
| Trace, capture, and self-check tools | **Offline** | `i2c sniff` `jtag bsdl-scan` `la export` `serial-list` `self-test` |
| Everything else | **Not wired** to a live transport yet | `uart` `onewire` `swd` `avr` `eeprom-microwire` `esp` `stm32` `la capture` `buspirate` `can` `serial` `failure-search` |

"Not wired" means the protocol logic is implemented and unit-tested against a mock, but no live CH341A / CH347 transport adapter exists for it yet. Those commands exit non-zero (or return a JSON-RPC error over MCP). They never report a fake success.

<details>
<summary>How the live paths work</summary>

- **SPI flash and BIOS.** `write` erases the affected sectors first (SPI programming can only clear bits from 1 to 0), programs page by page, polls the write-in-progress (WIP) bit after every erase and program so it never races a busy chip, takes a pre-write backup, and reads back to verify. Chips larger than 16 MB switch to 4-byte addressing automatically.
- **Backend selection.** `open_default()` probes for a CH347 (`1a86:55db`), then a CH341A (`1a86:5512`), then falls back to the mock backend with a warning on stderr. `RATCHET_FORCE_MOCK=1` forces the mock. Protocol verbs use `open_raw_bus()`, which returns an error rather than silently falling back to the mock when no device is present. `ratchet status` reports the active backend.
- **Hardened destructive paths.** A short USB read is a hard error, not zero-padded data. Erase and write refuse write-protected chips and a silently selected mock backend, and write refuses a chip of unknown capacity. 4-byte mode is always exited after use.
- **Tested without hardware.** A `LoopbackFlash` test bus emulates an SPI NOR chip behind the CH341A USB framing, so a full write, read-back, and verify round trip runs in CI. More than 500 unit and integration tests pass on Linux and macOS.

</details>

## Commands

`ratchet --help` lists 40 top-level subcommands. The [Status](#status) table shows which of them drive hardware today.

| Group | Commands |
|-------|----------|
| Hardware | `status` `detect` `identify` `monitor` |
| Chip operations | `read` `write` `verify` `erase` `region-erase` `blank-check` `sfdp` `wp-status` `wp-disable` |
| Workflows | `full-repair` `full-backup` `repl` `self-test` |
| Image analysis | `analyze` `diff` `checksum` |
| Knowledge base | `search` `chip-info` `post-decode` `voltage-reference` `failure-search` |
| I2C | `i2c scan / read / write / sniff`, `eeprom-i2c read / write` |
| JTAG | `jtag idcode-scan`, `jtag bsdl-scan` |
| Serial and instruments | `serial-list` `serial` `la export` `la capture` |
| Not wired yet | `uart` `onewire` `swd` `avr` `eeprom-microwire` `esp` `stm32` `buspirate` `can` |

Inspection commands support `--json`. Most return one envelope shape, `{ok, command, data?|error, nextAction?}`; `search` and `post-decode` print a bare JSON array instead.

```bash
ratchet status --json
ratchet chip-info ef4017 --json
ratchet analyze backup.bin --json | jq '.data.regions'
```

Exit codes are meant to be scripted against: `verify` exits non-zero on a mismatch, `blank-check` exits non-zero when the chip is not blank, and `write` and `full-repair` exit non-zero when the write does not verify or a repair step fails. In those cases `--json` prints an envelope with `"ok": false` and the reason in `error`.

<details>
<summary>More examples: I2C, EEPROM, JTAG, and offline tools</summary>

```bash
# I2C bus scan and register read (live CH341A / CH347)
ratchet i2c scan
ratchet i2c read --addr 0x50 --reg 0x00 --len 256

# 24Cxx I2C EEPROM dump and restore (live)
ratchet eeprom-i2c read --addr 0x50 --part 24c256 dump.bin
ratchet eeprom-i2c write --addr 0x50 --part 24c256 dump.bin

# JTAG IDCODE chain (live, CH347 only)
ratchet jtag idcode-scan

# Offline: decode a captured I2C trace, parse a BSDL file, convert a capture
ratchet i2c sniff trace.json
ratchet jtag bsdl-scan part.bsdl
ratchet la export capture.json out.csv --format csv

# Enumerate serial ports (POSIX)
ratchet serial-list
```

</details>

## Agent interface (MCP)

`ratchet-mcp` is a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes ratchet to AI agents over stdio, using hand-rolled JSON-RPC 2.0. It serves 31 tools: 19 for SPI flash and BIOS analysis and 12 for hardware protocols.

```bash
ratchet-mcp                # start the server (stdio; live backend, mock fallback)
ratchet-mcp --list-tools   # print the tool names, one per line
```

Register it with Claude Desktop in `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ratchet": {
      "command": "ratchet-mcp"
    }
  }
}
```

Destructive tools (`write_chip`, `erase_chip`, `region_erase`, `wp_disable`, `i2c_write`) require `"confirm": true` in their arguments. A call without it gets a JSON-RPC error, so an agent cannot write or erase by accident.

| Tool | Purpose |
|------|---------|
| `detect` | Scan USB for CH34x programmers |
| `identify` | Read JEDEC ID and SFDP, then look the chip up |
| `read_chip` `write_chip` `verify_chip` `erase_chip` | SPI flash operations |
| `wp_disable` | Clear block-protect bits |
| `analyze_image` `bios_regions` `nvram_vars` | BIOS image inspection |
| `search_chips` `chip_info` | Chip database |
| `post_decode` `failure_search` `voltage_reference` | Diagnostics knowledge base |
| `i2c_scan` `i2c_read` `i2c_write` | I2C bus operations (live) |
| `jtag_idcode_scan` | JTAG chain scan (live, CH347) |
| `uart_capture` `swd_dump_ram` `avr_program` `esp_flash` `stm32_swd_flash` `la_capture` `bus_pirate_proxy` `can_sniff` | Not wired yet; these return a JSON-RPC error |

## Safety

ratchet is built to not brick your board. Each item here is enforced in code and covered by the unit tests and the smoke suites in `tasks/`.

- **Backup before writing.** On by default. On a CH341A, an existing complete backup for the same chip ID and size is reused rather than overwritten, so keep your own copy per board (see [Things to know](#things-to-know)). Opt out with `--skip-backup`.
- **Read-back verify after every write.** `write` reads the chip back and compares it to the file. A mismatch is an error and a non-zero exit, not a `verified: false` to go looking for. Opt out with `--skip-verify`.
- **Blank-image guard.** `write` refuses an all-0xFF or all-0x00 image. Use `erase` to blank a chip on purpose.
- **Capacity and write-protect guards.** Images larger than the chip, chips the database cannot size, and chips with block-protect bits set are refused instead of being written blind.
- **No silent mock writes.** Destructive commands refuse to run when no programmer is attached and the factory fell back to the mock backend. Only an explicit `RATCHET_FORCE_MOCK=1` allows it.
- **MCP confirm gate.** Destructive MCP tools require `"confirm": true`.

<details>
<summary>The full list</summary>

- **Pre-write backup details.** CH341A uses a stable backup keyed by chip ID and size and preserves an existing complete backup across retries. CH347 creates a timestamped backup. Keep your own board-specific copy before writing.
- **Gateable exit codes.** `verify` exits non-zero on a mismatch and `blank-check` exits non-zero when the chip is not blank (the JSON envelope is still emitted first), so shell scripts can branch on them as they would with flashrom. `write` exits non-zero when the write fails or does not verify, and `full-repair` exits non-zero when any step fails; both then emit an `"ok": false` envelope that still carries the backup path or the per-step results. Over MCP, a failed `write_chip` is a JSON-RPC error.
- **`wp-disable` remedy.** A `write protected` refusal has an in-tool fix: `wp-disable` clears the block-protect bits (confirm-gated on MCP, destructive-gated on the CLI) and exits non-zero if protection survives, as with a hardware WP pin or an OTP lock.
- **Erase before program, with WIP polling.** Sectors are erased before programming, and the write-in-progress status bit is polled after every erase and page program, so the next command never races a busy chip (a chip erase can take tens of seconds).
- **Unknown capacity is refused.** Chips the database cannot size (`unknown chip capacity`) are refused outright instead of written blind.
- **Write-protect guard.** Protected silicon silently ignores program commands, which would otherwise read as a fake success, so erase and write refuse a chip whose block-protect bits are set.
- **Backend is visible.** Destructive-operation JSON carries a `backend` field so an agent can tell silicon from the mock.
- **Short-read detection.** A USB transfer that delivers fewer bytes than requested is a hard `short transfer` error, never zero-padded data. This protects reads, verifies, and backups.
- **Automatic 4-byte addressing** on chips over 16 MB, so large BIOS images are not half-addressed. 4-byte mode is always exited when the operation completes, so the chip is never left misaddressing for the next tool or for the board itself.
- **Backup no-clobber.** `full-backup` refuses to overwrite an existing `ratchet-backup-<chip>.bin` without `--force`, because it may be your only copy of a working BIOS.
- **Post-read flags.** `read --json` reports `allFF` and `allZero`, so a blank or dead read is easy to detect.

</details>

What ratchet cannot do for you: `voltage-reference` and `search` report the chip's rated voltage, but nothing stops you from connecting a 1.8 V part to a 3.3 V programmer. The CLI `erase` verb has no interactive prompt, because it is meant for scripting. A backup helps restore prior contents, but a successful recovery also depends on the hardware, the connection, and the firmware image.

## Supported hardware

### Programmers

| Programmer | USB ID | Notes |
|------------|--------|-------|
| **CH341A** | `1a86:5512` | The most common and cheapest option. SPI plus bit-bang I2C. |
| **CH347** | `1a86:55db`, `1a86:55de` | Newer and faster: SPI up to 60 MHz, native I2C, and JTAG. The HID-mode variant uses a different endpoint layout and is not supported. |

### Flash chips

806 chips in the database, from Winbond, Macronix, GigaDevice, SST / Microchip, EON, Spansion / Cypress / Infineon, Micron / Numonyx, ISSI, AMIC, XMC, PUYA, ESMT, Intel, Atmel / Adesto, and others, in both 3.3 V and 1.8 V variants. Run `ratchet search <name>` to check for yours. On a CH341A, unlisted chips are sized through SFDP where the chip supports it.

### Target MCUs (protocol logic only, not wired yet)

- **AVR**: ATmega328P (Arduino UNO), ATmega2560, ATtiny85, ATmega32U4 over ISP or the STK500 bootloader.
- **STM32**: F0 / F1 / F2 / F3 / F4 / F7 / G0 / G4 / H7 / L0 / L4 / L5 over SWD or the AN3155 UART bootloader.
- **ESP**: ESP8266, ESP32, ESP32-S2 / S3 / C3 / C6 over the ROM bootloader with an optional stub.
- **ARM Cortex-M**: a generic debug surface (halt, resume, step, RAM dump) over SWD for any ADIv5-compliant target.

## Requirements

- **Build**: Rust 1.88+, libusb-1.0, pkg-config, and libclang. See [Install](#install).
- **macOS**: `brew install libusb pkgconf`. The CH341A and CH347 are vendor-specific USB devices, so macOS loads no kernel driver for them and libusb opens them directly: no kext, no Zadig, and no extra entitlements when you run `ratchet` from a terminal. If the build cannot find libusb, put Homebrew's copy on the pkg-config path with `export PKG_CONFIG_PATH="$(brew --prefix libusb)/lib/pkgconfig"`. If a programmer does not enumerate, replug it and run `ratchet detect` again. More in the [macOS USB guide](docs/macos-usb-permissions.md).
- **Linux**: `sudo apt install libusb-1.0-0-dev pkg-config clang` on Debian and Ubuntu. For access without root, install [`packaging/70-ratchet.rules`](packaging/70-ratchet.rules) as shown under [Install](#install).
- **Windows**: not covered by CI. Building needs libusb from vcpkg, and the programmer needs the WinUSB driver installed with [Zadig](https://zadig.akeo.ie/).

## Architecture

```
rust/
├── ratchet-usb-sys   libusb FFI generated by bindgen (no rusb / nusb)
├── ratchet-usb       safe RAII wrapper, error mapping, bulk and control transfers
├── ratchet-core      chip database, backends (mock / CH341A / CH347), BIOS analyzer,
│                     repair, NVRAM, UEFI, knowledge base, protocols, programmers,
│                     debug, instruments, workflow pipeline, agent envelope
├── ratchet-cli       the `ratchet` binary (clap, 40 subcommands)
├── ratchet-mcp       the `ratchet-mcp` server (JSON-RPC 2.0 over stdio, 31 tools)
└── ratchet-node      optional napi-rs bridge for Node consumers
```

ratchet talks SPI, I2C, and JTAG directly over libusb and shells out to nothing at runtime. It is an alternative to flashrom, AsProgrammer, and NeoProgrammer on the SPI flash path, not a wrapper around them.

Beyond the live paths, `ratchet-core` carries a unit-tested protocol layer (UART, 1-Wire, passive SPI sniff, SWD, CAN), target-MCU programmers (AVR ISP, STK500, 93xxx EEPROM, ESP32 / ESP8266, STM32), an ARM debug surface (ADIv5, Cortex-M halt / resume / step, ELF-aware memory peek), BSDL boundary scan, a logic-analyzer model with Saleae and sigrok export, and Bus Pirate and slcan CAN bridges. These are the pieces waiting for a live transport.

## Roadmap

- Wire the remaining protocol groups (UART, 1-Wire, SWD, AVR ISP, Microwire, ESP, STM32, logic analyzer) to live transports
- Prebuilt binaries for macOS and Linux attached to every release
- Bundle a failure-pattern knowledge base for `failure-search`
- Benchmarks and throughput numbers measured on real hardware

## Contributing

Contributions are welcome, and ratchet is built to be easy to test and extend. You do not need a programmer to work on it: the mock backend and the loopback test bus run everything, locally and in CI.

- **Try it without hardware.** `RATCHET_FORCE_MOCK=1 ratchet self-test` runs the full integration check against the mock programmer.
- **Add a chip.** One JSON entry in [`rust/ratchet-core/data/chips.json`](rust/ratchet-core/data/chips.json), with the values from the datasheet.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks CI runs, and the project rules.
- Tried it on real hardware? File a [hardware report](https://github.com/jackulau/ratchet/issues/new?template=hardware_report.yml), whether it worked or not.
- Found a security problem? Follow [SECURITY.md](SECURITY.md) and report it privately.

This project follows a [code of conduct](CODE_OF_CONDUCT.md).

## Star history

<a href="https://www.star-history.com/#jackulau/ratchet&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=jackulau/ratchet&type=Date&theme=dark">
    <img src="https://api.star-history.com/svg?repos=jackulau/ratchet&type=Date" alt="Star history chart for jackulau/ratchet" width="640">
  </picture>
</a>

If ratchet saved a board for you, a star helps other people find it.

## License

MIT. See [LICENSE](LICENSE).
