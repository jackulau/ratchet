export interface MePartition {
  name: string;
  offset: number;
  size: number;
}

export interface IntelMeInfo {
  found: boolean;
  version: string;
  state: "normal" | "disabled" | "corrupted" | "unknown";
  regionOffset: number;
  regionSize: number;
  partitions: MePartition[];
  warnings: string[];
}

const FPT_SIGNATURE = Buffer.from("$FPT", "ascii");
const MN2_SIGNATURE = 0x324e4d24; // $MN2

const FPT_PARTITION_NAMES: Record<string, string> = {
  "FTPR": "Fault Tolerant Partition",
  "NFTP": "Non-Fault Tolerant Partition",
  "MFS": "ME File System",
  "DLMP": "Download Manifest",
  "PSVN": "Platform Security Version Number",
  "IVBP": "Independent Validation Boot Partition",
  "UTOK": "Unlock Token",
  "ISHC": "ISH Main",
  "OEMP": "OEM Data",
  "FITC": "Flash Image Tool Configuration",
  "WCOD": "Wireless Microcode",
  "LOCL": "Locality Manifest",
  "FLOG": "Flash Log",
};

export function parseMeRegion(data: Buffer, regionOffset = 0): IntelMeInfo {
  const warnings: string[] = [];
  const partitions: MePartition[] = [];
  let version = "unknown";
  let state: IntelMeInfo["state"] = "unknown";

  // Look for $FPT signature
  let fptOffset = -1;
  const searchEnd = Math.min(data.length - 4, 0x100);
  for (let i = 0; i < searchEnd; i++) {
    if (data.subarray(i, i + 4).equals(FPT_SIGNATURE)) {
      fptOffset = i;
      break;
    }
  }

  if (fptOffset < 0) {
    // Check if ME region is all 0xFF (disabled/absent)
    const sample = data.subarray(0, Math.min(256, data.length));
    if (sample.every((b) => b === 0xff)) {
      return {
        found: false,
        version: "none",
        state: "disabled",
        regionOffset,
        regionSize: data.length,
        partitions: [],
        warnings: ["ME region is blank (all 0xFF) — ME disabled or not present"],
      };
    }

    // Check if all zeros
    if (sample.every((b) => b === 0x00)) {
      return {
        found: false,
        version: "none",
        state: "corrupted",
        regionOffset,
        regionSize: data.length,
        partitions: [],
        warnings: ["ME region is all zeros — likely erased or corrupted"],
      };
    }

    return {
      found: false,
      version: "none",
      state: "unknown",
      regionOffset,
      regionSize: data.length,
      partitions: [],
      warnings: ["No $FPT signature found in ME region"],
    };
  }

  state = "normal";

  // Parse FPT header
  if (fptOffset + 32 > data.length) {
    return {
      found: true,
      version,
      state: "corrupted",
      regionOffset,
      regionSize: data.length,
      partitions: [],
      warnings: ["$FPT header truncated"],
    };
  }

  const numEntries = data.readUInt32LE(fptOffset + 4);
  const fptVersion = data[fptOffset + 21];

  if (numEntries > 32) {
    warnings.push(`Unusual FPT entry count: ${numEntries} — may be corrupted`);
  }

  // Parse FPT entries
  const entrySize = 32;
  const entriesStart = fptOffset + 32;
  const safeEntries = Math.min(numEntries, 32);

  for (let i = 0; i < safeEntries; i++) {
    const entryOffset = entriesStart + i * entrySize;
    if (entryOffset + entrySize > data.length) break;

    const name = data.subarray(entryOffset, entryOffset + 4).toString("ascii").replace(/\0/g, "");
    const partOffset = data.readUInt32LE(entryOffset + 8);
    const partSize = data.readUInt32LE(entryOffset + 12);

    if (partSize > 0 && partSize < data.length) {
      partitions.push({
        name: FPT_PARTITION_NAMES[name] ? `${name} (${FPT_PARTITION_NAMES[name]})` : name,
        offset: partOffset,
        size: partSize,
      });
    }
  }

  // Try to extract ME version from FTPR manifest ($MN2)
  const ftprEntry = partitions.find((p) => p.name.startsWith("FTPR"));
  if (ftprEntry) {
    const ftprStart = ftprEntry.offset;
    const ftprEnd = Math.min(ftprStart + ftprEntry.size, data.length);
    // Search for $MN2 signature within FTPR
    for (let i = ftprStart; i < ftprEnd - 4; i++) {
      if (data.readUInt32LE(i) === MN2_SIGNATURE) {
        // ME version at offset 0x18 from $MN2
        if (i + 0x20 < data.length) {
          const major = data.readUInt16LE(i + 0x18);
          const minor = data.readUInt16LE(i + 0x1a);
          const hotfix = data.readUInt16LE(i + 0x1c);
          const build = data.readUInt16LE(i + 0x1e);
          if (major > 0 && major < 50) {
            version = `${major}.${minor}.${hotfix}.${build}`;
          }
        }
        break;
      }
    }
  }

  if (version === "unknown") {
    warnings.push("Could not extract ME firmware version — $MN2 manifest not found");
  }

  return {
    found: true,
    version,
    state,
    regionOffset,
    regionSize: data.length,
    partitions,
    warnings,
  };
}
