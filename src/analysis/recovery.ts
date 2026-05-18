import { readFile } from "node:fs/promises";
import { scanFirmwareVolumes } from "./uefi.js";
import { parseMeRegion } from "./me.js";
import { parseNvramStore } from "./nvram.js";
import { listRegions, extractRegion } from "./regions.js";

export type CheckStatus = "pass" | "warn" | "fail";

export interface HealthCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface RecoveryStep {
  order: number;
  action: string;
  command: string;
  risk: "low" | "medium" | "high";
}

export interface BiosHealthReport {
  checks: HealthCheck[];
  overallStatus: CheckStatus;
  recoverySteps: RecoveryStep[];
}

const INTEL_FD_SIG = 0x0ff0a55a;

export async function analyzeBiosHealth(filePath: string): Promise<BiosHealthReport> {
  const data = await readFile(filePath);
  return analyzeBiosHealthFromBuffer(data);
}

export function analyzeBiosHealthFromBuffer(data: Buffer): BiosHealthReport {
  const checks: HealthCheck[] = [];

  // Check 1: File size validity
  const validSizes = [256 * 1024, 512 * 1024, 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024,
    8 * 1024 * 1024, 16 * 1024 * 1024, 32 * 1024 * 1024, 64 * 1024 * 1024, 128 * 1024 * 1024];
  const isPowerOf2 = validSizes.includes(data.length);
  checks.push({
    name: "File size",
    status: isPowerOf2 ? "pass" : "warn",
    detail: isPowerOf2
      ? `${(data.length / 1024 / 1024).toFixed(1)} MB — valid flash chip size`
      : `${data.length} bytes — not a standard flash chip size (may be a partial dump or capsule)`,
  });

  // Check 2: Not blank
  const isAllFF = data.every((b) => b === 0xff);
  const isAllZero = data.every((b) => b === 0x00);
  if (isAllFF) {
    checks.push({ name: "Content check", status: "fail", detail: "Image is entirely 0xFF — blank/erased chip" });
  } else if (isAllZero) {
    checks.push({ name: "Content check", status: "fail", detail: "Image is entirely 0x00 — failed read or dead chip" });
  } else {
    const ffCount = data.filter((b) => b === 0xff).length;
    const ffPct = (ffCount / data.length) * 100;
    checks.push({
      name: "Content check",
      status: ffPct > 95 ? "warn" : "pass",
      detail: ffPct > 95
        ? `${ffPct.toFixed(1)}% empty (0xFF) — partially erased or minimal firmware`
        : `${ffPct.toFixed(1)}% empty space — normal`,
    });
  }

  // Check 3: Flash Descriptor
  const hasIntelFD = data.length > 0x14 && data.readUInt32LE(0x10) === INTEL_FD_SIG;
  if (hasIntelFD) {
    const regions = listRegions(data);
    checks.push({
      name: "Intel Flash Descriptor",
      status: "pass",
      detail: `Valid descriptor found — ${regions.length} regions: ${regions.map((r) => r.name).join(", ")}`,
    });

    // Check 3b: Region integrity
    for (const region of regions) {
      if (region.offset + region.size > data.length) {
        checks.push({
          name: `Region: ${region.name}`,
          status: "fail",
          detail: `Region extends beyond image boundary (offset 0x${region.offset.toString(16)} + 0x${region.size.toString(16)} > 0x${data.length.toString(16)})`,
        });
      }
    }
  } else {
    checks.push({
      name: "Intel Flash Descriptor",
      status: "warn",
      detail: "No Intel Flash Descriptor — raw BIOS image or non-Intel platform",
    });
  }

  // Check 4: UEFI Firmware Volumes
  const fvs = scanFirmwareVolumes(data);
  if (fvs.length > 0) {
    const totalFiles = fvs.reduce((sum, fv) => sum + fv.files.length, 0);
    const phases = [...new Set(fvs.map((fv) => fv.phase))];
    checks.push({
      name: "UEFI Firmware Volumes",
      status: "pass",
      detail: `${fvs.length} volumes found, ${totalFiles} FFS files, phases: ${phases.join(", ")}`,
    });

    // Check for critical phases
    const hasPei = fvs.some((fv) => fv.phase === "PEI");
    const hasDxe = fvs.some((fv) => fv.phase === "DXE");
    if (!hasPei) {
      checks.push({ name: "PEI phase", status: "warn", detail: "No PEI firmware volume detected — may be compressed or nested" });
    }
    if (!hasDxe) {
      checks.push({ name: "DXE phase", status: "warn", detail: "No DXE firmware volume detected — may be compressed or nested" });
    }
  } else {
    // Check for legacy BIOS
    const lastBytes = data.subarray(data.length - 16);
    if (lastBytes[15] === 0xea) {
      checks.push({
        name: "Legacy BIOS",
        status: "pass",
        detail: "Legacy BIOS reset vector found at FFFF:FFF0",
      });
    } else {
      checks.push({
        name: "UEFI Firmware Volumes",
        status: "fail",
        detail: "No UEFI firmware volumes found — image may be corrupt, truncated, or not a BIOS image",
      });
    }
  }

  // Check 5: ME Region (if Intel FD present)
  if (hasIntelFD) {
    const meExtract = extractRegion(data, "me");
    if (meExtract) {
      const meInfo = parseMeRegion(meExtract.data, meExtract.region.offset);
      if (meInfo.found) {
        checks.push({
          name: "Intel ME",
          status: meInfo.state === "normal" ? "pass" : meInfo.state === "corrupted" ? "fail" : "warn",
          detail: `ME ${meInfo.version} — state: ${meInfo.state}, ${meInfo.partitions.length} partitions`,
        });
      } else {
        checks.push({
          name: "Intel ME",
          status: meInfo.state === "disabled" ? "warn" : "fail",
          detail: meInfo.warnings[0] || "ME region issue",
        });
      }
    }
  }

  // Check 6: NVRAM
  const nvram = parseNvramStore(data);
  if (nvram.found) {
    const validCount = nvram.variables.filter((v) => v.state === "valid").length;
    checks.push({
      name: "NVRAM Store",
      status: nvram.warnings.length > 0 ? "warn" : "pass",
      detail: `${validCount} valid variables, ${nvram.deletedCount} deleted, ${(nvram.freeSize / 1024).toFixed(1)} KB free`,
    });
  } else {
    checks.push({
      name: "NVRAM Store",
      status: "warn",
      detail: "No NVRAM variable store found — may be in a compressed volume",
    });
  }

  // Check 7: Reset vector (x86 entry point)
  if (data.length >= 16) {
    const resetVector = data.subarray(data.length - 16);
    const hasValidReset = resetVector[15] === 0xea || (resetVector[14] === 0x90 && resetVector[15] === 0x90);
    if (data.length >= 1024 * 1024) {
      checks.push({
        name: "Reset vector",
        status: hasValidReset ? "pass" : "warn",
        detail: hasValidReset
          ? "Valid x86 reset vector at end of image"
          : "No standard reset vector — may use UEFI SEC entry point instead",
      });
    }
  }

  // Determine overall status
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overallStatus: CheckStatus = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  // Generate recovery steps
  const recoverySteps = suggestRecoveryStrategy(checks, data);

  return { checks, overallStatus, recoverySteps };
}

function suggestRecoveryStrategy(checks: HealthCheck[], data: Buffer): RecoveryStep[] {
  const steps: RecoveryStep[] = [];
  let order = 1;

  const hasFails = checks.filter((c) => c.status === "fail");

  if (hasFails.some((c) => c.name === "Content check")) {
    steps.push({
      order: order++,
      action: "Image appears blank or all-zero — re-read the chip with better SOIC clip contact",
      command: "biospy read new_dump.bin --safe",
      risk: "low",
    });
    return steps;
  }

  if (hasFails.some((c) => c.name === "UEFI Firmware Volumes")) {
    steps.push({
      order: order++,
      action: "No valid firmware found — obtain correct BIOS from manufacturer and reflash",
      command: "biospy write correct_bios.bin",
      risk: "medium",
    });
  }

  if (hasFails.some((c) => c.name.startsWith("Region:"))) {
    steps.push({
      order: order++,
      action: "Region boundary error — image may be truncated. Re-read chip and verify full size",
      command: "biospy read full_dump.bin && biospy analyze full_dump.bin",
      risk: "low",
    });
  }

  const meCheck = checks.find((c) => c.name === "Intel ME" && c.status === "fail");
  if (meCheck) {
    steps.push({
      order: order++,
      action: "ME region corrupted — extract ME region from a donor image (same board model) and replace",
      command: "biospy region-extract donor.bin me --output donor_me.bin && biospy region-replace corrupt.bin me donor_me.bin --output fixed.bin",
      risk: "medium",
    });
  }

  const nvramCheck = checks.find((c) => c.name === "NVRAM Store" && c.status === "warn");
  if (nvramCheck && nvramCheck.detail.includes("deleted")) {
    steps.push({
      order: order++,
      action: "NVRAM has many deleted variables — clear CMOS or reflash to rebuild NVRAM",
      command: "Clear CMOS jumper on motherboard, or reflash clean BIOS",
      risk: "low",
    });
  }

  if (steps.length === 0) {
    const hasWarn = checks.some((c) => c.status === "warn");
    if (hasWarn) {
      steps.push({
        order: 1,
        action: "Image has warnings but no critical failures — may be usable. Flash and test",
        command: "biospy write dump.bin && biospy verify dump.bin",
        risk: "low",
      });
    } else {
      steps.push({
        order: 1,
        action: "Image looks healthy — no recovery needed",
        command: "biospy verify dump.bin",
        risk: "low",
      });
    }
  }

  return steps;
}
