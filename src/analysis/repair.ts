import { createHash } from "node:crypto";
import { listRegions, extractRegion, replaceRegion } from "./regions.js";
import { findNvramStore, parseNvramStore } from "./nvram.js";
import { analyzeBiosHealthFromBuffer } from "./recovery.js";
import type { RegionInfo } from "./regions.js";

export interface RegionDiff {
  name: string;
  offset: number;
  size: number;
  inputChecksum: string;
  outputChecksum: string;
  changed: boolean;
}

export interface RepairReport {
  actions: string[];
  totalBytesChanged: number;
  inputChecksum: string;
  outputChecksum: string;
  regions: RegionDiff[];
  warnings: string[];
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function regionChecksum(image: Buffer, region: RegionInfo): string {
  return sha256(image.subarray(region.offset, region.offset + region.size));
}

// ─── Task 1: Diff report ───

export function generateRepairReport(input: Buffer, output: Buffer, actions: string[]): RepairReport {
  const inputRegions = listRegions(input);
  const outputRegions = listRegions(output);
  const regions: RegionDiff[] = [];
  let totalBytesChanged = 0;

  const regionsToCompare = inputRegions.length >= outputRegions.length ? inputRegions : outputRegions;

  for (const region of regionsToCompare) {
    const inChk = region.offset + region.size <= input.length
      ? regionChecksum(input, region)
      : "N/A";
    const outChk = region.offset + region.size <= output.length
      ? regionChecksum(output, region)
      : "N/A";
    const changed = inChk !== outChk;

    if (changed) {
      const start = region.offset;
      const end = Math.min(start + region.size, Math.min(input.length, output.length));
      for (let i = start; i < end; i++) {
        if (input[i] !== output[i]) totalBytesChanged++;
      }
    }

    regions.push({
      name: region.name,
      offset: region.offset,
      size: region.size,
      inputChecksum: inChk,
      outputChecksum: outChk,
      changed,
    });
  }

  return {
    actions,
    totalBytesChanged,
    inputChecksum: sha256(input),
    outputChecksum: sha256(output),
    regions,
    warnings: [],
  };
}

// ─── Task 2: Reference-based repair ───

export function repairFromReference(broken: Buffer, reference: Buffer): { repaired: Buffer; report: RepairReport } {
  const warnings: string[] = [];
  const actions: string[] = [];

  if (broken.length !== reference.length) {
    warnings.push(`Size mismatch: broken=${broken.length}, reference=${reference.length}`);
  }

  const brokenRegions = listRegions(broken);
  const refRegions = listRegions(reference);

  // Non-Intel-FD: full replacement
  if (brokenRegions.length === 1 && brokenRegions[0].type === "raw") {
    actions.push("Full image replacement (no Intel Flash Descriptor)");
    warnings.push("No Intel FD — replaced entire image from reference");
    let repaired: Buffer;
    if (reference.length === broken.length) {
      repaired = Buffer.from(reference);
    } else if (reference.length < broken.length) {
      repaired = Buffer.alloc(broken.length, 0xff);
      reference.copy(repaired);
    } else {
      repaired = Buffer.alloc(broken.length);
      reference.copy(repaired, 0, 0, broken.length);
    }
    const report = generateRepairReport(broken, repaired, actions);
    report.warnings = warnings;
    return { repaired, report };
  }

  // Intel FD: per-region comparison and replacement
  let repaired: Buffer = Buffer.from(broken) as Buffer;

  for (const region of brokenRegions) {
    const brokenData = extractRegion(broken, region.name);
    const refData = extractRegion(reference, region.name);
    if (!brokenData || !refData) continue;

    const brokenChk = sha256(brokenData.data);
    const refChk = sha256(refData.data);

    if (brokenChk !== refChk) {
      actions.push(`Replaced region "${region.name}" from reference`);
      const result = replaceRegion(repaired, region.name, refData.data);
      if (result) {
        repaired = result.data as Buffer;
        warnings.push(...result.warnings);
      }
    }
  }

  if (actions.length === 0) {
    actions.push("No corrupted regions found — image matches reference");
  }

  const report = generateRepairReport(broken, repaired, actions);
  report.warnings = warnings;
  return { repaired, report };
}

// ─── Task 3: NVRAM reset ───

export function resetNvram(image: Buffer): { repaired: Buffer; report: RepairReport; storeOffset: number; storeSize: number } {
  const storeOffset = findNvramStore(image);
  if (storeOffset < 0) {
    throw new Error("No NVRAM variable store found in image");
  }

  const store = parseNvramStore(image, storeOffset);
  const storeSize = store.size > 0 ? store.size : 0;

  const repaired = Buffer.from(image);
  const VSS_HEADER_SIZE = 28;

  // Preserve 28-byte $VSS header, fill rest with 0xFF
  const clearStart = storeOffset + VSS_HEADER_SIZE;
  const clearEnd = storeOffset + storeSize;

  if (clearEnd > clearStart && clearEnd <= repaired.length) {
    repaired.fill(0xff, clearStart, clearEnd);
  }

  const bytesCleared = Math.max(0, clearEnd - clearStart);
  const actions = [`NVRAM reset: cleared ${bytesCleared} bytes of variable data at offset 0x${storeOffset.toString(16)}`];
  const report = generateRepairReport(image, repaired, actions);

  return { repaired, report, storeOffset, storeSize };
}

// ─── Task 4: Reset vector repair ───

export function repairResetVector(image: Buffer): { repaired: Buffer; report: RepairReport } {
  if (image.length < 16) {
    return { repaired: Buffer.from(image), report: generateRepairReport(image, image, ["Image too small for reset vector repair"]) };
  }

  const resetOffset = image.length - 16;
  const resetArea = image.subarray(resetOffset);

  // Check if reset area is zeroed
  const isZeroed = resetArea.every((b) => b === 0x00);
  if (!isZeroed) {
    return { repaired: Buffer.from(image), report: generateRepairReport(image, image, ["Reset vector already valid — no repair needed"]) };
  }

  const repaired = Buffer.from(image);
  // Standard x86 far jump: EA F0 FF 00 F0
  repaired[resetOffset] = 0xea;
  repaired[resetOffset + 1] = 0xf0;
  repaired[resetOffset + 2] = 0xff;
  repaired[resetOffset + 3] = 0x00;
  repaired[resetOffset + 4] = 0xf0;
  // Fill rest with NOP
  for (let i = 5; i < 16; i++) {
    repaired[resetOffset + i] = 0x90;
  }

  const actions = ["Patched zeroed reset vector with standard x86 far jump (EA F0 FF 00 F0)"];
  const report = generateRepairReport(image, repaired, actions);
  return { repaired, report };
}

// ─── Task 4: Auto-repair ───

export function repairAuto(image: Buffer): { repaired: Buffer; report: RepairReport } {
  const health = analyzeBiosHealthFromBuffer(image);
  const actions: string[] = [];
  let current: Buffer = Buffer.from(image) as Buffer;

  // Fix 1: Zeroed reset vector
  if (image.length >= 16) {
    const resetArea = image.subarray(image.length - 16);
    const isZeroed = resetArea.every((b) => b === 0x00);
    if (isZeroed) {
      const result = repairResetVector(current);
      current = result.repaired as Buffer;
      actions.push(...result.report.actions);
    }
  }

  // Fix 2: NVRAM with too many deleted variables
  try {
    const store = parseNvramStore(current);
    if (store.found && store.variables.length > 0) {
      const deletedRatio = store.deletedCount / store.variables.length;
      if (deletedRatio > 0.5) {
        const result = resetNvram(current);
        current = result.repaired as Buffer;
        actions.push(...result.report.actions);
      }
    }
  } catch {}

  if (actions.length === 0) {
    actions.push("No repairs needed — image appears healthy");
  }

  const report = generateRepairReport(image, current, actions);
  return { repaired: current, report };
}
