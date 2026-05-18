/**
 * SFDP (Serial Flash Discoverable Parameters) — JEDEC JESD216 standard.
 *
 * Pure parsers for the SFDP header and the JEDEC Basic Flash Parameter Table.
 * Backends call these to translate raw SPI bytes into ChipDef-compatible values
 * when a chip's JEDEC ID is missing from CHIP_DATABASE.
 */

export interface SFDPParameterHeader {
  idLsb: number;        // 0x00 = JEDEC Basic Flash Params
  minorRev: number;
  majorRev: number;
  length: number;       // table length in DWORDs
  tablePointer: number; // byte offset to parameter table
  idMsb: number;        // 0xff for JEDEC standard
}

export interface SFDPHeaderInfo {
  signature: string;    // "SFDP" if valid
  valid: boolean;
  minorRev: number;
  majorRev: number;
  numParameterHeaders: number; // (NPH + 1) per spec
  accessProtocol: number;
  parameterHeaders: SFDPParameterHeader[];
}

export interface SFDPBasicFlashParams {
  // From DWORD 1
  eraseSize4KB: boolean;
  fastReadSupported: boolean;
  addressByteCount: "3" | "4" | "3-or-4";
  ddrSupported: boolean;
  fastReadOpcode: number;

  // From DWORD 2
  densityBits: number;
  densityBytes: number;

  // From DWORD 8/9 — erase types
  eraseTypes: Array<{ sizeExp: number; sizeBytes: number; opcode: number }>;

  // From DWORD 11 — page size
  pageSize: number;

  // Derived
  needs4ByteAddr: boolean;
  sectorSize: number;
  blockSize: number;
}

const SFDP_SIGNATURE = [0x53, 0x46, 0x44, 0x50]; // "SFDP"

/**
 * Parse the 8-byte SFDP header starting at offset 0.
 * Optionally parses parameter headers immediately following if the buffer is large enough.
 */
export function parseSFDPHeader(buf: Buffer): SFDPHeaderInfo {
  if (buf.length < 8) {
    return {
      signature: "",
      valid: false,
      minorRev: 0,
      majorRev: 0,
      numParameterHeaders: 0,
      accessProtocol: 0,
      parameterHeaders: [],
    };
  }

  const sigBytes = [buf[0], buf[1], buf[2], buf[3]];
  const sigMatches = sigBytes.every((b, i) => b === SFDP_SIGNATURE[i]);
  const signature = String.fromCharCode(...sigBytes);

  if (!sigMatches) {
    return {
      signature,
      valid: false,
      minorRev: 0,
      majorRev: 0,
      numParameterHeaders: 0,
      accessProtocol: 0,
      parameterHeaders: [],
    };
  }

  const minorRev = buf[4];
  const majorRev = buf[5];
  const nphField = buf[6];
  const accessProtocol = buf[7];
  const numParameterHeaders = (nphField & 0xff) + 1;

  const parameterHeaders: SFDPParameterHeader[] = [];
  for (let i = 0; i < numParameterHeaders; i++) {
    const offset = 8 + i * 8;
    if (buf.length < offset + 8) break;
    parameterHeaders.push({
      idLsb: buf[offset],
      minorRev: buf[offset + 1],
      majorRev: buf[offset + 2],
      length: buf[offset + 3],
      tablePointer: buf[offset + 4] | (buf[offset + 5] << 8) | (buf[offset + 6] << 16),
      idMsb: buf[offset + 7],
    });
  }

  return {
    signature,
    valid: true,
    minorRev,
    majorRev,
    numParameterHeaders,
    accessProtocol,
    parameterHeaders,
  };
}

/**
 * Parse the JEDEC Basic Flash Parameter Table (BFPT).
 * Caller passes the raw bytes starting at the table address.
 */
export function parseBasicFlashParams(buf: Buffer): SFDPBasicFlashParams | null {
  if (buf.length < 16) return null;

  const dw1 = buf.readUInt32LE(0);
  const dw2 = buf.readUInt32LE(4);

  // DWORD 1 fields
  const eraseSize4KB = ((dw1 >> 0) & 0x3) === 0x1; // 01b = 4KB supported
  const ddrSupported = !!((dw1 >> 2) & 0x1);
  const addressByteField = (dw1 >> 17) & 0x3;
  const addressByteCount: "3" | "4" | "3-or-4" =
    addressByteField === 0 ? "3" : addressByteField === 1 ? "3-or-4" : "4";
  const fastReadSupported = !!((dw1 >> 16) & 0x1);
  const fastReadOpcode = (dw1 >> 8) & 0xff;

  // DWORD 2: density
  let densityBits: number;
  if (dw2 & 0x80000000) {
    const n = dw2 & 0x7fffffff;
    if (n >= 32) return null; // sanity: 2^32 bits = absurd
    densityBits = Math.pow(2, n);
  } else {
    densityBits = dw2 + 1;
  }
  if (densityBits <= 0 || densityBits > 0xffffffff * 8) return null;
  const densityBytes = Math.floor(densityBits / 8);

  // Erase types from DWORD 8-9 (bytes 28-35)
  const eraseTypes: Array<{ sizeExp: number; sizeBytes: number; opcode: number }> = [];
  if (buf.length >= 36) {
    for (let i = 0; i < 4; i++) {
      const sizeExp = buf[28 + i * 2];
      const opcode = buf[28 + i * 2 + 1];
      if (sizeExp > 0 && sizeExp < 32) {
        eraseTypes.push({ sizeExp, sizeBytes: 1 << sizeExp, opcode });
      }
    }
  }

  // Page size from DWORD 11 (bytes 40-43)
  let pageSize = 256;
  if (buf.length >= 44) {
    const dw11 = buf.readUInt32LE(40);
    const pageSizeBits = (dw11 >> 4) & 0x0f;
    if (pageSizeBits > 0 && pageSizeBits < 24) {
      pageSize = 1 << pageSizeBits;
    }
  }

  // Derive sector/block size from erase types when present
  const sortedErase = [...eraseTypes].sort((a, b) => a.sizeBytes - b.sizeBytes);
  const sectorSize = sortedErase[0]?.sizeBytes ?? (eraseSize4KB ? 4096 : 65536);
  const blockSize = sortedErase[sortedErase.length - 1]?.sizeBytes ?? 65536;

  const needs4ByteAddr = densityBytes > 16 * 1024 * 1024;

  return {
    eraseSize4KB,
    fastReadSupported,
    addressByteCount,
    ddrSupported,
    fastReadOpcode,
    densityBits,
    densityBytes,
    eraseTypes,
    pageSize,
    needs4ByteAddr,
    sectorSize,
    blockSize,
  };
}

/**
 * Synthesize a ChipDef-compatible record from raw JEDEC ID + parsed SFDP params.
 * Used as the universal fallback path for chips not in CHIP_DATABASE.
 */
export interface SFDPSynthesizedChip {
  name: string;
  vendor: string;
  jedecId: string;
  sizeBytes: number;
  type: "spi";
  pageSize: number;
  sectorSize: number;
  blockSize: number;
  voltage: number;
  needs4ByteAddr: boolean;
  source: "sfdp";
}

export function synthesizeChipFromSFDP(
  jedecId: string,
  manufacturerName: string,
  params: SFDPBasicFlashParams,
  voltageHint?: number,
): SFDPSynthesizedChip {
  return {
    name: `Unknown ${jedecId.toUpperCase()} (via SFDP)`,
    vendor: manufacturerName,
    jedecId: jedecId.toLowerCase(),
    sizeBytes: params.densityBytes,
    type: "spi",
    pageSize: params.pageSize,
    sectorSize: params.sectorSize,
    blockSize: params.blockSize,
    voltage: voltageHint ?? 3.3,
    needs4ByteAddr: params.needs4ByteAddr,
    source: "sfdp",
  };
}

/**
 * Build a synthetic SFDP buffer for testing. Caller specifies density and
 * optional fields; the returned buffer matches what a real chip would
 * produce starting at offset 0 (header) followed by the parameter table
 * at offset 0x80.
 */
export interface BuildSFDPOptions {
  majorRev?: number;
  minorRev?: number;
  densityBits?: number;        // raw density (default 8Mb)
  useDensityShift?: boolean;   // if true, encode as 2^N
  eraseSize4KB?: boolean;
  fastReadSupported?: boolean;
  addressBytes?: 3 | 4 | "3-or-4";
  pageSize?: number;
  eraseTypes?: Array<{ sizeExp: number; opcode: number }>;
  /** If set, corrupt the signature so parseSFDPHeader rejects it. */
  corruptSignature?: boolean;
  /** Truncate the buffer to this many bytes total. */
  truncateTo?: number;
  /** Omit the parameter table entirely. */
  omitParamTable?: boolean;
}

export function buildSyntheticSFDP(opts: BuildSFDPOptions = {}): Buffer {
  const majorRev = opts.majorRev ?? 1;
  const minorRev = opts.minorRev ?? 5;
  const tableOffset = 0x80;
  const tableLengthDWORDs = 20;
  const buf = Buffer.alloc(tableOffset + tableLengthDWORDs * 4);

  // Header
  if (opts.corruptSignature) {
    buf[0] = 0x42;
    buf[1] = 0x41;
    buf[2] = 0x44;
    buf[3] = 0x00;
  } else {
    buf[0] = 0x53; buf[1] = 0x46; buf[2] = 0x44; buf[3] = 0x50; // "SFDP"
  }
  buf[4] = minorRev;
  buf[5] = majorRev;
  buf[6] = 0x00; // NPH=0 → 1 parameter header
  buf[7] = 0xff; // access protocol

  // Parameter header at offset 8
  buf[8] = 0x00;                  // ID LSB (JEDEC)
  buf[9] = minorRev;
  buf[10] = majorRev;
  buf[11] = tableLengthDWORDs;
  buf[12] = tableOffset & 0xff;
  buf[13] = (tableOffset >> 8) & 0xff;
  buf[14] = (tableOffset >> 16) & 0xff;
  buf[15] = 0xff;                 // ID MSB

  if (opts.omitParamTable) {
    return buf.subarray(0, 16);
  }

  // DWORD 1
  let dw1 = 0;
  if (opts.eraseSize4KB ?? true) dw1 |= 0x1;
  if (opts.fastReadSupported ?? true) dw1 |= (1 << 16);
  const addrField = opts.addressBytes === 4 ? 2 : opts.addressBytes === "3-or-4" ? 1 : 0;
  dw1 |= (addrField & 0x3) << 17;
  dw1 |= 0xeb << 8; // fast read opcode 0xEB
  buf.writeUInt32LE(dw1, tableOffset + 0);

  // DWORD 2: density
  const densityBits = opts.densityBits ?? 8 * 1024 * 1024 * 8; // 8MB default
  if (opts.useDensityShift) {
    const n = Math.round(Math.log2(densityBits));
    buf.writeUInt32LE((0x80000000 | n) >>> 0, tableOffset + 4);
  } else {
    buf.writeUInt32LE(densityBits - 1, tableOffset + 4);
  }

  // Erase types DWORDs 8-9 (offsets 28-35 within table)
  const eraseTypes = opts.eraseTypes ?? [
    { sizeExp: 12, opcode: 0x20 }, // 4KB
    { sizeExp: 15, opcode: 0x52 }, // 32KB
    { sizeExp: 16, opcode: 0xd8 }, // 64KB
  ];
  for (let i = 0; i < Math.min(4, eraseTypes.length); i++) {
    buf[tableOffset + 28 + i * 2] = eraseTypes[i].sizeExp;
    buf[tableOffset + 28 + i * 2 + 1] = eraseTypes[i].opcode;
  }

  // DWORD 11: page size (offset 40)
  const pageSize = opts.pageSize ?? 256;
  const pageSizeBits = Math.round(Math.log2(pageSize));
  const dw11 = (pageSizeBits & 0xf) << 4;
  buf.writeUInt32LE(dw11, tableOffset + 40);

  if (opts.truncateTo !== undefined) {
    return buf.subarray(0, opts.truncateTo);
  }
  return buf;
}
