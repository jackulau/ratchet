export interface VbiosInfo {
  valid: boolean;
  size: number;
  type: "legacy" | "uefi-gop" | "hybrid" | "unknown";
  vendor: "nvidia" | "amd" | "intel" | "unknown";
  pciVendorId: number;
  pciDeviceId: number;
  pciClassCode: number;
  version: string;
  buildDate: string;
  subsystemVendorId: number;
  subsystemDeviceId: number;
  uefiGopPresent: boolean;
  legacyVgaPresent: boolean;
  tables: VbiosTable[];
}

export interface VbiosTable {
  name: string;
  offset: number;
  size: number;
  description: string;
}

export interface VbiosTimingEntry {
  index: number;
  memoryClockKHz: number;
  description: string;
}

export interface VbiosPowerEntry {
  name: string;
  valueMW: number;
  description: string;
}

const PCI_VENDOR_NVIDIA = 0x10DE;
const PCI_VENDOR_AMD = 0x1002;
const PCI_VENDOR_INTEL = 0x8086;

function readU16LE(buf: Buffer, offset: number): number {
  if (offset + 1 >= buf.length) return 0;
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32LE(buf: Buffer, offset: number): number {
  if (offset + 3 >= buf.length) return 0;
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}

function findSignature(buf: Buffer, sig: string, startOffset = 0, endOffset?: number): number {
  const end = endOffset ?? buf.length;
  const sigBuf = Buffer.from(sig, "ascii");
  for (let i = startOffset; i <= end - sigBuf.length; i++) {
    let match = true;
    for (let j = 0; j < sigBuf.length; j++) {
      if (buf[i + j] !== sigBuf[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

function extractPrintable(buf: Buffer, offset: number, maxLen: number): string {
  let result = "";
  for (let i = 0; i < maxLen && offset + i < buf.length; i++) {
    const byte = buf[offset + i];
    if (byte === 0) break;
    if (byte >= 0x20 && byte <= 0x7E) result += String.fromCharCode(byte);
    else break;
  }
  return result.trim();
}

function identifyVendor(vendorId: number): VbiosInfo["vendor"] {
  if (vendorId === PCI_VENDOR_NVIDIA) return "nvidia";
  if (vendorId === PCI_VENDOR_AMD) return "amd";
  if (vendorId === PCI_VENDOR_INTEL) return "intel";
  return "unknown";
}

function parseNvidiaInfo(buf: Buffer, tables: VbiosTable[]): { version: string; buildDate: string } {
  let version = "";
  let buildDate = "";

  const verOffset = findSignature(buf, "Version ");
  if (verOffset >= 0) {
    version = extractPrintable(buf, verOffset + 8, 32);
  }

  for (let offset = 0; offset < Math.min(buf.length, 0x2000); offset++) {
    const str = extractPrintable(buf, offset, 12);
    if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(str)) {
      buildDate = str;
      break;
    }
  }

  const bitOffset = findSignature(buf, "BIT\0");
  if (bitOffset >= 0) {
    tables.push({ name: "BIT (BIOS Information Table)", offset: bitOffset, size: 0, description: "NVIDIA master table index — points to clock, power, memory, GPIO tables" });
  }

  const nvInfoOffset = findSignature(buf, "\x00NV\x00");
  if (nvInfoOffset >= 0) {
    tables.push({ name: "NV Info", offset: nvInfoOffset, size: 0, description: "NVIDIA device info table" });
  }

  return { version, buildDate };
}

function parseAmdInfo(buf: Buffer, tables: VbiosTable[]): { version: string; buildDate: string } {
  let version = "";
  let buildDate = "";

  const atomOffset = findSignature(buf, "ATOM");
  if (atomOffset >= 0) {
    tables.push({ name: "ATOMBIOS Header", offset: atomOffset, size: 0, description: "AMD ATOMBIOS master header — contains master command and data table pointers" });

    const romHeaderPtr = findSignature(buf, "ATOM", atomOffset);
    if (romHeaderPtr >= 0 && romHeaderPtr + 0x50 < buf.length) {
      const verPtr = readU16LE(buf, romHeaderPtr + 0x4);
      if (verPtr > 0 && verPtr < buf.length - 32) {
        version = extractPrintable(buf, verPtr, 64);
      }
    }
  }

  for (let offset = 0; offset < Math.min(buf.length, 0x4000); offset++) {
    const str = extractPrintable(buf, offset, 12);
    if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(str)) {
      buildDate = str;
      break;
    }
  }

  const masterDataOffset = findSignature(buf, "\x00\x00MAST");
  if (masterDataOffset >= 0) {
    tables.push({ name: "Master Data Table", offset: masterDataOffset, size: 0, description: "AMD master data table — pointers to clock, voltage, GPIO, connector tables" });
  }

  return { version, buildDate };
}

function parseIntelInfo(buf: Buffer, tables: VbiosTable[]): { version: string; buildDate: string } {
  let version = "";
  let buildDate = "";

  const vbtOffset = findSignature(buf, "$VBT");
  if (vbtOffset >= 0) {
    tables.push({ name: "VBT (Video BIOS Table)", offset: vbtOffset, size: 0, description: "Intel Video BIOS Table — display configuration, backlight, panel timing" });
    if (vbtOffset + 20 < buf.length) {
      version = extractPrintable(buf, vbtOffset + 4, 16);
    }
  }

  return { version, buildDate };
}

export function parseVbios(buf: Buffer): VbiosInfo {
  const info: VbiosInfo = {
    valid: false,
    size: buf.length,
    type: "unknown",
    vendor: "unknown",
    pciVendorId: 0,
    pciDeviceId: 0,
    pciClassCode: 0,
    version: "",
    buildDate: "",
    subsystemVendorId: 0,
    subsystemDeviceId: 0,
    uefiGopPresent: false,
    legacyVgaPresent: false,
    tables: [],
  };

  if (buf.length < 512) return info;

  if (buf[0] === 0x55 && buf[1] === 0xAA) {
    info.legacyVgaPresent = true;
    info.valid = true;
  }

  const pcirOffset = readU16LE(buf, 0x18);
  if (pcirOffset > 0 && pcirOffset + 24 < buf.length) {
    const pcirSig = buf.subarray(pcirOffset, pcirOffset + 4).toString("ascii");
    if (pcirSig === "PCIR") {
      info.pciVendorId = readU16LE(buf, pcirOffset + 4);
      info.pciDeviceId = readU16LE(buf, pcirOffset + 6);
      info.pciClassCode = (buf[pcirOffset + 13] << 16) | (buf[pcirOffset + 12] << 8) | buf[pcirOffset + 11];
      info.vendor = identifyVendor(info.pciVendorId);
      info.valid = true;

      info.tables.push({
        name: "PCI Data Structure",
        offset: pcirOffset,
        size: 24,
        description: `Vendor: 0x${info.pciVendorId.toString(16).padStart(4, "0")}, Device: 0x${info.pciDeviceId.toString(16).padStart(4, "0")}`,
      });

      const codeType = buf[pcirOffset + 20];
      if (codeType === 0x03) {
        info.uefiGopPresent = true;
      }
    }
  }

  for (let offset = 512; offset < buf.length - 4; offset += 512) {
    if (buf[offset] === 0x55 && buf[offset + 1] === 0xAA) {
      const innerPcirOff = readU16LE(buf, offset + 0x18);
      if (innerPcirOff > 0 && offset + innerPcirOff + 24 < buf.length) {
        const sig = buf.subarray(offset + innerPcirOff, offset + innerPcirOff + 4).toString("ascii");
        if (sig === "PCIR") {
          const ct = buf[offset + innerPcirOff + 20];
          if (ct === 0x03) {
            info.uefiGopPresent = true;
            info.tables.push({ name: "UEFI GOP Driver", offset, size: 0, description: "EFI Graphics Output Protocol driver image" });
          }
        }
      }
    }
  }

  if (info.legacyVgaPresent && info.uefiGopPresent) info.type = "hybrid";
  else if (info.uefiGopPresent) info.type = "uefi-gop";
  else if (info.legacyVgaPresent) info.type = "legacy";

  let vendorInfo = { version: "", buildDate: "" };
  if (info.vendor === "nvidia") vendorInfo = parseNvidiaInfo(buf, info.tables);
  else if (info.vendor === "amd") vendorInfo = parseAmdInfo(buf, info.tables);
  else if (info.vendor === "intel") vendorInfo = parseIntelInfo(buf, info.tables);

  if (vendorInfo.version) info.version = vendorInfo.version;
  if (vendorInfo.buildDate) info.buildDate = vendorInfo.buildDate;

  if (!info.version && info.valid) {
    for (let i = 0; i < Math.min(buf.length, 0x8000); i++) {
      const s = extractPrintable(buf, i, 64);
      if (s.length > 10 && /\d+\.\d+/.test(s) && !s.includes("PCIR")) {
        info.version = s;
        break;
      }
    }
  }

  return info;
}

export function formatVbiosReport(info: VbiosInfo): string {
  const lines: string[] = [];

  lines.push(`VBIOS Analysis`);
  lines.push(`${"─".repeat(50)}`);
  lines.push(`Valid:        ${info.valid ? "Yes" : "No — missing 0x55AA signature"}`);
  lines.push(`Size:         ${info.size} bytes (${(info.size / 1024).toFixed(0)} KB)`);
  lines.push(`Type:         ${info.type}`);
  lines.push(`Vendor:       ${info.vendor} (0x${info.pciVendorId.toString(16).padStart(4, "0")})`);
  lines.push(`Device ID:    0x${info.pciDeviceId.toString(16).padStart(4, "0")}`);
  lines.push(`Class:        0x${info.pciClassCode.toString(16).padStart(6, "0")}`);
  if (info.version) lines.push(`Version:      ${info.version}`);
  if (info.buildDate) lines.push(`Build Date:   ${info.buildDate}`);
  lines.push(`Legacy VGA:   ${info.legacyVgaPresent ? "Yes" : "No"}`);
  lines.push(`UEFI GOP:     ${info.uefiGopPresent ? "Yes" : "No"}`);

  if (info.tables.length > 0) {
    lines.push(``);
    lines.push(`Tables Found:`);
    for (const t of info.tables) {
      lines.push(`  0x${t.offset.toString(16).padStart(6, "0")}  ${t.name}`);
      lines.push(`             ${t.description}`);
    }
  }

  return lines.join("\n");
}
