# biosMCP — Modern BIOS Chip Debugging & Programming MCP Server

## Problem
Existing BIOS programming tools (AsProgrammer, NeoProgrammer, SNANDer) are old, Windows-centric, GUI-only, and not agent-friendly. No modern tool lets AI agents autonomously detect, read, write, and debug BIOS chips via CH34x USB programmers.

## Solution
MCP server + CLI that wraps `flashrom` (battle-tested SPI backend) with agent-friendly tools for BIOS chip operations. Adds auto-detection, BIOS region analysis, safety checks, and modern DX.

## Architecture
```
┌─────────────────────────────────┐
│  Claude / AI Agent              │
│  (MCP client)                   │
└──────────┬──────────────────────┘
           │ MCP protocol (stdio)
┌──────────▼──────────────────────┐
│  biosMCP Server (TypeScript)    │
│  ┌────────────┬────────────┐    │
│  │ Tools      │ Analysis   │    │
│  │ - detect   │ - regions  │    │
│  │ - identify │ - headers  │    │
│  │ - read     │ - checksum │    │
│  │ - write    │ - diff     │    │
│  │ - erase    │ - validate │    │
│  │ - verify   │            │    │
│  └─────┬──────┴────────────┘    │
│        │                        │
│  ┌─────▼──────────────────┐     │
│  │ Backend Abstraction    │     │
│  │ - flashrom (primary)   │     │
│  │ - direct USB (future)  │     │
│  └─────┬──────────────────┘     │
└────────┼────────────────────────┘
         │ USB / libusb
┌────────▼────────────────────────┐
│  CH341A / CH347 Programmer      │
│  → SPI Flash (BIOS chip)       │
└─────────────────────────────────┘
```

## Supported Hardware
- **CH341A** — most common, SPI/I2C, 24MHz, primary target
- **CH347** — newer, SPI/I2C/JTAG, faster, secondary target
- **CH343** — UART-based, supported for serial debug console access
- SPI flash chips: W25Qxx, MX25Lxx, SST25VFxx, EN25QHxx, GD25Qxx, etc.
- I2C EEPROM: 24Cxx series

## MCP Tools

### Connection & Detection
- `bios_detect_programmer` — detect connected CH34x programmer, return type/status
- `bios_identify_chip` — read JEDEC ID, return chip model/size/capabilities
- `bios_connection_status` — full status: programmer + chip + voltage

### Read Operations
- `bios_read_chip` — read full chip contents to file, with progress
- `bios_read_region` — read specific address range
- `bios_read_id` — quick JEDEC ID read

### Write Operations
- `bios_write_chip` — write firmware file to chip (auto-backup first)
- `bios_write_region` — write to specific address range
- `bios_erase_chip` — full chip erase
- `bios_verify` — verify chip contents match file

### Analysis & Debug
- `bios_analyze` — parse BIOS image: regions, headers, UEFI volumes
- `bios_diff` — compare two BIOS images, show differences
- `bios_checksum` — compute and verify checksums
- `bios_dump_info` — human-readable BIOS image summary

### Serial Debug (CH343)
- `bios_serial_connect` — open serial debug console via CH343
- `bios_serial_send` — send command over serial
- `bios_serial_log` — capture serial output (POST codes, debug logs)

## Safety
- Auto-backup before any write operation
- Verify-after-write by default
- Chip write-protection check before write
- Size mismatch detection (file vs chip)
- Confirmation required for erase/write via agent

## Tasks

- [x] 1. Project scaffold (package.json, tsconfig, structure)
- [x] 2. flashrom backend abstraction
- [x] 3. Programmer detection tools
- [x] 4. Chip identification tools
- [x] 5. Read operations
- [x] 6. Write operations (with safety)
- [x] 7. BIOS image analysis
- [x] 8. Serial debug tools (CH343)
- [x] 9. CLI interface
- [x] 10. MCP server wiring
- [ ] 11. README and usage docs
