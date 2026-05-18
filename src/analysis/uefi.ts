export interface UefiFfsFile {
  guid: string;
  name: string;
  type: number;
  typeName: string;
  size: number;
  state: number;
  attributes: number;
  offset: number;
}

export interface UefiFirmwareVolume {
  offset: number;
  size: number;
  phase: string;
  revision: number;
  fileSystem: string;
  files: UefiFfsFile[];
  attributes: number;
  headerLength: number;
}

const FFS_FILE_TYPES: Record<number, string> = {
  0x00: "Unknown",
  0x01: "RAW",
  0x02: "Freeform",
  0x03: "Security Core (SEC)",
  0x04: "PEI Core",
  0x05: "DXE Core",
  0x06: "PEIM (PEI Module)",
  0x07: "Driver (DXE)",
  0x08: "Combined PEIM/Driver",
  0x09: "Application",
  0x0A: "SMM Driver (MM)",
  0x0B: "Firmware Volume Image",
  0x0C: "Combined SMM/DXE",
  0x0D: "SMM Core (MM)",
  0x0E: "SMM Standalone",
  0x0F: "SMM Core Standalone",
  0xF0: "Pad File",
};

const KNOWN_GUIDS: Record<string, string> = {
  "1ba0062e-c779-4582-8566-336ae8f78f09": "PEI Core (PI)",
  "52c05b14-0b98-496c-bc3b-04b50211d680": "PEI Core (EDK2)",
  "d6a2cb7f-6a18-4e2f-b43b-9920a733700a": "DXE Core",
  "fc510ee7-ffdc-11d4-bd41-0080c73c8881": "DXE Apriori",
  "1b45cc0a-156a-428a-af62-49864da0e6e6": "PEI Apriori",
  "9e21fd93-9c72-4c15-8c4b-e77f1db2d792": "BDS (Boot Device Selection)",
  "7c04a583-9e3e-4f1c-ad65-e05268d0b4d1": "Security (SEC)",
  "a19b1fe7-c1bc-49f8-875f-54a5d542443f": "AMI BIOS Guard",
  "cef5b9a3-476d-497f-9fdc-e98143e0422c": "NV Storage / Variable Store",
  "fff12b8d-7696-4c8b-a985-2747075b4f50": "NV FTW (Fault Tolerant Write)",
  "00000000-0000-0000-0000-000000000000": "Null GUID",
  "8c8ce578-8a3d-4f1c-9935-896185c32dd3": "EFI Global Variable GUID",
  "24400798-3807-4a42-b413-a1ecee205dd8": "AMI TSE Setup",
  "4599d26f-1a11-49b8-b91f-858745cff824": "Boot Manager",
  "462caa21-7614-4503-836e-8ab6f4662331": "SMBIOS Protocol",
  "eb9d2d31-2d88-11d3-9a16-0090273fc14d": "SMBIOS Table",
  "964e5b21-6459-11d2-8e39-00a0c969723b": "SMBIOS Thunk Driver",
  "587e72d7-cc50-4f79-8209-ca291fc1a10f": "Intel FSP (Firmware Support Package)",
  "912740be-2284-4734-b971-84b027353f0c": "Intel Microcode Update",
};

const EFI_FV_FILETYPE_PEI_CORE = 0x04;
const EFI_FV_FILETYPE_DXE_CORE = 0x05;
const EFI_FV_FILETYPE_PEIM = 0x06;
const EFI_FV_FILETYPE_DRIVER = 0x07;
const EFI_FV_FILETYPE_SMM = 0x0A;

function formatGuid(buf: Buffer, offset: number): string {
  if (offset + 16 > buf.length) return "00000000-0000-0000-0000-000000000000";
  const d1 = buf.readUInt32LE(offset).toString(16).padStart(8, "0");
  const d2 = buf.readUInt16LE(offset + 4).toString(16).padStart(4, "0");
  const d3 = buf.readUInt16LE(offset + 6).toString(16).padStart(4, "0");
  const d4 = buf.subarray(offset + 8, offset + 10).toString("hex");
  const d5 = buf.subarray(offset + 10, offset + 16).toString("hex");
  return `${d1}-${d2}-${d3}-${d4}-${d5}`;
}

function getGuidName(guid: string): string {
  return KNOWN_GUIDS[guid.toLowerCase()] || "";
}

export function parseUefiFirmwareVolume(data: Buffer, offset: number): UefiFirmwareVolume | null {
  if (offset + 56 > data.length) return null;

  const sig = data.readUInt32LE(offset + 40);
  if (sig !== 0x4856465f) return null; // _FVH

  const fvLength = Number(data.readBigUInt64LE(offset + 32));
  if (fvLength <= 0 || fvLength > data.length - offset) return null;

  const headerLength = data.readUInt16LE(offset + 48);
  const revision = data[offset + 55];
  const attributes = data.readUInt32LE(offset + 44);

  const fileSystemGuid = formatGuid(data, offset + 0);

  const files: UefiFfsFile[] = [];
  let fileOffset = offset + headerLength;

  while (fileOffset + 24 < offset + fvLength) {
    // Skip alignment padding (0xFF bytes)
    while (fileOffset < offset + fvLength && data[fileOffset] === 0xff) {
      fileOffset++;
    }
    if (fileOffset + 24 >= offset + fvLength) break;

    const fileGuid = formatGuid(data, fileOffset);
    if (fileGuid === "00000000-0000-0000-0000-000000000000") break;

    const integrityCheck = data.readUInt16LE(fileOffset + 16);
    const fileType = data[fileOffset + 18];
    const fileAttributes = data[fileOffset + 19];
    const fileState = data[fileOffset + 23];

    // File size is 3 bytes at offset 20
    let fileSize = data[fileOffset + 20] | (data[fileOffset + 21] << 8) | (data[fileOffset + 22] << 16);
    let dataOffset = 24;

    // FFS3 extended size (if bit 0 of attributes set and size field is 0xFFFFFF)
    if ((fileAttributes & 0x01) && fileSize === 0xffffff) {
      if (fileOffset + 32 <= offset + fvLength) {
        fileSize = Number(data.readBigUInt64LE(fileOffset + 24));
        dataOffset = 32;
      }
    }

    if (fileSize < dataOffset || fileSize > fvLength) break;

    const guidName = getGuidName(fileGuid);
    const typeName = FFS_FILE_TYPES[fileType] || `Type 0x${fileType.toString(16)}`;

    files.push({
      guid: fileGuid,
      name: guidName || typeName,
      type: fileType,
      typeName,
      size: fileSize,
      state: fileState,
      attributes: fileAttributes,
      offset: fileOffset,
    });

    // Align to 8-byte boundary
    fileOffset += fileSize;
    fileOffset = (fileOffset + 7) & ~7;
  }

  // Determine phase from file types
  let phase = "Unknown";
  const hasPeiCore = files.some((f) => f.type === EFI_FV_FILETYPE_PEI_CORE);
  const hasDxeCore = files.some((f) => f.type === EFI_FV_FILETYPE_DXE_CORE);
  const hasPeims = files.some((f) => f.type === EFI_FV_FILETYPE_PEIM);
  const hasDxeDrivers = files.some((f) => f.type === EFI_FV_FILETYPE_DRIVER);
  const hasSmmDrivers = files.some((f) => f.type === EFI_FV_FILETYPE_SMM);

  if (hasPeiCore || (hasPeims && !hasDxeDrivers)) phase = "PEI";
  else if (hasDxeCore || hasDxeDrivers) phase = "DXE";
  else if (hasSmmDrivers) phase = "SMM";
  else if (files.length === 0 || files.every((f) => f.type === 0x0B)) phase = "FV Container";

  // Check for SEC markers
  const hasSecFile = files.some((f) => f.type === 0x03);
  if (hasSecFile) phase = "SEC";

  return {
    offset,
    size: fvLength,
    phase,
    revision,
    fileSystem: fileSystemGuid,
    files,
    attributes,
    headerLength,
  };
}

export function scanFirmwareVolumes(data: Buffer): UefiFirmwareVolume[] {
  const volumes: UefiFirmwareVolume[] = [];
  const FVH_SIG = Buffer.from([0x5f, 0x46, 0x56, 0x48]);

  let offset = 0;
  while (offset < data.length - 56) {
    const sigOffset = data.indexOf(FVH_SIG, offset);
    if (sigOffset < 0 || sigOffset < 40) break;

    const fvBase = sigOffset - 40;
    const fv = parseUefiFirmwareVolume(data, fvBase);
    if (fv) {
      volumes.push(fv);
      offset = fvBase + fv.size;
    } else {
      offset = sigOffset + 4;
    }
  }

  return volumes;
}
