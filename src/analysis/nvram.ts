export interface NvramVariable {
  name: string;
  guid: string;
  guidName: string;
  size: number;
  dataSize: number;
  attributes: number;
  state: "valid" | "deleted" | "invalid";
  offset: number;
}

export interface NvramStore {
  found: boolean;
  offset: number;
  size: number;
  format: string;
  variables: NvramVariable[];
  totalSize: number;
  usedSize: number;
  freeSize: number;
  deletedCount: number;
  warnings: string[];
}

const WELL_KNOWN_GUIDS: Record<string, string> = {
  "8be4df61-93ca-11d2-aa0d-00e098032b8c": "EFI Global Variable",
  "4599d26f-1a11-49b8-b91f-858745cff824": "Boot Manager",
  "158def5a-f656-419c-b027-7a3192c079d2": "AMI Setup",
  "ec87d643-eba4-4bb5-a1e5-3f3e36b20da9": "AMI AMITSE",
  "c811fa38-42c8-4579-a9bb-60e94eddfb34": "AMI NVRAM",
  "a04a27f4-df00-4d42-b552-39511302113d": "Setup (Phoenix)",
  "4dfbbaab-1392-4fde-abb8-c4861e4e0bcb": "Intel ME Configuration",
  "3812723d-7e48-4e29-bc27-f4b9ce6be564": "Intel Platform Setup",
  "4b3082a3-80c6-4d7e-9cd0-583917265df1": "Secure Boot KEK",
  "d719b2cb-3d3a-4596-a3bc-dad00e67656f": "Secure Boot DB",
  "77fa9abd-0359-4d32-bd60-28f4e78f784b": "Microsoft Variable",
};

const VSS_SIGNATURE = 0x53535624; // $VSS
const VARIABLE_HEADER_SIGNATURE = 0x55aa;
const VARIABLE_STATE_VALID = 0x3f;
const VARIABLE_STATE_DELETED = 0x3c;

function formatGuid(buf: Buffer, offset: number): string {
  if (offset + 16 > buf.length) return "";
  const d1 = buf.readUInt32LE(offset).toString(16).padStart(8, "0");
  const d2 = buf.readUInt16LE(offset + 4).toString(16).padStart(4, "0");
  const d3 = buf.readUInt16LE(offset + 6).toString(16).padStart(4, "0");
  const d4 = buf.subarray(offset + 8, offset + 10).toString("hex");
  const d5 = buf.subarray(offset + 10, offset + 16).toString("hex");
  return `${d1}-${d2}-${d3}-${d4}-${d5}`;
}

function readUtf16Le(buf: Buffer, offset: number, maxLen: number): string {
  const chars: string[] = [];
  for (let i = 0; i < maxLen - 1; i += 2) {
    if (offset + i + 1 >= buf.length) break;
    const code = buf.readUInt16LE(offset + i);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

export function findNvramStore(data: Buffer): number {
  // Search for $VSS signature
  for (let i = 0; i < data.length - 4; i += 4) {
    if (data.readUInt32LE(i) === VSS_SIGNATURE) {
      return i;
    }
  }
  // Also try finding by UEFI variable header signature pattern
  for (let i = 0; i < data.length - 44; i++) {
    if (data.readUInt16LE(i) === VARIABLE_HEADER_SIGNATURE) {
      const state = data[i + 2];
      if (state === VARIABLE_STATE_VALID || state === VARIABLE_STATE_DELETED) {
        const nameSize = data.readUInt32LE(i + 36);
        const dataSize = data.readUInt32LE(i + 40);
        if (nameSize > 0 && nameSize < 512 && dataSize > 0 && dataSize < 65536) {
          return i;
        }
      }
    }
  }
  return -1;
}

export function parseNvramStore(data: Buffer, storeOffset = -1): NvramStore {
  const warnings: string[] = [];

  if (storeOffset < 0) {
    storeOffset = findNvramStore(data);
  }

  if (storeOffset < 0) {
    return {
      found: false,
      offset: 0,
      size: 0,
      format: "none",
      variables: [],
      totalSize: 0,
      usedSize: 0,
      freeSize: 0,
      deletedCount: 0,
      warnings: ["No NVRAM variable store found in image"],
    };
  }

  let format = "VSS";
  let storeSize = 0;
  let varOffset: number;

  // Check for $VSS header
  if (storeOffset + 28 <= data.length && data.readUInt32LE(storeOffset) === VSS_SIGNATURE) {
    storeSize = data.readUInt32LE(storeOffset + 4);
    format = "VSS (Variable Storage Segment)";
    varOffset = storeOffset + 28;
  } else {
    // No VSS header — try parsing raw variables
    storeSize = Math.min(data.length - storeOffset, 256 * 1024);
    format = "Raw UEFI Variables";
    varOffset = storeOffset;
  }

  const variables: NvramVariable[] = [];
  let usedSize = 0;
  let deletedCount = 0;
  const storeEnd = storeOffset + Math.min(storeSize, data.length - storeOffset);

  while (varOffset + 44 < storeEnd) {
    // Skip padding/free space
    if (data[varOffset] === 0xff) {
      varOffset++;
      continue;
    }

    // Check for variable header signature (0xAA55)
    const sig = data.readUInt16LE(varOffset);
    if (sig !== VARIABLE_HEADER_SIGNATURE) {
      varOffset++;
      continue;
    }

    const state = data[varOffset + 2];
    const attributes = data.readUInt32LE(varOffset + 4);
    const guid = formatGuid(data, varOffset + 20);
    const nameSize = data.readUInt32LE(varOffset + 36);
    const dataSize = data.readUInt32LE(varOffset + 40);

    if (nameSize === 0 || nameSize > 512 || dataSize > 65536) {
      varOffset += 4;
      continue;
    }

    const headerSize = 44;
    const totalVarSize = headerSize + nameSize + dataSize;

    if (varOffset + totalVarSize > storeEnd) break;

    const name = readUtf16Le(data, varOffset + headerSize, nameSize);
    const guidName = WELL_KNOWN_GUIDS[guid.toLowerCase()] || "";

    let varState: NvramVariable["state"] = "invalid";
    if ((state & 0x3f) === VARIABLE_STATE_VALID) varState = "valid";
    else if ((state & 0x3f) === VARIABLE_STATE_DELETED) varState = "deleted";

    variables.push({
      name,
      guid,
      guidName,
      size: totalVarSize,
      dataSize,
      attributes,
      state: varState,
      offset: varOffset,
    });

    usedSize += totalVarSize;
    if (varState === "deleted") deletedCount++;

    // Align to 4-byte boundary
    varOffset += (totalVarSize + 3) & ~3;
  }

  const freeSize = storeSize - usedSize;

  if (variables.length === 0) {
    warnings.push("No valid NVRAM variables found — store may be empty or corrupted");
  }

  if (deletedCount > variables.length * 0.5) {
    warnings.push(`High proportion of deleted variables (${deletedCount}/${variables.length}) — NVRAM may need garbage collection or reflash`);
  }

  return {
    found: true,
    offset: storeOffset,
    size: storeSize,
    format,
    variables,
    totalSize: storeSize,
    usedSize,
    freeSize: Math.max(0, freeSize),
    deletedCount,
    warnings,
  };
}
