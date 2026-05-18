import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { BiosAnalysis, BiosRegion, DiffResult } from "../types.js";
import { scanFirmwareVolumes, type UefiFirmwareVolume } from "./uefi.js";
import { parseMeRegion, type IntelMeInfo } from "./me.js";
import { parseNvramStore, type NvramStore } from "./nvram.js";
import { listRegions, extractRegion, type RegionInfo } from "./regions.js";
import { analyzeBiosHealth, type BiosHealthReport } from "./recovery.js";

const UEFI_FV_SIGNATURE = Buffer.from([
  0x5f, 0x46, 0x56, 0x48,
]); // _FVH
const INTEL_FD_SIGNATURE = Buffer.from([
  0x5a, 0xa5, 0xf0, 0x0f,
]); // Intel Flash Descriptor

interface FlashDescriptor {
  flmap0: number;
  flmap1: number;
  regionBase: number;
  masterBase: number;
}

export class BiosAnalyzer {
  async analyze(filePath: string): Promise<BiosAnalysis> {
    const data = await readFile(filePath);
    const checksum = createHash("sha256").update(data).digest("hex");
    const regions: BiosRegion[] = [];
    const warnings: string[] = [];
    let isUefi = false;
    let biosVendor: string | undefined;
    let biosVersion: string | undefined;
    let buildDate: string | undefined;

    // Check for Intel Flash Descriptor
    const fdOffset = this.findSignature(data, INTEL_FD_SIGNATURE);
    if (fdOffset >= 0 && fdOffset < 0x20) {
      const fd = this.parseFlashDescriptor(data, fdOffset);
      if (fd) {
        regions.push(...this.extractIntelRegions(data, fd));
      }
    }

    // Scan for UEFI firmware volumes
    let offset = 0;
    while (offset < data.length - 4) {
      const fvhOffset = this.findSignature(data, UEFI_FV_SIGNATURE, offset);
      if (fvhOffset < 0) break;

      isUefi = true;
      const fvBase = fvhOffset - 40;
      if (fvBase >= 0 && fvBase + 56 <= data.length) {
        const fvLength = data.readUInt32LE(fvBase + 32);
        if (fvLength > 0 && fvLength <= data.length - fvBase) {
          regions.push({
            name: `UEFI Firmware Volume`,
            offset: fvBase,
            size: fvLength,
            type: "uefi_fv",
            description: `FV at 0x${fvBase.toString(16)}`,
          });
        }
      }
      offset = fvhOffset + 4;
    }

    // Search for BIOS vendor strings
    const stringSearches = [
      { pattern: /American Megatrends/i, vendor: "AMI" },
      { pattern: /Phoenix Technologies/i, vendor: "Phoenix" },
      { pattern: /Award Software/i, vendor: "Award" },
      { pattern: /Insyde Corp/i, vendor: "Insyde" },
      { pattern: /LENOVO/i, vendor: "Lenovo" },
      { pattern: /Dell Inc/i, vendor: "Dell" },
      { pattern: /Hewlett-Packard/i, vendor: "HP" },
      { pattern: /ASUSTeK/i, vendor: "ASUS" },
      { pattern: /Gigabyte/i, vendor: "Gigabyte" },
      { pattern: /MSI/i, vendor: "MSI" },
    ];

    const textContent = data.toString("ascii").replace(/[^\x20-\x7E]/g, " ");

    for (const search of stringSearches) {
      if (search.pattern.test(textContent)) {
        biosVendor = search.vendor;
        break;
      }
    }

    // Look for version strings
    const versionMatch = textContent.match(
      /(?:BIOS|Version|Ver)[.: ]*(\d+\.\d+[\w.]*)/i,
    );
    if (versionMatch) biosVersion = versionMatch[1];

    // Look for build date
    const dateMatch = textContent.match(
      /(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/,
    );
    if (dateMatch) buildDate = dateMatch[1];

    // Validate image
    if (data.length === 0) {
      warnings.push("Image is empty (0 bytes)");
    } else if (data.every((b) => b === 0xff)) {
      warnings.push("Image is entirely 0xFF — chip may be blank or erased");
    } else if (data.every((b) => b === 0x00)) {
      warnings.push("Image is entirely 0x00 — read may have failed");
    } else {
      const ffCount = data.filter((b) => b === 0xff).length;
      const ffPercent = (ffCount / data.length) * 100;
      if (ffPercent > 90) {
        warnings.push(
          `Image is ${ffPercent.toFixed(1)}% empty (0xFF) — may be partially erased`,
        );
      }
    }

    if (!isUefi && regions.length === 0 && data.length >= 16) {
      const lastBytes = data.subarray(data.length - 16);
      if (lastBytes[15] === 0xea) {
        regions.push({
          name: "Legacy BIOS Reset Vector",
          offset: data.length - 16,
          size: 16,
          type: "legacy_reset",
          description: "x86 reset vector at FFFF:FFF0",
        });
      }
    }

    return {
      fileSize: data.length,
      checksum,
      regions,
      isUefi,
      biosVendor,
      biosVersion,
      buildDate,
      warnings,
    };
  }

  async diff(fileA: string, fileB: string): Promise<DiffResult> {
    const [dataA, dataB] = await Promise.all([
      readFile(fileA),
      readFile(fileB),
    ]);

    const maxLen = Math.max(dataA.length, dataB.length);
    const regions: DiffResult["regions"] = [];
    let inDiff = false;
    let diffStart = 0;

    for (let i = 0; i < maxLen; i++) {
      const a = i < dataA.length ? dataA[i] : -1;
      const b = i < dataB.length ? dataB[i] : -1;

      if (a !== b && !inDiff) {
        inDiff = true;
        diffStart = i;
      } else if (a === b && inDiff) {
        inDiff = false;
        const len = i - diffStart;
        regions.push({
          offset: diffStart,
          length: len,
          oldValue: dataA
            .subarray(diffStart, Math.min(diffStart + 16, i))
            .toString("hex"),
          newValue: dataB
            .subarray(diffStart, Math.min(diffStart + 16, i))
            .toString("hex"),
        });
      }
    }

    if (inDiff) {
      regions.push({
        offset: diffStart,
        length: maxLen - diffStart,
        oldValue: dataA
          .subarray(diffStart, Math.min(diffStart + 16, dataA.length))
          .toString("hex"),
        newValue: dataB
          .subarray(diffStart, Math.min(diffStart + 16, dataB.length))
          .toString("hex"),
      });
    }

    return {
      identical: regions.length === 0 && dataA.length === dataB.length,
      totalDifferences: regions.length,
      sizeA: dataA.length,
      sizeB: dataB.length,
      sizeMismatch: dataA.length !== dataB.length,
      regions: regions.slice(0, 100),
    };
  }

  async extractFirmware(filePath: string): Promise<{
    data: Buffer;
    format: string;
    originalSize: number;
    strippedBytes: number;
    warnings: string[];
  }> {
    const data = await readFile(filePath);
    const warnings: string[] = [];
    const originalSize = data.length;

    // UEFI Capsule: EFI_GUID 3B6686BD-0D76-4030-B70E-B5519E2FC5A0
    const UEFI_CAPSULE_GUID = Buffer.from([
      0xbd, 0x86, 0x66, 0x3b, 0x76, 0x0d, 0x30, 0x40,
      0xb7, 0x0e, 0xb5, 0x51, 0x9e, 0x2f, 0xc5, 0xa0,
    ]);
    if (data.length >= 28 && data.subarray(0, 16).equals(UEFI_CAPSULE_GUID)) {
      const capsuleSize = data.readUInt32LE(8);
      const bodyOffset = data.readUInt32LE(16);
      if (bodyOffset > 0 && bodyOffset < data.length) {
        const stripped = data.subarray(bodyOffset);
        if (capsuleSize > 0 && capsuleSize !== data.length) {
          warnings.push(
            `Capsule header declares size ${capsuleSize} but file is ${data.length} bytes`,
          );
        }
        return {
          data: Buffer.from(stripped),
          format: "UEFI Capsule",
          originalSize,
          strippedBytes: bodyOffset,
          warnings,
        };
      }
    }

    // Intel Flash Image: descriptor signature 5AA5F00F at offset 0x10
    if (data.length > 0x14 && data.readUInt32LE(0x10) === 0x0ff0a55a) {
      // Parse flash descriptor to find BIOS region
      const flmap0 = data.readUInt32LE(0x14 + 0x14);
      const regionBase = ((flmap0 >> 16) & 0xff) << 4;

      // Region 1 is BIOS
      const biosRegOffset = regionBase + 1 * 4;
      if (biosRegOffset + 4 <= data.length) {
        const reg = data.readUInt32LE(biosRegOffset);
        const base = (reg & 0x1fff) << 12;
        const limit = (((reg >> 16) & 0x1fff) << 12) | 0xfff;

        // Check for Intel ME region (region 2)
        const meRegOffset = regionBase + 2 * 4;
        if (meRegOffset + 4 <= data.length) {
          const meReg = data.readUInt32LE(meRegOffset);
          const meBase = (meReg & 0x1fff) << 12;
          const meLimit = (((meReg >> 16) & 0x1fff) << 12) | 0xfff;
          if (meLimit > meBase) {
            warnings.push(
              "Intel ME region detected — this may be locked by the chipset",
            );
          }
        }

        if (limit > base && limit < data.length) {
          const biosData = data.subarray(base, limit + 1);
          return {
            data: Buffer.from(biosData),
            format: "Intel Flash Image",
            originalSize,
            strippedBytes: originalSize - biosData.length,
            warnings,
          };
        }
      }
      // If we can't parse regions, return full image with warning
      warnings.push(
        "Intel Flash Descriptor detected but could not parse BIOS region",
      );
      return {
        data: Buffer.from(data),
        format: "Intel Flash Image",
        originalSize,
        strippedBytes: 0,
        warnings,
      };
    }

    // AMI BIOS .cap: MZ DOS header (4D 5A) with 0x800 byte header
    const AMI_CAP_HEADER_SIZE = 0x800;
    if (
      data.length > AMI_CAP_HEADER_SIZE &&
      data[0] === 0x4d &&
      data[1] === 0x5a
    ) {
      // Verify there's plausible firmware data after the header
      const afterHeader = data.subarray(AMI_CAP_HEADER_SIZE);
      // Check for UEFI firmware volume signature or non-trivial data
      const hasFvh =
        this.findSignature(afterHeader, UEFI_FV_SIGNATURE) >= 0;
      const notEmpty = !afterHeader.subarray(0, 64).every((b) => b === 0xff || b === 0x00);
      if (hasFvh || notEmpty) {
        return {
          data: Buffer.from(afterHeader),
          format: "AMI BIOS Cap",
          originalSize,
          strippedBytes: AMI_CAP_HEADER_SIZE,
          warnings,
        };
      }
    }

    // Raw binary — no recognized header
    return {
      data: Buffer.from(data),
      format: "Raw Binary",
      originalSize,
      strippedBytes: 0,
      warnings,
    };
  }

  async checksum(filePath: string): Promise<{ md5: string; sha256: string; crc32: string }> {
    const data = await readFile(filePath);
    return {
      md5: createHash("md5").update(data).digest("hex"),
      sha256: createHash("sha256").update(data).digest("hex"),
      crc32: this.crc32(data),
    };
  }

  async deepAnalyze(filePath: string): Promise<{
    basic: BiosAnalysis;
    firmwareVolumes: UefiFirmwareVolume[];
    meInfo: IntelMeInfo | null;
    nvram: NvramStore;
    regions: RegionInfo[];
  }> {
    const data = await readFile(filePath);
    const basic = await this.analyze(filePath);
    const firmwareVolumes = scanFirmwareVolumes(data);
    const regions = listRegions(data);
    const nvram = parseNvramStore(data);

    let meInfo: IntelMeInfo | null = null;
    const meExtract = extractRegion(data, "me");
    if (meExtract) {
      meInfo = parseMeRegion(meExtract.data, meExtract.region.offset);
    }

    return { basic, firmwareVolumes, meInfo, nvram, regions };
  }

  async getRegionMap(filePath: string): Promise<RegionInfo[]> {
    const data = await readFile(filePath);
    return listRegions(data);
  }

  async healthCheck(filePath: string): Promise<BiosHealthReport> {
    return analyzeBiosHealth(filePath);
  }

  private crc32(data: Buffer): string {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  }

  private findSignature(
    data: Buffer,
    sig: Buffer,
    startOffset = 0,
  ): number {
    for (let i = startOffset; i <= data.length - sig.length; i++) {
      if (data.subarray(i, i + sig.length).equals(sig)) return i;
    }
    return -1;
  }

  private parseFlashDescriptor(
    data: Buffer,
    offset: number,
  ): FlashDescriptor | null {
    if (offset + 0x20 > data.length) return null;
    const flmap0 = data.readUInt32LE(offset + 0x14);
    const flmap1 = data.readUInt32LE(offset + 0x18);
    const regionBase = ((flmap0 >> 16) & 0xff) << 4;
    const masterBase = ((flmap1 >> 16) & 0xff) << 4;
    return { flmap0, flmap1, regionBase, masterBase };
  }

  private extractIntelRegions(
    data: Buffer,
    fd: FlashDescriptor,
  ): BiosRegion[] {
    const regions: BiosRegion[] = [];
    const names = [
      "Flash Descriptor",
      "BIOS",
      "Intel ME",
      "GbE",
      "Platform Data",
    ];

    for (let i = 0; i < 5; i++) {
      const regOffset = fd.regionBase + i * 4;
      if (regOffset + 4 > data.length) break;

      const reg = data.readUInt32LE(regOffset);
      const base = (reg & 0x1fff) << 12;
      const limit = ((reg >> 16) & 0x1fff) << 12 | 0xfff;

      if (limit > base && limit < data.length) {
        regions.push({
          name: names[i] || `Region ${i}`,
          offset: base,
          size: limit - base + 1,
          type: "intel_fd_region",
          description: `Intel FD region ${i}`,
        });
      }
    }
    return regions;
  }
}
