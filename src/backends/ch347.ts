import { findByIds, type Device, type InEndpoint, type OutEndpoint } from "usb";
import type { ChipInfo, ReadResult, WriteResult, EraseResult, VerifyResult, ProgrammerInfo } from "../types.js";
import { lookupChipByJedecId, formatSize } from "../chips/database.js";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// CH347 USB identifiers (same vendor as CH341A)
const CH347_VID = 0x1a86;
const CH347_PID = 0x55db;

// CH347 SPI USB protocol
const CH347_SPI_INTERFACE = 2;
const CH347_EP_OUT = 0x06;
const CH347_EP_IN  = 0x86;

// CH347 SPI commands
const CH347_CMD_SPI_CONFIG  = 0xc0;
const CH347_CMD_SPI_CS_XFER = 0xc1;

// SPI config packet length (not counting command byte + 2-byte length header)
const CH347_SPI_CONFIG_LEN = 26;

// Max SPI payload per CS+Transfer packet
const CH347_MAX_SPI_PAYLOAD = 510;

// Clock divisor mapping
const CH347_CLOCK_DIVISORS: Record<number, string> = {
  0: "60 MHz",
  1: "30 MHz",
  2: "15 MHz",
  3: "7.5 MHz",
  4: "3.75 MHz",
  5: "1.875 MHz",
  6: "937.5 KHz",
  7: "468.75 KHz",
};

// SPI Flash commands (JEDEC standard)
const SPI_CMD_RDID          = 0x9f;
const SPI_CMD_READ          = 0x03;
const SPI_CMD_FAST_READ     = 0x0b;
const SPI_CMD_WREN          = 0x06;
const SPI_CMD_WRDI          = 0x04;
const SPI_CMD_PAGE_PROGRAM  = 0x02;
const SPI_CMD_SECTOR_ERASE  = 0x20; // 4KB
const SPI_CMD_BLOCK_ERASE   = 0xd8; // 64KB
const SPI_CMD_CHIP_ERASE    = 0xc7;
const SPI_CMD_RDSR          = 0x05;
const SPI_CMD_RDSR2         = 0x35;
const SPI_CMD_WRSR          = 0x01;
const SPI_CMD_EWSR          = 0x50;

// 4-byte address mode commands
const SPI_CMD_ENTER_4BYTE   = 0xb7;
const SPI_CMD_EXIT_4BYTE    = 0xe9;
const SPI_CMD_READ_4BYTE    = 0x13;
const SPI_CMD_FAST_READ_4BYTE = 0x0c;
const SPI_CMD_PAGE_PROGRAM_4BYTE = 0x12;
const SPI_CMD_SECTOR_ERASE_4BYTE = 0x21;
const SPI_CMD_BLOCK_ERASE_4BYTE  = 0xdc;

// SPI Status Register bits
const SPI_SR_WIP  = 0x01; // Write In Progress
const SPI_SR_WEL  = 0x02; // Write Enable Latch
const SPI_SR_BP0  = 0x04;
const SPI_SR_BP1  = 0x08;
const SPI_SR_BP2  = 0x10;
const SPI_SR_SRP  = 0x80;

// Timeouts
const USB_TIMEOUT = 5000;
const ERASE_TIMEOUT = 120000;
const PAGE_PROGRAM_TIMEOUT = 10000;

// Retry config: exponential backoff
const USB_RETRY_COUNT = 3;
const USB_RETRY_DELAYS = [10, 50, 200];

// 16MB threshold for 4-byte addressing
const ADDR_4BYTE_THRESHOLD = 16 * 1024 * 1024;

type ProgressCallback = (percent: number, bytes: number, total: number, speed?: number, eta?: number) => void;

export class CH347Backend {
  private device: Device | null = null;
  private epIn: InEndpoint | null = null;
  private epOut: OutEndpoint | null = null;
  private interfaceClaimed = false;
  private use4ByteAddr = false;
  private clockDivisor = 3; // default 7.5 MHz

  // --- USB transport with retry ---

  private async bulkWrite(data: Buffer): Promise<void> {
    if (!this.epOut) throw new Error("No OUT endpoint");

    for (let attempt = 0; attempt <= USB_RETRY_COUNT; attempt++) {
      try {
        return await new Promise<void>((resolve, reject) => {
          this.epOut!.transfer(data, (err) => {
            if (err) reject(new Error(`USB write failed: ${err.message}`));
            else resolve();
          });
        });
      } catch (err) {
        if (attempt < USB_RETRY_COUNT) {
          await this.sleep(USB_RETRY_DELAYS[attempt]);
          continue;
        }
        throw err;
      }
    }
  }

  private async bulkRead(length: number): Promise<Buffer> {
    if (!this.epIn) throw new Error("No IN endpoint");

    for (let attempt = 0; attempt <= USB_RETRY_COUNT; attempt++) {
      try {
        return await new Promise<Buffer>((resolve, reject) => {
          this.epIn!.transfer(length, (err, data) => {
            if (err) reject(new Error(`USB read failed: ${err.message}`));
            else resolve(data || Buffer.alloc(0));
          });
        });
      } catch (err) {
        if (attempt < USB_RETRY_COUNT) {
          await this.sleep(USB_RETRY_DELAYS[attempt]);
          continue;
        }
        throw err;
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error("USB read failed after retries");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- CH347 SPI protocol ---

  /**
   * Build and send SPI config packet.
   * Sets SPI mode 0, MSB first, CS0 active low, and the selected clock divisor.
   */
  private async sendSpiConfig(): Promise<void> {
    const pkt = Buffer.alloc(3 + CH347_SPI_CONFIG_LEN);
    pkt[0] = CH347_CMD_SPI_CONFIG;
    // Length field (little-endian): 26
    pkt[1] = CH347_SPI_CONFIG_LEN & 0xff;
    pkt[2] = (CH347_SPI_CONFIG_LEN >> 8) & 0xff;
    // Byte 3: SPI mode 0 (CPOL=0, CPHA=0)
    pkt[3] = 0x00;
    // Byte 4: Clock divisor
    pkt[4] = this.clockDivisor;
    // Byte 5: MSB first
    pkt[5] = 0x00;
    // Bytes 6-7: CS0 active low
    pkt[6] = 0x00;
    pkt[7] = 0x00;
    // Bytes 8-28: reserved (already zero from alloc)

    await this.bulkWrite(pkt);
  }

  /**
   * Build a CS+Transfer packet.
   * @param data SPI MOSI data (full duplex)
   * @param csAssert true to assert CS (drive low), false to deassert (drive high)
   * @param csIndex CS line index (0 for CS0)
   */
  private buildCsXferPacket(data: Buffer, csAssert: boolean, csIndex: number = 0): Buffer {
    const pkt = Buffer.alloc(4 + data.length);
    pkt[0] = CH347_CMD_SPI_CS_XFER;
    // Data length (little-endian), not counting the 4-byte header
    pkt[1] = data.length & 0xff;
    pkt[2] = (data.length >> 8) & 0xff;
    // CS control: bit 7 = CS state (0=assert/low, 1=deassert/high), bits 0-6 = CS index
    pkt[3] = (csAssert ? 0x00 : 0x80) | (csIndex & 0x7f);
    data.copy(pkt, 4);
    return pkt;
  }

  /**
   * Perform a full SPI transaction: assert CS, transfer data (possibly in multiple packets),
   * deassert CS. Returns the full-duplex MISO response.
   */
  private async spiTransfer(txData: Buffer): Promise<Buffer> {
    const result = Buffer.alloc(txData.length);
    let offset = 0;

    while (offset < txData.length) {
      const remaining = txData.length - offset;
      const chunkLen = Math.min(CH347_MAX_SPI_PAYLOAD, remaining);
      const chunk = txData.subarray(offset, offset + chunkLen);
      const isFirst = offset === 0;
      const isLast = offset + chunkLen >= txData.length;

      // For single-packet transfers: assert at start, deassert at end
      // For multi-packet: assert on first, keep asserted in middle, deassert on last
      if (isFirst && isLast) {
        const pktAssert = this.buildCsXferPacket(chunk, true);
        await this.bulkWrite(pktAssert);
        const rx = await this.bulkRead(4 + chunkLen);
        rx.copy(result, offset, 4, 4 + chunkLen);

        const pktDeassert = this.buildCsXferPacket(Buffer.alloc(0), false);
        await this.bulkWrite(pktDeassert);
        await this.bulkRead(4); // drain deassert response
      } else if (isFirst) {
        const pkt = this.buildCsXferPacket(chunk, true);
        await this.bulkWrite(pkt);
        const rx = await this.bulkRead(4 + chunkLen);
        rx.copy(result, offset, 4, 4 + chunkLen);
      } else if (isLast) {
        const pkt = this.buildCsXferPacket(chunk, true);
        await this.bulkWrite(pkt);
        const rx = await this.bulkRead(4 + chunkLen);
        rx.copy(result, offset, 4, 4 + chunkLen);

        const pktDeassert = this.buildCsXferPacket(Buffer.alloc(0), false);
        await this.bulkWrite(pktDeassert);
        await this.bulkRead(4); // drain deassert response
      } else {
        const pkt = this.buildCsXferPacket(chunk, true);
        await this.bulkWrite(pkt);
        const rx = await this.bulkRead(4 + chunkLen);
        rx.copy(result, offset, 4, 4 + chunkLen);
      }

      offset += chunkLen;
    }

    return result;
  }

  /**
   * Send a simple SPI command (assert CS, transfer, deassert CS).
   * Convenience wrapper for short commands.
   */
  private async spiCommand(cmd: number[]): Promise<Buffer> {
    return this.spiTransfer(Buffer.from(cmd));
  }

  // --- Address encoding ---

  private encodeAddress(address: number): number[] {
    if (this.use4ByteAddr) {
      return [
        (address >> 24) & 0xff,
        (address >> 16) & 0xff,
        (address >> 8) & 0xff,
        address & 0xff,
      ];
    }
    return [
      (address >> 16) & 0xff,
      (address >> 8) & 0xff,
      address & 0xff,
    ];
  }

  private async enter4ByteAddressMode(): Promise<void> {
    await this.spiCommand([SPI_CMD_ENTER_4BYTE]);
    this.use4ByteAddr = true;
  }

  private async exit4ByteAddressMode(): Promise<void> {
    if (this.use4ByteAddr) {
      await this.spiCommand([SPI_CMD_EXIT_4BYTE]);
      this.use4ByteAddr = false;
    }
  }

  // --- Status register helpers ---

  private async readStatusRegister(): Promise<number> {
    const rx = await this.spiCommand([SPI_CMD_RDSR, 0]);
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
      await this.sleep(5);
    }
    throw new Error("Chip busy timeout — WIP bit stuck");
  }

  private async disableWriteProtectionInternal(): Promise<void> {
    await this.spiCommand([SPI_CMD_EWSR]);
    await this.spiCommand([SPI_CMD_WRSR, 0x00]);
    await this.waitUntilReady();
  }

  // --- Internal chip identification (no open/close) ---

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
      voltage: dbEntry?.voltage,
    };
  }

  // --- Internal read (no open/close, with progress) ---

  private async readChipInternal(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    const start = Date.now();
    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: "No chip detected" };
      }

      const totalBytes = chip.sizeBytes;
      const needs4Byte = totalBytes > ADDR_4BYTE_THRESHOLD;

      if (needs4Byte) {
        await this.enter4ByteAddressMode();
      }

      try {
        const readBuf = Buffer.alloc(totalBytes);
        // Use larger read chunks for speed — CH347 can handle up to 510 bytes payload
        // Fast Read: cmd + addr + dummy byte + data
        const addrLen = needs4Byte ? 4 : 3;
        const headerLen = 1 + addrLen + 1; // cmd + addr + dummy
        const dataPerPacket = CH347_MAX_SPI_PAYLOAD - headerLen;
        let offset = 0;
        const readStartTime = Date.now();

        while (offset < totalBytes) {
          const chunkSize = Math.min(dataPerPacket, totalBytes - offset);
          const addr = this.encodeAddress(offset);
          const readCmd = needs4Byte ? SPI_CMD_FAST_READ_4BYTE : SPI_CMD_FAST_READ;
          const dummyData = new Array(chunkSize).fill(0);

          // Fast Read: command + address + 1 dummy byte + read data
          const rx = await this.spiCommand([readCmd, ...addr, 0x00, ...dummyData]);

          // Response: skip command echo + address echo + dummy byte
          rx.copy(readBuf, offset, headerLen, headerLen + chunkSize);
          offset += chunkSize;

          if (onProgress && offset % (64 * 1024) < dataPerPacket) {
            const elapsed = (Date.now() - readStartTime) / 1000;
            const speed = elapsed > 0 ? offset / elapsed : 0;
            const remaining = totalBytes - offset;
            const eta = speed > 0 ? remaining / speed : 0;
            onProgress(Math.round((offset / totalBytes) * 100), offset, totalBytes, speed, eta);
          }
        }

        const checksum = createHash("sha256").update(readBuf).digest("hex");
        await writeFile(outputPath, readBuf);

        // Check allFF / allZero
        let allFF = true;
        let allZero = true;
        for (let i = 0; i < readBuf.length; i++) {
          if (readBuf[i] !== 0xff) allFF = false;
          if (readBuf[i] !== 0x00) allZero = false;
          if (!allFF && !allZero) break;
        }

        return {
          success: true,
          filePath: outputPath,
          sizeBytes: totalBytes,
          durationMs: Date.now() - start,
          checksum,
          allFF,
          allZero,
        };
      } finally {
        if (needs4Byte) {
          await this.exit4ByteAddressMode();
        }
      }
    } catch (err: any) {
      return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: err.message };
    }
  }

  // --- Public API ---

  async detectProgrammer(): Promise<ProgrammerInfo> {
    const dev = findByIds(CH347_VID, CH347_PID);
    if (dev) {
      const info: ProgrammerInfo = {
        type: "ch347",
        connected: true,
        vendorId: CH347_VID.toString(16),
        productId: CH347_PID.toString(16),
        description: "CH347 USB High-Speed SPI Programmer",
        backend: "native",
      };
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

    return { type: "unknown", connected: false, description: "No CH347 programmer detected" };
  }

  async connectionTest(): Promise<{ stable: boolean; reads: number; matches: number; jedecId: string; error?: string }> {
    await this.open();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const rx = await this.spiCommand([SPI_CMD_RDID, 0, 0, 0]);
        ids.push(rx.subarray(1, 4).toString("hex"));
      }
      const first = ids[0];
      const matches = ids.filter((id) => id === first).length;
      const stable = matches === 5;

      if (first === "000000" || first === "ffffff") {
        return { stable: false, reads: 5, matches, jedecId: first, error: "No chip responding — check clip/socket connection" };
      }
      return { stable, reads: 5, matches, jedecId: first, error: stable ? undefined : `Unstable: ${matches}/5 consistent — reseat SOIC clip` };
    } catch (err: any) {
      return { stable: false, reads: 0, matches: 0, jedecId: "", error: err.message };
    } finally {
      await this.close();
    }
  }

  async resetChip(): Promise<void> {
    await this.open();
    try {
      await this.spiCommand([0xab]); // Release Power-Down
      await this.sleep(100);
      await this.spiCommand([0x66]); // Enable Reset
      await this.sleep(1);
      await this.spiCommand([0x99]); // Reset
      await this.sleep(100);
    } finally {
      await this.close();
    }
  }

  async open(clockSpeed?: number): Promise<void> {
    if (this.device) return;

    const dev = findByIds(CH347_VID, CH347_PID);
    if (!dev) throw new Error("CH347 not found. Check USB connection.");

    this.clockDivisor = clockSpeed ?? 3;
    if (this.clockDivisor < 0 || this.clockDivisor > 7) {
      throw new Error(`Invalid clock divisor ${this.clockDivisor}. Must be 0-7. (${Object.entries(CH347_CLOCK_DIVISORS).map(([k, v]) => `${k}=${v}`).join(", ")})`);
    }

    dev.open();
    this.device = dev;

    try {
      // CH347 Interface 2 has SPI — ONLY claim interface 2
      const iface = dev.interface(CH347_SPI_INTERFACE);
      if (!iface) throw new Error("CH347 SPI interface (interface 2) not found");

      try {
        if (iface.isKernelDriverActive()) {
          iface.detachKernelDriver();
        }
      } catch {}
      iface.claim();
      this.interfaceClaimed = true;

      // Find bulk endpoints on interface 2
      for (const ep of iface.endpoints) {
        if (ep.direction === "in" && ep.address === CH347_EP_IN) {
          this.epIn = ep as InEndpoint;
        } else if (ep.direction === "out" && ep.address === CH347_EP_OUT) {
          this.epOut = ep as OutEndpoint;
        }
      }

      if (!this.epIn || !this.epOut) {
        throw new Error("CH347 SPI bulk endpoints not found (expected OUT=0x06, IN=0x86)");
      }

      // Configure SPI mode
      await this.sendSpiConfig();
    } catch (err) {
      await this.close();
      throw err;
    }
  }

  async close(): Promise<void> {
    // Exit 4-byte address mode if active
    if (this.use4ByteAddr && this.epOut) {
      try {
        await this.exit4ByteAddressMode();
      } catch {}
    }

    if (this.device) {
      if (this.interfaceClaimed) {
        try {
          this.device.interface(CH347_SPI_INTERFACE).release();
        } catch {}
        this.interfaceClaimed = false;
      }
      try {
        this.device.close();
      } catch {}
      this.device = null;
      this.epIn = null;
      this.epOut = null;
    }
  }

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
    await this.open();
    try {
      return await this.identifyChipInternal();
    } finally {
      await this.close();
    }
  }

  async readChip(
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<ReadResult> {
    const start = Date.now();
    await this.open();

    try {
      return await this.readChipInternal(outputPath, onProgress);
    } catch (err: any) {
      return { success: false, filePath: outputPath, sizeBytes: 0, durationMs: Date.now() - start, checksum: "", error: err.message };
    } finally {
      await this.close();
    }
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
    await this.open();

    try {
      const chip = await this.identifyChipInternal();
      if (!chip) {
        return { success: false, backupPath: null, verified: false, durationMs: Date.now() - start, error: "No chip detected" };
      }

      // Size check
      if (firmware.length > chip.sizeBytes) {
        return {
          success: false, backupPath: null, verified: false, durationMs: Date.now() - start,
          error: `File (${formatSize(firmware.length)}) exceeds chip capacity (${formatSize(chip.sizeBytes)})`,
        };
      }

      // Auto-backup before write
      let backupPath: string | null = null;
      if (!opts?.skipBackup) {
        backupPath = `${inputPath}.backup.${Date.now()}.bin`;
        const backupResult = await this.readChipInternal(backupPath);
        if (!backupResult.success) {
          return { success: false, backupPath: null, verified: false, durationMs: Date.now() - start, error: `Backup failed: ${backupResult.error}` };
        }
      }

      // Check write protection and disable if needed
      const sr = await this.readStatusRegister();
      if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) {
        await this.disableWriteProtectionInternal();
      }

      // Erase chip
      await this.writeEnable();
      await this.spiCommand([SPI_CMD_CHIP_ERASE]);
      await this.waitUntilReady(ERASE_TIMEOUT);

      // Enter 4-byte address mode if needed
      const needs4Byte = chip.sizeBytes > ADDR_4BYTE_THRESHOLD;
      if (needs4Byte) {
        await this.enter4ByteAddressMode();
      }

      try {
        // Program page by page, skipping 0xFF pages
        const pageSize = chip.pageSize || 256;
        let offset = 0;
        const writeStartTime = Date.now();
        const ffPage = Buffer.alloc(pageSize, 0xff);

        while (offset < firmware.length) {
          const chunkSize = Math.min(pageSize, firmware.length - offset);
          const pageData = firmware.subarray(offset, offset + chunkSize);

          // Skip pages that are all 0xFF (already erased)
          const isBlank = chunkSize === pageSize
            ? pageData.equals(ffPage)
            : pageData.every((b) => b === 0xff);

          if (!isBlank) {
            const addr = this.encodeAddress(offset);
            const progCmd = needs4Byte ? SPI_CMD_PAGE_PROGRAM_4BYTE : SPI_CMD_PAGE_PROGRAM;

            await this.writeEnable();
            await this.spiCommand([progCmd, ...addr, ...pageData]);
            await this.waitUntilReady(PAGE_PROGRAM_TIMEOUT);
          }

          offset += chunkSize;

          if (onProgress && offset % (64 * 1024) < pageSize) {
            const elapsed = (Date.now() - writeStartTime) / 1000;
            const speed = elapsed > 0 ? offset / elapsed : 0;
            const remaining = firmware.length - offset;
            const eta = speed > 0 ? remaining / speed : 0;
            onProgress(Math.round((offset / firmware.length) * 100), offset, firmware.length, speed, eta);
          }
        }
      } finally {
        if (needs4Byte) {
          await this.exit4ByteAddressMode();
        }
      }

      // Verify after write
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

  async eraseChip(): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const sr = await this.readStatusRegister();
      if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) {
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

  async isWriteProtected(): Promise<boolean> {
    await this.open();
    try {
      const sr = await this.readStatusRegister();
      return (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) !== 0;
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

  async sectorErase(address: number): Promise<EraseResult> {
    const start = Date.now();
    await this.open();

    try {
      const chip = await this.identifyChipInternal();
      const needs4Byte = chip ? chip.sizeBytes > ADDR_4BYTE_THRESHOLD : false;

      if (needs4Byte) {
        await this.enter4ByteAddressMode();
      }

      try {
        const sr = await this.readStatusRegister();
        if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) {
          await this.disableWriteProtectionInternal();
        }

        const addr = this.encodeAddress(address);
        const eraseCmd = needs4Byte ? SPI_CMD_SECTOR_ERASE_4BYTE : SPI_CMD_SECTOR_ERASE;

        await this.writeEnable();
        await this.spiCommand([eraseCmd, ...addr]);
        await this.waitUntilReady(ERASE_TIMEOUT);

        return { success: true, durationMs: Date.now() - start };
      } finally {
        if (needs4Byte) {
          await this.exit4ByteAddressMode();
        }
      }
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
      const chip = await this.identifyChipInternal();
      const needs4Byte = chip ? chip.sizeBytes > ADDR_4BYTE_THRESHOLD : false;

      if (needs4Byte) {
        await this.enter4ByteAddressMode();
      }

      try {
        const sr = await this.readStatusRegister();
        if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) {
          await this.disableWriteProtectionInternal();
        }

        const addr = this.encodeAddress(address);
        const eraseCmd = needs4Byte ? SPI_CMD_BLOCK_ERASE_4BYTE : SPI_CMD_BLOCK_ERASE;

        await this.writeEnable();
        await this.spiCommand([eraseCmd, ...addr]);
        await this.waitUntilReady(ERASE_TIMEOUT);

        return { success: true, durationMs: Date.now() - start };
      } finally {
        if (needs4Byte) {
          await this.exit4ByteAddressMode();
        }
      }
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
      const chip = await this.identifyChipInternal();
      const needs4Byte = chip ? chip.sizeBytes > ADDR_4BYTE_THRESHOLD : false;

      if (needs4Byte) {
        await this.enter4ByteAddressMode();
      }

      try {
        const sr = await this.readStatusRegister();
        if (sr & (SPI_SR_BP0 | SPI_SR_BP1 | SPI_SR_BP2)) {
          await this.disableWriteProtectionInternal();
        }

        let offset = startAddr;
        const end = startAddr + length;

        while (offset < end) {
          const remaining = end - offset;

          if (remaining >= 65536 && (offset & 0xffff) === 0) {
            const addr = this.encodeAddress(offset);
            const cmd = needs4Byte ? SPI_CMD_BLOCK_ERASE_4BYTE : SPI_CMD_BLOCK_ERASE;
            await this.writeEnable();
            await this.spiCommand([cmd, ...addr]);
            await this.waitUntilReady(ERASE_TIMEOUT);
            offset += 65536;
          } else {
            const aligned = offset & ~0xfff;
            const addr = this.encodeAddress(aligned);
            const cmd = needs4Byte ? SPI_CMD_SECTOR_ERASE_4BYTE : SPI_CMD_SECTOR_ERASE;
            await this.writeEnable();
            await this.spiCommand([cmd, ...addr]);
            await this.waitUntilReady(ERASE_TIMEOUT);
            offset = aligned + 4096;
          }
        }

        return { success: true, durationMs: Date.now() - start };
      } finally {
        if (needs4Byte) {
          await this.exit4ByteAddressMode();
        }
      }
    } catch (err: any) {
      return { success: false, durationMs: Date.now() - start, error: err.message };
    } finally {
      await this.close();
    }
  }
}
