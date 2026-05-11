---
status: active
mode: auto
objective: 'Make biospy the best CLI tool for hardware debugging and repair. Fully custom implementation (no flashrom dependency). Professional-grade motherboard diagnostics, BIOS repair, hardware fault detection, and component-level debugging.'
created_at: 2026-05-11T00:00:00Z
updated_at: 2026-05-11T00:00:00Z
turns: 0
current_deliverable: 1
current_spec: ""
auto_started_at: 2026-05-11T00:00:00Z
sessions: 0
consecutive_failures: 0
---

## Deliverables

- [ ] 1. Remove flashrom dependency — eliminate flashrom backend, make native CH341A/CH347 the only path, improve auto-detection and error messages when no programmer found
- [ ] 2. Motherboard diagnostic engine — POST code decoder (AMI/Award/Phoenix/UEFI), power sequence analyzer, common failure pattern database, guided troubleshooting workflows for no-boot scenarios
- [ ] 3. Advanced BIOS analysis & repair — deep UEFI volume parsing (DXE/PEI/SEC phases), Intel ME region handling, NVRAM variable editor, BIOS region surgery (extract/replace/rebuild individual regions), corrupted BIOS recovery wizard
- [ ] 4. Hardware fault detection system — SPI bus integrity analyzer (signal quality scoring, timing analysis), voltage rail diagnostics via CH341A GPIO, component-level test sequences (capacitor/resistor/transistor checks via probe), automated diagnostic report generation
- [ ] 5. Enhanced chip database & smart identification — expand to 200+ chips, fuzzy JEDEC matching for unknown chips, chip capability auto-discovery via SFDP, voltage/timing recommendation engine, community chip submission format
- [ ] 6. Interactive debug console — REPL mode for live hardware interaction, SPI bus sniffer/monitor, register watch with auto-refresh, macro recording/playback for repetitive operations, scriptable automation via JS plugin system

## Progress Log

- [00:00] Created goal — entering auto-execution mode
