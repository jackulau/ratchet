# biospy

Modern BIOS chip programmer and debugger for **CH341A / CH347** USB programmers.

**Rust-first.** Single self-contained binary, custom libusb FFI, custom JSON-RPC
MCP server, no Node runtime required. The previous TypeScript implementation
was fully replaced in goal 004; the `ts-final` git tag preserves the prior
state for reference.

Replaces AsProgrammer / NeoProgrammer with one tool that has native USB
support, safety guards, BIOS image analysis, knowledge-base diagnostics,
real progress reporting, and a built-in MCP server for AI agents.

## Install

### macOS / Linux — pre-built binary (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/jacklau/biosMCP/main/install.sh | bash
```

This downloads the latest release for your host triple from GitHub Releases
and installs `biospy` + `biospy-mcp` into `/usr/local/bin` (or `~/.local/bin`
if the former isn't writable).

### From source via cargo

```bash
git clone https://github.com/jacklau/biosMCP
cd biosMCP/rust
cargo install --path biospy-cli
cargo install --path biospy-mcp
```

The release-profile binaries land in `rust/target/release/biospy` and
`rust/target/release/biospy-mcp` and run standalone — no Node, no Python.

### Via npm (thin wrapper)

```bash
npm install -g biospy
```

The npm package is a wrapper: `postinstall` downloads the same native binary
from GitHub Releases. Useful if your toolchain already runs through npm.

### Windows

Pre-built `biospy.exe` + `biospy-mcp.exe` are on the GitHub Releases page.
Install the WinUSB driver for your CH34x device via [Zadig](https://zadig.akeo.ie/)
before first use.

## Quick Start

```bash
# 1. Plug in CH341A programmer with chip in ZIF socket
biospy status                # check connection
biospy identify              # JEDEC ID + chip lookup

# 2. Read current BIOS (always do this first!)
biospy read backup.bin       # dumps chip → file

# 3. Analyze what you read
biospy analyze backup.bin

# 4. Flash new BIOS (auto-backs up current chip first)
biospy write new_bios.bin

# 5. Verify
biospy verify new_bios.bin
```

## Commands

| Group | Commands |
|-------|----------|
| Hardware | `status`, `detect`, `identify`, `connection-test`, `monitor` |
| Chip ops | `read`, `write`, `verify`, `erase`, `region-erase`, `blank-check`, `sfdp`, `wp-status` |
| Analysis | `analyze`, `diff`, `checksum`, `bios-regions`, `nvram-vars` |
| Knowledge base | `search`, `chip-info`, `post-decode`, `failure-search`, `voltage-reference` |
| Serial | `serial`, `serial-list` |
| Repair | `full-repair`, `full-backup`, `repl` |
| Self-test | `--self-test` (top-level flag) |

Every inspection command supports `--json` for AgentEnvelope output:
`{ok, command, data?|error, nextAction?}`. Long-running commands also accept
`--ndjson` for line-delimited progress events.

```bash
biospy status --json
biospy chip-info ef4017 --json
biospy analyze backup.bin --json | jq '.data.regions'
biospy read backup.bin --ndjson
```

## Agent Interface (MCP)

biospy ships a built-in **MCP server** (`biospy-mcp`) so AI agents — Claude
Desktop, mcp-cli, custom SDK clients — can drive the hardware directly.
Hand-rolled JSON-RPC 2.0 over stdio, 18 tools.

```bash
biospy-mcp                              # live mode (real USB)
BIOSPY_FORCE_MOCK=1 biospy-mcp          # mock mode (no hardware)
```

Register with Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "biospy": {
      "command": "biospy-mcp"
    }
  }
}
```

### Tools

| Tool | Purpose |
|------|---------|
| `detect` | Scan USB for CH34x programmers |
| `identify` | Read JEDEC ID + SFDP + DB lookup |
| `sfdp` | Read SFDP parameter table |
| `wp_status` | Read write-protection bits |
| `read_chip` | Dump flash to file |
| `write_chip` | Program file → flash |
| `verify_chip` | Compare chip vs file |
| `erase_chip` | Full chip erase |
| `region_erase` | Partial erase |
| `blank_check` | Verify chip is all 0xFF |
| `analyze_image` | Parse BIOS image (regions, UEFI, vendor) |
| `bios_regions` | Intel FD region layout |
| `nvram_vars` | List UEFI NVRAM variables |
| `search_chips` | Fuzzy search the 806-chip database |
| `chip_info` | Full chip details + write recommendations |
| `post_decode` | Decode AMI/Award/Phoenix/UEFI POST codes |
| `failure_search` | Search motherboard failure patterns |
| `voltage_reference` | Voltage class for a JEDEC ID |

## Safety Features

biospy refuses to let you brick your board:

- **Auto-backup** before every write — original chip contents saved to a
  timestamped backup
- **Verify-after-write** by default
- **Blank file detection** — refuses to write all-0xFF or all-0x00 files
- **File size check** — blocks writes that exceed chip capacity
- **1.8V voltage gate** — flags 1.8V chips on stock CH341A (3.3V output)
- **Erase confirmation** required before destructive ops
- **Post-read warnings** — alerts on blank (0xFF) or failed (0x00) reads

## Architecture

```
rust/
├── biospy-usb-sys   ← custom libusb FFI via bindgen (no rusb / nusb)
├── biospy-usb       ← safe RAII wrapper, error mapping, bulk/control transfers
├── biospy-core      ← chip db (806 chips), backends (mock/CH341A/CH347),
│                      BIOS analyzer, repair, NVRAM, UEFI, knowledge-base,
│                      workflow pipeline, REPL state, agent envelope
├── biospy-cli       ← clap-based CLI (26 subcommands + --self-test flag)
├── biospy-mcp       ← MCP JSON-RPC 2.0 server (18 tools, stdio)
└── biospy-node      ← optional napi-rs bridge for Node consumers
```

**Fully native.** Direct SPI over libusb. No external tools shelled out.
No `flashrom` dependency at runtime — biospy is an alternative to it, not a
wrapper around it.

## Supported Hardware

### Programmers

- **CH341A** (`1a86:5512`) — most common, SPI, ~$3 on AliExpress
- **CH347** (`1a86:55db`, `55dc`, `55de`) — newer, up to 60MHz, SPI/I2C/JTAG
- **CH343** (`1a86:55d3`) — UART serial-debug only

### Flash Chips (806 in database)

Winbond, Macronix, GigaDevice, SST/Microchip, EON, Spansion/Cypress/Infineon,
Micron/Numonyx, ISSI, AMIC, XMC, PUYA, ESMT, Intel, Atmel/Adesto, and more.
Both 3.3V and 1.8V variants.

## Requirements

- **End user**: nothing extra (pre-built binary is self-contained)
- **From-source build**: Rust 1.80+, libusb-1.0 (system package)
- **macOS**: `brew install libusb`
- **Linux (Debian/Ubuntu)**: `sudo apt install libusb-1.0-0-dev`
- **Windows**: vcpkg-installed libusb for build; WinUSB driver for runtime

## License

MIT.
