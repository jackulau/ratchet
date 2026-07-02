# ratchet  -  multi-protocol hardware debug + programming toolkit

This file is the living task/architecture sketch for the workspace. The
authoritative documentation is README.md; per-goal history lives in the goal
logs. The original TypeScript-server-wrapping-external-tools plan documented
here previously was fully replaced by the native Rust workspace in goal 004
(`ts-final` git tag preserves that era).

## Current Architecture

```
┌─────────────────────────────────┐
│  Human (CLI) / AI Agent (MCP)   │
└──────────┬──────────────────────┘
           │ clap CLI ─ or ─ JSON-RPC 2.0 over stdio (31 tools)
┌──────────▼──────────────────────┐
│  Rust workspace (6 crates)      │
│  ratchet-cli / ratchet-mcp      │
│  ratchet-core                   │
│   ├─ backends/ (ch341a, ch347,  │
│   │   mock, factory, libusb_bus,│
│   │   backup)                   │
│   ├─ protocols/ programmers/    │
│   ├─ workflows/ (repair pipeline)│
│   ├─ analysis/ chips/ (806-chip │
│   │   DB) debug/ instruments/   │
│  ratchet-usb / ratchet-usb-sys  │
│   (own libusb FFI - no rusb)    │
│  ratchet-node (napi bridge)     │
└────────┼────────────────────────┘
         │ libusb (custom bindgen bindings)
┌────────▼────────────────────────┐
│  CH341A (1a86:5512)             │
│  CH347  (1a86:55db / 55de)      │
│  → SPI flash, I2C, JTAG IDCODE  │
└─────────────────────────────────┘
```

No external programmer binaries: the SPI/I2C/JTAG paths speak the CH34x USB
protocols directly. The mock backend (RATCHET_FORCE_MOCK=1) keeps every
surface exercisable without hardware; destructive verbs refuse a silently
selected mock.

## Status

Everything listed in README "What works today" is wired and smoke-tested
(cli-smoke + mcp-smoke under forced mock, 470+ unit/integration tests).
Honestly-unwired verb groups (UART open/sniff, 1-Wire, SWD, AVR-ISP,
microwire, ESP, STM32, logic analyzer, Bus Pirate, CAN, monitor, serial
connect) fail with explicit hw-unavailable errors - see README "Not wired
yet".

## Open follow-ups (candidate next goals)

- [ ] Wire the remaining protocol verb groups to live transports (the big
      one - each is its own epic; protocol logic is unit-tested already)
- [ ] Distribution: GitHub Releases workflow, npm prebuilds for
      ratchet-node, CHANGELOG, version bump past 2.0.0-alpha.1
- [ ] Bundle a failure-pattern knowledge base for `failure-search`
- [ ] Criterion benchmarks + real-hardware throughput numbers
- [ ] macOS CI runner + MSRV check + cargo-audit
