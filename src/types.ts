export type BackendType = "native";

export interface ProgrammerInfo {
  type: "ch341a" | "ch347" | "ch343" | "unknown";
  connected: boolean;
  vendorId?: string;
  productId?: string;
  description?: string;
  backend?: BackendType;
  bus?: number;
  address?: number;
  portPath?: string;
  viaHub?: boolean;
}

export interface ChipInfo {
  name: string;
  vendorName: string;
  jedecId: string;
  sizeBytes: number;
  sizeHuman: string;
  type: "spi" | "i2c" | "parallel";
  pageSize?: number;
  sectorSize?: number;
  blockSize?: number;
  writeProtected?: boolean;
  voltage?: number;
}

export interface ReadResult {
  success: boolean;
  filePath: string;
  sizeBytes: number;
  durationMs: number;
  checksum: string;
  allFF?: boolean;
  allZero?: boolean;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  backupPath: string | null;
  verified: boolean;
  durationMs: number;
  error?: string;
}

export interface EraseResult {
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface VerifyResult {
  matches: boolean;
  filePath: string;
  chipChecksum: string;
  fileChecksum: string;
  durationMs: number;
  error?: string;
}

export interface BiosRegion {
  name: string;
  offset: number;
  size: number;
  type: string;
  description?: string;
}

export interface BiosAnalysis {
  fileSize: number;
  checksum: string;
  regions: BiosRegion[];
  isUefi: boolean;
  biosVendor?: string;
  biosVersion?: string;
  buildDate?: string;
  warnings: string[];
}

export interface DiffResult {
  identical: boolean;
  totalDifferences: number;
  sizeA: number;
  sizeB: number;
  sizeMismatch: boolean;
  regions: Array<{
    offset: number;
    length: number;
    oldValue: string;
    newValue: string;
  }>;
}

export interface SerialConfig {
  port: string;
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
}

export interface SerialMessage {
  timestamp: number;
  data: string;
  direction: "rx" | "tx";
}
