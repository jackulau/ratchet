#!/usr/bin/env node

import { CH341ABackend, type ProgressCallback } from "./backends/ch341a.js";
import { CH347Backend } from "./backends/ch347.js";
import { BiosAnalyzer } from "./analysis/bios.js";
import { SerialDebug } from "./serial/debug.js";
import { searchChips, CHIP_DATABASE, formatSize, getChipVoltage, needs4ByteAddressing, getManufacturerName, lookupChipByJedecId } from "./chips/database.js";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as out from "./output.js";
import type { ChipInfo, ReadResult } from "./types.js";

const VERSION = "0.6.0";

const ch341a = new CH341ABackend();
const ch347 = new CH347Backend();
const analyzer = new BiosAnalyzer();
const serial = new SerialDebug();

let verbose = false;
function vlog(msg: string): void {
  if (verbose) out.dim(`[verbose] ${msg}`);
}

// ─── Backend selection ───

type BackendKind = "ch341a" | "ch347";

async function pickBackend(force?: string): Promise<{ kind: BackendKind }> {
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

// ─── Commands ───

async function cmdStatus(args: Args) {
  out.header("Programmer");

  const ch341aInfo = await ch341a.detectProgrammer();
  const ch347Info = await ch347.detectProgrammer();

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
  const chip = await identifyAny();
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

async function cmdDetect() {
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
    out.dim("Supported: CH341A (1a86:5512), CH347 (1a86:55db)");
    out.dim("Check: USB cable connected? Try different port? Dongle/hub issue?");
  }
  console.log();
}

async function cmdIdentify(args: Args) {
  out.header("Identifying chip...");
  const chip = await identifyAny();
  if (!chip) {
    out.fail("No chip detected");
    out.dim("1. Check programmer is connected");
    out.dim("2. Check chip is seated correctly in ZIF socket");
    out.dim("3. Pin 1 (dot/notch) must align with socket marking");
    process.exit(1);
  }

  out.ok(`${chip.vendorName} ${chip.name}`);
  out.kvLine("JEDEC ID", chip.jedecId);
  out.kvLine("Manufacturer", getManufacturerName(chip.jedecId));
  out.kvLine("Size", `${chip.sizeHuman} (${chip.sizeBytes.toLocaleString()} bytes)`);
  out.kvLine("Page", `${chip.pageSize} bytes`);
  out.kvLine("Sector", `${chip.sectorSize ? formatSize(chip.sectorSize) : "unknown"}`);
  out.kvLine("Block", `${chip.blockSize ? formatSize(chip.blockSize) : "unknown"}`);

  if (needs4ByteAddressing(chip.jedecId)) {
    out.kvLine("Addressing", "4-byte mode required (>16MB)");
  }

  const voltage = getChipVoltage(chip.jedecId);
  if (voltage) {
    out.kvLine("Voltage", `${voltage}V`);
    if (voltage < 2.0) {
      console.log();
      out.warn("This is a 1.8V chip!");
      out.warn("Stock CH341A outputs 3.3V on SPI bus — this WILL damage the chip.");
      out.warn("Use a 1.8V voltage adapter between programmer and chip.");
    }
  }

  // Try SFDP
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

async function cmdRead(args: Args) {
  const outPath = args.positional[0];
  if (!outPath) { out.fail("Usage: biospy read <output.bin>"); process.exit(1); }

  const doubleVerify = args.flags.includes("--double-verify") || args.flags.includes("--safe");

  if (doubleVerify) {
    out.header(`Reading chip → ${outPath} (double-verify mode)`);
  } else {
    out.header(`Reading chip → ${outPath}`);
  }

  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);

  let result: ReadResult;

  if (backend.kind === "ch341a") {
    if (doubleVerify) {
      result = await ch341a.readChipDoubleVerify(outPath, makeProgress("Reading"));
    } else {
      result = await ch341a.readChip(outPath, makeProgress("Reading"));
    }
    out.writeProgress("Reading", 100);
  } else {
    result = await ch347.readChip(outPath, makeProgress("Reading"));
    out.writeProgress("Reading", 100);
  }

  if (!result.success) {
    out.fail(`Read failed: ${result.error}`);
    process.exit(1);
  }

  out.ok(`Read complete in ${out.formatDuration(result.durationMs)}`);
  out.kvLine("File", result.filePath);
  out.kvLine("Size", out.formatBytes(result.sizeBytes));
  out.kvLine("SHA256", result.checksum.substring(0, 16) + "...");

  if (result.durationMs > 0) {
    const speedBps = result.sizeBytes / (result.durationMs / 1000);
    out.kvLine("Speed", `${formatSize(speedBps)}/s`);
  }

  if (result.error && result.error.startsWith("Warning:")) {
    out.warn(result.error);
  }

  const data = await readFile(outPath);
  if (data.length === 0) {
    console.log();
    out.warn("Chip read is empty (0 bytes) — something went wrong");
  } else if (data.every((b) => b === 0xff)) {
    console.log();
    out.warn("Chip read is entirely 0xFF — chip may be blank or not connected properly");
  } else if (data.every((b) => b === 0x00)) {
    console.log();
    out.warn("Chip read is entirely 0x00 — connection likely failed");
  }
  console.log();
}

async function cmdWrite(args: Args) {
  const inPath = args.positional[0];
  if (!inPath) { out.fail("Usage: biospy write <firmware.bin>"); process.exit(1); }
  if (!existsSync(inPath)) { out.fail(`File not found: ${inPath}`); process.exit(1); }

  out.header(`Writing ${inPath} → chip`);

  let firmware: Buffer = await readFile(inPath);
  if (firmware.length === 0) { out.fail("File is empty"); process.exit(1); }

  // Detect capsule/header formats and warn user
  const fwInfo = await analyzer.extractFirmware(inPath);
  if (fwInfo.strippedBytes > 0 && !args.flags.includes("--raw")) {
    out.warn(`Detected ${fwInfo.format} — file has ${formatSize(fwInfo.strippedBytes)} header`);
    out.info(`Auto-stripping header. Raw firmware: ${formatSize(fwInfo.data.length)}`);
    firmware = Buffer.from(fwInfo.data);
    for (const w of fwInfo.warnings) out.warn(w);
  }

  if (firmware.every((b) => b === 0xff)) {
    out.fail("Firmware is entirely 0xFF (blank). This would erase all BIOS data.");
    out.dim("If intentional, use 'biospy erase' instead.");
    process.exit(1);
  }
  if (firmware.every((b) => b === 0x00)) {
    out.fail("Firmware is entirely 0x00 — likely corrupted or a failed read.");
    process.exit(1);
  }

  // Pre-write connection stability check
  if (!args.flags.includes("--skip-test")) {
    try {
      let connTest = await ch341a.connectionTest();
      if (!connTest.stable && connTest.reads === 0) {
        // CH341A not found, try CH347
        connTest = await ch347.connectionTest();
      }
      if (connTest.reads > 0 && !connTest.stable) {
        out.fail(`Connection unstable: ${connTest.error}`);
        out.dim("Fix your SOIC clip/ZIF socket connection before writing.");
        out.dim("Or use --skip-test to bypass (NOT recommended for writes).");
        process.exit(1);
      }
      if (connTest.stable) {
        out.ok(`Connection stable (${connTest.matches}/${connTest.reads} reads consistent)`);
      }
    } catch {
      // Programmer not connected — skip pre-write test
    }
  }

  const chip = await identifyAny();
  if (chip) {
    out.info(`Chip: ${chip.vendorName} ${chip.name} (${chip.sizeHuman})`);

    if (firmware.length > chip.sizeBytes) {
      out.fail(`File (${out.formatBytes(firmware.length)}) exceeds chip capacity (${chip.sizeHuman})`);
      process.exit(1);
    }

    if (firmware.length < chip.sizeBytes) {
      const pad = chip.sizeBytes - firmware.length;
      out.info(`File is ${out.formatBytes(firmware.length)}, chip is ${chip.sizeHuman} — ${formatSize(pad)} will remain 0xFF`);
    }

    const voltage = getChipVoltage(chip.jedecId);
    if (voltage && voltage < 2.0 && !args.flags.includes("--force-1.8v")) {
      out.fail(`${chip.name} is a 1.8V chip. Stock CH341A outputs 3.3V.`);
      out.fail("This WILL damage the chip without a voltage adapter.");
      out.dim("If you have a 1.8V adapter, re-run with --force-1.8v");
      process.exit(1);
    }

    if (needs4ByteAddressing(chip.jedecId)) {
      out.info("4-byte addressing mode will be used (chip >16MB)");
    }
  } else {
    out.fail("No chip detected — cannot write");
    out.dim("1. Check programmer is connected (biospy detect)");
    out.dim("2. Check SOIC clip/ZIF socket connection (biospy test-connection)");
    out.dim("3. Try 'biospy reset' if chip was interrupted mid-operation");
    process.exit(1);
  }

  const noBackup = args.flags.includes("--no-backup");
  const noVerify = args.flags.includes("--no-verify");

  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);
  if (!noBackup) out.info("Auto-backup before write...");
  else out.warn("Backup skipped (--no-backup)");

  const sigHandler = () => {
    out.warn("\n⚠ SIGINT ignored — write in progress. Interrupting now WILL brick your chip.");
    out.warn("  Wait for write to finish or accept the risk of a corrupted chip.");
  };
  process.on("SIGINT", sigHandler);

  // If header was stripped, write extracted firmware to temp file for backend
  let writePath = inPath;
  let tmpWritePath: string | null = null;
  if (fwInfo.strippedBytes > 0 && !args.flags.includes("--raw")) {
    tmpWritePath = join(tmpdir(), `bios_stripped_${Date.now()}.bin`);
    await writeFile(tmpWritePath, firmware);
    writePath = tmpWritePath;
  }

  let result;
  try {
    if (backend.kind === "ch341a") {
      result = await ch341a.writeChip(writePath, makeProgress("Writing"), { skipBackup: noBackup, skipVerify: noVerify });
      out.writeProgress("Writing", 100);
    } else {
      result = await ch347.writeChip(writePath, makeProgress("Writing"), { skipBackup: noBackup, skipVerify: noVerify });
      out.writeProgress("Writing", 100);
    }
  } finally {
    if (tmpWritePath) try { await unlink(tmpWritePath); } catch {}
  }

  process.removeListener("SIGINT", sigHandler);

  if (!result.success) {
    out.fail(`Write failed: ${result.error}`);
    if (result.backupPath) out.info(`Backup saved at: ${result.backupPath}`);
    process.exit(1);
  }

  out.ok(`Write complete in ${out.formatDuration(result.durationMs)}`);
  if (result.backupPath) out.kvLine("Backup", result.backupPath);
  if (!noVerify) out.kvLine("Verified", result.verified ? "yes" : "NO — run 'biospy verify' manually");
  else out.dim("Verification skipped (--no-verify)");

  if (result.durationMs > 0) {
    const speedBps = firmware.length / (result.durationMs / 1000);
    out.kvLine("Speed", `${formatSize(speedBps)}/s`);
  }
  console.log();
}

async function cmdBlankCheck(args: Args) {
  out.header("Blank check — reading chip...");
  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);

  const tmpPath = join(tmpdir(), `bios_blankcheck_${Date.now()}.bin`);
  try {
    let result: ReadResult;
    if (backend.kind === "ch341a") {
      result = await ch341a.readChip(tmpPath, makeProgress("Reading"));
      out.writeProgress("Reading", 100);
    } else {
      result = await ch347.readChip(tmpPath, makeProgress("Reading"));
      out.writeProgress("Reading", 100);
    }

    if (!result.success) {
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
  out.header("Write protection status");

  try {
    const info = await ch341a.detectProgrammer();
    if (info.connected && info.type === "ch341a") {
      const wp = await ch341a.isWriteProtected();
      if (wp) {
        out.warn("Write protection is ENABLED");
        out.dim("The write command clears this automatically before programming.");
      } else {
        out.ok("Write protection is disabled — chip is writable");
      }
      return;
    }
  } catch {}

  try {
    const info = await ch347.detectProgrammer();
    if (info.connected) {
      const wp = await ch347.isWriteProtected();
      if (wp) {
        out.warn("Write protection is ENABLED");
        out.dim("The write command clears this automatically before programming.");
      } else {
        out.ok("Write protection is disabled — chip is writable");
      }
      return;
    }
  } catch {}

  out.fail("No native USB programmer detected (WP check requires CH341A/CH347)");
  process.exit(1);
}

async function cmdErase(args: Args) {
  if (!args.flags.includes("--confirm")) {
    out.fail("Erase is destructive and irreversible.");
    out.dim("Re-run with --confirm to proceed.");
    process.exit(1);
  }

  out.header("Erasing chip...");
  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);

  const sigHandler = () => {
    out.warn("\n⚠ SIGINT ignored — erase in progress. Wait for completion.");
  };
  process.on("SIGINT", sigHandler);

  let result;
  if (backend.kind === "ch341a") result = await ch341a.eraseChip();
  else result = await ch347.eraseChip();

  process.removeListener("SIGINT", sigHandler);

  if (result.success) {
    out.ok(`Erased in ${out.formatDuration(result.durationMs)}`);
  } else {
    out.fail(`Erase failed: ${result.error}`);
    process.exit(1);
  }
  console.log();
}

async function cmdRegionErase(args: Args) {
  const startStr = args.positional[0];
  const lenStr = args.positional[1];
  if (!startStr || !lenStr) {
    out.fail("Usage: biospy region-erase <start_addr> <length>");
    out.dim("Addresses: decimal or 0x hex");
    process.exit(1);
  }
  if (!args.flags.includes("--confirm")) {
    out.fail("Region erase is destructive. Re-run with --confirm.");
    process.exit(1);
  }

  const startAddr = startStr.startsWith("0x") ? parseInt(startStr, 16) : parseInt(startStr);
  const length = lenStr.startsWith("0x") ? parseInt(lenStr, 16) : parseInt(lenStr);

  if (isNaN(startAddr) || isNaN(length)) {
    out.fail("Invalid address or length");
    process.exit(1);
  }

  out.header(`Region erase: 0x${startAddr.toString(16)} — ${formatSize(length)}`);

  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);

  let result;
  if (backend.kind === "ch341a") {
    result = await ch341a.regionErase(startAddr, length);
  } else {
    result = await ch347.regionErase(startAddr, length);
  }

  if (result.success) {
    out.ok(`Region erased in ${out.formatDuration(result.durationMs)}`);
  } else {
    out.fail(`Erase failed: ${result.error}`);
    process.exit(1);
  }
  console.log();
}

async function cmdVerify(args: Args) {
  const filePath = args.positional[0];
  if (!filePath) { out.fail("Usage: biospy verify <firmware.bin>"); process.exit(1); }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  out.header(`Verifying chip against ${filePath}`);
  const backend = await pickBackend(args.backend);
  out.info(`Backend: ${backend.kind}`);

  let result;
  if (backend.kind === "ch341a") result = await ch341a.verifyChip(filePath);
  else result = await ch347.verifyChip(filePath);

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
  const filePath = args.positional[0];
  if (!filePath) { out.fail("Usage: biospy analyze <firmware.bin>"); process.exit(1); }
  if (!existsSync(filePath)) { out.fail(`File not found: ${filePath}`); process.exit(1); }

  out.header(`Analyzing ${filePath}`);
  const analysis = await analyzer.analyze(filePath);

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

async function cmdSearch(args: Args) {
  const query = args.positional[0];
  if (!query) { out.fail("Usage: biospy search <query>"); process.exit(1); }

  const results = searchChips(query);
  if (results.length === 0) {
    out.fail(`No chips matching "${query}" (${CHIP_DATABASE.length} chips in database)`);
    process.exit(1);
  }

  out.header(`${results.length} chip(s) matching "${query}"`);
  const rows = [["Name", "Vendor", "Size", "Voltage", "JEDEC ID", "4B Addr"]];
  for (const c of results) {
    rows.push([
      c.name,
      c.vendor,
      formatSize(c.sizeBytes),
      `${c.voltage}V`,
      c.jedecId || "—",
      c.needs4ByteAddr ? "yes" : "—",
    ]);
  }
  out.table(rows);
  console.log();
}

async function cmdSFDP() {
  out.header("Reading SFDP (Serial Flash Discoverable Parameters)...");
  try {
    const sfdp = await ch341a.readSFDP();
    if (!sfdp) {
      out.fail("Chip does not support SFDP or is not connected");
      process.exit(1);
    }

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
  reset                      Reset chip from stuck state (power-down recovery)

${"\x1b[1m"}ANALYSIS:${"\x1b[0m"}
  analyze <file.bin>         Parse BIOS image (UEFI, regions, vendor)
  extract <file.cap>         Strip capsule/header from firmware file for flashing
  diff <a.bin> <b.bin>       Compare two BIOS images
  checksum <file.bin>        MD5 / SHA256 / CRC32
  dump <file> [offset] [len] Hex dump (offset/len: decimal or 0x hex)

${"\x1b[1m"}DATABASE:${"\x1b[0m"}
  search <query>             Search chip database by name/vendor/voltage

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
  --safe, --double-verify    Read chip twice, verify consistency
  --force-1.8v               Acknowledge 1.8V chip voltage risk
  --confirm                  Required for erase operations
  --no-backup                Skip backup read before write (faster)
  --no-verify                Skip post-write verification (faster)
  --skip-test                Skip pre-write connection stability test
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

  if (!args.command || args.command === "help" || args.flags.includes("--help")) {
    showHelp();
    return;
  }

  try {
    switch (args.command) {
      case "status":       await cmdStatus(args); break;
      case "detect":       await cmdDetect(); break;
      case "identify":
      case "id":           await cmdIdentify(args); break;
      case "sfdp":         await cmdSFDP(); break;
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
      case "reset":        await cmdReset(); break;
      case "analyze":
      case "info":         await cmdAnalyze(args); break;
      case "extract":      await cmdExtract(args); break;
      case "diff":
      case "compare":      await cmdDiff(args); break;
      case "checksum":
      case "hash":         await cmdChecksum(args); break;
      case "search":
      case "find":         await cmdSearch(args); break;
      case "serial-list":  await cmdSerialList(); break;
      case "serial":       await cmdSerialConnect(args); break;
      case "dump":
      case "hex":          await cmdDump(args); break;
      case "setup":
      case "doctor":       await cmdSetup(); break;
      default:
        out.fail(`Unknown command: ${args.command}`);
        out.dim("Run 'biospy help' to see available commands");
        process.exit(1);
    }
  } catch (err: any) {
    out.fail(err.message);
    process.exit(1);
  }
}

main();
