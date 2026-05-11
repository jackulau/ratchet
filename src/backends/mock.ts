import type { ChipInfo, ReadResult, WriteResult, EraseResult, VerifyResult, ProgrammerInfo } from "../types.js";
import type { SFDPInfo, ProgressCallback } from "./ch341a.js";
import { lookupChipByJedecId, formatSize } from "../chips/database.js";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MOCK_JEDEC = { manufacturer: 0xef, memoryType: 0x40, capacity: 0x17 };
const MOCK_SIZE = 8 * 1024 * 1024; // 8MB — W25Q64

export type QualityMode = 'stable' | 'noisy' | 'disconnected';

export class MockBackend {
  private flash: Buffer;
  private opened = false;
  private writeProtected = false;
  private qualityMode: QualityMode = 'stable';

  constructor(sizeBytes: number = MOCK_SIZE) {
    this.flash = Buffer.alloc(sizeBytes, 0xff);
  }

  setQualityMode(mode: QualityMode): void {
    this.qualityMode = mode;
  }

  async detectProgrammer(): Promise<ProgrammerInfo> {
    return {
      type: "ch341a",
      connected: true,
      vendorId: "1a86",
      productId: "5512",
      description: "Mock CH341A (dry-run mode)",
      backend: "native",
    };
  }

  async connectionTest(): Promise<{ stable: boolean; reads: number; matches: number; jedecId: string; error?: string; timings: number[]; statusRegister: number | null }> {
    const READ_COUNT = 10;

    if (this.qualityMode === 'disconnected') {
      return {
        stable: false,
        reads: READ_COUNT,
        matches: READ_COUNT,
        jedecId: "000000",
        error: "No chip responding — check clip/socket connection",
        timings: Array(READ_COUNT).fill(5),
        statusRegister: null,
      };
    }

    if (this.qualityMode === 'noisy') {
      const ids: string[] = [];
      const timings: number[] = [];
      const noisyIds = ["ab1234", "cd5678", "000000"];
      for (let i = 0; i < READ_COUNT; i++) {
        // ~30% of reads are inconsistent (indices 2, 5, 8)
        if (i % 3 === 2) {
          ids.push(noisyIds[i % noisyIds.length]);
          timings.push(5 + Math.floor(i * 25)); // variable timing
        } else {
          ids.push("ef4017");
          timings.push(5);
        }
      }
      const matches = ids.filter(id => id === ids[0]).length;
      return {
        stable: false,
        reads: READ_COUNT,
        matches,
        jedecId: ids[0],
        error: `Unstable: ${matches}/${READ_COUNT} consistent — reseat SOIC clip`,
        timings,
        statusRegister: 0x00,
      };
    }

    // 'stable' mode (default)
    return {
      stable: true,
      reads: READ_COUNT,
      matches: READ_COUNT,
      jedecId: "ef4017",
      timings: Array(READ_COUNT).fill(5),
      statusRegister: 0x00,
    };
  }

  async resetChip(): Promise<void> {}

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async readStatusRegisters(): Promise<{ sr1: number; sr2: number; sr3: number }> {
    return { sr1: this.writeProtected ? 0x1c : 0x00, sr2: 0x00, sr3: 0x00 };
  }

  async readJedecId(): Promise<{ manufacturer: number; memoryType: number; capacity: number; raw: string }> {
    return { ...MOCK_JEDEC, raw: "ef4017" };
  }

  async identifyChip(): Promise<ChipInfo | null> {
    const jedecHex = "ef4017";
    const db = lookupChipByJedecId(jedecHex);
    if (db) {
      return {
        name: db.name,
        vendorName: db.vendor,
        jedecId: jedecHex,
        sizeBytes: db.sizeBytes,
        sizeHuman: formatSize(db.sizeBytes),
        type: "spi",
        pageSize: db.pageSize,
        sectorSize: db.sectorSize ?? 4096,
        blockSize: db.blockSize ?? 65536,
        writeProtected: this.writeProtected,
      };
    }
    return {
      name: "W25Q64",
      vendorName: "Winbond",
      jedecId: jedecHex,
      sizeBytes: MOCK_SIZE,
      sizeHuman: "8 MB",
      type: "spi",
      pageSize: 256,
      sectorSize: 4096,
      blockSize: 65536,
      writeProtected: this.writeProtected,
    };
  }

  async readSFDP(): Promise<SFDPInfo | null> {
    return {
      densityBits: this.flash.length * 8,
      densityBytes: this.flash.length,
      pageSize: 256,
      sectorSize4KB: true,
      blockSize32KB: true,
      blockSize64KB: true,
      supports4ByteAddr: false,
      fastReadSupported: true,
      rawHeader: "53464450000101ff",
    };
  }

  async readChip(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    const start = Date.now();
    const total = this.flash.length;

    if (onProgress) {
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const bytes = Math.floor((total / steps) * i);
        onProgress(Math.round((i / steps) * 100), bytes, total, total / 2, (steps - i) * 0.01);
      }
    }

    await writeFile(outputPath, this.flash);
    const checksum = createHash("sha256").update(this.flash).digest("hex");

    const allFF = this.flash.every(b => b === 0xff);
    const allZero = this.flash.every(b => b === 0x00);

    return {
      success: true,
      filePath: outputPath,
      sizeBytes: total,
      durationMs: Date.now() - start,
      checksum,
      allFF,
      allZero,
    };
  }

  async readChipDoubleVerify(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    return this.readChip(outputPath, onProgress);
  }

  async writeChip(
    inputPath: string,
    onProgress?: ProgressCallback,
    opts?: { skipBackup?: boolean; skipVerify?: boolean },
  ): Promise<WriteResult> {
    const start = Date.now();

    if (!existsSync(inputPath)) {
      return { success: false, backupPath: null, verified: false, durationMs: 0, error: `File not found: ${inputPath}` };
    }

    const firmware = await readFile(inputPath);
    let backupPath: string | null = null;

    if (!opts?.skipBackup) {
      backupPath = join(tmpdir(), `biospy-backup-mock-${Date.now()}.bin`);
      await writeFile(backupPath, this.flash);
    }

    firmware.copy(this.flash, 0, 0, Math.min(firmware.length, this.flash.length));

    if (onProgress) {
      onProgress(100, firmware.length, firmware.length, firmware.length, 0);
    }

    const verified = !opts?.skipVerify;

    return {
      success: true,
      backupPath,
      verified,
      durationMs: Date.now() - start,
    };
  }

  async eraseChip(): Promise<EraseResult> {
    const start = Date.now();
    this.flash.fill(0xff);
    return { success: true, durationMs: Date.now() - start };
  }

  async sectorErase(address: number): Promise<EraseResult> {
    const start = Date.now();
    const sectorSize = 4096;
    const aligned = address & ~(sectorSize - 1);
    this.flash.fill(0xff, aligned, Math.min(aligned + sectorSize, this.flash.length));
    return { success: true, durationMs: Date.now() - start };
  }

  async blockErase(address: number): Promise<EraseResult> {
    const start = Date.now();
    const blockSize = 65536;
    const aligned = address & ~(blockSize - 1);
    this.flash.fill(0xff, aligned, Math.min(aligned + blockSize, this.flash.length));
    return { success: true, durationMs: Date.now() - start };
  }

  async regionErase(startAddr: number, length: number): Promise<EraseResult> {
    const start = Date.now();
    const end = Math.min(startAddr + length, this.flash.length);
    this.flash.fill(0xff, startAddr, end);
    return { success: true, durationMs: Date.now() - start };
  }

  async verifyChip(filePath: string): Promise<VerifyResult> {
    const start = Date.now();
    const fileData = await readFile(filePath);
    const chipChecksum = createHash("sha256").update(this.flash).digest("hex");
    const fileChecksum = createHash("sha256").update(fileData).digest("hex");
    const matches = chipChecksum === fileChecksum;

    return {
      matches,
      filePath,
      chipChecksum,
      fileChecksum,
      durationMs: Date.now() - start,
    };
  }

  async isWriteProtected(): Promise<boolean> {
    return this.writeProtected;
  }

  async disableWriteProtection(): Promise<void> {
    this.writeProtected = false;
  }

  getFlashBuffer(): Buffer {
    return this.flash;
  }
}
