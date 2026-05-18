#!/usr/bin/env node

import { CH341ABackend, type ProgressCallback } from "./backends/ch341a.js";
import { CH347Backend } from "./backends/ch347.js";
import { MockBackend } from "./backends/mock.js";
import { UsbDisconnectError } from "./backends/usb-errors.js";
import { BiosAnalyzer } from "./analysis/bios.js";
import { scanFirmwareVolumes } from "./analysis/uefi.js";
import { parseMeRegion } from "./analysis/me.js";
import { parseNvramStore } from "./analysis/nvram.js";
import { listRegions as listBiosRegions, extractRegion, extractRegionToFile, replaceRegionInFile } from "./analysis/regions.js";
import { analyzeBiosHealth } from "./analysis/recovery.js";
import { repairFromReference, resetNvram, repairAuto, type RepairReport } from "./analysis/repair.js";
import { runPipeline, buildBackupPipeline, buildRepairPipeline, createContext, type PipelineResult } from "./workflows/pipeline.js";
import { SerialDebug } from "./serial/debug.js";
import { searchChips, CHIP_DATABASE, formatSize, getChipVoltage, needs4ByteAddressing, getManufacturerName, lookupChipByJedecId, lookupChipByName, fuzzyMatchJedec, getChipRecommendations } from "./chips/database.js";
import type { ChipDef } from "./chips/database.js";
import { lookupPostCode, searchPostCodes, getPhaseDescription, searchFailurePatterns, getPatternsByCategory, FAILURE_PATTERNS, POWER_STAGES, analyzePowerSequence, getWorkflow, listWorkflows, formatWorkflowTree, analyzeSpiReadings, formatScoreBar, ALL_REFERENCES, buildTestReport, computeOverallScore, generateReportJson, LAPTOP_FAILURE_PATTERNS, searchLaptopFailurePatterns, getLaptopPatternsByCategory, ALL_LAPTOP_PLATFORMS, lookupPlatform, analyzeLaptopPower, LAPTOP_BRAND_GUIDES, LAPTOP_WORKFLOWS, getLaptopWorkflow, listLaptopWorkflows, GPU_FAILURE_PATTERNS, searchGpuFailurePatterns, getGpuPatternsByCategory, parseVbios, formatVbiosReport, VRM_CONTROLLERS, VRM_FAULT_SIGNATURES, lookupVrmController, searchVrmFaults, GPU_MEMORY_TEST_PATTERNS, VRAM_CHIPS, SSD_CONTROLLERS, SSD_FAILURE_PATTERNS, lookupSsdController, searchSsdControllers, searchSsdFailures, NAND_CHIPS, NAND_DIAG_PATTERNS, NAND_HEALTH_INDICATORS, lookupNandChip, searchNandDiagPatterns, getNandPatternsByCategory, interpretSmartAttribute, HDD_PCB_CHIPS, HDD_PCB_PROCEDURES, HDD_PCB_FAILURE_PATTERNS, lookupHddPcbChip, searchHddProcedures, getHddProceduresByManufacturer, searchHddPcbFailures, STORAGE_WORKFLOWS, getStorageWorkflow, listStorageWorkflows, searchStorageWorkflows, ROUTER_FIRMWARE_LAYOUTS, ROUTER_RECOVERY_PROCEDURES, lookupRouterFirmware, searchRouterRecovery, getRouterByBrand, getRecoveryByBrand, MCU_DATABASE, JTAG_PINOUTS, EMBEDDED_FAILURE_PATTERNS, POE_CONTROLLERS, lookupMcu, getJtagPinout, listJtagPinouts, searchEmbeddedFailures, lookupPoEController } from "./diagnostics/index.js";
import type { PostStandard, PowerSymptoms, SpiReading, TestResult, LaptopPowerSymptoms } from "./diagnostics/index.js";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as out from "./output.js";
import { computeQualityScore, formatMonitorLine, shouldAutoExit } from "./connection/quality.js";
import type { RawConnectionData } from "./connection/quality.js";
import type { ChipInfo, ReadResult } from "./types.js";
import { emitOk as agentOk, emitFail as agentFail, wantsJson, wantsNdjson } from "./agent/envelope.js";

const VERSION = "1.1.0";

let ch341a: CH341ABackend | MockBackend = new CH341ABackend();
let ch347: CH347Backend | MockBackend = new CH347Backend();
const analyzer = new BiosAnalyzer();
const serial = new SerialDebug();

let verbose = false;
let dryRun = false;
function vlog(msg: string): void {
  if (verbose) out.dim(`[verbose] ${msg}`);
}

// ─── Backend selection ───

type BackendKind = "ch341a" | "ch347";

async function pickBackend(force?: string): Promise<{ kind: BackendKind }> {
  if (dryRun) {
    vlog("Dry-run mode — using mock backend");
    return { kind: "ch341a" };
  }

  if (force) {
    if (force === "ch347") return { kind: "ch347" };
    if (force === "ch341a" || force === "native") return { kind: "ch341a" };
    out.fail(`Unknown backend: "${force}". Supported: ch341a, ch347`);
    process.exit(1);
  }

  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected && info.type === "ch341a") {
      vlog("Detected CH341A programmer");
      return { kind: "ch341a" };
    }
  } catch {}

  try {
    const info = await ch347.detectProgrammer();
    if (info.connected) {
      vlog("Detected CH347 programmer");
      return { kind: "ch347" };
    }
  } catch {}

  out.fail("No CH341A or CH347 programmer detected.");
  console.log();
  out.dim("Troubleshooting:");
  out.dim("  1. Check USB connection — unplug and reconnect the programmer");
  out.dim("  2. Verify the programmer is powered (LED should be on)");
  out.dim("  3. Try a different USB port (avoid hubs)");
  out.dim("  4. Check driver installation:");
  out.dim("     macOS: no driver needed (libusb)");
  out.dim("     Linux: ensure user is in 'plugdev' group, or run with sudo");
  out.dim("     Windows: install WCH drivers or use Zadig for libusb");
  out.dim("  5. If using SOIC clip: check clip seating on chip (pin 1 alignment)");
  process.exit(1);
}

async function identifyAny(): Promise<ChipInfo | null> {
  try {
    vlog("Trying CH341A chip identification...");
    return await ch341a.identifyChip();
  } catch (err: any) {
    vlog(`CH341A: ${err.message}`);
  }
  try {
    vlog("Trying CH347 chip identification...");
    return await ch347.identifyChip();
  } catch (err: any) {
    vlog(`CH347: ${err.message}`);
  }
  return null;
}

function makeProgress(label: string): ProgressCallback {
  return (pct: number, bytes: number, total: number, speed?: number, eta?: number) => {
    let extra = `${formatSize(bytes)} / ${formatSize(total)}`;
    if (speed) extra += ` @ ${formatSize(speed)}/s`;
    if (eta && eta > 0) extra += ` ETA ${out.formatDuration(eta * 1000)}`;
    out.writeProgress(label, pct, extra);
  };
}

// ─── NDJSON streaming helpers ───
// Emits one JSON object per line on stdout. Used when --ndjson is set on hardware ops.

function ndjsonEmit(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function ndjsonStatus(operation: string, message: string, extra?: Record<string, unknown>): void {
  ndjsonEmit({ type: "status", operation, message, ...(extra ?? {}) });
}

function ndjsonError(operation: string, code: string, message: string, extra?: Record<string, unknown>): void {
  ndjsonEmit({ type: "error", operation, code, message, ...(extra ?? {}) });
}

function ndjsonResult(operation: string, ok: boolean, extra?: Record<string, unknown>): void {
  ndjsonEmit({ type: "result", operation, ok, ...(extra ?? {}) });
}

// Throttle progress events so a 16MB read doesn't spew thousands of lines.
function makeNdjsonProgress(operation: string): ProgressCallback {
  let lastPct = -1;
  let lastEmitMs = 0;
  return (pct: number, bytes: number, total: number, speed?: number, eta?: number) => {
    const now = Date.now();
    const floored = Math.floor(pct);
    if (floored !== lastPct && (now - lastEmitMs >= 50 || pct === 100)) {
      lastPct = floored;
      lastEmitMs = now;
      ndjsonEmit({ type: "progress", operation, percent: floored, bytes, total, rateBytesPerSec: speed ?? null, etaSec: eta ?? null });
    }
  };
}

// ─── Commands ───

async function cmdStatus(args: Args) {
  const json = wantsJson(args.flags);
  const ch341aInfo = await ch341a.detectProgrammer();
  const ch347Info = await ch347.detectProgrammer();
  const chip = await identifyAny();

  if (json) {
    const programmer = ch341aInfo.connected && ch341aInfo.type === "ch341a"
      ? { connected: true, type: "ch341a", description: ch341aInfo.description, vendorId: ch341aInfo.vendorId, productId: ch341aInfo.productId, maxPayload: 31 }
      : ch347Info.connected
      ? { connected: true, type: ch347Info.type, description: ch347Info.description, vendorId: ch347Info.vendorId, productId: ch347Info.productId, maxPayload: 510 }
      : { connected: false };
    const chipData = chip ? {
      detected: true,
      vendor: chip.vendorName,
      name: chip.name,
      jedecId: chip.jedecId,
      sizeBytes: chip.sizeBytes,
      sizeHuman: chip.sizeHuman,
      type: chip.type,
      manufacturer: getManufacturerName(chip.jedecId),
      voltage: chip.voltage ?? null,
      addressing: needs4ByteAddressing(chip.jedecId) ? "4-byte" : "3-byte",
      voltageWarning: chip.voltage && chip.voltage < 2.0 ? "1.8V chip — stock CH341A outputs 3.3V. Use a voltage adapter." : null,
    } : { detected: false };
    const nextAction = !programmer.connected
      ? "Connect a CH341A or CH347 programmer via USB, then re-run."
      : !chip
      ? "Check chip seating in ZIF socket (pin 1 alignment)."
      : "Use `identify` for full chip details or `read <out.bin>` to dump.";
    agentOk("status", { programmer, chip: chipData }, nextAction);
    return;
  }

  out.header("Programmer");
  if (ch341aInfo.connected && ch341aInfo.type === "ch341a") {
    out.ok(`${ch341aInfo.description} (${ch341aInfo.type})`);
    out.kvLine("USB ID", `${ch341aInfo.vendorId}:${ch341aInfo.productId}`);
    out.kvLine("Backend", "native USB (CH341A)");
    out.kvLine("Max SPI payload", "31 bytes/packet");
  } else if (ch347Info.connected) {
    out.ok(`${ch347Info.description} (${ch347Info.type})`);
    out.kvLine("USB ID", `${ch347Info.vendorId}:${ch347Info.productId}`);
    out.kvLine("Backend", "native USB (CH347)");
    out.kvLine("Max SPI payload", "510 bytes/packet");
  } else {
    out.fail("No CH34x programmer detected");
    out.dim("Connect a CH341A or CH347 programmer via USB");
  }

  out.header("Flash Chip");
  if (chip) {
    out.ok(`${chip.vendorName} ${chip.name}`);
    out.kvLine("JEDEC ID", chip.jedecId);
    out.kvLine("Size", chip.sizeHuman);
    out.kvLine("Type", chip.type.toUpperCase());
    out.kvLine("Manufacturer", getManufacturerName(chip.jedecId));
    if (chip.voltage) out.kvLine("Voltage", `${chip.voltage}V`);
    if (needs4ByteAddressing(chip.jedecId)) {
      out.kvLine("Addressing", "4-byte (>16MB)");
    } else {
      out.kvLine("Addressing", "3-byte");
    }
    if (chip.voltage && chip.voltage < 2.0) {
      out.warn("1.8V chip — stock CH341A outputs 3.3V. Use a voltage adapter!");
    }
  } else {
    out.fail("No chip detected");
    out.dim("Check chip seating in ZIF socket (pin 1 aligned with dot/notch)");
  }

  console.log();
}

async function cmdDetect(args?: Args) {
  const json = args ? wantsJson(args.flags) : false;
  if (json) {
    const ch341aInfo = await ch341a.detectProgrammer();
    const ch347Info = await ch347.detectProgrammer();
    const found: Array<Record<string, unknown>> = [];
    if (ch341aInfo.connected && ch341aInfo.type === "ch341a") {
      found.push({ type: ch341aInfo.type, description: ch341aInfo.description, vendorId: ch341aInfo.vendorId, productId: ch341aInfo.productId, bus: ch341aInfo.bus ?? null, address: ch341aInfo.address ?? null, portPath: ch341aInfo.portPath ?? null, viaHub: ch341aInfo.viaHub ?? false, maxPayload: 31 });
    }
    if (ch347Info.connected) {
      found.push({ type: ch347Info.type, description: ch347Info.description, vendorId: ch347Info.vendorId, productId: ch347Info.productId, bus: ch347Info.bus ?? null, address: ch347Info.address ?? null, portPath: ch347Info.portPath ?? null, viaHub: ch347Info.viaHub ?? false, maxPayload: 510 });
    }
    agentOk("detect", { count: found.length, programmers: found }, found.length === 0 ? "No CH34x found — check USB connection or try a different port." : "Use `status` to also identify the chip, or `read <out.bin>` to dump it.");
    return;
  }

  out.header("Scanning USB...");

  const ch341aInfo = await ch341a.detectProgrammer();
  if (ch341aInfo.connected && ch341aInfo.type === "ch341a") {
    out.ok(`Found: ${ch341aInfo.description}`);
    out.kvLine("Type", ch341aInfo.type);
    out.kvLine("USB ID", `${ch341aInfo.vendorId}:${ch341aInfo.productId}`);
    out.kvLine("Speed", "31 bytes/packet (SPI stream mode)");
    if (ch341aInfo.bus !== undefined) out.kvLine("USB Bus", `${ch341aInfo.bus}, address ${ch341aInfo.address}`);
    if (ch341aInfo.portPath) out.kvLine("Port Path", ch341aInfo.portPath);
    if (ch341aInfo.viaHub) out.warn("Connected via USB hub — for best reliability, connect directly to motherboard USB port");
  }

  const ch347Info = await ch347.detectProgrammer();
  if (ch347Info.connected) {
    out.ok(`Found: ${ch347Info.description}`);
    out.kvLine("Type", ch347Info.type);
    out.kvLine("USB ID", `${ch347Info.vendorId}:${ch347Info.productId}`);
    out.kvLine("Speed", "510 bytes/packet (configurable clock up to 60MHz)");
    if (ch347Info.bus !== undefined) out.kvLine("USB Bus", `${ch347Info.bus}, address ${ch347Info.address}`);
    if (ch347Info.portPath) out.kvLine("Port Path", ch347Info.portPath);
    if (ch347Info.viaHub) out.warn("Connected via USB hub — for best reliability, connect directly to motherboard USB port");
  }

  if (!ch341aInfo.connected && !ch347Info.connected) {
    out.fail("No CH34x programmer found");
    out.dim("Supported: CH341A (1a86:5512), CH341B clone (5523), CH347 (55db),");
    out.dim("           CH347T (55dc), CH347F (55de), CH343 UART (55d3),");
    out.dim("           legacy QinHeng VID (4348:5512)");
    out.dim("Check: USB cable connected? Try different port? Dongle/hub issue?");
  }
  console.log();
}

async function cmdIdentify(args: Args) {
  const json = wantsJson(args.flags);
  const chip = await identifyAny();
  if (!chip) {
    if (json) {
      agentFail("identify", "NO_CHIP", "No chip detected", "Check chip seating in ZIF socket. Pin 1 (dot/notch) must align with socket marking.", "Re-seat the chip and re-run, or run `detect` to confirm programmer is present.");
      process.exit(1);
    }
    out.header("Identifying chip...");
    out.fail("No chip detected");
    out.dim("1. Check programmer is connected");
    out.dim("2. Check chip is seated correctly in ZIF socket");
    out.dim("3. Pin 1 (dot/notch) must align with socket marking");
    process.exit(1);
  }

  if (json) {
    const dbChip = lookupChipByJedecId(chip.jedecId);
    let sfdp: unknown = null;
    try { sfdp = await ch341a.readSFDP(); } catch {}
    const data: Record<string, unknown> = {
      jedecId: chip.jedecId,
      vendor: chip.vendorName,
      name: chip.name,
      sizeBytes: chip.sizeBytes,
      type: chip.type,
      voltage: chip.voltage ?? null,
      manufacturer: getManufacturerName(chip.jedecId),
      needs4ByteAddr: needs4ByteAddressing(chip.jedecId),
      knownInDatabase: !!dbChip,
    };
    if (dbChip) {
      data.dbChip = dbChip;
      data.recommendations = getChipRecommendations(dbChip);
    } else {
      data.fuzzy = fuzzyMatchJedec(chip.jedecId);
    }
    if (sfdp) data.sfdp = sfdp;
    agentOk("identify", data, dbChip ? "Chip is in the database — safe to read/write with default settings." : "Unknown chip — review fuzzy match and confirm voltage before writing.");
    return;
  }

  out.header("Identifying chip...");

  const dbChip = lookupChipByJedecId(chip.jedecId);
  if (dbChip) {
    out.ok(`${chip.vendorName} ${chip.name}`);
    displayChipDetails(dbChip);
    displayRecommendations(dbChip);
  } else {
    out.warn(`Unknown chip — JEDEC ID: ${chip.jedecId}`);
    const fuzzy = fuzzyMatchJedec(chip.jedecId);
    out.kvLine("Manufacturer", fuzzy.manufacturer);
    out.kvLine("Estimated Size", formatSize(fuzzy.estimatedSizeBytes));
    out.kvLine("Confidence", fuzzy.confidence);
    out.kvLine("Description", fuzzy.reasoning);
    if (fuzzy.similarChips.length > 0) {
      console.log();
      out.header("Similar Chips in Database");
      const rows = [["Name", "Vendor", "Size", "JEDEC ID"]];
      for (const s of fuzzy.similarChips) {
        rows.push([s.name, s.vendor, formatSize(s.sizeBytes), s.jedecId]);
      }
      out.table(rows);
    }
    out.dim(`\nTry: biospy chip-info ${chip.jedecId} for more details`);
  }

  try {
    const sfdp = await ch341a.readSFDP();
    if (sfdp) {
      console.log();
      out.header("SFDP (auto-detected parameters)");
      out.kvLine("Density", formatSize(sfdp.densityBytes));
      out.kvLine("Page Size", `${sfdp.pageSize} bytes`);
      out.kvLine("4KB Sector", sfdp.sectorSize4KB ? "yes" : "no");
      out.kvLine("32KB Block", sfdp.blockSize32KB ? "yes" : "no");
      out.kvLine("64KB Block", sfdp.blockSize64KB ? "yes" : "no");
      out.kvLine("Fast Read", sfdp.fastReadSupported ? "yes" : "no");
      out.kvLine("4-Byte Addr", sfdp.supports4ByteAddr ? "yes" : "no");
    }
  } catch {
    vlog("SFDP not available");
  }

  console.log();
}

// ─── Pre-flight quality gate ───

/**
 * Run a connection quality check before read/write operations.
 * Returns the score if proceeding is allowed, or exits the process if blocked.
 *
 * Thresholds:
 *   >= 70: proceed silently (show score in verbose mode)
 *   50-69: warn user, proceed
 *   < 50:  block operation, print diagnostics, exit 1
 */
async function runPreFlightQualityCheck(operation: string): Promise<number> {
  // Try CH341A first, then CH347
  let connResult;
  try {
    connResult = await ch341a.connectionTest();
    if (!connResult.stable && connResult.reads === 0) {
      connResult = await ch347.connectionTest();
    }
  } catch {
    try {
      connResult = await ch347.connectionTest();
    } catch {
      // Neither programmer available — skip quality check
      return 100;
    }
  }

  // Map connectionTest data to RawConnectionData
  const jedecReadings: string[] = [];
  for (let i = 0; i < connResult.matches; i++) {
    jedecReadings.push(connResult.jedecId);
  }
  for (let i = connResult.matches; i < connResult.reads; i++) {
    jedecReadings.push("000000");
  }

  const rawData: RawConnectionData = {
    jedecReadings,
    timingsMs: connResult.timings,
    statusRegisterOk: connResult.statusRegister !== null,
  };

  const quality = computeQualityScore(rawData);

  if (quality.score >= 70) {
    // Good or Excellent — proceed silently
    vlog(`Pre-flight quality: ${quality.score}/100 (${quality.grade})`);
    return quality.score;
  }

  if (quality.score >= 50) {
    // Fair — warn but proceed
    out.warn(`Connection quality: ${quality.score}/100 (${quality.grade})`);
    out.warn(`Proceeding with ${operation} — connection is marginal`);
    if (quality.diagnostics.length > 0) {
      for (const diag of quality.diagnostics) {
        out.dim(`  ${diag}`);
      }
    }
    return quality.score;
  }

  // Poor (< 50) — block the operation
  out.fail(`Connection quality too low for ${operation}: ${quality.score}/100 (${quality.grade})`);
  if (quality.diagnostics.length > 0) {
    for (const diag of quality.diagnostics) {
      out.warn(diag);
    }
  }
  out.dim("Run 'biospy connect' for detailed connection diagnostics.");
  process.exit(1);
}

async function cmdRead(args: Args) {
  const ndjson = wantsNdjson(args.flags);
  const outPath = args.positional[0];
  if (!outPath) {
    if (ndjson) { ndjsonError("read", "MISSING_ARG", "Output path required"); ndjsonResult("read", false, { error: "MISSING_ARG" }); process.exit(1); }
    out.fail("Usage: biospy read <output.bin>");
    process.exit(1);
  }

  const doubleVerify = args.flags.includes("--double-verify") || args.flags.includes("--safe");

  if (ndjson) {
    ndjsonStatus("read", `Reading chip → ${outPath}`, { outPath, doubleVerify });
  } else if (doubleVerify) {
    out.header(`Reading chip → ${outPath} (double-verify mode)`);
  } else {
    out.header(`Reading chip → ${outPath}`);
  }

  if (!dryRun && !args.flags.includes("--skip-quality-check")) {
    await runPreFlightQualityCheck("read");
  }

  const backend = await pickBackend(args.backend);
  if (ndjson) {
    ndjsonStatus("read", `Backend: ${backend.kind}`, { backend: backend.kind });
  } else {
    out.info(`Backend: ${backend.kind}`);
  }

  const progress = ndjson ? makeNdjsonProgress("read") : makeProgress("Reading");

  let result: ReadResult;
  if (backend.kind === "ch341a") {
    result = doubleVerify ? await ch341a.readChipDoubleVerify(outPath, progress) : await ch341a.readChip(outPath, progress);
    if (!ndjson) out.writeProgress("Reading", 100);
  } else {
    result = await ch347.readChip(outPath, progress);
    if (!ndjson) out.writeProgress("Reading", 100);
  }

  if (!result.success) {
    if (ndjson) {
      ndjsonError("read", "READ_FAILED", result.error ?? "read failed");
      ndjsonResult("read", false, { error: result.error ?? null });
      process.exit(1);
    }
    out.fail(`Read failed: ${result.error}`);
    process.exit(1);
  }

  const data = await readFile(outPath);
  const blank = data.every((b) => b === 0xff);
  const allZero = data.every((b) => b === 0x00);
  const speedBps = result.durationMs > 0 ? result.sizeBytes / (result.durationMs / 1000) : null;

  if (ndjson) {
    ndjsonResult("read", true, {
      file: result.filePath,
      sizeBytes: result.sizeBytes,
      durationMs: result.durationMs,
      checksum: result.checksum,
      rateBytesPerSec: speedBps,
      warnings: [
        ...(result.error && result.error.startsWith("Warning:") ? [result.error] : []),
        ...(data.length === 0 ? ["empty read"] : []),
        ...(blank ? ["chip read is entirely 0xFF — may be blank or unconnected"] : []),
        ...(allZero ? ["chip read is entirely 0x00 — connection likely failed"] : []),
      ],
    });
    return;
  }

  out.ok(`Read complete in ${out.formatDuration(result.durationMs)}`);
  out.kvLine("File", result.filePath);
  out.kvLine("Size", out.formatBytes(result.sizeBytes));
  out.kvLine("SHA256", result.checksum.substring(0, 16) + "...");
  if (speedBps !== null) out.kvLine("Speed", `${formatSize(speedBps)}/s`);
  if (result.error && result.error.startsWith("Warning:")) out.warn(result.error);
  if (data.length === 0) { console.log(); out.warn("Chip read is empty (0 bytes) — something went wrong"); }
  else if (blank) { console.log(); out.warn("Chip read is entirely 0xFF — chip may be blank or not connected properly"); }
  else if (allZero) { console.log(); out.warn("Chip read is entirely 0x00 — connection likely failed"); }
  console.log();
}

async function cmdWrite(args: Args) {
  const ndjson = wantsNdjson(args.flags);
  const failNdjson = (code: string, msg: string, extra?: Record<string, unknown>): never => {
    ndjsonError("write", code, msg, extra);
    ndjsonResult("write", false, { error: code });
    process.exit(1);
  };

  const inPath = args.positional[0];
  if (!inPath) {
    if (ndjson) failNdjson("MISSING_ARG", "Usage: biospy write <firmware.bin>");
    out.fail("Usage: biospy write <firmware.bin>"); process.exit(1);
  }
  if (!existsSync(inPath)) {
    if (ndjson) failNdjson("FILE_NOT_FOUND", `File not found: ${inPath}`);
    out.fail(`File not found: ${inPath}`); process.exit(1);
  }

  if (ndjson) ndjsonStatus("write", `Writing ${inPath} → chip`, { inPath });
  else out.header(`Writing ${inPath} → chip`);

  let firmware: Buffer = await readFile(inPath);
  if (firmware.length === 0) {
    if (ndjson) failNdjson("EMPTY_FILE", "File is empty");
    out.fail("File is empty"); process.exit(1);
  }

  const fwInfo = await analyzer.extractFirmware(inPath);
  if (fwInfo.strippedBytes > 0 && !args.flags.includes("--raw")) {
    if (ndjson) ndjsonStatus("write", `Auto-stripping ${fwInfo.format} header`, { strippedBytes: fwInfo.strippedBytes, format: fwInfo.format, warnings: fwInfo.warnings });
    else {
      out.warn(`Detected ${fwInfo.format} — file has ${formatSize(fwInfo.strippedBytes)} header`);
      out.info(`Auto-stripping header. Raw firmware: ${formatSize(fwInfo.data.length)}`);
      for (const w of fwInfo.warnings) out.warn(w);
    }
    firmware = Buffer.from(fwInfo.data);
  }

  if (firmware.every((b) => b === 0xff)) {
    if (ndjson) failNdjson("BLANK_FIRMWARE", "Firmware is entirely 0xFF (blank). Use `erase` instead.");
    out.fail("Firmware is entirely 0xFF (blank). This would erase all BIOS data.");
    out.dim("If intentional, use 'biospy erase' instead.");
    process.exit(1);
  }
  if (firmware.every((b) => b === 0x00)) {
    if (ndjson) failNdjson("ZERO_FIRMWARE", "Firmware is entirely 0x00 — likely corrupted or a failed read.");
    out.fail("Firmware is entirely 0x00 — likely corrupted or a failed read.");
    process.exit(1);
  }

  if (!dryRun && !args.flags.includes("--skip-quality-check") && !args.flags.includes("--skip-test")) {
    await runPreFlightQualityCheck("write");
  }

  const chip = await identifyAny();
  if (!chip) {
    if (ndjson) failNdjson("NO_CHIP", "No chip detected — cannot write", { hint: "Check programmer, SOIC clip/ZIF socket, or run `reset` if interrupted." });
    out.fail("No chip detected — cannot write");
    out.dim("1. Check programmer is connected (biospy detect)");
    out.dim("2. Check SOIC clip/ZIF socket connection (biospy test-connection)");
    out.dim("3. Try 'biospy reset' if chip was interrupted mid-operation");
    process.exit(1);
  }

  if (firmware.length > chip.sizeBytes) {
    if (ndjson) failNdjson("FILE_TOO_LARGE", `File (${firmware.length}) exceeds chip capacity (${chip.sizeBytes})`, { fileSize: firmware.length, chipSize: chip.sizeBytes });
    out.fail(`File (${out.formatBytes(firmware.length)}) exceeds chip capacity (${chip.sizeHuman})`);
    process.exit(1);
  }

  const voltage = getChipVoltage(chip.jedecId);
  if (voltage && voltage < 2.0 && !args.flags.includes("--force-1.8v")) {
    if (ndjson) failNdjson("VOLTAGE_GATE", `${chip.name} is a 1.8V chip. Stock CH341A outputs 3.3V — would damage chip.`, { voltage, hint: "If you have a 1.8V adapter, re-run with --force-1.8v" });
    out.fail(`${chip.name} is a 1.8V chip. Stock CH341A outputs 3.3V.`);
    out.fail("This WILL damage the chip without a voltage adapter.");
    out.dim("If you have a 1.8V adapter, re-run with --force-1.8v");
    process.exit(1);
  }

  if (ndjson) ndjsonStatus("write", `Chip: ${chip.vendorName} ${chip.name} (${chip.sizeHuman})`, { chip: { vendor: chip.vendorName, name: chip.name, sizeBytes: chip.sizeBytes, jedecId: chip.jedecId, voltage: voltage ?? null, needs4ByteAddr: needs4ByteAddressing(chip.jedecId) } });
  else {
    out.info(`Chip: ${chip.vendorName} ${chip.name} (${chip.sizeHuman})`);
    if (firmware.length < chip.sizeBytes) {
      const pad = chip.sizeBytes - firmware.length;
      out.info(`File is ${out.formatBytes(firmware.length)}, chip is ${chip.sizeHuman} — ${formatSize(pad)} will remain 0xFF`);
    }
    if (needs4ByteAddressing(chip.jedecId)) out.info("4-byte addressing mode will be used (chip >16MB)");
  }

  const noBackup = args.flags.includes("--no-backup");
  const noVerify = args.flags.includes("--no-verify");

  const backend = await pickBackend(args.backend);
  if (ndjson) ndjsonStatus("write", `Backend: ${backend.kind}`, { backend: backend.kind, noBackup, noVerify });
  else {
    out.info(`Backend: ${backend.kind}`);
    if (!noBackup) out.info("Auto-backup before write...");
    else out.warn("Backup skipped (--no-backup)");
  }

  const sigHandler = () => {
    if (!ndjson) {
      out.warn("\n⚠ SIGINT ignored — write in progress. Interrupting now WILL brick your chip.");
      out.warn("  Wait for write to finish or accept the risk of a corrupted chip.");
    }
  };
  process.on("SIGINT", sigHandler);

  let writePath = inPath;
  let tmpWritePath: string | null = null;
  if (fwInfo.strippedBytes > 0 && !args.flags.includes("--raw")) {
    tmpWritePath = join(tmpdir(), `bios_stripped_${Date.now()}.bin`);
    await writeFile(tmpWritePath, firmware);
    writePath = tmpWritePath;
  }

  const progress = ndjson ? makeNdjsonProgress("write") : makeProgress("Writing");

  let result;
  try {
    if (backend.kind === "ch341a") {
      result = await ch341a.writeChip(writePath, progress, { skipBackup: noBackup, skipVerify: noVerify });
    } else {
      result = await ch347.writeChip(writePath, progress, { skipBackup: noBackup, skipVerify: noVerify });
    }
    if (!ndjson) out.writeProgress("Writing", 100);
  } finally {
    if (tmpWritePath) try { await unlink(tmpWritePath); } catch {}
  }

  process.removeListener("SIGINT", sigHandler);

  if (!result.success) {
    if (ndjson) {
      ndjsonError("write", "WRITE_FAILED", result.error ?? "write failed", { backupPath: result.backupPath ?? null });
      ndjsonResult("write", false, { error: result.error ?? null, backupPath: result.backupPath ?? null });
      process.exit(1);
    }
    out.fail(`Write failed: ${result.error}`);
    if (result.backupPath) out.info(`Backup saved at: ${result.backupPath}`);
    process.exit(1);
  }

  const speedBps = result.durationMs > 0 ? firmware.length / (result.durationMs / 1000) : null;

  if (ndjson) {
    ndjsonResult("write", true, {
      durationMs: result.durationMs,
      backupPath: result.backupPath ?? null,
      verified: noVerify ? null : result.verified,
      bytesWritten: firmware.length,
      rateBytesPerSec: speedBps,
    });
    return;
  }

  out.ok(`Write complete in ${out.formatDuration(result.durationMs)}`);
  if (result.backupPath) out.kvLine("Backup", result.backupPath);
  if (!noVerify) out.kvLine("Verified", result.verified ? "yes" : "NO — run 'biospy verify' manually");
  else out.dim("Verification skipped (--no-verify)");
  if (speedBps !== null) out.kvLine("Speed", `${formatSize(speedBps)}/s`);
  console.log();
}

async function cmdBlankCheck(args: Args) {
  const ndjson = wantsNdjson(args.flags);
  if (ndjson) ndjsonStatus("blank-check", "Reading chip for blank check...");
  else out.header("Blank check — reading chip...");

  const backend = await pickBackend(args.backend);
  if (ndjson) ndjsonStatus("blank-check", `Backend: ${backend.kind}`, { backend: backend.kind });
  else out.info(`Backend: ${backend.kind}`);

  const tmpPath = join(tmpdir(), `bios_blankcheck_${Date.now()}.bin`);
  try {
    const progress = ndjson ? makeNdjsonProgress("blank-check") : makeProgress("Reading");
    let result: ReadResult;
    if (backend.kind === "ch341a") result = await ch341a.readChip(tmpPath, progress);
    else result = await ch347.readChip(tmpPath, progress);
    if (!ndjson) out.writeProgress("Reading", 100);

    if (!result.success) {
      if (ndjson) { ndjsonError("blank-check", "READ_FAILED", result.error ?? "read failed"); ndjsonResult("blank-check", false, { error: result.error ?? null }); process.exit(1); }
      out.fail(`Read failed: ${result.error}`);
      process.exit(1);
    }

    const data = await readFile(tmpPath);
    let nonBlank = 0;
    let firstNonBlank = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0xff) {
        nonBlank++;
        if (firstNonBlank === -1) firstNonBlank = i;
      }
    }

    if (ndjson) {
      ndjsonResult("blank-check", true, {
        blank: nonBlank === 0,
        sizeBytes: data.length,
        nonBlankBytes: nonBlank,
        firstNonBlankOffset: firstNonBlank >= 0 ? firstNonBlank : null,
        nonBlankPercent: data.length > 0 ? nonBlank / data.length : 0,
      });
      return;
    }

    if (nonBlank === 0) {
      out.ok(`Chip is blank (${formatSize(data.length)} all 0xFF)`);
    } else {
      out.fail(`NOT blank — ${nonBlank.toLocaleString()} non-0xFF bytes (${(nonBlank / data.length * 100).toFixed(2)}%)`);
      out.kvLine("First at", `0x${firstNonBlank.toString(16)}`);
      out.kvLine("Chip size", formatSize(data.length));
    }
  } finally {
    try { await unlink(tmpPath); } catch {}
  }
  console.log();
}

async function cmdWPStatus(args: Args) {
  const json = wantsJson(args.flags);

  const tryBackend = async (backend: typeof ch341a | typeof ch347, type: string): Promise<{ ok: true; wp: boolean; type: string } | null> => {
    try {
      const info = await backend.detectProgrammer();
      if (info.connected) {
        const wp = await backend.isWriteProtected();
        return { ok: true, wp, type };
      }
    } catch {}
    return null;
  };

  const result = (await tryBackend(ch341a, "ch341a")) ?? (await tryBackend(ch347, "ch347"));

  if (!result) {
    if (json) {
      agentFail("wp-status", "NO_PROGRAMMER", "No native USB programmer detected", "WP check requires a CH341A or CH347 programmer.", "Run `detect` to confirm USB connection.");
      process.exit(1);
    }
    out.header("Write protection status");
    out.fail("No native USB programmer detected (WP check requires CH341A/CH347)");
    process.exit(1);
  }

  if (json) {
    agentOk("wp-status", { writeProtected: result.wp, backend: result.type }, result.wp ? "Chip is write-protected — `write` will clear protection automatically before programming." : "Chip is writable — safe to proceed with write operations.");
    return;
  }

  out.header("Write protection status");
  if (result.wp) {
    out.warn("Write protection is ENABLED");
    out.dim("The write command clears this automatically before programming.");
  } else {
    out.ok("Write protection is disabled — chip is writable");
  }
}

async function cmdErase(args: Args) {
  if (!args.flags.includes("--confirm")) {
    if (wantsNdjson(args.flags)) {
      ndjsonError("erase", "MISSING_CONFIRM", "Erase is destructive — re-run with --confirm");
      ndjsonResult("erase", false, { error: "MISSING_CONFIRM" });
      process.exit(1);
    }
    out.fail("Erase is destructive and irreversible.");
    out.dim("Re-run with --confirm to proceed.");
    process.exit(1);
  }

  const ndjson = wantsNdjson(args.flags);
  if (ndjson) ndjsonStatus("erase", "Erasing chip...");
  else out.header("Erasing chip...");

  const backend = await pickBackend(args.backend);
  if (ndjson) ndjsonStatus("erase", `Backend: ${backend.kind}`, { backend: backend.kind });
  else out.info(`Backend: ${backend.kind}`);

  const sigHandler = () => {
    if (!ndjson) out.warn("\n⚠ SIGINT ignored — erase in progress. Wait for completion.");
  };
  process.on("SIGINT", sigHandler);

  let result;
  if (backend.kind === "ch341a") result = await ch341a.eraseChip();
  else result = await ch347.eraseChip();

  process.removeListener("SIGINT", sigHandler);

  if (result.success) {
    if (ndjson) { ndjsonResult("erase", true, { durationMs: result.durationMs }); return; }
    out.ok(`Erased in ${out.formatDuration(result.durationMs)}`);
  } else {
    if (ndjson) {
      ndjsonError("erase", "ERASE_FAILED", result.error ?? "erase failed");
      ndjsonResult("erase", false, { error: result.error ?? null });
      process.exit(1);
    }
    out.fail(`Erase failed: ${result.error}`);
    process.exit(1);
  }
  console.log();
}

async function cmdRegionErase(args: Args) {
  const ndjson = wantsNdjson(args.flags);
  const fail = (code: string, msg: string): never => {
    if (ndjson) {
      ndjsonError("region-erase", code, msg);
      ndjsonResult("region-erase", false, { error: code });
      process.exit(1);
    }
    out.fail(msg);
    process.exit(1);
  };

  const startStr = args.positional[0];
  const lenStr = args.positional[1];
  if (!startStr || !lenStr) {
    if (!ndjson) out.dim("Addresses: decimal or 0x hex");
    fail("MISSING_ARG", "Usage: biospy region-erase <start_addr> <length>");
  }
  if (!args.flags.includes("--confirm")) fail("MISSING_CONFIRM", "Region erase is destructive. Re-run with --confirm.");

  const startAddr = startStr.startsWith("0x") ? parseInt(startStr, 16) : parseInt(startStr);
  const length = lenStr.startsWith("0x") ? parseInt(lenStr, 16) : parseInt(lenStr);
  if (isNaN(startAddr) || isNaN(length)) fail("INVALID_ARG", "Invalid address or length");

  if (ndjson) ndjsonStatus("region-erase", `Region erase: 0x${startAddr.toString(16)} — ${formatSize(length)}`, { startAddr, length });
  else out.header(`Region erase: 0x${startAddr.toString(16)} — ${formatSize(length)}`);

  const backend = await pickBackend(args.backend);
  if (ndjson) ndjsonStatus("region-erase", `Backend: ${backend.kind}`, { backend: backend.kind });
  else out.info(`Backend: ${backend.kind}`);

  let result;
  if (backend.kind === "ch341a") result = await ch341a.regionErase(startAddr, length);
  else result = await ch347.regionErase(startAddr, length);

  if (!result.success) {
    if (ndjson) {
      ndjsonError("region-erase", "ERASE_FAILED", result.error ?? "erase failed");
      ndjsonResult("region-erase", false, { error: result.error ?? null });
      process.exit(1);
    }
    out.fail(`Erase failed: ${result.error}`);
    process.exit(1);
  }
  if (ndjson) { ndjsonResult("region-erase", true, { durationMs: result.durationMs, startAddr, length }); return; }
  out.ok(`Region erased in ${out.formatDuration(result.durationMs)}`);
  console.log();
}

async function cmdVerify(args: Args) {
  const ndjson = wantsNdjson(args.flags);
  const filePath = args.positional[0];
  if (!filePath) {
    if (ndjson) { ndjsonError("verify", "MISSING_ARG", "Usage: biospy verify <firmware.bin>"); ndjsonResult("verify", false, { error: "MISSING_ARG" }); process.exit(1); }
    out.fail("Usage: biospy verify <firmware.bin>"); process.exit(1);
  }
  if (!existsSync(filePath)) {
    if (ndjson) { ndjsonError("verify", "FILE_NOT_FOUND", `File not found: ${filePath}`); ndjsonResult("verify", false, { error: "FILE_NOT_FOUND" }); process.exit(1); }
    out.fail(`File not found: ${filePath}`); process.exit(1);
  }

  if (ndjson) ndjsonStatus("verify", `Verifying chip against ${filePath}`, { filePath });
  else out.header(`Verifying chip against ${filePath}`);
  const backend = await pickBackend(args.backend);
  if (ndjson) ndjsonStatus("verify", `Backend: ${backend.kind}`, { backend: backend.kind });
  else out.info(`Backend: ${backend.kind}`);

  let result;
  if (backend.kind === "ch341a") result = await ch341a.verifyChip(filePath);
  else result = await ch347.verifyChip(filePath);

  if (ndjson) {
    if (result.matches) {
      ndjsonResult("verify", true, { matches: true, durationMs: result.durationMs, fileChecksum: result.fileChecksum, chipChecksum: result.chipChecksum });
      return;
    }
    ndjsonError("verify", "MISMATCH", result.error ?? "chip does not match file");
    ndjsonResult("verify", false, { matches: false, durationMs: result.durationMs, fileChecksum: result.fileChecksum ?? null, chipChecksum: result.chipChecksum ?? null, error: result.error ?? null });
    process.exit(1);
  }

  if (result.matches) {
    out.ok(`Match confirmed in ${out.formatDuration(result.durationMs)}`);
    out.kvLine("File SHA256", result.fileChecksum.substring(0, 16) + "...");
    out.kvLine("Chip SHA256", result.chipChecksum.substring(0, 16) + "...");
  } else {
    out.fail("Mismatch!" + (result.error ? ` ${result.error}` : ""));
    if (result.fileChecksum) out.kvLine("File SHA256", result.fileChecksum.substring(0, 16) + "...");
    if (result.chipChecksum) out.kvLine("Chip SHA256", result.chipChecksum.substring(0, 16) + "...");
    process.exit(1);
  }
  console.log();
}

async function cmdAnalyze(args: Args) {
  const json = wantsJson(args.flags);
  const filePath = args.positional[0];
  if (!filePath) {
    if (json) { agentFail("analyze", "MISSING_ARG", "File path required", "Pass a path to a BIOS image file.", "biospy analyze <firmware.bin>"); process.exit(1); }
    out.fail("Usage: biospy analyze <firmware.bin>"); process.exit(1);
  }
  if (!existsSync(filePath)) {
    if (json) { agentFail("analyze", "FILE_NOT_FOUND", `File not found: ${filePath}`); process.exit(1); }
    out.fail(`File not found: ${filePath}`); process.exit(1);
  }

  const analysis = await analyzer.analyze(filePath);

  if (json) {
    agentOk("analyze", {
      file: filePath,
      sizeBytes: analysis.fileSize,
      checksum: analysis.checksum,
      isUefi: analysis.isUefi,
      biosVendor: analysis.biosVendor ?? null,
      biosVersion: analysis.biosVersion ?? null,
      buildDate: analysis.buildDate ?? null,
      regions: analysis.regions,
      warnings: analysis.warnings,
    }, "Use `bios-regions` for deep region layout or `nvram` to list UEFI variables.");
    return;
  }

  out.header(`Analyzing ${filePath}`);
  out.kvLine("Size", out.formatBytes(analysis.fileSize));
  out.kvLine("SHA256", analysis.checksum.substring(0, 16) + "...");
  out.kvLine("UEFI", analysis.isUefi ? "yes" : "no (legacy BIOS)");
  if (analysis.biosVendor) out.kvLine("Vendor", analysis.biosVendor);
  if (analysis.biosVersion) out.kvLine("Version", analysis.biosVersion);
  if (analysis.buildDate) out.kvLine("Build Date", analysis.buildDate);

  if (analysis.regions.length > 0) {
    out.header("Regions");
    const rows = [["Name", "Offset", "Size", "Type"]];
    for (const r of analysis.regions) {
      rows.push([r.name, `0x${r.offset.toString(16)}`, out.formatBytes(r.size), r.type]);
    }
    out.table(rows);
  }

  if (analysis.warnings.length > 0) {
    console.log();
    for (const w of analysis.warnings) out.warn(w);
  }
  console.log();
}

async function cmdDiff(args: Args) {
  const [fileA, fileB] = args.positional;
  if (!fileA || !fileB) { out.fail("Usage: biospy diff <a.bin> <b.bin>"); process.exit(1); }
  if (!existsSync(fileA)) { out.fail(`File not found: ${fileA}`); process.exit(1); }
  if (!existsSync(fileB)) { out.fail(`File not found: ${fileB}`); process.exit(1); }

  out.header(`Comparing ${fileA} vs ${fileB}`);
  const diff = await analyzer.diff(fileA, fileB);

  if (diff.identical) {
    out.ok("Files are identical");
  } else {
    out.info(`${diff.totalDifferences} difference region(s)`);
    if (diff.sizeMismatch) {
      out.warn(`Size mismatch: ${out.formatBytes(diff.sizeA)} vs ${out.formatBytes(diff.sizeB)}`);
    }

    if (diff.regions.length > 0) {
      console.log();
      const rows = [["Offset", "Length", "Old (hex)", "New (hex)"]];
      for (const r of diff.regions.slice(0, 20)) {
        rows.push([`0x${r.offset.toString(16)}`, `${r.length} B`, r.oldValue, r.newValue]);
      }
      out.table(rows);
      if (diff.totalDifferences > 20) {
        out.dim(`... and ${diff.totalDifferences - 20} more regions`);
      }
    }
  }
  console.log();
}

async function cmdChecksum(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) { out.fail("Usage: biospy checksum <firmware.bin>"); process.exit(1); }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  out.header(`Checksums for ${filePath}`);
  const sums = await analyzer.checksum(filePath);
  out.kvLine("MD5", sums.md5);
  out.kvLine("SHA256", sums.sha256);
  out.kvLine("CRC32", sums.crc32);
  console.log();
}

function displayRepairReport(report: RepairReport): void {
  out.header("Repair Report");
  for (const action of report.actions) out.info(action);

  if (report.regions.length > 0) {
    console.log();
    const rows = [["Region", "Offset", "Size", "Changed"]];
    for (const r of report.regions) {
      rows.push([r.name, `0x${r.offset.toString(16)}`, `${r.size}`, r.changed ? "YES" : "no"]);
    }
    out.table(rows);
  }

  console.log();
  out.kvLine("Bytes modified", report.totalBytesChanged.toString());
  out.kvLine("Input checksum", report.inputChecksum.substring(0, 16) + "...");
  out.kvLine("Output checksum", report.outputChecksum.substring(0, 16) + "...");

  for (const w of report.warnings) out.warn(w);
}

async function cmdRepair(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) {
    out.fail("Usage: biospy repair <broken.bin> [--reference <good.bin>] [--auto] [--nvram-reset] [--output <path>] [--dry-run]");
    process.exit(1);
  }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  const refIdx = args.flags.indexOf("--reference");
  const refPath = refIdx >= 0 ? args.flags[refIdx + 1] : null;
  const outIdx = args.flags.indexOf("--output");
  const outputPath = outIdx >= 0 ? args.flags[outIdx + 1] : null;
  const isAuto = args.flags.includes("--auto");
  const isNvramReset = args.flags.includes("--nvram-reset");
  const isDryRun = args.flags.includes("--dry-run");

  const inputData = await readFile(filePath);
  const baseName = filePath.replace(/^.*[\\/]/, "");
  const defaultOutput = `repaired_${baseName}`;

  if (refPath) {
    if (!existsSync(refPath)) { out.fail(`Reference file not found: ${refPath}`); process.exit(1); }
    out.header(`Reference repair: ${filePath} → ${refPath}`);
    const refData = await readFile(refPath);
    const { repaired, report } = repairFromReference(inputData, refData);
    displayRepairReport(report);
    if (!isDryRun) {
      const dest = outputPath || defaultOutput;
      await writeFile(dest, repaired);
      out.ok(`Repaired image written to ${dest}`);
    } else {
      out.info("Dry run — no output file written");
    }
  } else if (isNvramReset) {
    out.header(`NVRAM reset: ${filePath}`);
    try {
      const { repaired, report, storeOffset, storeSize } = resetNvram(inputData);
      out.kvLine("Store offset", `0x${storeOffset.toString(16)}`);
      out.kvLine("Store size", `${storeSize} bytes`);
      displayRepairReport(report);
      if (!isDryRun) {
        const dest = outputPath || defaultOutput;
        await writeFile(dest, repaired);
        out.ok(`Repaired image written to ${dest}`);
      } else {
        out.info("Dry run — no output file written");
      }
    } catch (e: any) {
      out.fail(e.message);
      process.exit(1);
    }
  } else if (isAuto) {
    out.header(`Auto-repair: ${filePath}`);
    const { repaired, report } = repairAuto(inputData);
    displayRepairReport(report);
    if (!isDryRun) {
      if (report.totalBytesChanged > 0) {
        const dest = outputPath || defaultOutput;
        await writeFile(dest, repaired);
        out.ok(`Repaired image written to ${dest}`);
      } else {
        out.ok("No repairs needed — no output file written");
      }
    } else {
      out.info("Dry run — no output file written");
    }
  } else {
    out.fail("Specify repair mode: --reference <file>, --auto, or --nvram-reset");
    process.exit(1);
  }
  console.log();
}

function displayPipelineResult(result: PipelineResult): void {
  console.log();
  for (const step of result.stepResults) {
    const icon = step.success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${icon} [${step.number}/${result.stepResults.length > 0 ? result.stepResults[result.stepResults.length - 1].number : 0}] ${step.name} — ${step.detail} (${out.formatDuration(step.durationMs)})`);
  }
  console.log();
  if (result.success) {
    out.ok(`Pipeline complete in ${out.formatDuration(result.totalDurationMs)}`);
  } else {
    out.fail(`Pipeline failed at step "${result.errorStep}": ${result.errorDetail}`);
  }
}

async function cmdFullBackup(args: Args) {
  out.header("Full Backup Pipeline");

  const outputDir = (() => {
    const idx = args.flags.indexOf("--output");
    return idx >= 0 ? args.flags[idx + 1] : ".";
  })();

  const backend = dryRun ? new MockBackend() : (await pickBackend(args.backend)).kind === "ch347" ? ch347 : ch341a;
  const ctx = createContext({
    backend: backend as any,
    dryRun,
    outputDir,
  });

  const steps = buildBackupPipeline(ctx);
  const result = await runPipeline(steps, ctx);
  displayPipelineResult(result);

  if (result.success && ctx.metadata && ctx.imageData) {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, "").substring(0, 15);
    const chipName = ctx.chipInfo?.name || "chip";
    const baseName = `${chipName}_${dateStr}`;
    const binPath = join(outputDir, `${baseName}.bin`);
    const jsonPath = join(outputDir, `${baseName}.json`);

    if (!dryRun) {
      await writeFile(binPath, ctx.imageData);
      await writeFile(jsonPath, JSON.stringify(ctx.metadata, null, 2));
      out.ok(`Dump: ${binPath}`);
      out.ok(`Metadata: ${jsonPath}`);
    } else {
      out.info(`Would write: ${binPath}`);
      out.info(`Would write: ${jsonPath}`);
    }
  }
  console.log();

  if (!result.success) process.exit(1);
}

async function cmdFullRepair(args: Args) {
  out.header("Full Repair Pipeline");

  const refIdx = args.flags.indexOf("--reference");
  const refPath = refIdx >= 0 ? args.flags[refIdx + 1] : null;
  const outputDir = (() => {
    const idx = args.flags.indexOf("--output");
    return idx >= 0 ? args.flags[idx + 1] : ".";
  })();
  const skipWrite = args.flags.includes("--skip-write");

  if (refPath && !existsSync(refPath)) {
    out.fail(`Reference file not found: ${refPath}`);
    process.exit(1);
  }

  const backend = dryRun ? new MockBackend() : (await pickBackend(args.backend)).kind === "ch347" ? ch347 : ch341a;
  const ctx = createContext({
    backend: backend as any,
    dryRun,
    referencePath: refPath,
    outputDir,
    skipWrite,
  });

  const steps = buildRepairPipeline(ctx);
  const result = await runPipeline(steps, ctx);
  displayPipelineResult(result);

  if (result.success && ctx.repairReport) {
    displayRepairReport(ctx.repairReport);
  }
  console.log();

  if (!result.success) process.exit(1);
}

async function cmdDump(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) { out.fail("Usage: biospy dump <file> [offset] [length]"); process.exit(1); }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  const offsetStr = args.positional[1] || "0";
  const offset = offsetStr.startsWith("0x") ? parseInt(offsetStr, 16) : parseInt(offsetStr);
  const lengthStr = args.positional[2] || "256";
  const length = lengthStr.startsWith("0x") ? parseInt(lengthStr, 16) : parseInt(lengthStr);

  if (isNaN(offset) || isNaN(length)) {
    out.fail("Invalid offset or length (use decimal or 0x hex)");
    process.exit(1);
  }

  const fileInfo = await stat(filePath);
  const data = await readFile(filePath);

  if (offset >= data.length) {
    out.fail(`Offset 0x${offset.toString(16)} beyond file size (${out.formatBytes(fileInfo.size)})`);
    process.exit(1);
  }

  const end = Math.min(offset + length, data.length);
  const slice = data.subarray(offset, end);

  out.header(`${filePath} — 0x${offset.toString(16)}..0x${(end - 1).toString(16)} (${end - offset} bytes)`);
  console.log();

  for (let i = 0; i < slice.length; i += 16) {
    const row = slice.subarray(i, Math.min(i + 16, slice.length));
    const addr = (offset + i).toString(16).padStart(8, "0");
    const hex = Array.from(row).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(row).map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : ".").join("");
    console.log(`  ${addr}  ${hex.padEnd(47)}  ${ascii}`);
  }
  console.log();
}

function displayChipDetails(chip: ChipDef): void {
  out.kvLine("Name", chip.name);
  out.kvLine("Vendor", chip.vendor);
  out.kvLine("JEDEC ID", chip.jedecId || "—");
  out.kvLine("Size", `${formatSize(chip.sizeBytes)} (${chip.sizeBytes.toLocaleString()} bytes)`);
  out.kvLine("Type", chip.type.toUpperCase());
  out.kvLine("Page Size", `${chip.pageSize} bytes`);
  out.kvLine("Sector Size", chip.sectorSize ? formatSize(chip.sectorSize) : "—");
  out.kvLine("Block Size", chip.blockSize ? formatSize(chip.blockSize) : "—");
  out.kvLine("Voltage", `${chip.voltage}V`);
  if (chip.voltageMin !== undefined && chip.voltageMax !== undefined) {
    out.kvLine("Voltage Range", `${chip.voltageMin}V – ${chip.voltageMax}V`);
  }
  if (chip.maxClockMhz) out.kvLine("Max SPI Clock", `${chip.maxClockMhz} MHz`);
  if (chip.needs4ByteAddr) out.kvLine("Addressing", "4-byte mode required (>16MB)");
  if (chip.eraseOpcodes && chip.eraseOpcodes.length > 0) {
    out.kvLine("Erase Opcodes", chip.eraseOpcodes.map((o: number) => `0x${o.toString(16).padStart(2, "0")}`).join(", "));
  }
}

function displayRecommendations(chip: ChipDef): void {
  const rec = getChipRecommendations(chip);
  console.log();
  out.header("Recommendations");
  out.kvLine("Safe Voltage", rec.safeVoltage);
  out.kvLine("Max SPI Clock", rec.maxSpiClock);
  out.kvLine("Write Page Size", `${rec.writePageSize} bytes`);
  out.kvLine("Erase Strategy", rec.eraseStrategy);
  out.kvLine("Address Mode", rec.addressMode);
  if (rec.warnings.length > 0) {
    console.log();
    for (const w of rec.warnings) out.warn(w);
  }
}

async function cmdChipInfo(args: Args) {
  const query = args.positional[0];
  const wantsJson = args.flags.includes("--json");
  if (!query) {
    if (wantsJson) {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: "Missing query",
        nextAction: "Pass a JEDEC ID (6 hex chars) or chip name as the argument.",
      }) + "\n");
      process.exit(1);
    }
    out.fail("Usage: biospy chip-info <jedec_id|name>");
    out.dim("  biospy chip-info ef4017     # lookup by JEDEC ID");
    out.dim("  biospy chip-info W25Q64     # lookup by chip name");
    process.exit(1);
  }

  const isHex = /^[0-9a-fA-F]{6}$/.test(query);

  // JSON path resolves first so we never print decorative output before serializing.
  if (wantsJson) {
    const direct = isHex ? lookupChipByJedecId(query) : lookupChipByName(query);
    if (direct) {
      process.stdout.write(JSON.stringify({ ok: true, query, chip: direct, recommendations: getChipRecommendations(direct) }) + "\n");
      return;
    }
    if (isHex) {
      const fuzzy = fuzzyMatchJedec(query);
      process.stdout.write(JSON.stringify({ ok: false, query, fuzzy, nextAction: "Re-read JEDEC ID (`biospy identify`) or open an issue with chip details." }) + "\n");
      process.exit(1);
    }
    const partial = searchChips(query);
    process.stdout.write(JSON.stringify({
      ok: false,
      query,
      partialMatches: partial.slice(0, 20),
      error: `No chip matching "${query}"`,
      nextAction: partial.length > 0 ? "Use one of the partialMatches name fields." : "Try `biospy search <prefix>` to list candidates.",
    }) + "\n");
    process.exit(1);
  }

  if (isHex) {
    const chip = lookupChipByJedecId(query);
    if (chip) {
      out.header(`${chip.vendor} ${chip.name}`);
      displayChipDetails(chip);
      displayRecommendations(chip);
    } else {
      out.warn(`No exact match for JEDEC ID ${query.toLowerCase()} — trying fuzzy match...`);
      console.log();
      const fuzzy = fuzzyMatchJedec(query);
      out.header("Fuzzy Match Result");
      out.kvLine("Manufacturer", fuzzy.manufacturer);
      out.kvLine("Estimated Size", formatSize(fuzzy.estimatedSizeBytes));
      out.kvLine("Confidence", fuzzy.confidence);
      out.kvLine("Description", fuzzy.reasoning);
      if (fuzzy.similarChips.length > 0) {
        console.log();
        out.header("Similar Chips");
        const rows = [["Name", "Vendor", "Size", "JEDEC ID"]];
        for (const s of fuzzy.similarChips) {
          rows.push([s.name, s.vendor, formatSize(s.sizeBytes), s.jedecId]);
        }
        out.table(rows);
      }
    }
  } else {
    const chip = lookupChipByName(query);
    if (chip) {
      out.header(`${chip.vendor} ${chip.name}`);
      displayChipDetails(chip);
      displayRecommendations(chip);
    } else {
      const results = searchChips(query);
      if (results.length > 0) {
        out.warn(`No exact match for "${query}" — showing ${results.length} partial match(es)`);
        console.log();
        const rows = [["Name", "Vendor", "Size", "Voltage", "JEDEC ID"]];
        for (const c of results.slice(0, 20)) {
          rows.push([c.name, c.vendor, formatSize(c.sizeBytes), `${c.voltage}V`, c.jedecId || "—"]);
        }
        out.table(rows);
        if (results.length > 20) out.dim(`... and ${results.length - 20} more`);
      } else {
        out.fail(`No chip matching "${query}" in database (${CHIP_DATABASE.length} entries)`);
        out.dim(`Try: biospy search ${query}  # broader fuzzy search`);
        process.exit(1);
      }
    }
  }
  console.log();
}

async function cmdSearch(args: Args) {
  const query = args.positional[0] ?? "";
  const wantsJson = args.flags.includes("--json");

  const results = searchChips(query);
  if (results.length === 0) {
    if (wantsJson) {
      process.stdout.write(JSON.stringify({
        ok: false,
        query,
        matches: [],
        error: `No chips matching "${query}"`,
        totalInDatabase: CHIP_DATABASE.length,
        nextAction: "Try a shorter query, JEDEC ID prefix, or vendor name. See `biospy search` to list all chips.",
      }) + "\n");
      process.exit(1);
    }
    out.fail(`No chips matching "${query}" (${CHIP_DATABASE.length} chips in database)`);
    process.exit(1);
  }

  if (wantsJson) {
    process.stdout.write(JSON.stringify({
      ok: true,
      query,
      totalInDatabase: CHIP_DATABASE.length,
      matches: results.map((c) => ({
        name: c.name,
        vendor: c.vendor,
        jedecId: c.jedecId,
        sizeBytes: c.sizeBytes,
        type: c.type,
        pageSize: c.pageSize,
        sectorSize: c.sectorSize,
        blockSize: c.blockSize,
        voltage: c.voltage,
        voltageMin: c.voltageMin,
        voltageMax: c.voltageMax,
        maxClockMhz: c.maxClockMhz,
        needs4ByteAddr: c.needs4ByteAddr,
      })),
    }) + "\n");
    return;
  }

  const label = query ? `${results.length} chip(s) matching "${query}"` : `All ${results.length} chips in database`;
  out.header(label);
  const rows = [["Name", "Vendor", "Size", "Voltage", "JEDEC ID", "4B Addr"]];
  for (const c of results) {
    const vStr = c.voltageMin !== undefined && c.voltageMax !== undefined
      ? `${c.voltageMin}-${c.voltageMax}V` : `${c.voltage}V`;
    rows.push([
      c.name,
      c.vendor,
      formatSize(c.sizeBytes),
      vStr,
      c.jedecId || "—",
      c.needs4ByteAddr ? "yes" : "—",
    ]);
  }
  out.table(rows);
  console.log();
}

async function cmdSFDP(args?: Args) {
  const json = args ? wantsJson(args.flags) : false;
  try {
    const sfdp = await ch341a.readSFDP();
    if (!sfdp) {
      if (json) {
        agentFail("sfdp", "NO_SFDP", "Chip does not support SFDP or is not connected", "SFDP is optional — check chip datasheet for support. Use `chip-info <jedec>` for database lookup instead.", "Try `identify` to read JEDEC ID and look up parameters from the chip database.");
        process.exit(1);
      }
      out.header("Reading SFDP (Serial Flash Discoverable Parameters)...");
      out.fail("Chip does not support SFDP or is not connected");
      process.exit(1);
    }

    if (json) {
      agentOk("sfdp", sfdp, "Use SFDP-reported geometry as ground truth for write/erase operations.");
      return;
    }

    out.header("Reading SFDP (Serial Flash Discoverable Parameters)...");
    out.ok("SFDP table found");
    out.kvLine("Density", `${formatSize(sfdp.densityBytes)} (${sfdp.densityBits.toLocaleString()} bits)`);
    out.kvLine("Page Size", `${sfdp.pageSize} bytes`);
    out.kvLine("4KB Sector Erase", sfdp.sectorSize4KB ? "supported" : "not supported");
    out.kvLine("32KB Block Erase", sfdp.blockSize32KB ? "supported" : "not supported");
    out.kvLine("64KB Block Erase", sfdp.blockSize64KB ? "supported" : "not supported");
    out.kvLine("Fast Read", sfdp.fastReadSupported ? "supported" : "not supported");
    out.kvLine("4-Byte Addressing", sfdp.supports4ByteAddr ? "supported" : "not supported");
    out.kvLine("Raw Header", sfdp.rawHeader);
  } catch (err: any) {
    if (json) {
      agentFail("sfdp", "READ_FAILED", err.message ?? "SFDP read failed");
      process.exit(1);
    }
    out.fail(err.message);
    process.exit(1);
  }
  console.log();
}

async function cmdConnectionTest() {
  out.header("Connection stability test");
  out.info("Reading JEDEC ID 5 times to verify connection quality...");

  let result;
  try {
    result = await ch341a.connectionTest();
  } catch {
    try {
      result = await ch347.connectionTest();
    } catch (err: any) {
      out.fail(`No programmer found: ${err.message}`);
      process.exit(1);
    }
  }

  if (result.stable) {
    out.ok(`Connection stable — ${result.matches}/${result.reads} reads consistent`);
    out.kvLine("JEDEC ID", result.jedecId);
    const dbEntry = lookupChipByJedecId(result.jedecId);
    if (dbEntry) out.kvLine("Chip", `${dbEntry.vendor} ${dbEntry.name}`);
    out.info("Connection is good — safe to proceed with read/write operations");
  } else {
    out.fail(result.error || "Connection unstable");
    if (result.matches > 0) {
      out.kvLine("Consistency", `${result.matches}/${result.reads} reads matched`);
    }
    console.log();
    out.header("Troubleshooting:");
    out.dim("1. Reseat SOIC clip — make sure all 8 pins make contact");
    out.dim("2. Clean chip pins with isopropyl alcohol");
    out.dim("3. Check ZIF socket — pin 1 dot aligned with notch");
    out.dim("4. Try shorter USB cable or remove USB hub");
    out.dim("5. Remove other devices from SPI bus (disconnect from motherboard)");
    out.dim("6. Try 'biospy reset' to reset chip from stuck state");
    process.exit(1);
  }
  console.log();
}

async function cmdConnect(args: Args) {
  out.header("Connection Wizard");
  out.info("Auto-detecting programmer, identifying chip, and scoring connection quality...");
  console.log();

  // 1. Detect programmer
  let programmerType: string = "unknown";
  let backend: typeof ch341a | typeof ch347 = ch341a;

  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected && info.type === "ch341a") {
      programmerType = "CH341A";
      backend = ch341a;
      vlog("Detected CH341A programmer");
    } else {
      throw new Error("not CH341A");
    }
  } catch {
    try {
      const info = await ch347.detectProgrammer();
      if (info.connected) {
        programmerType = "CH347";
        backend = ch347;
        vlog("Detected CH347 programmer");
      } else {
        throw new Error("not connected");
      }
    } catch (err: any) {
      out.fail(`No programmer found: ${err.message}`);
      out.dim("Connect a CH341A or CH347 programmer via USB");
      process.exit(1);
    }
  }

  out.kvLine("Programmer", programmerType);

  // 2. Identify chip
  const chip = await identifyAny();
  if (chip) {
    out.kvLine("Chip", `${chip.vendorName} ${chip.name}`);
    out.kvLine("JEDEC ID", chip.jedecId);
    out.kvLine("Size", chip.sizeHuman);
  } else {
    out.warn("Could not identify chip — proceeding with connection test");
  }

  // 3. Run enhanced connection test
  let connResult;
  try {
    connResult = await backend.connectionTest();
  } catch (err: any) {
    out.fail(`Connection test failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Map connectionTest data to RawConnectionData for quality scoring
  //    connectionTest returns { stable, reads, matches, jedecId, timings, statusRegister }
  //    We reconstruct jedecReadings: matches copies of jedecId, rest as "000000" (unknown bad reads)
  const jedecReadings: string[] = [];
  for (let i = 0; i < connResult.matches; i++) {
    jedecReadings.push(connResult.jedecId);
  }
  for (let i = connResult.matches; i < connResult.reads; i++) {
    jedecReadings.push("000000");
  }

  const rawData: RawConnectionData = {
    jedecReadings,
    timingsMs: connResult.timings,
    statusRegisterOk: connResult.statusRegister !== null,
  };

  const quality = computeQualityScore(rawData);

  // 5. Output — diagnostics first (actionable recommendations lead)
  console.log();
  if (quality.diagnostics.length > 0) {
    out.header("Diagnostics");
    for (const diag of quality.diagnostics) {
      out.warn(diag);
    }
    console.log();
  }

  // Quality score with grade
  out.header("Quality Score");
  const scoreLabel = `${quality.score}/100 — ${quality.grade}`;
  if (quality.score >= 90) {
    out.ok(scoreLabel);
  } else if (quality.score >= 50) {
    out.warn(scoreLabel);
  } else {
    out.fail(scoreLabel);
  }

  // Category breakdowns
  console.log();
  for (const cat of quality.categories) {
    const pct = `${cat.score}%`;
    const weightPct = `${Math.round(cat.weight * 100)}%`;
    out.kvLine(cat.name, `${pct} (weight ${weightPct})`);
  }

  // Verbose: per-read timing data
  if (verbose && connResult.timings.length > 0) {
    console.log();
    out.header("Per-Read Timings");
    for (let i = 0; i < connResult.timings.length; i++) {
      out.dim(`Read ${i + 1}: ${connResult.timings[i].toFixed(1)}ms`);
    }
  }

  // Connection test summary
  console.log();
  out.kvLine("Reads", `${connResult.matches}/${connResult.reads} consistent`);
  out.kvLine("JEDEC ID", connResult.jedecId);
  if (connResult.statusRegister !== null) {
    out.kvLine("Status Reg", `0x${connResult.statusRegister.toString(16).padStart(2, "0")}`);
  } else {
    out.kvLine("Status Reg", "unreadable");
  }

  // Final recommendation
  console.log();
  if (quality.score >= 90) {
    out.ok("Connection is excellent — safe to proceed with read/write");
  } else if (quality.score >= 70) {
    out.ok("Connection is good — safe to proceed");
  } else if (quality.score >= 50) {
    out.warn("Connection is fair — proceed with caution");
    out.dim("Consider reseating clip before write operations");
  } else {
    out.fail("Connection is poor — fix before proceeding");
    out.dim("Run 'biospy connect' after fixing to re-check");
  }
  console.log();

  // ── Monitor mode ──
  if (args.flags.includes("--monitor")) {
    out.header("Monitor Mode");
    out.info("Re-checking quality every 2 seconds. Press Ctrl+C to stop.");
    console.log();

    let previousScore: number = quality.score;
    let iterationCount = 1;
    let exitReason = "";

    // Clean exit on SIGINT
    const sigintHandler = () => {
      console.log();
      out.header("Monitor Summary");
      out.kvLine("Iterations", String(iterationCount));
      out.kvLine("Final Score", `${previousScore}/100`);
      if (exitReason) out.warn(exitReason);
      console.log();
      process.exit(0);
    };
    process.on("SIGINT", sigintHandler);

    // Continuous re-check loop
    const monitorLoop = async (): Promise<void> => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise<void>(resolve => setTimeout(resolve, 2000));
        iterationCount++;

        let ct;
        try {
          ct = await backend.connectionTest();
        } catch (err: any) {
          out.fail(`Connection lost: ${err.message}`);
          exitReason = "Connection lost during monitoring";
          break;
        }

        const readings: string[] = [];
        for (let i = 0; i < ct.matches; i++) readings.push(ct.jedecId);
        for (let i = ct.matches; i < ct.reads; i++) readings.push("000000");

        const raw: RawConnectionData = {
          jedecReadings: readings,
          timingsMs: ct.timings,
          statusRegisterOk: ct.statusRegister !== null,
        };

        const q = computeQualityScore(raw);
        console.log(formatMonitorLine(q.score, previousScore));

        if (shouldAutoExit(q.score)) {
          console.log();
          out.fail(`Quality dropped to ${q.score}/100 — below critical threshold (20)`);
          out.warn("Auto-exiting monitor. Check physical connection immediately.");
          exitReason = "Auto-exit: critical degradation";
          previousScore = q.score;
          break;
        }

        previousScore = q.score;
      }

      // Print summary on loop exit
      process.removeListener("SIGINT", sigintHandler);
      console.log();
      out.header("Monitor Summary");
      out.kvLine("Iterations", String(iterationCount));
      out.kvLine("Final Score", `${previousScore}/100`);
      if (exitReason) out.warn(exitReason);
      console.log();
      process.exit(1);
    };

    await monitorLoop();
    return; // unreachable, but satisfies TS
  }

  // Exit code: 0 if score >= 50, 1 if < 50
  if (quality.score < 50) {
    process.exit(1);
  }
}

async function cmdReset() {
  out.header("Resetting chip...");
  out.info("Sending: Release Power-Down → Enable Reset → Reset");

  try {
    await ch341a.resetChip();
    out.ok("Reset sequence complete (CH341A)");
  } catch {
    try {
      await ch347.resetChip();
      out.ok("Reset sequence complete (CH347)");
    } catch (err: any) {
      out.fail(`Reset failed: ${err.message}`);
      out.dim("If chip still doesn't respond, power-cycle the programmer (replug USB)");
      process.exit(1);
    }
  }
  out.info("Chip should now respond to commands. Try 'biospy identify'");
  console.log();
}

async function cmdExtract(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) { out.fail("Usage: biospy extract <firmware_file>"); process.exit(1); }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  out.header(`Detecting firmware format: ${filePath}`);
  const result = await analyzer.extractFirmware(filePath);

  out.kvLine("Format", result.format);
  out.kvLine("Original size", formatSize(result.originalSize));

  if (result.strippedBytes > 0) {
    out.kvLine("Header stripped", formatSize(result.strippedBytes));
    out.kvLine("Firmware size", formatSize(result.data.length));

    const outPath = filePath.replace(/\.[^.]+$/, ".raw.bin");
    await writeFile(outPath, result.data);
    out.ok(`Extracted firmware saved to: ${outPath}`);
    out.info("Use this file for 'biospy write' — it's the raw BIOS data without capsule headers");
  } else {
    out.ok("File is already raw binary — use directly with 'biospy write'");
  }

  for (const w of result.warnings) {
    out.warn(w);
  }
  console.log();
}

async function cmdSerialList() {
  out.header("Serial ports (CH34x/WCH)");
  try {
    const ports = await serial.listPorts();
    if (ports.length === 0) {
      out.dim("No WCH/CH34x serial ports found");
    } else {
      for (const p of ports) {
        out.ok(p.path);
        if (p.manufacturer) out.kvLine("Manufacturer", p.manufacturer);
      }
    }
  } catch (err: any) {
    out.fail(err.message);
  }
  console.log();
}

async function cmdSerialConnect(args: Args) {
  const port = args.positional[0];
  const baud = parseInt(args.positional[1] || "115200");
  if (!port) { out.fail("Usage: biospy serial <port> [baud]"); process.exit(1); }

  out.header(`Serial: ${port} @ ${baud}`);
  const result = await serial.connect({ port, baudRate: baud });
  if (!result.success) {
    out.fail(result.error || "Connection failed");
    process.exit(1);
  }

  out.ok("Connected — streaming output (Ctrl+C to quit)");
  console.log();

  let lastTs = Date.now();
  const interval = setInterval(() => {
    const msgs = serial.getLog(lastTs);
    for (const m of msgs) {
      if (m.direction === "rx") process.stdout.write(m.data);
      if (m.timestamp > lastTs) lastTs = m.timestamp + 1;
    }
  }, 100);

  process.on("SIGINT", async () => {
    clearInterval(interval);
    await serial.disconnect();
    console.log("\nDisconnected.");
    process.exit(0);
  });
}

async function cmdSetup() {
  out.header("biospy setup check");

  out.ok(`Node.js ${process.version}`);

  // CH341A
  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected && info.type === "ch341a") {
      out.ok(`CH341A: ${info.description}`);
    } else {
      out.dim("CH341A: not connected");
    }
  } catch (err: any) {
    out.warn(`CH341A USB: ${err.message}`);
  }

  // CH347
  try {
    const info = await ch347.detectProgrammer();
    if (info.connected) {
      out.ok(`CH347: ${info.description}`);
    } else {
      out.dim("CH347: not connected");
    }
  } catch (err: any) {
    out.warn(`CH347 USB: ${err.message}`);
  }

  // Serialport
  try {
    await serial.listPorts();
    out.ok("serialport working");
  } catch {
    out.warn("serialport not available (serial debug disabled)");
  }

  // Chip database
  out.ok(`Chip database: ${CHIP_DATABASE.length} chips`);

  console.log();
}

// ─── Diagnostic commands ───

async function cmdPostDecode(args: Args) {
  const json = wantsJson(args.flags);
  const code = args.positional[0];
  if (!code) {
    if (json) { agentFail("post-decode", "MISSING_ARG", "POST code required", undefined, "biospy post-decode <hex-code> [--standard ami|award|phoenix|uefi]"); process.exit(1); }
    out.fail("Usage: biospy post-decode <hex-code> [--standard ami|award|phoenix|uefi]");
    process.exit(1);
  }

  let standard: PostStandard | undefined;
  const stdIdx = args.flags.indexOf("--standard");
  if (stdIdx >= 0) {
    const flagList = args.flags;
    const stdVal = flagList[stdIdx + 1] as PostStandard;
    if (stdVal && ["ami", "award", "phoenix", "uefi"].includes(stdVal)) {
      standard = stdVal;
    }
  }
  for (const pos of args.positional.slice(1)) {
    if (["ami", "award", "phoenix", "uefi"].includes(pos)) {
      standard = pos as PostStandard;
    }
  }

  const isHex = /^(0x)?[0-9a-fA-F]{1,4}$/.test(code);
  const results = lookupPostCode(code, standard);

  if (results.length === 0) {
    const cleaned = code.replace(/^0x/i, "").toUpperCase().padStart(2, "0");
    const nearby = searchPostCodes(cleaned);
    if (json) {
      if (!isHex) {
        agentFail("post-decode", "INVALID_CODE", `"${code}" is not a valid POST code`, "POST codes are 1-4 hex digits, optionally prefixed with 0x.");
        process.exit(1);
      }
      agentOk("post-decode", { query: code, matches: [], nearby: nearby.slice(0, 5).map((e) => ({ standard: e.standard, code: e.code, phase: e.phase, description: e.description, causes: e.causes })) }, nearby.length > 0 ? "No exact match — nearby returns descriptions that mention this code." : "No information available for this code in the database.");
      return;
    }
    out.warn(`No exact match for POST code 0x${cleaned}${standard ? ` (${standard})` : ""}`);
    console.log();
    if (nearby.length > 0) {
      out.info("Searching descriptions...");
      const shown = nearby.slice(0, 5);
      for (const entry of shown) {
        out.header(`[${entry.standard.toUpperCase()}] 0x${entry.code} — ${entry.phase}`);
        out.kvLine("Description", entry.description);
        if (entry.causes.length > 0) {
          out.kvLine("Causes", entry.causes[0]);
          for (const c of entry.causes.slice(1)) out.dim(c);
        }
      }
      return;
    }
    if (!isHex) {
      out.fail(`"${code}" is not a valid POST code (expected 1–4 hex digits, optionally prefixed with 0x)`);
      process.exit(1);
    }
    out.fail(`No information available for POST code 0x${cleaned}`);
    process.exit(1);
  }

  if (json) {
    agentOk("post-decode", { query: code, standard: standard ?? null, matches: results.map((e) => ({ standard: e.standard, code: e.code, phase: e.phase, phaseDescription: getPhaseDescription(e.phase), description: e.description, causes: e.causes })) });
    return;
  }

  for (const entry of results) {
    out.header(`[${entry.standard.toUpperCase()}] POST Code 0x${entry.code}`);
    out.kvLine("Phase", entry.phase);
    out.kvLine("Phase info", getPhaseDescription(entry.phase));
    out.kvLine("Description", entry.description);
    if (entry.causes.length > 0) {
      console.log();
      out.info("Common causes:");
      for (const cause of entry.causes) {
        out.dim(`• ${cause}`);
      }
    }
    console.log();
  }
}

async function cmdFailureDb(args: Args) {
  const json = wantsJson(args.flags);
  let categoryFilter: string | undefined;
  const catIdx = args.flags.indexOf("--category");
  if (catIdx >= 0 && args.flags[catIdx + 1]) {
    categoryFilter = args.flags[catIdx + 1];
  }

  if (categoryFilter) {
    const patterns = getPatternsByCategory(categoryFilter);
    if (patterns.length === 0) {
      if (json) { agentFail("failure-db", "UNKNOWN_CATEGORY", `No patterns in category "${categoryFilter}"`, "Valid categories: power, display, boot, stability, bios, peripheral."); process.exit(1); }
      out.fail(`No patterns in category "${categoryFilter}". Categories: power, display, boot, stability, bios, peripheral`);
      process.exit(1);
    }
    if (json) {
      agentOk("failure-db", { mode: "category", category: categoryFilter, count: patterns.length, patterns: patterns.map((p) => ({ id: p.id, name: p.name, category: p.category, difficulty: p.difficulty })) }, "Search by symptom for full diagnostic detail: `failure-db \"<symptom>\"`");
      return;
    }
    out.header(`Failure Patterns — ${categoryFilter.toUpperCase()} (${patterns.length} patterns)`);
    console.log();
    for (const p of patterns) {
      console.log(`  ${p.id}  ${p.name}  [${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}]`);
    }
    console.log();
    out.dim(`Use 'biospy failure-db "<symptom>"' to search by symptom`);
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    if (json) { agentFail("failure-db", "MISSING_ARG", "Query or category required", undefined, "biospy failure-db <symptom> | --category <power|display|boot|stability|bios|peripheral>"); process.exit(1); }
    out.fail("Usage: biospy failure-db <symptom> | biospy failure-db --category <category>");
    out.dim("Examples:");
    out.dim('  biospy failure-db "no power"');
    out.dim('  biospy failure-db "blank screen"');
    out.dim("  biospy failure-db --category power");
    out.dim(`Total patterns in database: ${FAILURE_PATTERNS.length}`);
    process.exit(1);
  }

  const results = searchFailurePatterns(query);
  if (results.length === 0) {
    if (json) { agentOk("failure-db", { mode: "search", query, count: 0, patterns: [] }, "Try broader terms: power, display, boot, ram, gpu, usb, bios"); return; }
    out.warn(`No failure patterns match "${query}"`);
    out.dim("Try broader terms: power, display, boot, ram, gpu, usb, bios");
    return;
  }

  if (json) {
    agentOk("failure-db", { mode: "search", query, count: results.length, patterns: results.slice(0, 10).map((p) => ({ id: p.id, name: p.name, category: p.category, difficulty: p.difficulty, symptoms: p.symptoms, causes: p.causes, diagnosticSteps: p.diagnosticSteps, tools: p.tools })) });
    return;
  }

  const shown = results.slice(0, 5);
  out.header(`Failure Patterns matching "${query}" (${results.length} found, showing top ${shown.length})`);

  for (const p of shown) {
    console.log();
    out.header(`${p.name}  [${p.category}]  Difficulty: ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);

    out.info("Symptoms:");
    for (const s of p.symptoms) out.dim(`• ${s}`);

    console.log();
    out.info("Likely causes (ranked):");
    for (const c of p.causes) {
      const marker = c.probability === "high" ? "!!!" : c.probability === "medium" ? " !!" : "  !";
      out.dim(`${marker} [${c.probability}] ${c.cause}`);
    }

    console.log();
    out.info("Diagnostic steps:");
    for (let i = 0; i < p.diagnosticSteps.length; i++) {
      out.dim(`${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
    }

    if (p.tools.length > 0) {
      console.log();
      out.kvLine("Tools needed", p.tools.join(", "));
    }
  }
  console.log();
}

async function cmdPowerSequence(args: Args) {
  const hasSymptoms = args.flags.some((f) =>
    ["--fan-spins", "--no-fan", "--leds-on", "--no-leds", "--beeps", "--no-beep",
     "--display", "--no-display", "--drive-activity", "--no-drives", "--usb-power", "--no-usb"].includes(f),
  );

  if (!hasSymptoms) {
    out.header("ATX Power-On Sequence");
    console.log();
    for (const stage of POWER_STAGES) {
      console.log(`  ${stage.order}. ${stage.name}`);
      out.dim(`     ${stage.description}`);
      out.dim(`     Rails: ${stage.voltageRails.join(", ")}`);
      out.dim(`     Observable: ${stage.observableSignals[0]}`);
      console.log();
    }
    out.dim("Use symptom flags to analyze a failure:");
    out.dim("  biospy power-sequence --fan-spins --no-display --no-beep");
    out.dim("");
    out.dim("Flags: --fan-spins, --no-fan, --leds-on, --no-leds, --beeps, --no-beep,");
    out.dim("       --display, --no-display, --drive-activity, --no-drives, --usb-power, --no-usb");
    return;
  }

  const symptoms: PowerSymptoms = {};
  if (args.flags.includes("--fan-spins")) { symptoms.psuFanSpins = true; symptoms.cpuFanSpins = true; }
  if (args.flags.includes("--no-fan")) { symptoms.psuFanSpins = false; symptoms.cpuFanSpins = false; }
  if (args.flags.includes("--leds-on")) symptoms.boardLeds = true;
  if (args.flags.includes("--no-leds")) symptoms.boardLeds = false;
  if (args.flags.includes("--beeps")) symptoms.postBeeps = true;
  if (args.flags.includes("--no-beep")) symptoms.postBeeps = false;
  if (args.flags.includes("--display")) symptoms.displayOutput = true;
  if (args.flags.includes("--no-display")) symptoms.displayOutput = false;
  if (args.flags.includes("--drive-activity")) symptoms.driveActivity = true;
  if (args.flags.includes("--no-drives")) symptoms.driveActivity = false;
  if (args.flags.includes("--usb-power")) symptoms.usbPower = true;
  if (args.flags.includes("--no-usb")) symptoms.usbPower = false;

  const results = analyzePowerSequence(symptoms);

  out.header("Power Sequence Analysis");
  console.log();

  for (const r of results) {
    const pct = Math.round(r.confidence * 100);
    out.info(`Stage ${r.stage.order}: ${r.stage.name} — ${pct}% confidence`);
    out.dim(`  ${r.reasoning}`);
    console.log();
    out.info("Voltage rails to check:");
    for (const rail of r.stage.voltageRails) out.dim(`  • ${rail}`);
    console.log();
    out.info("Next diagnostic steps:");
    for (let i = 0; i < r.nextChecks.length; i++) {
      out.dim(`  ${(i + 1).toString().padStart(2)}. ${r.nextChecks[i]}`);
    }
    console.log();
  }
}

async function cmdLaptopDiag(args: Args) {
  const brandIdx = args.flags.indexOf("--brand");
  if (brandIdx >= 0) {
    const brandKey = args.flags[brandIdx + 1]?.toLowerCase();
    const guide = brandKey ? LAPTOP_BRAND_GUIDES[brandKey] : undefined;
    if (!guide) {
      out.fail(`Unknown brand "${brandKey}". Available: ${Object.keys(LAPTOP_BRAND_GUIDES).join(", ")}`);
      process.exit(1);
    }
    out.header(`${guide.brand} — Repair Guide`);
    console.log();
    out.kvLine("BIOS access", guide.biosAccessKey);
    out.kvLine("Reset procedure", guide.resetProcedure);
    out.kvLine("Diagnostic mode", guide.diagnosticMode);
    console.log();
    out.info("Common EC chips:");
    for (const ec of guide.commonEcChips) out.dim(`  • ${ec}`);
    console.log();
    out.info("Common charge ICs:");
    for (const ic of guide.commonChargeIcs) out.dim(`  • ${ic}`);
    console.log();
    out.info("Common VRMs:");
    for (const vrm of guide.commonVrms) out.dim(`  • ${vrm}`);
    console.log();
    out.info("Known issues:");
    for (const issue of guide.knownIssues) out.dim(`  • ${issue}`);
    return;
  }

  const query = args.positional.join(" ");

  if (!query) {
    out.header("Laptop Platform Database");
    console.log();
    out.info("Intel Platforms:");
    for (const p of ALL_LAPTOP_PLATFORMS.filter(p => p.vendor === "intel")) {
      out.dim(`  ${p.generation.padEnd(22)} ${p.codename.padEnd(18)} ${p.name}`);
    }
    console.log();
    out.info("AMD Platforms:");
    for (const p of ALL_LAPTOP_PLATFORMS.filter(p => p.vendor === "amd")) {
      out.dim(`  ${p.generation.padEnd(22)} ${p.codename.padEnd(18)} ${p.name}`);
    }
    console.log();
    out.dim("Usage: biospy laptop-diag <platform-name>");
    out.dim("Example: biospy laptop-diag \"raptor lake\"");
    out.dim("         biospy laptop-diag zen4");
    console.log();
    out.header("Brand Guides");
    console.log();
    for (const [id, guide] of Object.entries(LAPTOP_BRAND_GUIDES)) {
      out.info(`${guide.brand.padEnd(20)} (${id})`);
    }
    out.dim("\nUsage: biospy laptop-diag --brand <brand>");
    return;
  }

  const platform = lookupPlatform(query);
  if (!platform) {
    out.fail(`No platform matching "${query}". Try: haswell, broadwell, skylake, raptor lake, zen2, zen4...`);
    process.exit(1);
  }

  out.header(`${platform.name} — ${platform.codename} (${platform.vendor.toUpperCase()} ${platform.generation})`);
  console.log();
  out.info("Power-On Sequence:");
  console.log();
  for (const stage of platform.powerSequence) {
    console.log(`  ${stage.order}. ${stage.name}  [${stage.rail}]`);
    out.dim(`     Typical: ${stage.typicalVoltage}`);
    out.dim(`     ${stage.description}`);
    out.dim(`     Controlled by: ${stage.controlledBy}`);
    console.log();
  }

  out.info("Failure symptoms per stage:");
  for (const stage of platform.powerSequence) {
    out.info(`  ${stage.order}. ${stage.name}:`);
    for (const s of stage.failureSymptoms) out.dim(`     • ${s}`);
    console.log();
  }
}

async function cmdLaptopPower(args: Args) {
  const platformQuery = args.positional.join(" ");

  const hasSymptoms = args.flags.some(f =>
    ["--charger-led", "--no-charger-led", "--battery-charges", "--no-battery",
     "--power-button", "--no-power-button", "--fan-spins", "--no-fan",
     "--backlight", "--no-backlight", "--display", "--no-display",
     "--keyboard-lights", "--no-keyboard", "--usb-power", "--no-usb"].includes(f),
  );

  if (!platformQuery) {
    out.header("Laptop Power Rail Analyzer");
    console.log();
    out.dim("Analyzes laptop power-on sequence by platform and symptoms.");
    console.log();
    out.dim("Usage: biospy laptop-power <platform> [--symptom-flags]");
    out.dim("");
    out.dim("Examples:");
    out.dim('  biospy laptop-power "raptor lake"');
    out.dim("  biospy laptop-power skylake --no-fan --charger-led");
    out.dim("  biospy laptop-power zen4 --no-display --fan-spins");
    out.dim("");
    out.dim("Symptom flags:");
    out.dim("  --charger-led / --no-charger-led     Charger indicator light");
    out.dim("  --battery-charges / --no-battery      Battery accepts charge");
    out.dim("  --power-button / --no-power-button    Power button responds");
    out.dim("  --fan-spins / --no-fan                Fan runs");
    out.dim("  --backlight / --no-backlight          Screen backlight");
    out.dim("  --display / --no-display              Display output");
    out.dim("  --keyboard-lights / --no-keyboard     Keyboard illumination");
    out.dim("  --usb-power / --no-usb                USB port power");
    console.log();
    out.dim(`Platforms: ${ALL_LAPTOP_PLATFORMS.map(p => p.codename).join(", ")}`);
    return;
  }

  const platform = lookupPlatform(platformQuery);
  if (!platform) {
    out.fail(`No platform matching "${platformQuery}".`);
    out.dim(`Available: ${ALL_LAPTOP_PLATFORMS.map(p => p.codename).join(", ")}`);
    process.exit(1);
  }

  if (!hasSymptoms) {
    out.header(`${platform.name} — Power Rail Sequence`);
    console.log();
    for (const stage of platform.powerSequence) {
      console.log(`  ${stage.order}. ${stage.name}  →  ${stage.rail}  [${stage.typicalVoltage}]`);
      out.dim(`     ${stage.controlledBy}`);
    }
    console.log();
    out.dim("Add symptom flags for power failure analysis:");
    out.dim(`  biospy laptop-power "${platformQuery}" --no-fan --charger-led`);
    return;
  }

  const symptoms: LaptopPowerSymptoms = {};
  if (args.flags.includes("--charger-led")) symptoms.chargerLed = true;
  if (args.flags.includes("--no-charger-led")) symptoms.chargerLed = false;
  if (args.flags.includes("--battery-charges")) symptoms.batteryCharges = true;
  if (args.flags.includes("--no-battery")) symptoms.batteryCharges = false;
  if (args.flags.includes("--power-button")) symptoms.powerButtonResponse = true;
  if (args.flags.includes("--no-power-button")) symptoms.powerButtonResponse = false;
  if (args.flags.includes("--fan-spins")) symptoms.fanSpins = true;
  if (args.flags.includes("--no-fan")) symptoms.fanSpins = false;
  if (args.flags.includes("--backlight")) symptoms.screenBacklight = true;
  if (args.flags.includes("--no-backlight")) symptoms.screenBacklight = false;
  if (args.flags.includes("--display")) symptoms.displayOutput = true;
  if (args.flags.includes("--no-display")) symptoms.displayOutput = false;
  if (args.flags.includes("--keyboard-lights")) symptoms.keyboardLights = true;
  if (args.flags.includes("--no-keyboard")) symptoms.keyboardLights = false;
  if (args.flags.includes("--usb-power")) symptoms.usbPower = true;
  if (args.flags.includes("--no-usb")) symptoms.usbPower = false;

  const analysis = analyzeLaptopPower(platform, symptoms);
  const pct = Math.round(analysis.confidence * 100);

  out.header(`Laptop Power Analysis — ${platform.name}`);
  console.log();
  out.info(`Suspected failed stage: ${analysis.suspectedStage.name} (${pct}% confidence)`);
  out.dim(`  Rail: ${analysis.suspectedStage.rail}  [${analysis.suspectedStage.typicalVoltage}]`);
  out.dim(`  Controlled by: ${analysis.suspectedStage.controlledBy}`);
  console.log();
  out.info("Reasoning:");
  out.dim(`  ${analysis.reasoning}`);
  console.log();
  out.info("Diagnostic checks:");
  for (let i = 0; i < analysis.nextChecks.length; i++) {
    out.dim(`  ${(i + 1).toString().padStart(2)}. ${analysis.nextChecks[i]}`);
  }
  console.log();
}

async function cmdLaptopFailures(args: Args) {
  let categoryFilter: string | undefined;
  const catIdx = args.flags.indexOf("--category");
  if (catIdx >= 0 && args.flags[catIdx + 1]) {
    categoryFilter = args.flags[catIdx + 1];
  }

  if (categoryFilter) {
    const patterns = getLaptopPatternsByCategory(categoryFilter);
    if (patterns.length === 0) {
      out.fail(`No patterns in category "${categoryFilter}". Categories: power, display, keyboard, audio, network, usb, storage, battery, boot, thermal`);
      process.exit(1);
    }
    out.header(`Laptop Failure Patterns — ${categoryFilter.toUpperCase()} (${patterns.length} patterns)`);
    console.log();
    for (const p of patterns) {
      console.log(`  ${p.id}  ${p.name}  [${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}]`);
    }
    console.log();
    out.dim(`Use 'biospy laptop-failures "<symptom>"' to search by symptom`);
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.fail("Usage: biospy laptop-failures <symptom> | biospy laptop-failures --category <category>");
    out.dim("Examples:");
    out.dim('  biospy laptop-failures "no power"');
    out.dim('  biospy laptop-failures "backlight"');
    out.dim("  biospy laptop-failures --category display");
    out.dim(`Total laptop patterns: ${LAPTOP_FAILURE_PATTERNS.length}`);
    out.dim("Categories: power, display, keyboard, audio, network, usb, storage, battery, boot, thermal");
    process.exit(1);
  }

  const results = searchLaptopFailurePatterns(query);
  if (results.length === 0) {
    out.warn(`No laptop failure patterns match "${query}"`);
    out.dim("Try: power, display, keyboard, audio, network, usb, storage, battery, boot, thermal");
    return;
  }

  const shown = results.slice(0, 5);
  out.header(`Laptop Failures matching "${query}" (${results.length} found, showing top ${shown.length})`);

  for (const p of shown) {
    console.log();
    out.header(`${p.name}  [${p.category}]  Difficulty: ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);

    out.info("Symptoms:");
    for (const s of p.symptoms) out.dim(`• ${s}`);

    console.log();
    out.info("Likely causes (ranked):");
    for (const c of p.causes) {
      const marker = c.probability === "high" ? "!!!" : c.probability === "medium" ? " !!" : "  !";
      out.dim(`${marker} [${c.probability}] ${c.cause}`);
    }

    console.log();
    out.info("Diagnostic steps:");
    for (let i = 0; i < p.diagnosticSteps.length; i++) {
      out.dim(`${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
    }

    if (p.tools.length > 0) {
      console.log();
      out.kvLine("Tools needed", p.tools.join(", "));
    }
  }
  console.log();
}

async function cmdGpuDiag(args: Args) {
  const vrmIdx = args.flags.indexOf("--vrm");
  if (vrmIdx >= 0) {
    const vrmQuery = args.flags[vrmIdx + 1];
    if (!vrmQuery) {
      out.fail("Usage: biospy gpu-diag --vrm <controller-name>");
      out.dim(`Available: ${VRM_CONTROLLERS.map(c => c.name).join(", ")}`);
      process.exit(1);
    }
    const controller = lookupVrmController(vrmQuery);
    if (!controller) {
      out.fail(`No VRM controller matching "${vrmQuery}".`);
      out.dim(`Available: ${VRM_CONTROLLERS.map(c => c.name).join(", ")}`);
      process.exit(1);
    }
    out.header(`${controller.name} — ${controller.manufacturer}`);
    console.log();
    out.kvLine("Type", controller.type);
    out.kvLine("Phases", controller.phases);
    out.kvLine("Input", controller.inputVoltage);
    out.kvLine("Output", controller.outputVoltage);
    out.kvLine("Description", controller.datasheet);
    console.log();
    out.info("Common GPUs:");
    for (const g of controller.commonGpus) out.dim(`  • ${g}`);

    const faults = VRM_FAULT_SIGNATURES.filter(f =>
      f.controller.toLowerCase().includes(controller.name.toLowerCase()) || f.controller === "Any" || f.controller.startsWith("Any")
    );
    console.log();
    out.info(`Related fault signatures (${faults.length}):`);
    for (const f of faults.slice(0, 5)) {
      out.dim(`  ${f.id}  ${f.faultType}`);
    }
    if (faults.length > 5) out.dim(`  ... and ${faults.length - 5} more`);
    return;
  }

  const query = args.positional.join(" ");

  if (!query) {
    out.header("GPU VRM Controller Database");
    console.log();
    const rows = [["Controller", "Manufacturer", "Phases", "Type"]];
    for (const c of VRM_CONTROLLERS) {
      rows.push([c.name, c.manufacturer, c.phases, c.type]);
    }
    out.table(rows);
    console.log();
    out.dim("Usage: biospy gpu-diag --vrm <controller-name>");
    out.dim("       biospy gpu-diag <fault-symptom>");
    console.log();
    out.info("GPU Memory Test Patterns:");
    for (const t of GPU_MEMORY_TEST_PATTERNS) {
      out.dim(`  • ${t.name}: ${t.description.slice(0, 80)}...`);
    }
    console.log();
    out.info(`VRAM Chip Database: ${VRAM_CHIPS.length} chips`);
    out.dim("  Types: GDDR5, GDDR5X, GDDR6, GDDR6X, HBM2, HBM2E, HBM3");
    return;
  }

  const faults = searchVrmFaults(query);
  if (faults.length === 0) {
    out.warn(`No VRM faults matching "${query}"`);
    out.dim("Try: short, overvoltage, overcurrent, phase, ripple, coil whine");
    return;
  }

  const shown = faults.slice(0, 3);
  out.header(`VRM Faults matching "${query}" (${faults.length} found, showing top ${shown.length})`);

  for (const f of shown) {
    console.log();
    out.header(`${f.faultType}  [${f.controller}]  Difficulty: ${"★".repeat(f.repairDifficulty)}${"☆".repeat(5 - f.repairDifficulty)}`);
    out.info("Symptoms:");
    for (const s of f.symptoms) out.dim(`  • ${s}`);
    console.log();
    out.info("Measurements:");
    for (const m of f.measurements) out.dim(`  • ${m}`);
    console.log();
    out.info("Common cause:");
    out.dim(`  ${f.commonCause}`);
    console.log();
    out.info("Repair notes:");
    out.dim(`  ${f.repairNotes}`);
  }
  console.log();
}

async function cmdVbiosInfo(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) {
    out.fail("Usage: biospy vbios-info <vbios.bin>");
    out.dim("Example: biospy vbios-info gpu_bios.rom");
    out.dim("");
    out.dim("Parses GPU VBIOS images — identifies vendor, device, tables, version.");
    out.dim("Supports NVIDIA, AMD/ATI (ATOMBIOS), and Intel GOP.");
    out.dim("Read VBIOS from GPU SPI flash first: biospy read vbios.bin");
    process.exit(1);
  }

  const data = await readFile(filePath);
  const info = parseVbios(data);
  const report = formatVbiosReport(info);
  console.log();
  console.log(report);
  console.log();
}

async function cmdGpuFailures(args: Args) {
  let categoryFilter: string | undefined;
  const catIdx = args.flags.indexOf("--category");
  if (catIdx >= 0 && args.flags[catIdx + 1]) {
    categoryFilter = args.flags[catIdx + 1];
  }

  if (categoryFilter) {
    const patterns = getGpuPatternsByCategory(categoryFilter);
    if (patterns.length === 0) {
      out.fail(`No patterns in category "${categoryFilter}". Categories: artifacts, no-display, fan, crash, memory, power, thermal, driver`);
      process.exit(1);
    }
    out.header(`GPU Failure Patterns — ${categoryFilter.toUpperCase()} (${patterns.length} patterns)`);
    console.log();
    for (const p of patterns) {
      console.log(`  ${p.id}  ${p.name}  [${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}]`);
    }
    console.log();
    out.dim(`Use 'biospy gpu-failures "<symptom>"' to search by symptom`);
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.fail("Usage: biospy gpu-failures <symptom> | biospy gpu-failures --category <category>");
    out.dim("Examples:");
    out.dim('  biospy gpu-failures "artifacts"');
    out.dim('  biospy gpu-failures "no display"');
    out.dim("  biospy gpu-failures --category thermal");
    out.dim(`Total GPU patterns: ${GPU_FAILURE_PATTERNS.length}`);
    out.dim("Categories: artifacts, no-display, fan, crash, memory, power, thermal, driver");
    process.exit(1);
  }

  const results = searchGpuFailurePatterns(query);
  if (results.length === 0) {
    out.warn(`No GPU failure patterns match "${query}"`);
    out.dim("Try: artifacts, no display, fan, crash, memory, power, thermal, driver");
    return;
  }

  const shown = results.slice(0, 5);
  out.header(`GPU Failures matching "${query}" (${results.length} found, showing top ${shown.length})`);

  for (const p of shown) {
    console.log();
    out.header(`${p.name}  [${p.category}]  Difficulty: ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
    out.info("Symptoms:");
    for (const s of p.symptoms) out.dim(`  • ${s}`);
    console.log();
    out.info("Likely causes (ranked):");
    for (const c of p.causes) {
      const marker = c.probability === "high" ? "!!!" : c.probability === "medium" ? " !!" : "  !";
      out.dim(`${marker} [${c.probability}] ${c.cause}`);
    }
    console.log();
    out.info("Diagnostic steps:");
    for (let i = 0; i < p.diagnosticSteps.length; i++) {
      out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
    }
    if (p.tools.length > 0) {
      console.log();
      out.kvLine("Tools needed", p.tools.join(", "));
    }
  }
  console.log();
}

// ═══ Storage Diagnostics ═══

async function cmdStorageDiag(args: Args) {
  const controllerIdx = args.flags.indexOf("--controller");
  if (controllerIdx >= 0) {
    const name = args.flags[controllerIdx + 1];
    const ctrl = lookupSsdController(name);
    if (!ctrl) {
      out.fail(`SSD controller "${name}" not found`);
      out.dim("Try: SM2259XT, PS5018-E18, 88SS1100, Phoenix, Elpis, etc.");
      process.exit(1);
    }

    out.header(`${ctrl.name} — ${ctrl.manufacturer}`);
    console.log();
    out.kvLine("Type", ctrl.type.toUpperCase());
    out.kvLine("Channels", ctrl.channels.toString());
    out.kvLine("Max Capacity", ctrl.maxCapacity);
    out.kvLine("Interface", ctrl.interface);
    out.kvLine("DRAM", ctrl.dram ? "Yes" : "No (DRAM-less / HMB)");
    out.kvLine("NAND Support", ctrl.nandSupport.join(", "));
    out.kvLine("Firmware Access", ctrl.firmwareAccess);
    console.log();
    out.info("Common drives:");
    for (const d of ctrl.commonDrives) out.dim(`  • ${d}`);
    console.log();
    out.info("Recovery notes:");
    out.dim(`  ${ctrl.recoveryNotes}`);
    console.log();
    return;
  }

  const smartIdx = args.flags.indexOf("--smart");
  if (smartIdx >= 0) {
    const attrStr = args.flags[smartIdx + 1];
    const attrId = parseInt(attrStr, 10);
    if (isNaN(attrId)) {
      out.fail(`Invalid SMART attribute ID: "${attrStr}"`);
      process.exit(1);
    }
    const indicator = interpretSmartAttribute(attrId);
    if (!indicator) {
      out.warn(`SMART attribute ${attrId} not in database`);
      out.dim("Known attributes: 5, 171, 172, 173, 174, 177, 187, 199, 231, 233");
      return;
    }
    out.header(`SMART Attribute ${indicator.smartAttribute}: ${indicator.name}`);
    console.log();
    out.kvLine("Description", indicator.description);
    out.kvLine("Warning", indicator.warningThreshold);
    out.kvLine("Critical", indicator.criticalThreshold);
    console.log();
    out.info("Interpretation:");
    out.dim(`  ${indicator.interpretation}`);
    console.log();
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.header("SSD Controller Database");
    console.log();
    out.info(`  ${"Controller".padEnd(16)} ${"Manufacturer".padEnd(30)} ${"Type".padEnd(6)} ${"Ch".padEnd(4)} DRAM`);
    out.dim(`  ${"─".repeat(16)} ${"─".repeat(30)} ${"─".repeat(6)} ${"─".repeat(4)} ${"─".repeat(4)}`);
    for (const c of SSD_CONTROLLERS) {
      out.dim(`  ${c.name.padEnd(16)} ${c.manufacturer.padEnd(30)} ${c.type.padEnd(6)} ${c.channels.toString().padEnd(4)} ${c.dram ? "Yes" : "No"}`);
    }
    console.log();
    out.dim("Usage: biospy storage-diag --controller <name>");
    out.dim("       biospy storage-diag --smart <attribute-id>");
    out.dim("       biospy storage-diag <fault-symptom>");
    console.log();
    return;
  }

  const results = searchSsdFailures(query);
  if (results.length === 0) {
    out.warn(`No SSD failure patterns match "${query}"`);
    out.dim("Try: firmware, brick, capacity, read-only, power loss, etc.");
    return;
  }

  const shown = results.slice(0, 5);
  out.header(`SSD Failures matching "${query}" (${results.length} found, showing top ${shown.length})`);
  for (const p of shown) {
    console.log();
    out.header(`${p.name}  [${p.controller}]  Difficulty: ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
    out.info("Symptoms:");
    for (const s of p.symptoms) out.dim(`  • ${s}`);
    console.log();
    out.info("Diagnostic steps:");
    for (let i = 0; i < p.diagnosticSteps.length; i++) {
      out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
    }
    console.log();
    out.kvLine("Firmware recovery", p.firmwareRecovery);
    out.kvLine("Data recovery possible", p.dataRecoveryPossible ? "Yes" : "Unlikely");
  }
  console.log();
}

async function cmdNandCheck(args: Args) {
  let categoryFilter: string | undefined;
  const catIdx = args.flags.indexOf("--category");
  if (catIdx >= 0 && args.flags[catIdx + 1]) {
    categoryFilter = args.flags[catIdx + 1];
  }

  if (categoryFilter) {
    const patterns = getNandPatternsByCategory(categoryFilter as any);
    if (patterns.length === 0) {
      out.fail(`No patterns in category "${categoryFilter}". Categories: bad-blocks, read-errors, retention, wear, ecc, controller-nand`);
      process.exit(1);
    }
    out.header(`NAND Diagnostic Patterns — ${categoryFilter.toUpperCase()} (${patterns.length})`);
    console.log();
    for (const p of patterns) {
      out.info(`  ${p.id}  ${p.name}  [${p.severity}]`);
    }
    console.log();
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.header("NAND Flash Diagnostics");
    console.log();
    out.info(`NAND Chips in database: ${NAND_CHIPS.length}`);
    out.info(`Diagnostic patterns: ${NAND_DIAG_PATTERNS.length}`);
    out.info(`SMART health indicators: ${NAND_HEALTH_INDICATORS.length}`);
    console.log();
    out.dim("Usage: biospy nand-check <symptom>");
    out.dim("       biospy nand-check --category <category>");
    out.dim("Categories: bad-blocks, read-errors, retention, wear, ecc, controller-nand");
    out.dim("Examples:");
    out.dim('  biospy nand-check "bad blocks"');
    out.dim('  biospy nand-check "read errors"');
    out.dim("  biospy nand-check --category wear");
    process.exit(1);
  }

  const chipResults = lookupNandChip(query);
  if (chipResults.length > 0) {
    out.header(`NAND Chips matching "${query}" (${chipResults.length})`);
    for (const c of chipResults.slice(0, 5)) {
      console.log();
      out.info(`${c.partNumber} — ${c.manufacturer}`);
      out.kvLine("  Type", `${c.type.toUpperCase()} ${c.technology}`);
      out.kvLine("  Layers", c.layers > 0 ? `${c.layers}-layer` : "planar");
      out.kvLine("  Density", c.density);
      out.kvLine("  Page/Block", `${c.pageSize}B page / ${c.blockSize}B block`);
      out.kvLine("  Endurance", c.endurance);
      out.kvLine("  Interface", c.interface.toUpperCase());
    }
    console.log();
    return;
  }

  const results = searchNandDiagPatterns(query);
  if (results.length === 0) {
    out.warn(`No NAND diagnostic patterns match "${query}"`);
    out.dim("Try: bad blocks, read errors, retention, wear, ecc, timing");
    return;
  }

  const shown = results.slice(0, 5);
  out.header(`NAND Diagnostics matching "${query}" (${results.length} found, showing top ${shown.length})`);
  for (const p of shown) {
    console.log();
    out.header(`${p.name}  [${p.category}]  Severity: ${p.severity.toUpperCase()}`);
    out.dim(`  ${p.description}`);
    console.log();
    out.info("Symptoms:");
    for (const s of p.symptoms) out.dim(`  • ${s}`);
    console.log();
    out.info("Diagnostic steps:");
    for (let i = 0; i < p.diagnosticSteps.length; i++) {
      out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
    }
    console.log();
    out.info("Interpretation:");
    out.dim(`  ${p.interpretation}`);
  }
  console.log();
}

async function cmdHddPcb(args: Args) {
  const mfrIdx = args.flags.indexOf("--mfr");
  if (mfrIdx >= 0) {
    const mfr = args.flags[mfrIdx + 1]?.toLowerCase() as any;
    const procedures = getHddProceduresByManufacturer(mfr);
    if (procedures.length === 0) {
      out.fail(`No procedures for manufacturer "${mfr}". Try: seagate, western-digital, hitachi, toshiba, samsung`);
      process.exit(1);
    }
    out.header(`HDD PCB Procedures — ${mfr.toUpperCase()} (${procedures.length})`);
    console.log();
    for (const p of procedures) {
      out.info(`  ${p.id}  ${p.name}  [${p.category}]  Risk: ${p.riskLevel}  ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
    }
    console.log();
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.header("HDD PCB Repair Database");
    console.log();
    out.info(`PCB chips in database: ${HDD_PCB_CHIPS.length}`);
    out.info(`Repair procedures: ${HDD_PCB_PROCEDURES.length}`);
    out.info(`Failure patterns: ${HDD_PCB_FAILURE_PATTERNS.length}`);
    console.log();
    out.dim("Usage: biospy hdd-pcb <symptom>");
    out.dim("       biospy hdd-pcb --mfr <manufacturer>");
    out.dim("Manufacturers: seagate, western-digital, hitachi, toshiba, samsung");
    out.dim("Examples:");
    out.dim('  biospy hdd-pcb "clicking"');
    out.dim('  biospy hdd-pcb "rom swap"');
    out.dim("  biospy hdd-pcb --mfr seagate");
    process.exit(1);
  }

  const chipResults = lookupHddPcbChip(query);
  if (chipResults.length > 0 && !query.includes(" ")) {
    out.header(`HDD PCB Chips matching "${query}" (${chipResults.length})`);
    for (const c of chipResults.slice(0, 5)) {
      console.log();
      out.info(`${c.name} — ${c.manufacturer}`);
      out.kvLine("  Type", c.type);
      out.kvLine("  Package", c.package);
      out.kvLine("  Programming", c.programmingMethod);
      out.kvLine("  Common drives", c.commonDrives.join(", "));
      out.dim(`  ${c.notes}`);
    }
    console.log();
    return;
  }

  const procResults = searchHddProcedures(query);
  const failResults = searchHddPcbFailures(query);

  if (procResults.length === 0 && failResults.length === 0) {
    out.warn(`No HDD PCB results match "${query}"`);
    out.dim("Try: rom swap, clicking, tvs, seagate f3, firmware, motor, etc.");
    return;
  }

  if (failResults.length > 0) {
    const shown = failResults.slice(0, 3);
    out.header(`HDD PCB Failures matching "${query}" (${failResults.length} found)`);
    for (const p of shown) {
      console.log();
      out.header(`${p.name}  Difficulty: ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
      out.info("Symptoms:");
      for (const s of p.symptoms) out.dim(`  • ${s}`);
      console.log();
      out.info("Causes:");
      for (const c of p.causes) {
        const marker = c.probability === "high" ? "!!!" : c.probability === "medium" ? " !!" : "  !";
        out.dim(`${marker} [${c.probability}] ${c.cause}`);
      }
      console.log();
      out.info("Diagnostic steps:");
      for (let i = 0; i < p.diagnosticSteps.length; i++) {
        out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.diagnosticSteps[i]}`);
      }
      console.log();
      out.kvLine("Repair procedure", p.repairProcedure);
    }
  }

  if (procResults.length > 0) {
    const shown = procResults.slice(0, 3);
    console.log();
    out.header(`HDD PCB Procedures matching "${query}" (${procResults.length} found)`);
    for (const p of shown) {
      console.log();
      out.info(`${p.name}  [${p.driveFamily}]  Risk: ${p.riskLevel}  ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
      out.dim(`  ${p.description}`);
      console.log();
      out.info("Steps:");
      for (let i = 0; i < p.steps.length; i++) {
        out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.steps[i]}`);
      }
      out.kvLine("  Tools", p.requiredTools.join(", "));
      out.kvLine("  Chips", p.chipsTouched.join(", "));
    }
  }
  console.log();
}

async function cmdStorageWorkflows(args: Args) {
  const query = args.positional.join(" ");

  if (!query) {
    out.header("Storage Recovery Workflows");
    console.log();
    for (const wf of listStorageWorkflows()) {
      const diffStr = "★".repeat(wf.difficulty) + "☆".repeat(5 - wf.difficulty);
      out.info(`  ${wf.id.padEnd(28)} ${wf.name.padEnd(42)} [${wf.category}] ${diffStr}`);
    }
    console.log();
    out.dim("Usage: biospy storage-recovery <workflow-id | search-query>");
    out.dim("Example: biospy storage-recovery ssd-not-detected");
    process.exit(1);
  }

  const wf = getStorageWorkflow(query);
  if (wf) {
    out.header(`${wf.name}  [${wf.category}]  Difficulty: ${"★".repeat(wf.difficulty)}${"☆".repeat(5 - wf.difficulty)}`);
    out.dim(`  ${wf.description}`);
    console.log();
    if (wf.requiredTools.length > 0) {
      out.kvLine("Required tools", wf.requiredTools.join(", "));
      console.log();
    }
    out.info("Decision Tree:");
    for (const step of wf.steps) {
      console.log();
      out.info(`  [${step.id}] ${step.instruction}`);
      if (step.tip) out.dim(`       TIP: ${step.tip}`);
      if (step.yesNext) out.dim(`       YES → ${step.yesNext}`);
      if (step.noNext) out.dim(`       NO  → ${step.noNext}`);
    }
    console.log();
    out.info("Conclusions:");
    for (const c of wf.conclusions) {
      const sev = c.severity === "critical" ? "\x1b[31m" : c.severity === "warning" ? "\x1b[33m" : "\x1b[32m";
      console.log(`  ${sev}[${c.id}]\x1b[0m ${c.title}`);
      out.dim(`       ${c.description}`);
    }
    console.log();
    return;
  }

  const results = searchStorageWorkflows(query);
  if (results.length === 0) {
    out.warn(`No storage workflows match "${query}"`);
    out.dim("Try: ssd, hdd, firmware, nand, recovery, clicking, etc.");
    return;
  }

  out.header(`Storage Workflows matching "${query}" (${results.length})`);
  for (const wf of results.slice(0, 5)) {
    console.log();
    out.info(`  ${wf.id.padEnd(28)} ${wf.name}`);
    out.dim(`  ${"".padEnd(28)} ${wf.description}`);
  }
  console.log();
  out.dim("Use: biospy storage-recovery <workflow-id>");
  console.log();
}

// ═══ Network & Embedded Diagnostics ═══

async function cmdRouterFlash(args: Args) {
  const brandIdx = args.flags.indexOf("--brand");
  if (brandIdx >= 0) {
    const brand = args.flags[brandIdx + 1];
    const layouts = getRouterByBrand(brand);
    const procs = getRecoveryByBrand(brand);
    if (layouts.length === 0 && procs.length === 0) {
      out.fail(`No entries for brand "${brand}". Try: tp-link, netgear, ubiquiti, mikrotik, openwrt, linksys, asus`);
      process.exit(1);
    }
    if (layouts.length > 0) {
      out.header(`Router Firmware Layouts — ${brand.toUpperCase()} (${layouts.length})`);
      for (const l of layouts) {
        console.log();
        out.info(`${l.series}`);
        out.kvLine("  Flash", `${l.flashChip} (${l.flashSize})`);
        out.kvLine("  Bootloader", l.bootloader);
        out.kvLine("  SPI Programmable", l.spiProgrammable ? "Yes — readable with CH341A/CH347" : "No (NAND or other)");
        out.kvLine("  Recovery", l.recoveryMethod);
        out.info("  Partitions:");
        for (const p of l.partitions) {
          out.dim(`    ${p.offset.padEnd(18)} ${p.size.padEnd(12)} ${p.name.padEnd(20)} ${p.description}`);
        }
      }
    }
    if (procs.length > 0) {
      console.log();
      out.header(`Recovery Procedures for ${brand.toUpperCase()} (${procs.length})`);
      for (const p of procs) {
        console.log();
        out.info(`  ${p.id.padEnd(28)} ${p.name}  [${p.category}]  ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
      }
    }
    console.log();
    return;
  }

  const query = args.positional.join(" ");
  if (!query) {
    out.header("Router/Switch Firmware Database");
    console.log();
    out.info(`Firmware layouts: ${ROUTER_FIRMWARE_LAYOUTS.length}`);
    out.info(`Recovery procedures: ${ROUTER_RECOVERY_PROCEDURES.length}`);
    console.log();
    out.info("  Brand          Models");
    out.dim("  ─────          ──────");
    const brands = new Map<string, string[]>();
    for (const l of ROUTER_FIRMWARE_LAYOUTS) {
      if (!brands.has(l.brand)) brands.set(l.brand, []);
      brands.get(l.brand)!.push(l.series);
    }
    for (const [brand, models] of brands) {
      out.dim(`  ${brand.padEnd(15)} ${models.join(", ")}`);
    }
    console.log();
    out.dim("Usage: biospy router-flash <query>");
    out.dim("       biospy router-flash --brand <brand-name>");
    out.dim("Examples:");
    out.dim('  biospy router-flash "archer c7"');
    out.dim('  biospy router-flash "tftp recovery"');
    out.dim("  biospy router-flash --brand mikrotik");
    process.exit(1);
  }

  const layouts = lookupRouterFirmware(query);
  const procs = searchRouterRecovery(query);

  if (layouts.length === 0 && procs.length === 0) {
    out.warn(`No router/firmware results match "${query}"`);
    out.dim("Try: tp-link, netgear, ubiquiti, openwrt, tftp, serial, spi, jtag, etc.");
    return;
  }

  if (layouts.length > 0) {
    const shown = layouts.slice(0, 3);
    out.header(`Router Layouts matching "${query}" (${layouts.length} found)`);
    for (const l of shown) {
      console.log();
      out.info(`${l.brand} ${l.series}`);
      out.kvLine("  Flash", `${l.flashChip} (${l.flashSize})`);
      out.kvLine("  Bootloader", l.bootloader);
      out.kvLine("  SPI Programmable", l.spiProgrammable ? "Yes" : "No");
      out.info("  Partitions:");
      for (const p of l.partitions) {
        out.dim(`    ${p.offset.padEnd(18)} ${p.size.padEnd(12)} ${p.name}`);
      }
    }
  }

  if (procs.length > 0) {
    const shown = procs.slice(0, 3);
    console.log();
    out.header(`Recovery Procedures matching "${query}" (${procs.length} found)`);
    for (const p of shown) {
      console.log();
      out.header(`${p.name}  [${p.category}]  ${"★".repeat(p.difficulty)}${"☆".repeat(5 - p.difficulty)}`);
      out.dim(`  ${p.description}`);
      console.log();
      out.info("Steps:");
      for (let i = 0; i < p.steps.length; i++) {
        out.dim(`  ${(i + 1).toString().padStart(2)}. ${p.steps[i]}`);
      }
      out.kvLine("  Tools", p.requiredTools.join(", "));
    }
  }
  console.log();
}

async function cmdMcuInfo(args: Args) {
  const query = args.positional.join(" ");
  if (!query) {
    out.header("MCU Flash Identification Database");
    console.log();
    out.info(`  ${"MCU".padEnd(20)} ${"Family".padEnd(12)} ${"Core".padEnd(20)} ${"Flash".padEnd(10)} ${"Programming"}`);
    out.dim(`  ${"─".repeat(20)} ${"─".repeat(12)} ${"─".repeat(20)} ${"─".repeat(10)} ${"─".repeat(20)}`);
    for (const m of MCU_DATABASE) {
      out.dim(`  ${m.partNumber.padEnd(20)} ${m.family.padEnd(12)} ${m.core.padEnd(20)} ${m.flashSize.padEnd(10)} ${m.programmingInterface.join(", ")}`);
    }
    console.log();
    out.dim(`Total MCUs: ${MCU_DATABASE.length}`);
    out.dim("Usage: biospy mcu-info <part-number or family>");
    out.dim('Examples: biospy mcu-info "STM32F103"');
    out.dim('         biospy mcu-info "ESP32"');
    process.exit(1);
  }

  const results = lookupMcu(query);
  if (results.length === 0) {
    out.warn(`No MCU matches "${query}"`);
    out.dim("Try: STM32, ESP32, ATmega, nRF52, RP2040, PIC, etc.");
    return;
  }

  out.header(`MCUs matching "${query}" (${results.length})`);
  for (const m of results.slice(0, 5)) {
    console.log();
    out.header(`${m.partNumber} — ${m.manufacturer} ${m.family}`);
    out.kvLine("  Core", m.core);
    out.kvLine("  Flash", m.flashSize);
    out.kvLine("  RAM", m.ramSize);
    out.kvLine("  Package", m.package);
    out.kvLine("  Voltage", m.voltage);
    out.kvLine("  Programming", m.programmingInterface.join(", "));
    out.kvLine("  SPI Flashable", m.spiFlashable ? "Yes" : "No");
    console.log();
    out.info("Bootloader Recovery:");
    out.dim(`  ${m.bootloaderRecovery}`);
  }
  console.log();
}

async function cmdJtagRef(args: Args) {
  const query = args.positional.join(" ");

  if (!query) {
    out.header("JTAG/SWD Pinout Reference");
    console.log();
    for (const p of listJtagPinouts()) {
      out.info(`  ${p.id.padEnd(22)} ${p.name.padEnd(35)} ${p.connector}`);
    }
    console.log();
    out.dim("Usage: biospy jtag-ref <pinout-name>");
    out.dim("Example: biospy jtag-ref arm-20pin");
    process.exit(1);
  }

  const pinout = getJtagPinout(query);
  if (pinout) {
    out.header(`${pinout.name}  [${pinout.connector}]`);
    out.kvLine("Voltage", pinout.voltage);
    console.log();
    out.info("Pin assignments:");
    out.dim(`  ${"Pin".padEnd(6)} ${"Signal".padEnd(12)} Description`);
    out.dim(`  ${"─".repeat(6)} ${"─".repeat(12)} ${"─".repeat(30)}`);
    for (const p of pinout.pins) {
      out.dim(`  ${p.pin.toString().padEnd(6)} ${p.signal.padEnd(12)} ${p.description}`);
    }
    console.log();
    if (pinout.notes) {
      out.info("Notes:");
      out.dim(`  ${pinout.notes}`);
    }
    console.log();
    return;
  }

  const failures = searchEmbeddedFailures(query);
  if (failures.length > 0) {
    const shown = failures.slice(0, 3);
    out.header(`Embedded Failures matching "${query}" (${failures.length})`);
    for (const f of shown) {
      console.log();
      out.header(`${f.name}  [${f.category}]  ${"★".repeat(f.difficulty)}${"☆".repeat(5 - f.difficulty)}`);
      out.info("Symptoms:");
      for (const s of f.symptoms) out.dim(`  • ${s}`);
      console.log();
      out.info("Causes:");
      for (const c of f.causes) {
        const marker = c.probability === "high" ? "!!!" : c.probability === "medium" ? " !!" : "  !";
        out.dim(`${marker} [${c.probability}] ${c.cause}`);
      }
      console.log();
      out.info("Diagnostic steps:");
      for (let i = 0; i < f.diagnosticSteps.length; i++) {
        out.dim(`  ${(i + 1).toString().padStart(2)}. ${f.diagnosticSteps[i]}`);
      }
      console.log();
      out.kvLine("Repair", f.repairProcedure);
    }
    console.log();
    return;
  }

  out.warn(`No JTAG pinout or embedded failure matches "${query}"`);
  out.dim("Pinouts: arm-20pin, arm-10pin-swd, avr-6pin-isp, mips-ejtag-14pin, esp32-jtag");
  out.dim("Or search embedded failures: flash corruption, bootloader, protection, etc.");
}

async function cmdPoeDiag(args: Args) {
  const query = args.positional.join(" ");
  if (!query) {
    out.header("PoE Controller Database");
    console.log();
    out.info(`  ${"Controller".padEnd(14)} ${"Manufacturer".padEnd(20)} ${"Type".padEnd(6)} ${"Standard".padEnd(12)} ${"Ports".padEnd(6)} Max Power`);
    out.dim(`  ${"─".repeat(14)} ${"─".repeat(20)} ${"─".repeat(6)} ${"─".repeat(12)} ${"─".repeat(6)} ${"─".repeat(10)}`);
    for (const c of POE_CONTROLLERS) {
      out.dim(`  ${c.name.padEnd(14)} ${c.manufacturer.padEnd(20)} ${c.type.toUpperCase().padEnd(6)} ${c.standard.padEnd(12)} ${c.ports.toString().padEnd(6)} ${c.maxPower}`);
    }
    console.log();
    out.dim(`Total PoE controllers: ${POE_CONTROLLERS.length}`);
    out.dim("Usage: biospy poe-diag <controller-name or query>");
    out.dim('Example: biospy poe-diag "TPS23861"');
    process.exit(1);
  }

  const results = lookupPoEController(query);
  if (results.length === 0) {
    out.warn(`No PoE controller matches "${query}"`);
    out.dim("Try: TPS23861, LTC4266, LTC4291, TPS2372, etc.");
    return;
  }

  for (const c of results) {
    console.log();
    out.header(`${c.name} — ${c.manufacturer}`);
    out.kvLine("Type", c.type.toUpperCase());
    out.kvLine("Standard", c.standard);
    out.kvLine("Ports", c.ports.toString());
    out.kvLine("Max Power", c.maxPower);
    out.kvLine("Interface", c.interface);
    console.log();
    if (c.diagnosticRegisters.length > 0) {
      out.info("Diagnostic Registers:");
      for (const r of c.diagnosticRegisters) out.dim(`  • ${r}`);
    }
    if (c.commonIssues.length > 0) {
      console.log();
      out.info("Common Issues:");
      for (const i of c.commonIssues) out.dim(`  • ${i}`);
    }
  }
  console.log();
}

async function cmdDiagnose(args: Args) {
  const scenario = args.positional[0];

  if (!scenario) {
    out.header("Guided Troubleshooting Workflows");
    console.log();
    for (const wf of listWorkflows()) {
      out.info(`${wf.name.padEnd(16)} ${wf.title}`);
      out.dim(`${"".padEnd(16)} ${wf.description}`);
    }
    console.log();
    out.dim("Usage: biospy diagnose <workflow-name>");
    out.dim("Example: biospy diagnose no-boot");
    return;
  }

  const workflow = getWorkflow(scenario);
  if (!workflow) {
    out.fail(`Unknown workflow: "${scenario}"`);
    out.dim("Available workflows:");
    for (const wf of listWorkflows()) {
      out.dim(`  ${wf.name} — ${wf.description}`);
    }
    process.exit(1);
  }

  out.header(workflow.name);
  out.dim(workflow.description);
  console.log();
  console.log(formatWorkflowTree(workflow));
}

// ─── BIOS analysis commands ───

async function cmdBiosRegions(args: Args) {
  const json = wantsJson(args.flags);
  const file = args.positional[0];
  if (!file) {
    if (json) { agentFail("bios-regions", "MISSING_ARG", "File path required", undefined, "biospy bios-regions <file.bin>"); process.exit(1); }
    out.fail("Usage: biospy bios-regions <file.bin>"); process.exit(1);
  }
  if (!existsSync(file)) {
    if (json) { agentFail("bios-regions", "FILE_NOT_FOUND", `File not found: ${file}`); process.exit(1); }
    out.fail(`File not found: ${file}`); process.exit(1);
  }

  const data = await readFile(file);
  const regions = listBiosRegions(data);

  if (json) {
    const fvs = scanFirmwareVolumes(data);
    const meExtract = extractRegion(data, "me");
    const me = meExtract ? parseMeRegion(meExtract.data, meExtract.region.offset) : null;
    const nvram = parseNvramStore(data);
    agentOk("bios-regions", {
      file,
      sizeBytes: data.length,
      regions,
      uefiVolumes: fvs.map((fv) => ({ phase: fv.phase, offset: fv.offset, size: fv.size, fileCount: fv.files.length, files: fv.files.slice(0, 50) })),
      me: me ? { version: me.version, state: me.state, partitions: me.partitions, warnings: me.warnings } : null,
      nvram: nvram.found ? { format: nvram.format, offset: nvram.offset, totalSize: nvram.totalSize, usedSize: nvram.usedSize, freeSize: nvram.freeSize, deletedCount: nvram.deletedCount, validCount: nvram.variables.filter((v) => v.state === "valid").length, warnings: nvram.warnings } : null,
    }, "Use `nvram <file>` to list variables in detail, or `bios-recovery <file>` for health check.");
    return;
  }

  out.header("Region Layout");
  const rows = [["Region", "Offset", "Size", "Type"]];
  for (const r of regions) {
    rows.push([r.name, `0x${r.offset.toString(16)}`, formatSize(r.size), r.type]);
  }
  out.table(rows);

  // Deep UEFI analysis
  const fvs = scanFirmwareVolumes(data);
  if (fvs.length > 0) {
    console.log();
    out.header("UEFI Firmware Volumes");
    for (const fv of fvs) {
      out.info(`${fv.phase} volume at 0x${fv.offset.toString(16)} (${formatSize(fv.size)}) — ${fv.files.length} files`);
      for (const f of fv.files.slice(0, 10)) {
        out.dim(`  ${f.typeName.padEnd(24)} ${f.guid}${f.name !== f.typeName ? ` (${f.name})` : ""}`);
      }
      if (fv.files.length > 10) out.dim(`  ... and ${fv.files.length - 10} more files`);
    }
  }

  // ME info
  const meExtract = extractRegion(data, "me");
  if (meExtract) {
    console.log();
    const meInfo = parseMeRegion(meExtract.data, meExtract.region.offset);
    out.header("Intel ME");
    out.kvLine("Version", meInfo.version);
    out.kvLine("State", meInfo.state);
    out.kvLine("Partitions", meInfo.partitions.length.toString());
    for (const w of meInfo.warnings) out.warn(w);
  }

  // NVRAM
  const nvram = parseNvramStore(data);
  if (nvram.found) {
    console.log();
    out.header("NVRAM Store");
    const validCount = nvram.variables.filter((v) => v.state === "valid").length;
    out.kvLine("Format", nvram.format);
    out.kvLine("Variables", `${validCount} valid, ${nvram.deletedCount} deleted`);
    out.kvLine("Usage", `${formatSize(nvram.usedSize)} / ${formatSize(nvram.totalSize)} (${formatSize(nvram.freeSize)} free)`);
    for (const w of nvram.warnings) out.warn(w);
  }
}

async function cmdNvram(args: Args) {
  const json = wantsJson(args.flags);
  const file = args.positional[0];
  if (!file) {
    if (json) { agentFail("nvram", "MISSING_ARG", "File path required", undefined, "biospy nvram <file.bin> [--search <name>]"); process.exit(1); }
    out.fail("Usage: biospy nvram <file.bin> [--search <name>]"); process.exit(1);
  }
  if (!existsSync(file)) {
    if (json) { agentFail("nvram", "FILE_NOT_FOUND", `File not found: ${file}`); process.exit(1); }
    out.fail(`File not found: ${file}`); process.exit(1);
  }

  const data = await readFile(file);
  const nvram = parseNvramStore(data);

  if (!nvram.found) {
    if (json) { agentOk("nvram", { found: false }, "No NVRAM variable store in this image — might be raw flash or pre-UEFI."); return; }
    out.warn("No NVRAM variable store found in this image");
    return;
  }

  let searchFilter: string | undefined;
  const searchIdx = args.flags.indexOf("--search");
  if (searchIdx >= 0 && args.flags[searchIdx + 1]) {
    searchFilter = args.flags[searchIdx + 1].toLowerCase();
  }

  if (json) {
    const vars = searchFilter
      ? nvram.variables.filter((v) => v.name.toLowerCase().includes(searchFilter!) || v.guidName.toLowerCase().includes(searchFilter!))
      : nvram.variables;
    agentOk("nvram", {
      file,
      found: true,
      format: nvram.format,
      offset: nvram.offset,
      totalSize: nvram.totalSize,
      usedSize: nvram.usedSize,
      freeSize: nvram.freeSize,
      deletedCount: nvram.deletedCount,
      filter: searchFilter ?? null,
      variables: vars.map((v) => ({ name: v.name, guid: v.guid, guidName: v.guidName, dataSize: v.dataSize, state: v.state })),
      warnings: nvram.warnings,
    });
    return;
  }

  out.header("NVRAM Variable Store");
  out.kvLine("Format", nvram.format);
  out.kvLine("Location", `0x${nvram.offset.toString(16)}`);
  out.kvLine("Size", formatSize(nvram.totalSize));
  out.kvLine("Used", formatSize(nvram.usedSize));
  out.kvLine("Free", formatSize(nvram.freeSize));
  out.kvLine("Deleted", nvram.deletedCount.toString());

  const vars = searchFilter
    ? nvram.variables.filter((v) => v.name.toLowerCase().includes(searchFilter!) || v.guidName.toLowerCase().includes(searchFilter!))
    : nvram.variables.filter((v) => v.state === "valid");

  console.log();
  if (searchFilter) {
    out.info(`Variables matching "${searchFilter}" (${vars.length} found):`);
  } else {
    out.info(`Valid variables (${vars.length}):`);
  }

  const rows = [["Name", "GUID/Type", "Size", "State"]];
  for (const v of vars) {
    const guidLabel = v.guidName || v.guid.substring(0, 18) + "...";
    rows.push([v.name || "(unnamed)", guidLabel, formatSize(v.dataSize), v.state]);
  }
  out.table(rows);

  for (const w of nvram.warnings) out.warn(w);
}

async function cmdRegionExtract(args: Args) {
  const file = args.positional[0];
  const regionName = args.positional[1];
  if (!file || !regionName) {
    out.fail("Usage: biospy region-extract <image.bin> <region> --output <out.bin>");
    out.dim("Regions: descriptor, bios, me, gbe, platform");
    process.exit(1);
  }
  if (!existsSync(file)) { out.fail(`File not found: ${file}`); process.exit(1); }

  let outputPath: string | undefined;
  const outIdx = args.flags.indexOf("--output");
  if (outIdx >= 0) outputPath = args.flags[outIdx + 1];
  if (!outputPath) outputPath = args.positional[2];
  if (!outputPath) outputPath = `${regionName}_region.bin`;

  try {
    const { region } = await extractRegionToFile(file, regionName, outputPath);
    out.ok(`Extracted ${region.name} region (${formatSize(region.size)}) → ${outputPath}`);
    out.kvLine("Offset", `0x${region.offset.toString(16)}`);
    out.kvLine("Size", formatSize(region.size));
  } catch (err: any) {
    out.fail(err.message);
    process.exit(1);
  }
}

async function cmdRegionReplace(args: Args) {
  const file = args.positional[0];
  const regionName = args.positional[1];
  const replacementFile = args.positional[2];
  if (!file || !regionName || !replacementFile) {
    out.fail("Usage: biospy region-replace <image.bin> <region> <replacement.bin> --output <fixed.bin>");
    process.exit(1);
  }
  if (!existsSync(file)) { out.fail(`File not found: ${file}`); process.exit(1); }
  if (!existsSync(replacementFile)) { out.fail(`Replacement file not found: ${replacementFile}`); process.exit(1); }

  let outputPath: string | undefined;
  const outIdx = args.flags.indexOf("--output");
  if (outIdx >= 0) outputPath = args.flags[outIdx + 1];
  if (!outputPath) outputPath = `${file}.patched.bin`;

  try {
    const { region, warnings } = await replaceRegionInFile(file, regionName, replacementFile, outputPath);
    out.ok(`Replaced ${region.name} region → ${outputPath}`);
    out.kvLine("Region offset", `0x${region.offset.toString(16)}`);
    out.kvLine("Region size", formatSize(region.size));
    for (const w of warnings) out.warn(w);
  } catch (err: any) {
    out.fail(err.message);
    process.exit(1);
  }
}

async function cmdBiosRecovery(args: Args) {
  const file = args.positional[0];
  if (!file) { out.fail("Usage: biospy bios-recovery <file.bin>"); process.exit(1); }
  if (!existsSync(file)) { out.fail(`File not found: ${file}`); process.exit(1); }

  const report = await analyzeBiosHealth(file);

  out.header("BIOS Health Check");
  console.log();

  for (const check of report.checks) {
    if (check.status === "pass") out.ok(`${check.name}: ${check.detail}`);
    else if (check.status === "warn") out.warn(`${check.name}: ${check.detail}`);
    else out.fail(`${check.name}: ${check.detail}`);
  }

  console.log();
  const statusLabel = report.overallStatus === "pass" ? "HEALTHY" : report.overallStatus === "warn" ? "WARNINGS" : "NEEDS REPAIR";
  out.header(`Overall: ${statusLabel}`);

  if (report.recoverySteps.length > 0) {
    console.log();
    out.info("Recovery steps:");
    for (const step of report.recoverySteps) {
      out.dim(`  ${step.order}. [${step.risk}] ${step.action}`);
      out.dim(`     $ ${step.command}`);
    }
  }
}

// ─── Hardware fault detection ───

async function cmdSpiTest(args: Args) {
  const readCount = 10;
  out.header("SPI Bus Integrity Test");
  out.info(`Reading JEDEC ID ${readCount} times to score connection quality...`);

  let backend: typeof ch341a | typeof ch347;
  try {
    const info = await ch341a.detectProgrammer();
    backend = info.connected ? ch341a : ch347;
  } catch {
    try {
      await ch347.detectProgrammer();
      backend = ch347;
    } catch {
      out.fail("No programmer detected");
      out.dim("Check: USB cable connected, drivers installed, SOIC clip seated on chip");
      process.exit(1);
    }
  }

  const readings: SpiReading[] = [];
  for (let i = 0; i < readCount; i++) {
    try {
      const result = await backend.connectionTest();
      readings.push({ jedecId: result.jedecId, timestamp: Date.now() });
    } catch {
      readings.push({ jedecId: "000000", timestamp: Date.now() });
    }
  }

  const report = analyzeSpiReadings(readings);
  console.log();
  out.kvLine("Signal Score", formatScoreBar(report.score));
  out.kvLine("Pattern", report.pattern.toUpperCase());
  out.kvLine("Dominant ID", `0x${report.dominantId.toUpperCase()}`);
  out.kvLine("Consistency", `${report.dominantCount}/${report.totalReads} reads matched`);

  if (report.uniqueIds.length > 1) {
    out.kvLine("Unique IDs seen", report.uniqueIds.map(id => `0x${id.toUpperCase()}`).join(", "));
  }

  const chip = lookupChipByJedecId(report.dominantId);
  if (chip) out.kvLine("Detected Chip", `${chip.vendor} ${chip.name}`);

  console.log();
  if (report.score >= 95) out.ok(report.recommendation);
  else if (report.score >= 80) out.warn(report.recommendation);
  else out.fail(report.recommendation);

  const outputIdx = args.flags.indexOf("--output");
  if (outputIdx !== -1 && args.flags[outputIdx + 1]) {
    const outFile = args.flags[outputIdx + 1];
    const json = JSON.stringify(report, null, 2);
    await writeFile(outFile, json);
    out.ok(`Report saved to ${outFile}`);
  }
}

async function cmdHwDiag(args: Args) {
  out.header("Hardware Diagnostic Suite");
  out.info("Running comprehensive hardware checks...");
  console.log();

  let backend: typeof ch341a | typeof ch347;
  let backendKind: BackendKind = "ch341a";
  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected) {
      backend = ch341a;
    } else {
      throw new Error("not connected");
    }
  } catch {
    try {
      await ch347.detectProgrammer();
      backend = ch347;
      backendKind = "ch347";
    } catch {
      out.fail("No programmer detected");
      out.dim("Check: USB cable connected, drivers installed, SOIC clip seated on chip");
      process.exit(1);
    }
  }

  const tests: TestResult[] = [];

  out.info("1/4  Programmer detection...");
  tests.push({ name: "Programmer Detection", status: "pass", detail: `${backendKind.toUpperCase()} connected`, durationMs: 0 });

  out.info("2/4  SPI bus integrity (10 reads)...");
  const spiReadings: SpiReading[] = [];
  const spiStart = Date.now();
  for (let i = 0; i < 10; i++) {
    try {
      const result = await backend.connectionTest();
      spiReadings.push({ jedecId: result.jedecId, timestamp: Date.now() });
    } catch {
      spiReadings.push({ jedecId: "000000", timestamp: Date.now() });
    }
  }
  const spiReport = analyzeSpiReadings(spiReadings);
  const spiDuration = Date.now() - spiStart;
  tests.push({
    name: "SPI Bus Integrity",
    status: spiReport.score >= 80 ? "pass" : spiReport.score >= 50 ? "fail" : "fail",
    detail: `Score: ${spiReport.score}% (${spiReport.pattern})`,
    durationMs: spiDuration,
  });

  out.info("3/4  Chip identification...");
  const idStart = Date.now();
  let chipInfo: ChipInfo | null = null;
  try {
    chipInfo = await backend.identifyChip();
    if (chipInfo) {
      const chipName = chipInfo.name || `Unknown (${chipInfo.jedecId})`;
      tests.push({ name: "Chip Identification", status: "pass", detail: chipName, durationMs: Date.now() - idStart });
    } else {
      tests.push({ name: "Chip Identification", status: "fail", detail: "No chip identified", durationMs: Date.now() - idStart });
    }
  } catch (err: any) {
    tests.push({ name: "Chip Identification", status: "fail", detail: err.message, durationMs: Date.now() - idStart });
  }

  out.info("4/4  Read capability...");
  const readStart = Date.now();
  try {
    const result = await backend.connectionTest();
    if (result.stable) {
      tests.push({ name: "Read Capability", status: "pass", detail: "Stable read confirmed", durationMs: Date.now() - readStart });
    } else {
      tests.push({ name: "Read Capability", status: "fail", detail: result.error || "Unstable reads", durationMs: Date.now() - readStart });
    }
  } catch (err: any) {
    tests.push({ name: "Read Capability", status: "fail", detail: err.message, durationMs: Date.now() - readStart });
  }

  const chipId = chipInfo?.jedecId || spiReport.dominantId || "unknown";
  const testReport = buildTestReport(tests, chipId);
  const { score, grade } = computeOverallScore({ spiIntegrity: spiReport, chipTests: testReport });

  console.log();
  out.header("Results");
  for (const t of tests) {
    const icon = t.status === "pass" ? "pass" : "fail";
    const fn = icon === "pass" ? out.ok : out.fail;
    fn(`${t.name}: ${t.detail} (${t.durationMs}ms)`);
  }

  console.log();
  out.kvLine("Score", formatScoreBar(score));
  out.kvLine("Grade", grade);
  out.kvLine("Tests", `${testReport.passCount} pass, ${testReport.failCount} fail, ${testReport.skipCount} skip`);

  const recommendations: string[] = [];
  if (spiReport.score < 80) recommendations.push("SPI connection unreliable — reseat SOIC clip, clean chip pads");
  if (!chipInfo) recommendations.push("Chip not identified — verify chip is SPI flash and clip is aligned");
  if (testReport.failCount > 0) recommendations.push("Some tests failed — check diagnostic details above");

  if (recommendations.length > 0) {
    console.log();
    out.info("Recommendations:");
    for (const r of recommendations) out.dim(`  • ${r}`);
  }

  const outputIdx = args.flags.indexOf("--output");
  if (outputIdx !== -1 && args.flags[outputIdx + 1]) {
    const outFile = args.flags[outputIdx + 1];
    const fullReport = {
      timestamp: new Date().toISOString(),
      chipId,
      chipName: chipInfo?.name || "Unknown",
      chipVoltage: chipInfo ? getChipVoltage(chipInfo.name || "") : undefined,
      spiIntegrity: spiReport,
      chipTests: testReport,
      overallScore: score,
      overallGrade: grade,
      recommendations,
    };
    await writeFile(outFile, JSON.stringify(fullReport, null, 2));
    out.ok(`Full report saved to ${outFile}`);
  }
}

async function cmdVoltageRef(args: Args) {
  const json = wantsJson(args.flags);
  const searchIdx = args.flags.indexOf("--search");
  const query = searchIdx !== -1 ? args.flags[searchIdx + 1]?.toLowerCase() : undefined;
  const connectorArg = args.positional[0]?.toLowerCase();

  const refs = ALL_REFERENCES;
  const matchedConnectors: typeof refs = [];

  for (const ref of refs) {
    if (connectorArg) {
      const name = ref.connector.toLowerCase();
      if (!name.includes(connectorArg) && !ref.description.toLowerCase().includes(connectorArg)) continue;
    }

    let matchingRails = ref.rails;
    if (query) {
      matchingRails = ref.rails.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.notes.toLowerCase().includes(query) ||
        r.pin.toLowerCase().includes(query)
      );
      if (matchingRails.length === 0) continue;
    }

    matchedConnectors.push({ ...ref, rails: matchingRails });

    if (json) continue;

    out.header(`${ref.connector} — ${ref.description}`);
    console.log();
    for (const rail of matchingRails) {
      const color = rail.color !== "—" ? ` [${rail.color}]` : "";
      out.kvLine(`${rail.name}${color}`, `Pin ${rail.pin}`);
      out.dim(`    Expected: ${rail.expected}  Tolerance: ${rail.tolerance}`);
      out.dim(`    ${rail.notes}`);
    }
    console.log();
  }

  if (json) {
    if (matchedConnectors.length === 0) {
      agentOk("voltage-ref", { connector: connectorArg ?? null, query: query ?? null, count: 0, connectors: [] }, connectorArg ? `No connector matching "${connectorArg}". Available: atx, eps, pcie, board, spi.` : "No matches.");
      return;
    }
    agentOk("voltage-ref", { connector: connectorArg ?? null, query: query ?? null, count: matchedConnectors.length, connectors: matchedConnectors }, "Use returned rail.expected + rail.tolerance to compare against multimeter readings.");
    return;
  }

  if (connectorArg && !refs.some(r => r.connector.toLowerCase().includes(connectorArg) || r.description.toLowerCase().includes(connectorArg))) {
    out.warn(`No connector matching "${connectorArg}"`);
    out.dim("Available: atx, eps, pcie, board, spi");
  }
}

// ─── Arg parsing ───

interface Args {
  command: string;
  positional: string[];
  chip?: string;
  backend?: string;
  flags: string[];
}

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const positional: string[] = [];
  const flags: string[] = [];
  let chip: string | undefined;
  let backend: string | undefined;
  let command = "";

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--chip" || arg === "-c") { chip = raw[++i]; continue; }
    if (arg === "--backend" || arg === "-b") { backend = raw[++i]; continue; }
    if (arg === "--verbose" || arg === "-v") { flags.push("--verbose"); continue; }
    if (arg === "--version" || arg === "-V") { flags.push("--version"); continue; }
    if (arg === "--standard" || arg === "--category" || arg === "--output" || arg === "--search" || arg === "--interval" || arg === "--timeout" || arg === "--file" || arg === "--brand" || arg === "--vrm" || arg === "--controller" || arg === "--mfr" || arg === "--smart") { flags.push(arg, raw[++i]); continue; }
    if (arg.startsWith("--")) { flags.push(arg); continue; }
    if (!command) { command = arg; continue; }
    positional.push(arg);
  }

  return { command, positional, chip, backend, flags };
}

function showHelp(): void {
  console.log(`
${"\x1b[1m"}biospy${"\x1b[0m"} v${VERSION} — BIOS chip programmer & debugger for CH341A/CH347

${"\x1b[1m"}HARDWARE:${"\x1b[0m"}
  status                     Programmer + chip + backend status
  detect                     Detect USB programmers (CH341A, CH347)
  identify                   Identify flash chip (JEDEC ID + SFDP)
  sfdp                       Read SFDP parameter table from chip

${"\x1b[1m"}CHIP OPERATIONS:${"\x1b[0m"}
  read <output.bin>          Read chip → file (with progress + speed)
  read <output.bin> --safe   Double-read with 2-of-3 verification
  write <firmware.bin>       Write file → chip (auto-backup, verify)
  erase --confirm            Erase entire chip (destructive!)
  region-erase <addr> <len> --confirm  Erase specific region (smart granularity)
  verify <firmware.bin>      Verify chip matches file
  blank-check                Verify chip is fully erased (all 0xFF)
  wp-status                  Show write protection status

${"\x1b[1m"}DIAGNOSTICS:${"\x1b[0m"}
  test-connection            Read JEDEC ID 5x — verify SOIC clip/socket is solid
  connect                    Connection wizard — auto-detect, identify, quality score
  reset                      Reset chip from stuck state (power-down recovery)
  diagnose [scenario]        Guided troubleshooting (no-boot, no-display, reboot-loop, bios-corrupt, no-power)
  post-decode <code>         Decode POST code (AMI/Award/Phoenix/UEFI)
  failure-db <symptom>       Search motherboard failure pattern database
  power-sequence [--flags]   ATX power sequence diagram + symptom analyzer
  spi-test [--output f.json] SPI bus integrity test — 10-read signal quality score
  hw-diag [--output f.json]  Full hardware diagnostic suite with graded report
  voltage-ref [connector]    ATX/EPS/board voltage reference tables (--search <rail>)

${"\x1b[1m"}LAPTOP REPAIR:${"\x1b[0m"}
  laptop-diag <platform>     Power rail sequence + symptom analysis for laptop platform
  laptop-power [--flags]     Laptop power rail analyzer (Intel/AMD platform sequences)
  laptop-failures <symptom>  Search 65+ laptop failure patterns (--category <cat>)

${"\x1b[1m"}GPU DIAGNOSTICS:${"\x1b[0m"}
  gpu-diag <query>           GPU VRM database + fault signatures (--vrm <name>)
  vbios-info <file.bin>      Parse GPU VBIOS image (vendor, tables, version)
  gpu-failures <symptom>     Search 45+ GPU failure patterns (--category <cat>)

${"\x1b[1m"}STORAGE RECOVERY:${"\x1b[0m"}
  storage-diag <query>       SSD controller database + failure patterns (--controller <name>, --smart <id>)
  nand-check <query>         NAND flash diagnostics + chip database (--category <cat>)
  hdd-pcb <query>            HDD PCB repair: chips, procedures, failures (--mfr <manufacturer>)
  storage-recovery <id>      Storage device recovery workflows + decision trees

${"\x1b[1m"}NETWORK & EMBEDDED:${"\x1b[0m"}
  router-flash <query>       Router firmware layouts + recovery procedures (--brand <name>)
  mcu-info <query>           MCU flash identification (STM32, ESP32, ATmega, nRF52, RP2040)
  jtag-ref <pinout>          JTAG/SWD pinout reference + embedded failure patterns
  poe-diag <query>           PoE controller database + diagnostics

${"\x1b[1m"}ANALYSIS:${"\x1b[0m"}
  analyze <file.bin>         Parse BIOS image (UEFI, regions, vendor)
  bios-regions <file.bin>    Deep region layout with UEFI FV, ME, NVRAM details
  nvram <file.bin>           List UEFI NVRAM variables from BIOS dump
  bios-recovery <file.bin>   Health check + recovery wizard for corrupted BIOS
  extract <file.cap>         Strip capsule/header from firmware file for flashing
  diff <a.bin> <b.bin>       Compare two BIOS images
  checksum <file.bin>        MD5 / SHA256 / CRC32
  dump <file> [offset] [len] Hex dump (offset/len: decimal or 0x hex)

${"\x1b[1m"}BIOS SURGERY:${"\x1b[0m"}
  region-extract <img> <rgn> Extract region (descriptor/bios/me/gbe) to file
  region-replace <img> <rgn> <file>  Replace region in image with file

${"\x1b[1m"}DATABASE:${"\x1b[0m"}
  chip-info <id|name>        Chip details + recommendations (JEDEC ID or name)
  search [query]             Search chip database (empty = list all ${CHIP_DATABASE.length} chips)

${"\x1b[1m"}INTERACTIVE:${"\x1b[0m"}
  repl                       Interactive debug console (tab completion, history)
  spi-monitor [--interval N] Continuous JEDEC ID polling with change detection
  reg-watch [--interval N]   Live status register watch with bit parsing
  macro list                 List recorded macros
  macro play <name> [--file] Replay recorded macro
  run-script <file.js>       Execute JS automation script

${"\x1b[1m"}SERIAL DEBUG:${"\x1b[0m"}
  serial-list                List CH343/WCH serial ports
  serial <port> [baud]       Stream serial debug output

${"\x1b[1m"}SETUP:${"\x1b[0m"}
  setup                      Check all dependencies and connections

${"\x1b[1m"}OPTIONS:${"\x1b[0m"}
  -b, --backend <type>       Force: ch341a | ch347
  -c, --chip <name>          Force chip name
  -v, --verbose              Show debug output
  -V, --version              Show version
  --dry-run                  Simulate all hardware ops (no USB needed)
  --self-test                Run comprehensive self-test suite
  --safe, --double-verify    Read chip twice, verify consistency
  --force-1.8v               Acknowledge 1.8V chip voltage risk
  --confirm                  Required for erase operations
  --no-backup                Skip backup read before write (faster)
  --no-verify                Skip post-write verification (faster)
  --skip-test                Skip pre-write connection stability test
  --skip-quality-check       Skip pre-flight quality gate on read/write
  --raw                      Write file as-is, don't strip capsule headers

${"\x1b[1m"}BACKENDS:${"\x1b[0m"}
  ch341a    Native USB — 31B/packet, 3/4-byte addressing, SFDP
  ch347     Native USB — 510B/packet, up to 60MHz SPI clock

${"\x1b[1m"}EXAMPLES:${"\x1b[0m"}
  biospy status                        # what's connected?
  biospy read backup.bin               # dump current BIOS
  biospy read backup.bin --safe        # dump with double-verify
  biospy write new_bios.bin            # flash new BIOS (backs up first)
  biospy write new_bios.bin -b ch347   # flash via CH347 (faster)
  biospy analyze backup.bin            # inspect BIOS structure
  biospy dump backup.bin 0x0 512       # hex inspect first 512 bytes
  biospy search W25Q                   # find chips in database
  biospy sfdp                          # read chip self-description
  biospy region-erase 0x0 0x10000 --confirm  # erase first 64KB
  biospy status --dry-run              # test without hardware
  biospy --self-test                   # run full self-test suite
`);
}

// ─── Main ───

async function main() {
  const args = parseArgs();

  if (args.flags.includes("--version")) {
    console.log(`biospy v${VERSION}`);
    return;
  }

  verbose = args.flags.includes("--verbose");

  if (args.flags.includes("--dry-run")) {
    dryRun = true;
    const mock = new MockBackend();
    ch341a = mock;
    ch347 = mock as any;
    vlog("Dry-run mode active — all hardware operations simulated");
  }

  if (args.flags.includes("--self-test")) {
    const { runSelfTest } = await import("./self-test.js");
    const passed = await runSelfTest();
    process.exit(passed ? 0 : 1);
  }

  if (!args.command || args.command === "help" || args.flags.includes("--help")) {
    showHelp();
    return;
  }

  try {
    switch (args.command) {
      case "status":       await cmdStatus(args); break;
      case "detect":       await cmdDetect(args); break;
      case "identify":
      case "id":           await cmdIdentify(args); break;
      case "sfdp":         await cmdSFDP(args); break;
      case "read":         await cmdRead(args); break;
      case "write":
      case "flash":        await cmdWrite(args); break;
      case "erase":        await cmdErase(args); break;
      case "region-erase": await cmdRegionErase(args); break;
      case "verify":       await cmdVerify(args); break;
      case "blank-check":  await cmdBlankCheck(args); break;
      case "wp-status":    await cmdWPStatus(args); break;
      case "test-connection":
      case "test":         await cmdConnectionTest(); break;
      case "connect":      await cmdConnect(args); break;
      case "repair":       await cmdRepair(args); break;
      case "full-repair":  await cmdFullRepair(args); break;
      case "full-backup":  await cmdFullBackup(args); break;
      case "reset":        await cmdReset(); break;
      case "analyze":
      case "info":         await cmdAnalyze(args); break;
      case "extract":      await cmdExtract(args); break;
      case "diff":
      case "compare":      await cmdDiff(args); break;
      case "checksum":
      case "hash":         await cmdChecksum(args); break;
      case "chip-info":
      case "chipinfo":     await cmdChipInfo(args); break;
      case "search":
      case "find":         await cmdSearch(args); break;
      case "serial-list":  await cmdSerialList(); break;
      case "serial":       await cmdSerialConnect(args); break;
      case "dump":
      case "hex":          await cmdDump(args); break;
      case "setup":
      case "doctor":       await cmdSetup(); break;
      case "post-decode":  await cmdPostDecode(args); break;
      case "failure-db":   await cmdFailureDb(args); break;
      case "power-sequence": await cmdPowerSequence(args); break;
      case "diagnose":     await cmdDiagnose(args); break;
      case "laptop-diag":  await cmdLaptopDiag(args); break;
      case "laptop-power": await cmdLaptopPower(args); break;
      case "laptop-failures": await cmdLaptopFailures(args); break;
      case "gpu-diag":     await cmdGpuDiag(args); break;
      case "vbios-info":   await cmdVbiosInfo(args); break;
      case "gpu-failures": await cmdGpuFailures(args); break;
      case "storage-diag": await cmdStorageDiag(args); break;
      case "ssd-controller": await cmdStorageDiag(args); break;
      case "nand-check":   await cmdNandCheck(args); break;
      case "hdd-pcb":      await cmdHddPcb(args); break;
      case "storage-recovery": await cmdStorageWorkflows(args); break;
      case "router-flash": await cmdRouterFlash(args); break;
      case "mcu-info":     await cmdMcuInfo(args); break;
      case "jtag-ref":     await cmdJtagRef(args); break;
      case "poe-diag":     await cmdPoeDiag(args); break;
      case "bios-regions": await cmdBiosRegions(args); break;
      case "nvram":        await cmdNvram(args); break;
      case "region-extract": await cmdRegionExtract(args); break;
      case "region-replace": await cmdRegionReplace(args); break;
      case "bios-recovery": await cmdBiosRecovery(args); break;
      case "spi-test":     await cmdSpiTest(args); break;
      case "hw-diag":      await cmdHwDiag(args); break;
      case "voltage-ref":  await cmdVoltageRef(args); break;
      case "repl":
      case "console":
      case "debug":        { const { startRepl } = await import("./repl/index.js"); await startRepl(); break; }
      case "spi-monitor": {
        const { startSpiMonitor } = await import("./repl/sniffer.js");
        const intervalIdx = args.flags.indexOf("--interval");
        const interval = intervalIdx >= 0 ? parseInt(args.flags[intervalIdx + 1], 10) : 1000;
        const backend = await pickBackend(args.backend);
        const hw = backend.kind === "ch347" ? ch347 : ch341a;
        await startSpiMonitor(hw as any, { intervalMs: interval || 1000 });
        break;
      }
      case "reg-watch": {
        const { startRegisterWatch } = await import("./repl/watch.js");
        const intervalIdx = args.flags.indexOf("--interval");
        const interval = intervalIdx >= 0 ? parseInt(args.flags[intervalIdx + 1], 10) : 500;
        const backend = await pickBackend(args.backend);
        const hw = backend.kind === "ch347" ? ch347 : ch341a;
        await startRegisterWatch(hw as any, { intervalMs: interval || 500 });
        break;
      }
      case "macro": {
        const { MacroRecorder } = await import("./repl/macros.js");
        const recorder = new MacroRecorder();
        const sub = args.positional[0]?.toLowerCase();
        const fileIdx = args.flags.indexOf("--file");
        const file = fileIdx >= 0 ? args.flags[fileIdx + 1] : undefined;
        if (file) { try { await recorder.load(file); } catch {} }
        if (sub === "list") {
          const list = recorder.list();
          if (list.length === 0) { out.info("No macros recorded"); } else {
            const rows = [["Name", "Commands", "Created"]];
            for (const m of list) rows.push([m.name, String(m.commandCount), m.createdAt]);
            out.table(rows);
          }
        } else if (sub === "save") {
          const path = args.positional[1];
          if (!path) { out.fail("Usage: biospy macro save <file>"); process.exit(1); }
          await recorder.save(path);
          out.ok(`Saved to ${path}`);
        } else {
          out.fail("Usage: biospy macro list|save <file>");
          out.dim("For record/play, use the REPL: biospy repl");
        }
        break;
      }
      case "run-script": {
        const { runScript } = await import("./repl/plugins.js");
        const file = args.positional[0];
        if (!file) { out.fail("Usage: biospy run-script <file.js>"); process.exit(1); }
        const timeoutIdx = args.flags.indexOf("--timeout");
        const timeout = timeoutIdx >= 0 ? parseInt(args.flags[timeoutIdx + 1], 10) : undefined;
        await runScript(file, ch341a as any, timeout ? { timeoutMs: timeout } : undefined);
        break;
      }
      default:
        out.fail(`Unknown command: ${args.command}`);
        out.dim("Run 'biospy help' to see available commands");
        process.exit(1);
    }
  } catch (err: any) {
    if (err instanceof UsbDisconnectError) {
      console.log();
      out.fail(err.message);
      process.exit(2);
    }
    out.fail(err.message);
    process.exit(1);
  }
}

main();
