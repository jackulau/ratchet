# biospy

Modern BIOS chip programmer and debugger for CH341A / CH347 USB programmers.

Replaces AsProgrammer, NeoProgrammer, and flashrom's CLI with a single tool that has native USB support, safety guards, BIOS image analysis, and real progress reporting.

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
├── Native USB backend     ← direct CH341A SPI via libusb (preferred)
├── Flashrom backend       ← fallback, wraps flashrom CLI
├── BIOS analyzer          ← UEFI FV, Intel FD, vendor detection
├── Chip database          ← 55+ chips with voltage/pinout specs
└── Serial debug           ← CH343 UART streaming
```

**Native USB** talks directly to the CH341A over libusb — no flashrom needed. Flashrom is auto-detected as a fallback if the native backend can't connect.

## Supported Hardware

### Programmers
- **CH341A** (USB ID `1a86:5512`) — most common, SPI, ~$3 on AliExpress
- **CH347** (USB ID `1a86:55db`) — newer, faster, SPI/I2C/JTAG

### Flash Chips (55+ in database)
Winbond, Macronix, GigaDevice, SST, EON, Spansion, Micron, ISSI, XMC, PUYA — both 3.3V and 1.8V variants. Plus 24Cxx I2C EEPROMs.

## Options

```
-p, --programmer <type>    Flashrom programmer type (default: ch341a_spi)
-c, --chip <name>          Force chip name
-b, --backend <type>       Force: native | flashrom
--force-1.8v               Acknowledge 1.8V voltage risk
--confirm                  Required for erase
```

## Requirements

- Node.js 20+
- macOS, Linux, or Windows
- CH341A or CH347 USB programmer
- flashrom (optional, for fallback backend)
