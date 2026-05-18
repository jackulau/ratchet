import { readFile, writeFile } from "node:fs/promises";

export interface RegionInfo {
  name: string;
  offset: number;
  size: number;
  type: string;
}

const INTEL_FD_SIG = 0x0ff0a55a;

const REGION_NAMES = ["descriptor", "bios", "me", "gbe", "platform"];

function parseFlashDescriptorRegions(data: Buffer): RegionInfo[] {
  if (data.length < 0x20 || data.readUInt32LE(0x10) !== INTEL_FD_SIG) return [];

  const flmap0 = data.readUInt32LE(0x14 + 0x14);
  const regionBase = ((flmap0 >> 16) & 0xff) << 4;
  const regions: RegionInfo[] = [];

  for (let i = 0; i < 5; i++) {
    const regOffset = regionBase + i * 4;
    if (regOffset + 4 > data.length) break;

    const reg = data.readUInt32LE(regOffset);
    const base = (reg & 0x1fff) << 12;
    const limit = (((reg >> 16) & 0x1fff) << 12) | 0xfff;

    if (limit > base && limit < data.length) {
      regions.push({
        name: REGION_NAMES[i] || `region${i}`,
        offset: base,
        size: limit - base + 1,
        type: "intel_fd",
      });
    }
  }

  return regions;
}

export function listRegions(image: Buffer): RegionInfo[] {
  const fdRegions = parseFlashDescriptorRegions(image);
  if (fdRegions.length > 0) return fdRegions;

  return [{
    name: "bios",
    offset: 0,
    size: image.length,
    type: "raw",
  }];
}

export function extractRegion(image: Buffer, regionName: string): { data: Buffer; region: RegionInfo } | null {
  const regions = listRegions(image);
  const region = regions.find((r) => r.name.toLowerCase() === regionName.toLowerCase());
  if (!region) return null;

  return {
    data: Buffer.from(image.subarray(region.offset, region.offset + region.size)),
    region,
  };
}

export function replaceRegion(image: Buffer, regionName: string, replacement: Buffer): { data: Buffer; region: RegionInfo; warnings: string[] } | null {
  const regions = listRegions(image);
  const region = regions.find((r) => r.name.toLowerCase() === regionName.toLowerCase());
  if (!region) return null;

  const warnings: string[] = [];
  let repData = replacement;

  if (replacement.length !== region.size) {
    if (replacement.length < region.size) {
      warnings.push(`Replacement (${replacement.length} bytes) smaller than region (${region.size} bytes) — padding with 0xFF`);
      repData = Buffer.alloc(region.size, 0xff);
      replacement.copy(repData);
    } else {
      warnings.push(`Replacement (${replacement.length} bytes) larger than region (${region.size} bytes) — truncating`);
      repData = replacement.subarray(0, region.size);
    }
  }

  const result = Buffer.from(image);
  repData.copy(result, region.offset);

  return { data: result, region, warnings };
}

export function rebuildImage(baseImage: Buffer, replacements: Record<string, Buffer>): { data: Buffer; warnings: string[] } {
  const warnings: string[] = [];
  let result: Buffer = Buffer.from(baseImage);

  for (const [regionName, replacement] of Object.entries(replacements)) {
    const replaced = replaceRegion(result, regionName, replacement);
    if (!replaced) {
      warnings.push(`Region "${regionName}" not found in image — skipped`);
      continue;
    }
    result = replaced.data;
    warnings.push(...replaced.warnings);
  }

  return { data: result, warnings };
}

export async function extractRegionToFile(imagePath: string, regionName: string, outputPath: string): Promise<{ region: RegionInfo; warnings: string[] }> {
  const image = await readFile(imagePath);
  const result = extractRegion(image, regionName);
  if (!result) {
    const regions = listRegions(image);
    throw new Error(`Region "${regionName}" not found. Available: ${regions.map((r) => r.name).join(", ")}`);
  }

  await writeFile(outputPath, result.data);
  return { region: result.region, warnings: [] };
}

export async function replaceRegionInFile(imagePath: string, regionName: string, replacementPath: string, outputPath: string): Promise<{ region: RegionInfo; warnings: string[] }> {
  const [image, replacement] = await Promise.all([readFile(imagePath), readFile(replacementPath)]);
  const result = replaceRegion(image, regionName, replacement);
  if (!result) {
    const regions = listRegions(image);
    throw new Error(`Region "${regionName}" not found. Available: ${regions.map((r) => r.name).join(", ")}`);
  }

  await writeFile(outputPath, result.data);
  return { region: result.region, warnings: result.warnings };
}
