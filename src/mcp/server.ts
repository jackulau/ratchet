#!/usr/bin/env node

// biospy-mcp — Model Context Protocol server for biosMCP.
//
// Exposes BIOS chip-programming primitives as MCP tools so an LLM agent can
// detect/identify/read/write/verify SPI flash via CH341A/CH347 USB programmers,
// and consult the chip database / POST codes / failure patterns / voltage refs.
//
// Transport: stdio (JSON-RPC over stdin/stdout). Logging goes to stderr.
//
// Safety:
//   - Destructive tools (write_chip, erase_chip, region_erase) require confirm:true.
//   - Voltage gate refuses to write 1.8V chips on stock CH341A unless force_1_8v:true.
//   - Dry-run is default when BIOSPY_FORCE_MOCK=1 or no real programmer is detected.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CH341ABackend } from "../backends/ch341a.js";
import { CH347Backend } from "../backends/ch347.js";
import { MockBackend } from "../backends/mock.js";
import { BiosAnalyzer } from "../analysis/bios.js";
import { scanFirmwareVolumes } from "../analysis/uefi.js";
import { parseMeRegion } from "../analysis/me.js";
import { parseNvramStore } from "../analysis/nvram.js";
import { listRegions as listBiosRegions, extractRegion } from "../analysis/regions.js";
import {
  searchChips, CHIP_DATABASE, lookupChipByJedecId, lookupChipByName,
  fuzzyMatchJedec, getChipRecommendations, getChipVoltage, needs4ByteAddressing,
  getManufacturerName,
} from "../chips/database.js";
import {
  lookupPostCode, searchPostCodes, getPhaseDescription,
  searchFailurePatterns, getPatternsByCategory, ALL_REFERENCES,
  FAILURE_PATTERNS, LAPTOP_FAILURE_PATTERNS, GPU_FAILURE_PATTERNS,
  SSD_FAILURE_PATTERNS, POST_CODES,
} from "../diagnostics/index.js";
import type { PostStandard } from "../diagnostics/index.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ok as envOk, fail as envFail, type AgentEnvelope } from "../agent/envelope.js";

const VERSION = "1.1.0";
const FORCE_MOCK = process.env.BIOSPY_FORCE_MOCK === "1";

// ─── Backend selection ───
// We pick a backend lazily per-tool so detect can refresh state, and so the
// server starts cleanly even when no hardware is plugged in.

let ch341a: CH341ABackend | MockBackend = FORCE_MOCK ? new MockBackend() : new CH341ABackend();
let ch347: CH347Backend | MockBackend = FORCE_MOCK ? new MockBackend() : new CH347Backend();
const analyzer = new BiosAnalyzer();

async function pickActiveBackend(): Promise<{ kind: "ch341a" | "ch347" | "mock"; backend: CH341ABackend | CH347Backend | MockBackend }> {
  if (FORCE_MOCK) return { kind: "mock", backend: ch341a };
  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected) return { kind: "ch341a", backend: ch341a };
  } catch {}
  try {
    const info = await ch347.detectProgrammer();
    if (info.connected) return { kind: "ch347", backend: ch347 };
  } catch {}
  // No real hw — fall back to mock so dry-run tools still work.
  return { kind: "mock", backend: new MockBackend() };
}

// ─── Envelope helpers for MCP content ───
// Every tool returns one text-content block whose body is a JSON envelope.
// Consistent shape lets the agent treat all tools the same and machine-parse
// without needing per-tool parsing.

function envContent(env: AgentEnvelope): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  return env.ok
    ? { content: [{ type: "text", text: JSON.stringify(env) }] }
    : { content: [{ type: "text", text: JSON.stringify(env) }], isError: true };
}

function okContent<T>(command: string, data: T, nextAction?: string) {
  return envContent(envOk(command, data, nextAction));
}

function failContent(command: string, code: string, message: string, hint?: string, nextAction?: string) {
  return envContent(envFail(command, code, message, hint, nextAction));
}

// ─── Server build ───

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "biospy-mcp", version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } },
  );

  // ─── Resources ───
  // Browseable read-only databases. Each returns a JSON-serialized full catalog
  // so an agent can grep/filter offline instead of paginating tool calls.

  function jsonResource(uri: string, payload: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload) }] };
  }

  server.registerResource("chips-db", "biospy://db/chips", {
    title: "Chip database (806 SPI flash entries)",
    description: "Full chip catalog with JEDEC IDs, sizes, voltages, addressing modes, page/sector/block geometry.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: CHIP_DATABASE.length, chips: CHIP_DATABASE }));

  server.registerResource("post-codes", "biospy://db/post-codes", {
    title: "POST code catalog (AMI / Award / Phoenix / UEFI)",
    description: "Every POST code with phase, description, common causes.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: POST_CODES.length, codes: POST_CODES }));

  server.registerResource("failure-patterns", "biospy://db/failure-patterns", {
    title: "Motherboard failure pattern catalog",
    description: "Symptoms → ranked causes → diagnostic steps for power/display/boot/stability/bios/peripheral.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: FAILURE_PATTERNS.length, patterns: FAILURE_PATTERNS }));

  server.registerResource("laptop-failures", "biospy://db/laptop-failures", {
    title: "Laptop failure pattern catalog (65+ patterns)",
    description: "Symptoms → causes → diagnostic steps for laptop-specific failures.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: LAPTOP_FAILURE_PATTERNS.length, patterns: LAPTOP_FAILURE_PATTERNS }));

  server.registerResource("gpu-failures", "biospy://db/gpu-failures", {
    title: "GPU failure pattern catalog (45+ patterns)",
    description: "Symptoms → causes → diagnostic steps for GPU-specific failures.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: GPU_FAILURE_PATTERNS.length, patterns: GPU_FAILURE_PATTERNS }));

  server.registerResource("ssd-failures", "biospy://db/ssd-failures", {
    title: "SSD/NVMe failure pattern catalog",
    description: "Controller-keyed firmware/brick/capacity/recovery patterns.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: SSD_FAILURE_PATTERNS.length, patterns: SSD_FAILURE_PATTERNS }));

  server.registerResource("voltage-refs", "biospy://db/voltage-refs", {
    title: "Voltage reference tables (ATX, EPS, PCIe, board, SPI)",
    description: "Expected voltages + tolerances per pin/rail for each connector.",
    mimeType: "application/json",
  }, async (uri) => jsonResource(uri.toString(), { count: ALL_REFERENCES.length, references: ALL_REFERENCES }));

  // ─── Prompts ───
  // Canned diagnostic workflows. The agent requests one, fills in args, and gets
  // back a primed user-message that orients it on the right next steps + tools.

  function promptMsg(text: string): { messages: Array<{ role: "user"; content: { type: "text"; text: string } }> } {
    return { messages: [{ role: "user", content: { type: "text", text } }] };
  }

  server.registerPrompt("diagnose-bricked-board", {
    title: "Diagnose a bricked motherboard (no-boot / no-POST)",
    description: "Walk through a no-boot diagnosis: power → CPU → display → POST → BIOS recovery. Uses biospy tools.",
    argsSchema: { symptoms: z.string().describe("Free-text symptoms: 'no power, no fans' or 'fans spin but no display'") },
  }, ({ symptoms }) => promptMsg(
    `I have a motherboard that won't boot. Symptoms: ${symptoms ?? "(unspecified)"}.\n\n` +
    `Drive a structured diagnosis with biospy:\n` +
    `1. Use the failure_search tool with the symptom string to find matching motherboard failure patterns.\n` +
    `2. Use power_sequence (via the failure_search results) to identify which stage is failing.\n` +
    `3. If the board powers on but no display: call gpu-failures (via failure_search with category=display) for video chain issues.\n` +
    `4. If suspected BIOS corruption: read the chip with read_chip, then analyze_image + bios_regions to inspect.\n` +
    `5. Recommend the highest-probability cause + the specific multimeter measurements needed to confirm.\n` +
    `Use voltage_reference to ground expected rail readings. Report findings in a structured form.`,
  ));

  server.registerPrompt("safe-flash-procedure", {
    title: "Safe flash procedure checklist",
    description: "Read-backup → analyze → write → verify checklist before flashing a BIOS.",
    argsSchema: { firmware_path: z.string().optional(), backup_path: z.string().optional() },
  }, ({ firmware_path, backup_path }) => promptMsg(
    `I need to safely flash a BIOS. Firmware: ${firmware_path ?? "(specify path)"}. Backup target: ${backup_path ?? "(specify path)"}.\n\n` +
    `Run this procedure with biospy tools, stopping on any failure:\n` +
    `1. detect — confirm CH34x programmer is connected.\n` +
    `2. identify — read JEDEC ID; confirm chip is in the database and matches expected target.\n` +
    `3. wp_status — verify write protection state.\n` +
    `4. read_chip with the backup path — save current chip contents (double_verify:true for safety).\n` +
    `5. analyze_image on the backup AND the new firmware — compare vendor, version, regions; flag mismatched sizes or vendors.\n` +
    `6. If checks pass: call write_chip with confirm:true. (And force_1_8v:true ONLY if the chip is 1.8V and a level shifter is fitted.)\n` +
    `7. verify_chip against the firmware file to confirm successful write.\n` +
    `Refuse to proceed past any step that fails. Report each step's result.`,
  ));

  server.registerPrompt("analyze-bios-image", {
    title: "Deep-analyze a BIOS dump",
    description: "Parse regions, UEFI volumes, ME, NVRAM. Flag anomalies and recovery options.",
    argsSchema: { path: z.string().describe("Path to BIOS image file") },
  }, ({ path }) => promptMsg(
    `Analyze the BIOS image at "${path}".\n\n` +
    `Run these biospy tools in order and report findings:\n` +
    `1. analyze_image — file size, vendor, version, top-level regions.\n` +
    `2. bios_regions — deep region layout (Intel descriptor, UEFI FVs, ME, NVRAM).\n` +
    `3. nvram_vars — list UEFI NVRAM variables; flag suspicious counts (e.g. all-deleted store).\n` +
    `4. If the image looks corrupted or anomalous (blank regions, missing reset vector, garbage UEFI volumes), explain what's wrong and which biospy commands can repair it.\n` +
    `Cross-reference vendor/version with the chip database (search_chips) if the image embeds JEDEC hints.`,
  ));

  server.registerPrompt("voltage-fault-diagnosis", {
    title: "Diagnose a voltage rail fault",
    description: "Rail-by-rail measurement plan using voltage_reference + failure_search.",
    argsSchema: { connector: z.string().describe("atx, eps, pcie, board, spi"), symptom: z.string().optional() },
  }, ({ connector, symptom }) => promptMsg(
    `A board has a suspected voltage fault on the ${connector} connector. Symptom: ${symptom ?? "(unspecified)"}.\n\n` +
    `Use biospy tools:\n` +
    `1. voltage_reference with connector="${connector}" — pull expected voltages + tolerances per pin.\n` +
    `2. For each rail, request the operator measure with a multimeter and report the reading.\n` +
    `3. Compare each measurement against expected/tolerance. Flag any out-of-spec rail.\n` +
    `4. failure_search with the symptom (or "power") for matching motherboard failure patterns related to power rails.\n` +
    `5. If a specific rail is dead/wrong: suggest the upstream regulator (VRM controller via gpu-diag or laptop-power) and what to probe next.\n` +
    `Be precise: name pin numbers, expected V, measured V, deviation.`,
  ));

  server.registerPrompt("recover-corrupt-bios", {
    title: "Recover a corrupt BIOS image",
    description: "Decision tree: reference-based repair vs. NVRAM reset vs. full reflash vs. external recovery.",
    argsSchema: { dump_path: z.string().describe("Path to dumped BIOS image"), reference_path: z.string().optional().describe("Optional known-good reference image") },
  }, ({ dump_path, reference_path }) => promptMsg(
    `Recover the (possibly corrupt) BIOS dump at "${dump_path}".${reference_path ? ` Reference image: "${reference_path}".` : ""}\n\n` +
    `Workflow with biospy:\n` +
    `1. analyze_image + bios_regions on the dump — identify what's wrong (blank regions, zero descriptor, NVRAM corruption, missing reset vector).\n` +
    `2. Decide repair path:\n` +
    `   - If reference provided AND damage is localized → use it with biospy's repair tool (full-repair via CLI) for reference-based byte-merge.\n` +
    `   - If NVRAM all-deleted but rest intact → NVRAM reset only.\n` +
    `   - If reset vector zeroed or critical UEFI files missing → recommend external dump from a known-good board.\n` +
    `   - If chip is physically failing (random reads on second pass) → recommend chip replacement.\n` +
    `3. Always read backup BEFORE writing recovery image. Use safe-flash-procedure for the actual write.\n` +
    `Be explicit about which repair path you chose and why.`,
  ));

  // ─── Information tools (read-only, safe) ───

  server.registerTool(
    "detect",
    {
      title: "Detect CH34x programmers",
      description: "Scan USB for CH341A / CH347 / CH343 USB-SPI programmers. Returns an array of connected programmer descriptors. Safe; reads only.",
      inputSchema: {},
    },
    async () => {
      const found: Array<Record<string, unknown>> = [];
      try {
        const a = await ch341a.detectProgrammer();
        if (a.connected && a.type === "ch341a") found.push({ type: a.type, description: a.description, vendorId: a.vendorId, productId: a.productId, maxPayload: 31 });
      } catch {}
      try {
        const b = await ch347.detectProgrammer();
        if (b.connected) found.push({ type: b.type, description: b.description, vendorId: b.vendorId, productId: b.productId, maxPayload: 510 });
      } catch {}
      const next = found.length === 0
        ? (FORCE_MOCK ? "Mock mode (BIOSPY_FORCE_MOCK=1). Real hardware not consulted." : "No CH34x found — check USB connection. Set BIOSPY_FORCE_MOCK=1 to operate against a mock backend.")
        : "Use `identify` to read the JEDEC ID, or `read_chip` to dump the flash.";
      return okContent("detect", { count: found.length, mock: FORCE_MOCK, programmers: found }, next);
    },
  );

  server.registerTool(
    "identify",
    {
      title: "Identify flash chip",
      description: "Read JEDEC ID + SFDP from the connected chip and resolve against the 806-chip database. Safe; reads only.",
      inputSchema: {},
    },
    async () => {
      const { kind, backend } = await pickActiveBackend();
      let chip;
      try { chip = await backend.identifyChip(); }
      catch (e: any) {
        return failContent("identify", "IDENTIFY_FAILED", e?.message ?? "identify failed", "Check chip seating (pin 1) and SOIC clip pressure.");
      }
      if (!chip) {
        return failContent("identify", "NO_CHIP", "No chip detected", "Check chip seating in ZIF/SOIC. Pin 1 (dot/notch) must align.");
      }
      const dbChip = lookupChipByJedecId(chip.jedecId);
      let sfdp: unknown = null;
      try { if ("readSFDP" in backend) sfdp = await (backend as CH341ABackend | MockBackend).readSFDP(); } catch {}
      return okContent(
        "identify",
        {
          jedecId: chip.jedecId,
          vendor: chip.vendorName,
          name: chip.name,
          sizeBytes: chip.sizeBytes,
          type: chip.type,
          voltage: chip.voltage ?? null,
          manufacturer: getManufacturerName(chip.jedecId),
          needs4ByteAddr: needs4ByteAddressing(chip.jedecId),
          backend: kind,
          knownInDatabase: !!dbChip,
          dbChip: dbChip ?? null,
          recommendations: dbChip ? getChipRecommendations(dbChip) : null,
          fuzzy: dbChip ? null : fuzzyMatchJedec(chip.jedecId),
          sfdp,
        },
        dbChip ? "Chip is in the database — safe to read/write with default settings." : "Unknown chip — review fuzzy match and confirm voltage before writing.",
      );
    },
  );

  server.registerTool(
    "sfdp",
    {
      title: "Read SFDP parameter table",
      description: "Read SFDP (Serial Flash Discoverable Parameters) from the chip. Returns geometry, erase support, voltage. Safe; reads only.",
      inputSchema: {},
    },
    async () => {
      const { backend } = await pickActiveBackend();
      if (!("readSFDP" in backend)) return failContent("sfdp", "UNSUPPORTED_BACKEND", "CH347 backend does not implement SFDP — use CH341A or set BIOSPY_FORCE_MOCK=1");
      try {
        const sfdp = await (backend as CH341ABackend | MockBackend).readSFDP();
        if (!sfdp) return failContent("sfdp", "NO_SFDP", "Chip does not support SFDP or is not connected", "Use `chip_info <jedec>` for database lookup.");
        return okContent("sfdp", sfdp);
      } catch (e: any) {
        return failContent("sfdp", "READ_FAILED", e?.message ?? "SFDP read failed");
      }
    },
  );

  server.registerTool(
    "wp_status",
    {
      title: "Read write-protection status",
      description: "Returns whether the connected chip's write-protect (WP) bits are set. Safe; reads only.",
      inputSchema: {},
    },
    async () => {
      const { kind, backend } = await pickActiveBackend();
      try {
        const wp = await backend.isWriteProtected();
        return okContent("wp_status", { writeProtected: wp, backend: kind }, wp ? "Chip is write-protected — `write_chip` clears protection before programming." : "Chip is writable.");
      } catch (e: any) {
        return failContent("wp_status", "WP_READ_FAILED", e?.message ?? "WP read failed");
      }
    },
  );

  // ─── Hardware operations ───

  server.registerTool(
    "read_chip",
    {
      title: "Read flash chip to file",
      description: "Dump full flash contents to <path>. Returns sha256, size, duration. Safe (read-only) but blocks on long reads.",
      inputSchema: {
        path: z.string().describe("Absolute path where the dumped binary will be written"),
        double_verify: z.boolean().optional().describe("Read twice and require a match. Slower but safer."),
      },
    },
    async ({ path, double_verify }) => {
      const { kind, backend } = await pickActiveBackend();
      try {
        const result = double_verify && kind === "ch341a"
          ? await (backend as CH341ABackend | MockBackend).readChipDoubleVerify(path)
          : await backend.readChip(path);
        if (!result.success) return failContent("read_chip", "READ_FAILED", result.error ?? "read failed");
        return okContent("read_chip", {
          file: result.filePath, sizeBytes: result.sizeBytes, checksum: result.checksum,
          durationMs: result.durationMs, backend: kind,
        }, "Use `verify_chip` to re-confirm the dump matches the chip, or `analyze_image` to inspect contents.");
      } catch (e: any) {
        return failContent("read_chip", "READ_FAILED", e?.message ?? "read failed");
      }
    },
  );

  server.registerTool(
    "write_chip",
    {
      title: "Write firmware to flash chip (DESTRUCTIVE)",
      description: "Programs <path> into the chip. Auto-backs-up first, then writes + verifies. Requires confirm:true. Refuses 1.8V chips without force_1_8v:true.",
      inputSchema: {
        path: z.string().describe("Absolute path of firmware file to flash"),
        confirm: z.boolean().describe("Must be true. Guards against accidental writes."),
        force_1_8v: z.boolean().optional().describe("Required to write a 1.8V chip on stock CH341A (3.3V) — only set if you have a voltage adapter."),
        skip_backup: z.boolean().optional(),
        skip_verify: z.boolean().optional(),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ path, confirm, force_1_8v, skip_backup, skip_verify }) => {
      if (!confirm) return failContent("write_chip", "MISSING_CONFIRM", "Destructive operation requires confirm:true", "Pass confirm:true if the agent intends to program this chip.");
      if (!existsSync(path)) return failContent("write_chip", "FILE_NOT_FOUND", `File not found: ${path}`);
      const fw = await readFile(path);
      if (fw.length === 0) return failContent("write_chip", "EMPTY_FILE", "Firmware file is empty");
      if (fw.every((b) => b === 0xff)) return failContent("write_chip", "BLANK_FIRMWARE", "Firmware is entirely 0xFF — would erase chip. Use `erase_chip` instead.");
      if (fw.every((b) => b === 0x00)) return failContent("write_chip", "ZERO_FIRMWARE", "Firmware is entirely 0x00 — likely corrupted or a failed read.");

      const { kind, backend } = await pickActiveBackend();
      let chip;
      try { chip = await backend.identifyChip(); } catch {}
      if (!chip) return failContent("write_chip", "NO_CHIP", "No chip detected — cannot write", "Run `detect` then `identify` to confirm hardware.");
      if (fw.length > chip.sizeBytes) return failContent("write_chip", "FILE_TOO_LARGE", `File (${fw.length}) exceeds chip capacity (${chip.sizeBytes})`);

      const voltage = getChipVoltage(chip.jedecId);
      if (voltage && voltage < 2.0 && !force_1_8v) {
        return failContent("write_chip", "VOLTAGE_GATE", `${chip.name} is a 1.8V chip — stock CH341A outputs 3.3V and WILL damage it.`, "Set force_1_8v:true ONLY if you have a 1.8V level-shifter or adapter.", "Use a voltage adapter, then retry with force_1_8v:true.");
      }

      try {
        const result = await backend.writeChip(path, undefined, { skipBackup: !!skip_backup, skipVerify: !!skip_verify });
        if (!result.success) return failContent("write_chip", "WRITE_FAILED", result.error ?? "write failed", undefined, result.backupPath ? `Backup available at ${result.backupPath}` : undefined);
        return okContent("write_chip", {
          bytesWritten: fw.length, durationMs: result.durationMs, backupPath: result.backupPath ?? null,
          verified: skip_verify ? null : result.verified, backend: kind, chip: { name: chip.name, jedecId: chip.jedecId },
        }, "Use `verify_chip` to re-check or `read_chip` to dump and inspect.");
      } catch (e: any) {
        return failContent("write_chip", "WRITE_FAILED", e?.message ?? "write failed");
      }
    },
  );

  server.registerTool(
    "erase_chip",
    {
      title: "Erase entire flash chip (DESTRUCTIVE)",
      description: "Full chip erase to 0xFF. Requires confirm:true. Cannot be undone.",
      inputSchema: { confirm: z.boolean().describe("Must be true. Guards against accidental erase.") },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ confirm }) => {
      if (!confirm) return failContent("erase_chip", "MISSING_CONFIRM", "Erase requires confirm:true", "Pass confirm:true if the agent intends to wipe this chip.");
      const { kind, backend } = await pickActiveBackend();
      try {
        const result = await backend.eraseChip();
        if (!result.success) return failContent("erase_chip", "ERASE_FAILED", result.error ?? "erase failed");
        return okContent("erase_chip", { durationMs: result.durationMs, backend: kind }, "Use `blank_check` to confirm full erase.");
      } catch (e: any) {
        return failContent("erase_chip", "ERASE_FAILED", e?.message ?? "erase failed");
      }
    },
  );

  server.registerTool(
    "region_erase",
    {
      title: "Erase a flash region (DESTRUCTIVE)",
      description: "Erase a byte range [start, start+length). Granularity rounds to nearest erasable block. Requires confirm:true.",
      inputSchema: {
        start_addr: z.number().int().min(0).describe("Byte offset (0-based)"),
        length: z.number().int().min(1).describe("Number of bytes to erase"),
        confirm: z.boolean().describe("Must be true."),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ start_addr, length, confirm }) => {
      if (!confirm) return failContent("region_erase", "MISSING_CONFIRM", "Region erase requires confirm:true");
      const { kind, backend } = await pickActiveBackend();
      try {
        const result = await backend.regionErase(start_addr, length);
        if (!result.success) return failContent("region_erase", "ERASE_FAILED", result.error ?? "region erase failed");
        return okContent("region_erase", { startAddr: start_addr, length, durationMs: result.durationMs, backend: kind });
      } catch (e: any) {
        return failContent("region_erase", "ERASE_FAILED", e?.message ?? "region erase failed");
      }
    },
  );

  server.registerTool(
    "verify_chip",
    {
      title: "Verify chip against file",
      description: "Compare chip contents byte-for-byte against <path>. Returns ok:true on match, ok:false on mismatch (with both checksums).",
      inputSchema: { path: z.string().describe("File to verify against") },
    },
    async ({ path }) => {
      if (!existsSync(path)) return failContent("verify_chip", "FILE_NOT_FOUND", `File not found: ${path}`);
      const { kind, backend } = await pickActiveBackend();
      try {
        const result = await backend.verifyChip(path);
        return okContent("verify_chip", {
          matches: result.matches, durationMs: result.durationMs,
          fileChecksum: result.fileChecksum, chipChecksum: result.chipChecksum, backend: kind,
          error: result.error ?? null,
        });
      } catch (e: any) {
        return failContent("verify_chip", "VERIFY_FAILED", e?.message ?? "verify failed");
      }
    },
  );

  server.registerTool(
    "blank_check",
    {
      title: "Check chip is entirely 0xFF (blank)",
      description: "Read chip and confirm every byte is 0xFF.",
      inputSchema: {},
    },
    async () => {
      const { kind, backend } = await pickActiveBackend();
      const tmpPath = `/tmp/biospy-mcp-blankcheck-${Date.now()}.bin`;
      try {
        const result = await backend.readChip(tmpPath);
        if (!result.success) return failContent("blank_check", "READ_FAILED", result.error ?? "read failed");
        const data = await readFile(tmpPath);
        let nonBlank = 0; let firstNonBlank = -1;
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== 0xff) { nonBlank++; if (firstNonBlank === -1) firstNonBlank = i; }
        }
        return okContent("blank_check", {
          blank: nonBlank === 0, sizeBytes: data.length, nonBlankBytes: nonBlank,
          firstNonBlankOffset: firstNonBlank >= 0 ? firstNonBlank : null, backend: kind,
        });
      } catch (e: any) {
        return failContent("blank_check", "BLANK_CHECK_FAILED", e?.message ?? "blank check failed");
      } finally {
        try { await (await import("node:fs/promises")).unlink(tmpPath); } catch {}
      }
    },
  );

  // ─── Image analysis (file-based, no hw needed) ───

  server.registerTool(
    "analyze_image",
    {
      title: "Analyze a BIOS image",
      description: "Parse a BIOS dump: UEFI presence, regions, vendor, version. Safe; no hardware required.",
      inputSchema: { path: z.string().describe("Path to the BIOS image file") },
    },
    async ({ path }) => {
      if (!existsSync(path)) return failContent("analyze_image", "FILE_NOT_FOUND", `File not found: ${path}`);
      try {
        const a = await analyzer.analyze(path);
        return okContent("analyze_image", {
          file: path, sizeBytes: a.fileSize, checksum: a.checksum, isUefi: a.isUefi,
          biosVendor: a.biosVendor ?? null, biosVersion: a.biosVersion ?? null, buildDate: a.buildDate ?? null,
          regions: a.regions, warnings: a.warnings,
        }, "Use `bios_regions` for deep region layout or `nvram_vars` to list UEFI variables.");
      } catch (e: any) {
        return failContent("analyze_image", "ANALYSIS_FAILED", e?.message ?? "analyze failed");
      }
    },
  );

  server.registerTool(
    "bios_regions",
    {
      title: "Deep region layout for a BIOS image",
      description: "Lists Intel descriptor regions, UEFI firmware volumes, ME partitions, NVRAM stores. Safe; no hardware required.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      if (!existsSync(path)) return failContent("bios_regions", "FILE_NOT_FOUND", `File not found: ${path}`);
      try {
        const data = await readFile(path);
        const regions = listBiosRegions(data);
        const fvs = scanFirmwareVolumes(data);
        const meExtract = extractRegion(data, "me");
        const me = meExtract ? parseMeRegion(meExtract.data, meExtract.region.offset) : null;
        const nvram = parseNvramStore(data);
        return okContent("bios_regions", {
          file: path, sizeBytes: data.length, regions,
          uefiVolumes: fvs.map((fv) => ({ phase: fv.phase, offset: fv.offset, size: fv.size, fileCount: fv.files.length })),
          me: me ? { version: me.version, state: me.state, partitions: me.partitions, warnings: me.warnings } : null,
          nvram: nvram.found ? { format: nvram.format, totalSize: nvram.totalSize, usedSize: nvram.usedSize, freeSize: nvram.freeSize, deletedCount: nvram.deletedCount } : null,
        });
      } catch (e: any) {
        return failContent("bios_regions", "ANALYSIS_FAILED", e?.message ?? "regions parse failed");
      }
    },
  );

  server.registerTool(
    "nvram_vars",
    {
      title: "List NVRAM variables from a BIOS image",
      description: "Parses UEFI NVRAM variable store. Optional substring filter.",
      inputSchema: { path: z.string(), search: z.string().optional() },
    },
    async ({ path, search }) => {
      if (!existsSync(path)) return failContent("nvram_vars", "FILE_NOT_FOUND", `File not found: ${path}`);
      try {
        const data = await readFile(path);
        const nv = parseNvramStore(data);
        if (!nv.found) return okContent("nvram_vars", { found: false }, "No NVRAM store in this image.");
        const filter = search?.toLowerCase();
        const vars = filter
          ? nv.variables.filter((v) => v.name.toLowerCase().includes(filter) || v.guidName.toLowerCase().includes(filter))
          : nv.variables;
        return okContent("nvram_vars", {
          file: path, found: true, format: nv.format, totalSize: nv.totalSize,
          variables: vars.map((v) => ({ name: v.name, guid: v.guid, guidName: v.guidName, dataSize: v.dataSize, state: v.state })),
        });
      } catch (e: any) {
        return failContent("nvram_vars", "PARSE_FAILED", e?.message ?? "NVRAM parse failed");
      }
    },
  );

  // ─── Chip database tools ───

  server.registerTool(
    "search_chips",
    {
      title: "Search the chip database",
      description: "Fuzzy search across 806 chips (vendor, name, JEDEC prefix).",
      inputSchema: { query: z.string().describe("Vendor, name, or JEDEC ID prefix") },
    },
    async ({ query }) => {
      const matches = searchChips(query);
      if (matches.length === 0) return okContent("search_chips", { query, totalInDatabase: CHIP_DATABASE.length, matches: [] }, "No matches — try a shorter query or vendor name.");
      return okContent("search_chips", {
        query, totalInDatabase: CHIP_DATABASE.length,
        matches: matches.map((c) => ({ name: c.name, vendor: c.vendor, jedecId: c.jedecId, sizeBytes: c.sizeBytes, voltage: c.voltage, needs4ByteAddr: c.needs4ByteAddr })),
      });
    },
  );

  server.registerTool(
    "chip_info",
    {
      title: "Full chip details + write recommendations",
      description: "Look up a chip by JEDEC ID (6 hex chars) or chip name and return full datasheet-derived properties + recommended write settings.",
      inputSchema: { query: z.string().describe("JEDEC ID or chip name") },
    },
    async ({ query }) => {
      const isHex = /^[0-9a-fA-F]{6}$/.test(query);
      const direct = isHex ? lookupChipByJedecId(query) : lookupChipByName(query);
      if (direct) return okContent("chip_info", { query, chip: direct, recommendations: getChipRecommendations(direct) });
      if (isHex) return okContent("chip_info", { query, chip: null, fuzzy: fuzzyMatchJedec(query) }, "No exact JEDEC match — review fuzzy match before writing.");
      const partial = searchChips(query);
      return failContent("chip_info", "NOT_FOUND", `No chip matching "${query}"`, partial.length > 0 ? "Try one of the partialMatches names" : undefined, partial.length > 0 ? "Use `search_chips` to list candidates." : "No partial matches either.");
    },
  );

  // ─── Diagnostics ───

  server.registerTool(
    "post_decode",
    {
      title: "Decode AMI/Award/Phoenix/UEFI POST code",
      description: "Translate hex POST code (e.g. '4F', '0xB4') into phase, description, and likely causes.",
      inputSchema: {
        code: z.string().describe("Hex POST code, 1-4 digits, optionally 0x-prefixed"),
        standard: z.enum(["ami", "award", "phoenix", "uefi"]).optional(),
      },
    },
    async ({ code, standard }) => {
      const isHex = /^(0x)?[0-9a-fA-F]{1,4}$/.test(code);
      if (!isHex) return failContent("post_decode", "INVALID_CODE", `"${code}" is not a valid POST code`, "1-4 hex digits, optionally prefixed with 0x.");
      const matches = lookupPostCode(code, standard as PostStandard | undefined);
      if (matches.length > 0) {
        return okContent("post_decode", {
          query: code, standard: standard ?? null,
          matches: matches.map((e) => ({ standard: e.standard, code: e.code, phase: e.phase, phaseDescription: getPhaseDescription(e.phase), description: e.description, causes: e.causes })),
        });
      }
      const cleaned = code.replace(/^0x/i, "").toUpperCase().padStart(2, "0");
      const nearby = searchPostCodes(cleaned);
      return okContent("post_decode", {
        query: code, matches: [],
        nearby: nearby.slice(0, 5).map((e) => ({ standard: e.standard, code: e.code, phase: e.phase, description: e.description, causes: e.causes })),
      }, nearby.length > 0 ? "No exact match — nearby entries reference this code." : "No info for this code.");
    },
  );

  server.registerTool(
    "failure_search",
    {
      title: "Search the motherboard failure pattern database",
      description: "Find failure patterns matching a symptom string or list patterns in a category (power, display, boot, stability, bios, peripheral).",
      inputSchema: {
        query: z.string().optional(),
        category: z.enum(["power", "display", "boot", "stability", "bios", "peripheral"]).optional(),
      },
    },
    async ({ query, category }) => {
      if (category) {
        const patterns = getPatternsByCategory(category);
        return okContent("failure_search", { mode: "category", category, count: patterns.length, patterns: patterns.map((p) => ({ id: p.id, name: p.name, category: p.category, difficulty: p.difficulty })) });
      }
      if (!query) return failContent("failure_search", "MISSING_ARG", "Pass either query or category");
      const results = searchFailurePatterns(query);
      return okContent("failure_search", {
        mode: "search", query, count: results.length,
        patterns: results.slice(0, 10).map((p) => ({ id: p.id, name: p.name, category: p.category, difficulty: p.difficulty, symptoms: p.symptoms, causes: p.causes, diagnosticSteps: p.diagnosticSteps, tools: p.tools })),
      });
    },
  );

  server.registerTool(
    "voltage_reference",
    {
      title: "ATX/EPS/PCIe/board voltage reference tables",
      description: "Returns expected voltages + tolerances for each pin on the requested connector. Optional rail-name filter.",
      inputSchema: {
        connector: z.string().optional().describe("Substring filter: atx, eps, pcie, board, spi"),
        search: z.string().optional().describe("Filter rails by name/notes substring"),
      },
    },
    async ({ connector, search }) => {
      const connArg = connector?.toLowerCase();
      const q = search?.toLowerCase();
      const matched = ALL_REFERENCES.filter((ref) => {
        if (!connArg) return true;
        return ref.connector.toLowerCase().includes(connArg) || ref.description.toLowerCase().includes(connArg);
      }).map((ref) => {
        if (!q) return ref;
        const rails = ref.rails.filter((r) => r.name.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q) || r.pin.toLowerCase().includes(q));
        return { ...ref, rails };
      }).filter((ref) => ref.rails.length > 0);

      return okContent("voltage_reference", { connector: connArg ?? null, search: q ?? null, count: matched.length, connectors: matched }, "Compare rail.expected + rail.tolerance against multimeter readings.");
    },
  );

  return server;
}

// ─── Entrypoint ───

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so stdout stays pure JSON-RPC.
  process.stderr.write(`biospy-mcp v${VERSION} ready on stdio${FORCE_MOCK ? " (mock mode)" : ""}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    process.stderr.write(`biospy-mcp fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
