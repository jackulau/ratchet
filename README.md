# biospy

Modern BIOS chip programmer and debugger for CH341A / CH347 USB programmers.

Replaces AsProgrammer and NeoProgrammer with a single tool that has native USB support, safety guards, BIOS image analysis, and real progress reporting. No external tools required.

## Install

```bash
git clone <this-repo> && cd biospy
./install.sh
```

Or manually:

```bash
npm install
npm run build
node dist/cli.js status
```

Global install after building:

```bash
npm link
biospy status
```

## Quick Start

```bash
# 1. Plug in CH341A programmer with chip in ZIF socket
biospy status           # check connection

# 2. Read current BIOS (always do this first!)
biospy read backup.bin  # dumps chip → file

# 3. Analyze what you read
biospy analyze backup.bin

# 4. Flash new BIOS (auto-backs up current chip first)
biospy write new_bios.bin

# 5. Verify
biospy verify new_bios.bin
```

## Commands

### Hardware

| Command | Description |
|---------|-------------|
| `status` | Show programmer, chip, and backend status |
| `detect` | Detect USB programmer |
| `identify` / `id` | Read JEDEC ID, show chip specs + voltage |

### Chip Operations

| Command | Description |
|---------|-------------|
| `read <file>` | Read chip to file (progress bar, SHA256) |
| `write <file>` | Write file to chip (auto-backup, verify, safety checks) |
| `erase --confirm` | Full chip erase |
| `verify <file>` | Verify chip contents match file |

### Analysis

| Command | Description |
|---------|-------------|
| `analyze <file>` | Parse BIOS: UEFI volumes, Intel FD regions, vendor, version |
| `diff <a> <b>` | Byte-level diff of two BIOS images |
| `checksum <file>` | MD5 / SHA256 / CRC32 |

### Database & Serial

| Command | Description |
|---------|-------------|
| `search <query>` | Search 55+ chips by name, vendor, JEDEC ID |
| `serial <port> [baud]` | Stream serial debug output (CH343) |
| `serial-list` | List available serial ports |

## Agent Interface (MCP)

biospy ships an **MCP server** (`biospy-mcp`) so AI agents — Claude Desktop, mcp-cli, custom SDK clients — can drive the hardware directly. JSON-RPC over stdio. 18 tools cover detection, identification, read/write/verify/erase, image analysis, the chip database, POST-code decoding, failure-pattern search, and voltage references.

```bash
# Run the server manually (stdio)
biospy-mcp

# Mock mode (no hardware required, for testing)
BIOSPY_FORCE_MOCK=1 biospy-mcp
```

Register with Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "biospy": {
      "command": "node",
      "args": ["/absolute/path/to/biospy/dist/mcp/server.js"]
    }
  }
}
```

Or after `npm link` / global install: `"command": "biospy-mcp"`.

### Tools

| Tool | Purpose |
|------|---------|
| `detect` | Scan USB for CH34x programmers |
| `identify` | Read JEDEC ID + SFDP + DB lookup |
| `sfdp` | Read SFDP parameter table |
| `wp_status` | Read write-protection bits |
| `read_chip` | Dump flash to file |
| `write_chip` | Program file → flash (requires `confirm:true`) |
| `verify_chip` | Compare chip vs file |
| `erase_chip` | Full erase (requires `confirm:true`) |
| `region_erase` | Partial erase (requires `confirm:true`) |
| `blank_check` | Verify chip is all 0xFF |
| `analyze_image` | Parse BIOS image (regions, UEFI, vendor) |
| `bios_regions` | Deep region layout (Intel FD + UEFI + ME + NVRAM) |
| `nvram_vars` | List UEFI NVRAM variables |
| `search_chips` | Fuzzy search the 806-chip database |
| `chip_info` | Full chip details + write recommendations |
| `post_decode` | Decode AMI/Award/Phoenix/UEFI POST codes |
| `failure_search` | Search motherboard failure patterns |
| `voltage_reference` | ATX/EPS/PCIe/board voltage tables |

Destructive tools (`write_chip`, `erase_chip`, `region_erase`) require `confirm:true`. The voltage gate refuses writes to 1.8V chips on stock CH341A unless `force_1_8v:true` is set. Every tool returns a stable envelope: `{ok, command, data?|error, nextAction?}`.

### CLI JSON Mode

Every inspection command also accepts `--json` and emits the same envelope on stdout — useful for shell-driving agents or piping into `jq`:

```bash
biospy status --json
biospy chip-info ef4017 --json
biospy analyze backup.bin --json | jq '.data.regions'
```

Hardware ops accept `--ndjson` for line-delimited progress events:

```bash
biospy read backup.bin --ndjson   # emits {type:"progress"...}, then {type:"result"...}
```

## Safety Features

**biospy refuses to let you brick your board:**

- **Auto-backup** before every write — original chip contents saved to `<file>.backup.<timestamp>.bin`
- **Verify-after-write** by default
- **Blank file detection** — refuses to write all-0xFF or all-0x00 files
- **File size check** — blocks writes that exceed chip capacity
- **1.8V voltage gate** — detects 1.8V chips and blocks writes unless you have a voltage adapter (`--force-1.8v`)
- **Erase confirmation** — requires `--confirm` flag
- **Post-read warnings** — alerts on blank (0xFF) or failed (0x00) reads

## Architecture

```
biospy
├── CH341A backend         ← direct SPI via libusb, 31B/packet
├── CH347 backend          ← direct SPI via libusb, 510B/packet, up to 60MHz
├── BIOS analyzer          ← UEFI FV, Intel FD, vendor detection
├── Chip database          ← 55+ chips with voltage/pinout specs
└── Serial debug           ← CH343 UART streaming
```

**Fully native USB** — talks directly to CH341A/CH347 hardware over libusb. No external tools required.

## Supported Hardware

### Programmers
- **CH341A** (USB ID `1a86:5512`) — most common, SPI, ~$3 on AliExpress
- **CH347** (USB ID `1a86:55db`) — newer, faster, SPI/I2C/JTAG

### Flash Chips (55+ in database)
Winbond, Macronix, GigaDevice, SST, EON, Spansion, Micron, ISSI, XMC, PUYA — both 3.3V and 1.8V variants. Plus 24Cxx I2C EEPROMs.

## Options

```
-c, --chip <name>          Force chip name
-b, --backend <type>       Force: ch341a | ch347
--force-1.8v               Acknowledge 1.8V voltage risk
--confirm                  Required for erase
```

## Requirements

- Node.js 20+
- macOS, Linux, or Windows
- CH341A or CH347 USB programmer
