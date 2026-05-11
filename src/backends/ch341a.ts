import { findByIds, type Device, type InEndpoint, type OutEndpoint } from "usb";
import type { ChipInfo, ReadResult, WriteResult, EraseResult, VerifyResult, ProgrammerInfo } from "../types.js";
import { lookupChipByJedecId, formatSize } from "../chips/database.js";
import { wrapUsbError } from "./usb-errors.js";
import { readFile, stat, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CH341A_VID = 0x1a86;
const CH341A_PID = 0x5512;
const CH347_PID = 0x55db;

const CH341A_CMD_SPI_STREAM = 0xa8;
const CH341A_CMD_UIO_STREAM = 0xab;

const CH341A_CMD_UIO_STM_IN  = 0x00;
const CH341A_CMD_UIO_STM_DIR = 0x40;
const CH341A_CMD_UIO_STM_OUT = 0x80;
const CH341A_CMD_UIO_STM_END = 0x20;

const CH341A_STM_I2C_SCL = 0x01;
const CH341A_STM_I2C_SDA = 0x02;
const CH341A_STM_SPI_CS  = 0x01;
const CH341A_STM_SPI_DBG = 0x04;

// SPI flash commands — 3-byte address mode
const SPI_CMD_RDID          = 0x9f;
const SPI_CMD_READ          = 0x03;
const SPI_CMD_FAST_READ     = 0x0b;
const SPI_CMD_WREN          = 0x06;
const SPI_CMD_WRDI          = 0x04;
const SPI_CMD_PAGE_PROGRAM  = 0x02;
const SPI_CMD_SECTOR_ERASE  = 0x20; // 4KB
const SPI_CMD_BLOCK_ERASE_32K = 0x52; // 32KB
const SPI_CMD_BLOCK_ERASE   = 0xd8; // 64KB
const SPI_CMD_CHIP_ERASE    = 0xc7;
const SPI_CMD_RDSR          = 0x05;
const SPI_CMD_RDSR2         = 0x35;
const SPI_CMD_RDSR3         = 0x15;
const SPI_CMD_WRSR          = 0x01;
const SPI_CMD_WRSR2         = 0x31;
const SPI_CMD_WRSR3         = 0x11;
const SPI_CMD_EWSR          = 0x50;
const SPI_CMD_SFDP          = 0x5a;
const SPI_CMD_RELEASE_POWERDOWN = 0xab;
const SPI_CMD_ENABLE_RESET  = 0x66;
const SPI_CMD_RESET         = 0x99;

// 4-byte address mode commands
const SPI_CMD_EN4B          = 0xb7;
const SPI_CMD_EX4B          = 0xe9;
const SPI_CMD_READ_4B       = 0x13;
const SPI_CMD_FAST_READ_4B  = 0x0c;
const SPI_CMD_PAGE_PROGRAM_4B = 0x12;
const SPI_CMD_SECTOR_ERASE_4B = 0x21; // 4KB
const SPI_CMD_BLOCK_ERASE_4B  = 0xdc; // 64KB

const SPI_SR_WIP  = 0x01;
const SPI_SR_WEL  = 0x02;
const SPI_SR_BP0  = 0x04;
const SPI_SR_BP1  = 0x08;
const SPI_SR_BP2  = 0x10;
const SPI_SR_BP3  = 0x20;
const SPI_SR_SRP  = 0x80;

const USB_EP_OUT = 0x02;
const USB_EP_IN  = 0x82;
const CH341A_PACKET_LENGTH = 0x20;
const CH341A_MAX_XFER = 32;

const USB_TIMEOUT = 5000;
const ERASE_TIMEOUT = 120000;
const PAGE_PROGRAM_TIMEOUT = 10000;

const USB_MAX_RETRIES = 3;
const USB_RETRY_DELAYS = [10, 50, 200];

const SIZE_16MB = 16 * 1024 * 1024;

export interface SFDPInfo {
  densityBits: number;
  densityBytes: number;
  pageSize: number;
  sectorSize4KB: boolean;
  blockSize32KB: boolean;
  blockSize64KB: boolean;
  supports4ByteAddr: boolean;
  fastReadSupported: boolean;
  rawHeader: string;
}

export type ProgressCallback = (
  percent: number,
  bytes: number,
  total: number,
  speed?: number,
  eta?: number,
) => void;

export class CH341ABackend {
  private device: Device | null = null;
  private epIn: InEndpoint | null = null;
  private epOut: OutEndpoint | null = null;
  private interfaceClaimed = false;
  private use4ByteAddr = false;
  private usbErrorCount = 0;

  async detectProgrammer(): Promise<ProgrammerInfo> {
    const ch341a = findByIds(CH341A_VID, CH341A_PID);
    if (ch341a) {
      const conn = this.getConnectionInfo(ch341a);
      return {
        type: "ch341a",
        connected: true,
        vendorId: CH341A_VID.toString(16),
        productId: CH341A_PID.toString(16),
        description: "CH341A USB SPI Programmer",
        ...conn,
      };
    }

    const ch347 = findByIds(CH341A_VID, CH347_PID);
    if (ch347) {
      const conn = this.getConnectionInfo(ch347);
      return {
        type: "ch347",
        connected: true,
        vendorId: CH341A_VID.toString(16),
        productId: CH347_PID.toString(16),
        description: "CH347 USB SPI/I2C/JTAG Programmer",
        ...conn,
      };
    }

    return { type: "unknown", connected: false, description: "No CH34x programmer detected" };
  }

  async connectionTest(): Promise<{ stable: boolean; reads: number; matches: number; jedecId: string; error?: string; timings: number[]; statusRegister: number | null }> {
    await this.open();
    try {
      const ids: string[] = [];
      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const t0 = Date.now();
        const rx = await this.spiCommand([SPI_CMD_RDID, 0, 0, 0]);
        timings.push(Date.now() - t0);
        const id = rx.subarray(1, 4).toString("hex");
        ids.push(id);
      }

      const first = ids[0];
      const matches = ids.filter((id) => id === first).length;
      const stable = matches === 10;

      // Attempt status register read (SR1)
      let statusRegister: number | null = null;
      try {
        statusRegister = await this.readStatusRegister();
      } catch {}

      if (first === "000000" || first === "ffffff") {
        return {
          stable: false,
          reads: 10,
          matches,
          jedecId: first,
          error: "No chip responding — check clip/socket connection",
          timings,
          statusRegister,
        };
      }

      return {
        stable,
        reads: 10,
        matches,
        jedecId: first,
        error: stable ? undefined : `Unstable connection: got ${matches}/10 consistent reads — reseat SOIC clip or check ZIF socket`,
        timings,
        statusRegister,
      };
    } catch (err: any) {
      return {
        stable: false,
        reads: 0,
        matches: 0,
        jedecId: "",
        error: err.message,
        timings: [],
        statusRegister: null,
      };
    } finally {
      await this.close();
    }
  }

  async resetChip(): Promise<void> {
    await this.open();
    try {
      // Release Power-Down / Resume from Deep Power-Down
      await this.spiCommand([SPI_CMD_RELEASE_POWERDOWN]);
      await this.delay(100); // tRES1 max ~100us, use 100ms for safety

      // Enable Reset (0x66) + Reset (0x99) sequence
      await this.spiCommand([SPI_CMD_ENABLE_RESET]);
      await this.delay(1); // tCREH: must issue Reset within 100us of Enable Reset
      await this.spiCommand([SPI_CMD_RESET]);
      await this.delay(100); // tRST: chip needs time to reset (~30us typical, 100ms for safety)
    } finally {
      await this.close();
    }
  }

  private getConnectionInfo(dev: Device): { bus?: number; address?: number; portPath?: string; viaHub?: boolean } {
    const info: { bus?: number; address?: number; portPath?: string; viaHub?: boolean } = {};
    try {
      info.bus = dev.busNumber;
      info.address = dev.deviceAddress;
      if (dev.portNumbers && dev.portNumbers.length > 0) {
        info.portPath = dev.portNumbers.join(".");
        info.viaHub = dev.portNumbers.length > 1;
      }
    } catch {}
    return info;
  }

  async open(): Promise<void> {
    if (this.device) return;

    const dev = findByIds(CH341A_VID, CH341A_PID);
    if (!dev) throw new Error("CH341A not found. Check USB connection.");

    dev.open();
    this.device = dev;

    try {
      const iface = dev.interface(0);
      if (!iface) throw new Error("CH341A interface 0 not found");

      try {
        if (iface.isKernelDriverActive()) {
          iface.detachKernelDriver();
        }
      } catch {}
      iface.claim();
      this.interfaceClaimed = true;

      for (const ep of iface.endpoints) {
        if (ep.direction === "in" && ep.address === USB_EP_IN) {
          this.epIn = ep as InEndpoint;
        } else if (ep.direction === "out" && ep.address === USB_EP_OUT) {
          this.epOut = ep as OutEndpoint;
        }
      }

      if (!this.epIn || !this.epOut) {
        throw new Error("CH341A bulk endpoints not found");
      }

      await this.enableSpiMode();

      const chip = await this.identifyChipInternal();
      if (chip && chip.sizeBytes > SIZE_16MB) {
        await this.enter4ByteMode();
      }
    } catch (err) {
      await this.close();
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.device) {
      if (this.use4ByteAddr) {
        try {
          await this.exit4ByteMode();
        } catch {}
      }
      if (this.interfaceClaimed) {
        try {
          this.device.interface(0).release();
        } catch {}
        this.interfaceClaimed = false;
      }
      try {
        this.device.close();
      } catch {}
      this.device = null;
      this.epIn = null;
      this.epOut = null;
      this.use4ByteAddr = false;
    }
  }

  private async enableSpiMode(): Promise<void> {
    const cmd = Buffer.from([
      CH341A_CMD_UIO_STREAM,
      CH341A_CMD_UIO_STM_OUT | CH341A_STM_SPI_CS,
      CH341A_CMD_UIO_STM_DIR | (CH341A_STM_SPI_CS | CH341A_STM_SPI_DBG),
      CH341A_CMD_UIO_STM_END,
    ]);
    await this.bulkWrite(cmd);
  }

  private async enter4ByteMode(): Promise<void> {
    await this.spiCommand([SPI_CMD_EN4B]);
    this.use4ByteAddr = true;
  }

  private async exit4ByteMode(): Promise<void> {
    await this.spiCommand([SPI_CMD_EX4B]);
    this.use4ByteAddr = false;
  }

  private async csAssert(): Promise<void> {
    const cmd = Buffer.from([
      CH341A_CMD_UIO_STREAM,
      CH341A_CMD_UIO_STM_OUT | 0,
      CH341A_CMD_UIO_STM_END,
    ]);
    await this.bulkWrite(cmd);
  }

  private async csDeassert(): Promise<void> {
    const cmd = Buffer.from([
      CH341A_CMD_UIO_STREAM,
      CH341A_CMD_UIO_STM_OUT | CH341A_STM_SPI_CS,
      CH341A_CMD_UIO_STM_END,
    ]);
    await this.bulkWrite(cmd);
  }

  private async spiTransfer(txData: Buffer): Promise<Buffer> {
    const maxPayload = CH341A_MAX_XFER - 1; // 31 bytes SPI data per USB packet
    const result = Buffer.alloc(txData.length);
    let offset = 0;

    while (offset < txData.length) {
      const chunkLen = Math.min(maxPayload, txData.length - offset);
      const packet = Buffer.alloc(chunkLen + 1);
      packet[0] = CH341A_CMD_SPI_STREAM;
      txData.copy(packet, 1, offset, offset + chunkLen);

      await this.bulkWriteRetry(packet);
      const rx = await this.bulkReadRetry(chunkLen);
      rx.copy(result, offset, 0, chunkLen);
      offset += chunkLen;
    }

    return result;
  }

  private async spiCommand(cmd: number[]): Promise<Buffer> {
    await this.csAssert();
    try {
      const tx = Buffer.from(cmd);
      const rx = await this.spiTransfer(tx);
      return rx;
    } finally {
      await this.csDeassert();
    }
  }

  private async bulkWrite(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.epOut) return reject(new Error("No OUT endpoint"));
      this.epOut.transfer(data, (err) => {
        if (err) reject(new Error(`USB write failed: ${err.message}`));
        else resolve();
      });
    });
  }

  private async bulkRead(length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.epIn) return reject(new Error("No IN endpoint"));
      this.epIn.transfer(length, (err, data) => {
        if (err) reject(new Error(`USB read failed: ${err.message}`));
        else resolve(data || Buffer.alloc(0));
      });
    });
  }

  private async bulkWriteRetry(data: Buffer): Promise<void> {
    for (let attempt = 0; attempt < USB_MAX_RETRIES; attempt++) {
      try {
        await this.bulkWrite(data);
        return;
      } catch (err: any) {
        this.usbErrorCount++;
        if (attempt === USB_MAX_RETRIES - 1) throw wrapUsbError(err);
        await this.delay(USB_RETRY_DELAYS[attempt]);
      }
    }
  }

  private async bulkReadRetry(length: number): Promise<Buffer> {
    for (let attempt = 0; attempt < USB_MAX_RETRIES; attempt++) {
      try {
        return await this.bulkRead(length);
      } catch (err: any) {
        this.usbErrorCount++;
        if (attempt === USB_MAX_RETRIES - 1) throw wrapUsbError(err);
        await this.delay(USB_RETRY_DELAYS[attempt]);
      }
    }
    throw new Error("USB read exhausted retries");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private addressBytes(addr: number): number[] {
    if (this.use4ByteAddr) {
      return [
        (addr >> 24) & 0xff,
        (addr >> 16) & 0xff,
        (addr >> 8) & 0xff,
        addr & 0xff,
      ];
    }
    return [
      (addr >> 16) & 0xff,
      (addr >> 8) & 0xff,
      addr & 0xff,
    ];
  }

  private get addrLen(): number {
    return this.use4ByteAddr ? 4 : 3;
  }

  // --- Status registers ---

  private async readStatusRegister(): Promise<number> {
    const rx = await this.spiCommand([SPI_CMD_RDSR, 0]);
    return rx[1];
  }

  private async readStatusRegister2(): Promise<number> {
    const rx = await this.spiCommand([SPI_CMD_RDSR2, 0]);
    return rx[1];
  }

  private async readStatusRegister3(): Promise<number> {
    const rx = await this.spiCommand([SPI_CMD_RDSR3, 0]);
    return rx[1];
  }

  private async writeEnable(): Promise<void> {
    await this.spiCommand([SPI_CMD_WREN]);
  }

  private async waitUntilReady(timeoutMs: number = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const sr = await this.readStatusRegister();
      if (!(sr & SPI_SR_WIP)) return;
      await this.delay(5);
    }
    throw new Error("Chip busy timeout — WIP bit stuck");
  }

  // --- Write protection clearing for various vendors ---

  private async disableWriteProtectionInternal(): Promise<void> {
    const sr1 = await this.readStatusRegister();
    const bpBits = sr1 & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3);

    if (!bpBits) return;

    // Try volatile status register write first (Winbond, GigaDevice, etc.)
    await this.spiCommand([SPI_CMD_EWSR]);
    await this.spiCommand([SPI_CMD_WRSR, 0x00]);
    await this.waitUntilReady();

    const check = await this.readStatusRegister();
    if (!(check & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3))) return;

    // SR1 non-volatile with WREN (Macronix, Spansion, ISSI)
    await this.writeEnable();
    await this.spiCommand([SPI_CMD_WRSR, 0x00]);
    await this.waitUntilReady();

    const check2 = await this.readStatusRegister();
    if (!(check2 & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3))) return;

    // Some chips require clearing SR2 as well (Winbond W25Qxx with CMP bit)
    try {
      const sr2 = await this.readStatusRegister2();
      if (sr2 & 0x40) { // CMP bit
        await this.writeEnable();
        await this.spiCommand([SPI_CMD_WRSR2, 0x00]);
        await this.waitUntilReady();
      }
    } catch {}

    // Final attempt: write both SR1+SR2 in one WRSR (some older chips)
    try {
      await this.writeEnable();
      await this.spiCommand([SPI_CMD_WRSR, 0x00, 0x00]);
      await this.waitUntilReady();
    } catch {}
  }

  // --- Public status register access ---

  async readStatusRegisters(): Promise<{ sr1: number; sr2: number; sr3: number }> {
    await this.open();
    try {
      const sr1 = await this.readStatusRegister();
      const sr2 = await this.readStatusRegister2();
      const sr3 = await this.readStatusRegister3();
      return { sr1, sr2, sr3 };
    } finally {
      await this.close();
    }
  }

  // --- JEDEC ID ---

  async readJedecId(): Promise<{ manufacturer: number; memoryType: number; capacity: number; raw: string }> {
    await this.open();
    try {
      const rx = await this.spiCommand([SPI_CMD_RDID, 0, 0, 0]);
      return {
        manufacturer: rx[1],
        memoryType: rx[2],
        capacity: rx[3],
        raw: rx.subarray(1, 4).toString("hex"),
      };
    } finally {
      await this.close();
    }
  }

  async identifyChip(): Promise<ChipInfo | null> {
    const id = await this.readJedecId();
    if (id.manufacturer === 0 || id.manufacturer === 0xff) return null;

    const dbEntry = lookupChipByJedecId(id.raw);
    const sizeBytes = dbEntry?.sizeBytes || (id.capacity <= 30 ? (1 << id.capacity) : 2 ** id.capacity);

    return {
      name: dbEntry?.name || `Unknown (${id.raw})`,
      vendorName: dbEntry?.vendor || `0x${id.manufacturer.toString(16)}`,
      jedecId: id.raw,
      sizeBytes,
      sizeHuman: formatSize(sizeBytes),
      type: "spi",
      pageSize: dbEntry?.pageSize || 256,
      sectorSize: dbEntry?.sectorSize || 4096,
      blockSize: dbEntry?.blockSize || 65536,
      voltage: dbEntry?.voltage,
    };
  }

  private async identifyChipInternal(): Promise<ChipInfo | null> {
    const rx = await this.spiCommand([SPI_CMD_RDID, 0, 0, 0]);
    const manufacturer = rx[1];
    const memoryType = rx[2];
    const capacity = rx[3];

    if (manufacturer === 0 || manufacturer === 0xff) return null;

    const raw = rx.subarray(1, 4).toString("hex");
    const dbEntry = lookupChipByJedecId(raw);
    const sizeBytes = dbEntry?.sizeBytes || (capacity <= 30 ? (1 << capacity) : 2 ** capacity);

    return {
      name: dbEntry?.name || `Unknown (${raw})`,
      vendorName: dbEntry?.vendor || `0x${manufacturer.toString(16)}`,
      jedecId: raw,
      sizeBytes,
      sizeHuman: formatSize(sizeBytes),
      type: "spi",
      pageSize: dbEntry?.pageSize || 256,
      sectorSize: dbEntry?.sectorSize || 4096,
      blockSize: dbEntry?.blockSize || 65536,
    };
  }

  // --- SFDP (JEDEC JESD216) ---

  async readSFDP(): Promise<SFDPInfo | null> {
    await this.open();
    try {
      return await this.readSFDPInternal();
    } finally {
      await this.close();
    }
  }

  private async readSFDPInternal(): Promise<SFDPInfo | null> {
    // SFDP header: cmd 0x5A + 3 address bytes (0x000000) + 1 dummy + 8 bytes header
    const headerRx = await this.spiCommand([
      SPI_CMD_SFDP, 0x00, 0x00, 0x00,
      0x00, // dummy byte
      ...new Array(8).fill(0),
    ]);

    const hdr = headerRx.subarray(5, 13);

    // Signature check: "SFDP" = 0x53 0x46 0x44 0x50
    if (hdr[0] !== 0x53 || hdr[1] !== 0x46 || hdr[2] !== 0x44 || hdr[3] !== 0x50) {
      return null;
    }

    const nph = (hdr[6] & 0xff) + 1; // number of parameter headers
    if (nph < 1) return null;

    // Read first parameter header (8 bytes at offset 0x08)
    const phRx = await this.spiCommand([
      SPI_CMD_SFDP, 0x00, 0x00, 0x08,
      0x00, // dummy
      ...new Array(8).fill(0),
    ]);

    const ph = phRx.subarray(5, 13);
    const pTableLen = ph[3]; // length in DWORDs
    const pTableAddr = ph[4] | (ph[5] << 8) | (ph[6] << 16);

    const dwordsToRead = Math.min(pTableLen, 20);
    const bytesToRead = dwordsToRead * 4;

    const ptRx = await this.spiCommand([
      SPI_CMD_SFDP,
      (pTableAddr >> 16) & 0xff,
      (pTableAddr >> 8) & 0xff,
      pTableAddr & 0xff,
      0x00, // dummy
      ...new Array(bytesToRead).fill(0),
    ]);

    const pt = ptRx.subarray(5, 5 + bytesToRead);
    if (pt.length < 16) return null;

    // DWORD 1 (bytes 0-3): erase sizes and fast read support
    const dw1 = pt.readUInt32LE(0);
    const sectorSize4KB = !!(dw1 & (1 << 1));
    const fastReadSupported = !(dw1 & (1 << 2)); // bit 2=0 means fast read supported

    // DWORD 2 (bytes 4-7): density
    const dw2 = pt.readUInt32LE(4);
    let densityBits: number;
    if (dw2 & (1 << 31)) {
      // bit 31 set: density is 2^N bits, N in bits 30:0
      const n = dw2 & 0x7fffffff;
      densityBits = Math.pow(2, n);
    } else {
      densityBits = dw2 + 1;
    }
    const densityBytes = Math.floor(densityBits / 8);

    const supports4ByteAddr = densityBytes > SIZE_16MB;

    // Page size from DWORD 11 (bytes 40-43) if available
    let pageSize = 256;
    if (pt.length >= 44) {
      const dw11 = pt.readUInt32LE(40);
      const pageSizeBits = (dw11 >> 4) & 0x0f;
      if (pageSizeBits > 0) {
        pageSize = 1 << pageSizeBits;
      }
    }

    // DWORD 8-9 (bytes 28-35): erase type sizes
    let blockSize32KB = false;
    let blockSize64KB = false;
    if (pt.length >= 36) {
      for (let i = 0; i < 4; i++) {
        const typeByte = pt[28 + i * 2];
        const sizeExp = typeByte;
        if (sizeExp === 15) blockSize32KB = true; // 2^15 = 32KB
        if (sizeExp === 16) blockSize64KB = true; // 2^16 = 64KB
      }
    }

    return {
      densityBits,
      densityBytes,
      pageSize,
      sectorSize4KB,
      blockSize32KB,
      blockSize64KB,
      supports4ByteAddr,
      fastReadSupported,
      rawHeader: hdr.toString("hex"),
    };
  }

  // --- Read operations ---

  async readChip(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    const start = Date.now();
    await this.open();

    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: "No chip detected" };
      }

      const readBuf = await this.readChipData(chip, onProgress, start);
      const checksum = createHash("sha256").update(readBuf).digest("hex");
      await writeFile(outputPath, readBuf);

      const allFF = readBuf.every((b) => b === 0xff);
      const allZero = readBuf.every((b) => b === 0x00);

      return {
        success: true,
        filePath: outputPath,
        sizeBytes: chip.sizeBytes,
        durationMs: Date.now() - start,
        checksum,
        allFF,
        allZero,
      };
    } catch (err: any) {
      return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: err.message };
    } finally {
      await this.close();
    }
  }

  async readChipDoubleVerify(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    const start = Date.now();
    await this.open();

    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: "No chip detected" };
      }

      const totalBytes = chip.sizeBytes;
      const wrapProgress = (passNum: number, passes: number) => {
        if (!onProgress) return undefined;
        return (pct: number, bytes: number, total: number, spd?: number) => {
          const overallPct = Math.round(((passNum - 1) / passes * 100) + (pct / passes));
          onProgress(overallPct, bytes + (passNum - 1) * total, total * passes, spd);
        };
      };

      const read1 = await this.readChipData(chip, wrapProgress(1, 2), start);
      const read2 = await this.readChipData(chip, wrapProgress(2, 2), start);

      let finalBuf: Buffer;
      let mismatches = 0;

      if (read1.equals(read2)) {
        finalBuf = read1;
      } else {
        for (let i = 0; i < totalBytes; i++) {
          if (read1[i] !== read2[i]) mismatches++;
        }

        const read3 = await this.readChipData(chip, undefined, start);
        finalBuf = Buffer.alloc(totalBytes);

        for (let i = 0; i < totalBytes; i++) {
          if (read1[i] === read2[i]) {
            finalBuf[i] = read1[i];
          } else if (read1[i] === read3[i]) {
            finalBuf[i] = read1[i];
          } else if (read2[i] === read3[i]) {
            finalBuf[i] = read2[i];
          } else {
            // No consensus — use read3 (most recent)
            finalBuf[i] = read3[i];
          }
        }
      }

      const checksum = createHash("sha256").update(finalBuf).digest("hex");
      await writeFile(outputPath, finalBuf);

      const allFF = finalBuf.every((b) => b === 0xff);
      const allZero = finalBuf.every((b) => b === 0x00);

      const result: ReadResult = {
        success: true,
        filePath: outputPath,
        sizeBytes: totalBytes,
        durationMs: Date.now() - start,
        checksum,
        allFF,
        allZero,
      };

      if (mismatches > 0) {
        result.error = `Warning: ${mismatches} byte mismatches between reads, resolved via 2-of-3 voting`;
      }

      return result;
    } catch (err: any) {
      return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: err.message };
    } finally {
      await this.close();
    }
  }

  private async readChipData(
    chip: ChipInfo,
    onProgress: ProgressCallback | undefined,
    opStart: number,
  ): Promise<Buffer> {
    const totalBytes = chip.sizeBytes;
    const readBuf = Buffer.alloc(totalBytes);
    const pageSize = 256;
    let offset = 0;
    let speedTracker = { startTime: Date.now(), bytes: 0 };

    while (offset < totalBytes) {
      const chunkSize = Math.min(pageSize, totalBytes - offset);
      const addr = this.addressBytes(offset);

      // Fast Read: cmd + addr + 1 dummy byte + data
      const readCmd = this.use4ByteAddr ? SPI_CMD_FAST_READ_4B : SPI_CMD_FAST_READ;
      const dummyAndData = new Array(1 + chunkSize).fill(0); // 1 dummy + chunkSize data
      const rx = await this.spiCommand([readCmd, ...addr, ...dummyAndData]);

      // Response: cmd echo + addr echo + dummy echo + data
      const dataOffset = 1 + this.addrLen + 1;
      rx.copy(readBuf, offset, dataOffset, dataOffset + chunkSize);
      offset += chunkSize;

      speedTracker.bytes += chunkSize;
      if (onProgress && offset % (64 * 1024) === 0) {
        const elapsed = (Date.now() - speedTracker.startTime) / 1000;
        const speed = elapsed > 0 ? speedTracker.bytes / elapsed : 0;
        const remaining = totalBytes - offset;
        const eta = speed > 0 ? remaining / speed : 0;
        onProgress(Math.round((offset / totalBytes) * 100), offset, totalBytes, speed, eta);
      }
    }

    return readBuf;
  }

  // --- Write operations ---

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
    await this.open();

    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, backupPath: null, verified: false, durationMs: Date.now() - start, error: "No chip detected" };
      }

      if (firmware.length > chip.sizeBytes) {
        return {
          success: false, backupPath: null, verified: false, durationMs: Date.now() - start,
          error: `File (${formatSize(firmware.length)}) exceeds chip capacity (${formatSize(chip.sizeBytes)})`,
        };
      }

      let backupPath: string | null = null;
      if (!opts?.skipBackup) {
        backupPath = `${inputPath}.backup.${Date.now()}.bin`;
        const backupResult = await this.readChipInternal(backupPath);
        if (!backupResult.success) {
          return { success: false, backupPath: null, verified: false, durationMs: Date.now() - start, error: `Backup failed: ${backupResult.error}` };
        }
      }

      const sr = await this.readStatusRegister();
      if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3)) {
        await this.disableWriteProtectionInternal();
      }

      await this.writeEnable();
      await this.spiCommand([SPI_CMD_CHIP_ERASE]);
      await this.waitUntilReady(ERASE_TIMEOUT);

      const pageSize = chip.pageSize || 256;
      let offset = 0;
      let pagesSkipped = 0;
      let speedTracker = { startTime: Date.now(), bytes: 0 };

      const programCmd = this.use4ByteAddr ? SPI_CMD_PAGE_PROGRAM_4B : SPI_CMD_PAGE_PROGRAM;

      while (offset < firmware.length) {
        const chunkSize = Math.min(pageSize, firmware.length - offset);
        const pageData = firmware.subarray(offset, offset + chunkSize);

        // Skip pages that are all 0xFF (already erased)
        if (pageData.every((b) => b === 0xff)) {
          pagesSkipped++;
          offset += chunkSize;
          speedTracker.bytes += chunkSize;
          if (onProgress && offset % (64 * 1024) === 0) {
            const elapsed = (Date.now() - speedTracker.startTime) / 1000;
            const speed = elapsed > 0 ? speedTracker.bytes / elapsed : 0;
            const remaining = firmware.length - offset;
            const eta = speed > 0 ? remaining / speed : 0;
            onProgress(Math.round((offset / firmware.length) * 100), offset, firmware.length, speed, eta);
          }
          continue;
        }

        const addr = this.addressBytes(offset);

        await this.writeEnable();
        await this.spiCommand([programCmd, ...addr, ...pageData]);
        await this.waitUntilReady(PAGE_PROGRAM_TIMEOUT);

        offset += chunkSize;
        speedTracker.bytes += chunkSize;

        if (onProgress && offset % (64 * 1024) === 0) {
          const elapsed = (Date.now() - speedTracker.startTime) / 1000;
          const speed = elapsed > 0 ? speedTracker.bytes / elapsed : 0;
          const remaining = firmware.length - offset;
          const eta = speed > 0 ? remaining / speed : 0;
          onProgress(Math.round((offset / firmware.length) * 100), offset, firmware.length, speed, eta);
        }
      }

      let verified = false;
      if (!opts?.skipVerify) {
        const verifyPath = join(tmpdir(), `bios_verify_${Date.now()}.bin`);
        try {
          const verifyResult = await this.readChipInternal(verifyPath);
          if (verifyResult.success) {
            const verifyData = await readFile(verifyPath);
            verified = firmware.equals(verifyData.subarray(0, firmware.length));
          }
        } finally {
          try { await unlink(verifyPath); } catch {}
        }
      }

      return {
        success: true,
        backupPath,
        verified,
        durationMs: Date.now() - start,
        error: !opts?.skipVerify && !verified ? "Write succeeded but verification failed — chip contents may differ" : undefined,
      };
    } catch (err: any) {
      return { success: false, backupPath: null, verified: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }

  // --- Erase operations ---

  async eraseChip(): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const sr = await this.readStatusRegister();
      if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3)) {
        await this.disableWriteProtectionInternal();
      }

      await this.writeEnable();
      await this.spiCommand([SPI_CMD_CHIP_ERASE]);
      await this.waitUntilReady(ERASE_TIMEOUT);

      return { success: true, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }

  async sectorErase(address: number): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const aligned = address & ~0xfff; // 4KB aligned
      await this.eraseBlock(aligned, "sector");
      return { success: true, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }

  async blockErase(address: number): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const aligned = address & ~0xffff; // 64KB aligned
      await this.eraseBlock(aligned, "block64");
      return { success: true, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }

  async regionErase(startAddr: number, length: number): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const sr = await this.readStatusRegister();
      if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3)) {
        await this.disableWriteProtectionInternal();
      }

      let offset = startAddr;
      const end = startAddr + length;

      while (offset < end) {
        const remaining = end - offset;

        // Smart erase: pick largest aligned erase that fits
        if (remaining >= 65536 && (offset & 0xffff) === 0) {
          await this.eraseBlock(offset, "block64");
          offset += 65536;
        } else if (remaining >= 32768 && (offset & 0x7fff) === 0) {
          await this.eraseBlock(offset, "block32");
          offset += 32768;
        } else {
          const aligned = offset & ~0xfff;
          await this.eraseBlock(aligned, "sector");
          offset = aligned + 4096;
        }
      }

      return { success: true, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }

  private async eraseBlock(address: number, type: "sector" | "block32" | "block64"): Promise<void> {
    const addr = this.addressBytes(address);
    let cmd: number;

    if (type === "sector") {
      cmd = this.use4ByteAddr ? SPI_CMD_SECTOR_ERASE_4B : SPI_CMD_SECTOR_ERASE;
    } else if (type === "block32") {
      cmd = SPI_CMD_BLOCK_ERASE_32K; // no 4-byte variant in standard command set
    } else {
      cmd = this.use4ByteAddr ? SPI_CMD_BLOCK_ERASE_4B : SPI_CMD_BLOCK_ERASE;
    }

    await this.writeEnable();
    await this.spiCommand([cmd, ...addr]);
    await this.waitUntilReady(ERASE_TIMEOUT);
  }

  // --- Verify ---

  async verifyChip(filePath: string): Promise<VerifyResult> {
    const start = Date.now();

    if (!existsSync(filePath)) {
      return { matches: false, filePath, chipChecksum: "", fileChecksum: "", durationMs: 0, error: `File not found: ${filePath}` };
    }

    const fileData = await readFile(filePath);
    const fileChecksum = createHash("sha256").update(fileData).digest("hex");

    const tmpPath = join(tmpdir(), `bios_verify_${Date.now()}.bin`);
    try {
      const readResult = await this.readChip(tmpPath);

      if (!readResult.success) {
        return { matches: false, filePath, chipChecksum: "", fileChecksum, durationMs: Date.now() - start, error: readResult.error };
      }

      const chipData = await readFile(tmpPath);
      const matches = fileData.equals(chipData.subarray(0, fileData.length));

      return {
        matches,
        filePath,
        chipChecksum: readResult.checksum,
        fileChecksum,
        durationMs: Date.now() - start,
      };
    } finally {
      try { await unlink(tmpPath); } catch {}
    }
  }

  // --- Write protection ---

  async isWriteProtected(): Promise<boolean> {
    await this.open();
    try {
      const sr = await this.readStatusRegister();
      return (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2 | SPI_SR_BP3)) !== 0;
    } finally {
      await this.close();
    }
  }

  async disableWriteProtection(): Promise<void> {
    await this.open();
    try {
      await this.disableWriteProtectionInternal();
    } finally {
      await this.close();
    }
  }

  // --- Internal read used within already-open sessions ---

  private async readChipInternal(outputPath: string): Promise<ReadResult> {
    const start = Date.now();
    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: "No chip" };
      }

      const readBuf = await this.readChipData(chip, undefined, start);
      const checksum = createHash("sha256").update(readBuf).digest("hex");
      await writeFile(outputPath, readBuf);

      const allFF = readBuf.every((b) => b === 0xff);
      const allZero = readBuf.every((b) => b === 0x00);

      return { success: true, filePath: outputPath, sizeBytes: chip.sizeBytes, durationMs: Date.now() - start, checksum, allFF, allZero };
    } catch (err: any) {
      return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: err.message };
    }
  }
}
