import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";
import type {
  ProgrammerInfo,
  ChipInfo,
  ReadResult,
  WriteResult,
  EraseResult,
  VerifyResult,
} from "../types.js";
import { lookupChipByJedecId, formatSize } from "../chips/database.js";

const exec = promisify(execFile);

const isWindows = platform === "win32";
const isMac = platform === "darwin";

const FLASHROM_PATHS = isWindows
  ? [
      "flashrom.exe",
      "C:\\flashrom\\flashrom.exe",
      "C:\\Program Files\\flashrom\\flashrom.exe",
      "C:\\Program Files (x86)\\flashrom\\flashrom.exe",
    ]
  : [
      "/opt/homebrew/opt/flashrom/sbin/flashrom",
      "/opt/homebrew/bin/flashrom",
      "/usr/local/bin/flashrom",
      "/usr/bin/flashrom",
      "/usr/sbin/flashrom",
      "flashrom",
    ];

const CH341A_VENDOR_ID = "1a86";
const CH341A_PRODUCT_ID = "5512";
const CH347_PRODUCT_ID = "55db";

export class FlashromBackend {
  private flashromPath: string | null = null;

  async findFlashrom(): Promise<string> {
    if (this.flashromPath) return this.flashromPath;

    for (const p of FLASHROM_PATHS) {
      try {
        await exec(p, ["--version"]);
        this.flashromPath = p;
        return p;
      } catch {
        continue;
      }
    }
    throw new Error(
      isWindows
        ? "flashrom not found. Download from https://flashrom.org/Downloads or place flashrom.exe in PATH"
        : "flashrom not found. Install via: brew install flashrom (macOS) or apt install flashrom (Linux)",
    );
  }

  async getVersion(): Promise<string> {
    const path = await this.findFlashrom();
    const { stdout } = await exec(path, ["--version"]);
    const match = stdout.match(/flashrom v([\d.]+)/);
    return match ? match[1] : "unknown";
  }

  async detectProgrammer(): Promise<ProgrammerInfo> {
    if (isMac) {
      return this.detectProgrammerMac();
    }
    if (isWindows) {
      return this.detectProgrammerWindows();
    }
    return this.detectProgrammerLinux();
  }

  private async detectProgrammerMac(): Promise<ProgrammerInfo> {
    try {
      const { stdout } = await exec("system_profiler", [
        "SPUSBDataType",
        "-json",
      ]);
      const data = JSON.parse(stdout);
      const devices = this.flattenUsbDevices(data.SPUSBDataType || []);

      for (const dev of devices) {
        const vid = (dev.vendor_id || "").replace("0x", "").toLowerCase();
        const pid = (dev.product_id || "").replace("0x", "").toLowerCase();

        if (vid === CH341A_VENDOR_ID) {
          if (pid === CH341A_PRODUCT_ID) {
            return {
              type: "ch341a",
              connected: true,
              vendorId: vid,
              productId: pid,
              description: dev._name || "CH341A USB Programmer",
            };
          }
          if (pid === CH347_PRODUCT_ID) {
            return {
              type: "ch347",
              connected: true,
              vendorId: vid,
              productId: pid,
              description: dev._name || "CH347 USB Programmer",
            };
          }
          return {
            type: "unknown",
            connected: true,
            vendorId: vid,
            productId: pid,
            description: dev._name || "WCH USB Device",
          };
        }
      }
    } catch {}

    return { type: "unknown", connected: false, description: "No programmer detected" };
  }

  private async detectProgrammerLinux(): Promise<ProgrammerInfo> {
    try {
      const { stdout } = await exec("lsusb", []);
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(CH341A_VENDOR_ID)) {
          if (line.toLowerCase().includes(CH341A_PRODUCT_ID)) {
            return {
              type: "ch341a",
              connected: true,
              description: "CH341A USB Programmer",
            };
          }
          if (line.toLowerCase().includes(CH347_PRODUCT_ID)) {
            return {
              type: "ch347",
              connected: true,
              description: "CH347 USB Programmer",
            };
          }
        }
      }
    } catch {}

    return { type: "unknown", connected: false, description: "No programmer detected" };
  }

  private async detectProgrammerWindows(): Promise<ProgrammerInfo> {
    // Use PowerShell to query USB devices on Windows
    try {
      const { stdout } = await exec("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-PnpDevice -Class USB -Status OK | Select-Object -Property InstanceId,FriendlyName | ConvertTo-Json",
      ], { timeout: 10000 });

      const devices = JSON.parse(stdout);
      const devList = Array.isArray(devices) ? devices : [devices];

      for (const dev of devList) {
        const instanceId = (dev.InstanceId || "").toLowerCase();
        if (instanceId.includes(`vid_${CH341A_VENDOR_ID}`)) {
          if (instanceId.includes(`pid_${CH341A_PRODUCT_ID}`)) {
            return {
              type: "ch341a",
              connected: true,
              vendorId: CH341A_VENDOR_ID,
              productId: CH341A_PRODUCT_ID,
              description: dev.FriendlyName || "CH341A USB Programmer",
            };
          }
          if (instanceId.includes(`pid_${CH347_PRODUCT_ID}`)) {
            return {
              type: "ch347",
              connected: true,
              vendorId: CH341A_VENDOR_ID,
              productId: CH347_PRODUCT_ID,
              description: dev.FriendlyName || "CH347 USB Programmer",
            };
          }
          return {
            type: "unknown",
            connected: true,
            vendorId: CH341A_VENDOR_ID,
            description: dev.FriendlyName || "WCH USB Device",
          };
        }
      }
    } catch {
      // PowerShell detection failed — try wmic as fallback
      try {
        const { stdout } = await exec("wmic", [
          "path",
          "Win32_USBControllerDevice",
          "get",
          "Dependent",
          "/format:list",
        ], { timeout: 10000 });
        if (stdout.toLowerCase().includes(CH341A_VENDOR_ID)) {
          if (stdout.toLowerCase().includes(CH341A_PRODUCT_ID)) {
            return { type: "ch341a", connected: true, description: "CH341A USB Programmer" };
          }
          if (stdout.toLowerCase().includes(CH347_PRODUCT_ID)) {
            return { type: "ch347", connected: true, description: "CH347 USB Programmer" };
          }
        }
      } catch {}
    }

    return { type: "unknown", connected: false, description: "No programmer detected" };
  }

  private flattenUsbDevices(items: any[]): any[] {
    const result: any[] = [];
    for (const item of items) {
      if (item._items) result.push(...this.flattenUsbDevices(item._items));
      if (item.vendor_id) result.push(item);
    }
    return result;
  }

  async identifyChip(programmer?: string): Promise<ChipInfo | null> {
    const path = await this.findFlashrom();
    const prog = programmer || "ch341a_spi";

    try {
      const { stdout, stderr } = await exec(
        path,
        ["-p", prog, "--flash-name"],
        { timeout: 30000 },
      );
      const output = stdout + stderr;

      const vendorMatch = output.match(
        /vendor:\s*"([^"]+)"/i,
      );
      const nameMatch = output.match(
        /name:\s*"([^"]+)"/i,
      );
      const sizeMatch = output.match(/(\d+)\s*kB/i);
      const jedecMatch = output.match(
        /JEDEC.*?(\w{2})\s+(\w{2})\s+(\w{2})/i,
      );

      if (nameMatch) {
        const jedecId = jedecMatch
          ? `${jedecMatch[1]}${jedecMatch[2]}${jedecMatch[3]}`.toLowerCase()
          : "";
        const dbEntry = jedecId ? lookupChipByJedecId(jedecId) : undefined;
        const sizeBytes = sizeMatch
          ? parseInt(sizeMatch[1]) * 1024
          : dbEntry?.sizeBytes || 0;

        return {
          name: nameMatch[1],
          vendorName: vendorMatch?.[1] || dbEntry?.vendor || "Unknown",
          jedecId,
          sizeBytes,
          sizeHuman: formatSize(sizeBytes),
          type: dbEntry?.type || "spi",
          pageSize: dbEntry?.pageSize,
          sectorSize: dbEntry?.sectorSize,
          blockSize: dbEntry?.blockSize,
          voltage: dbEntry?.voltage,
        };
      }
    } catch (err: any) {
      const output = (err.stdout || "") + (err.stderr || "");

      const chipMatch = output.match(
        /Found\s+(\w+)\s+flash\s+chip\s+"([^"]+)"/i,
      );
      if (chipMatch) {
        const jedecMatch = output.match(
          /JEDEC.*?(\w{2})\s+(\w{2})\s+(\w{2})/i,
        );
        const jedecId = jedecMatch
          ? `${jedecMatch[1]}${jedecMatch[2]}${jedecMatch[3]}`.toLowerCase()
          : "";
        const dbEntry = jedecId ? lookupChipByJedecId(jedecId) : undefined;
        const sizeMatch = output.match(/(\d+)\s*kB/i);
        const sizeBytes = sizeMatch
          ? parseInt(sizeMatch[1]) * 1024
          : dbEntry?.sizeBytes || 0;

        return {
          name: chipMatch[2],
          vendorName: chipMatch[1] || dbEntry?.vendor || "Unknown",
          jedecId,
          sizeBytes,
          sizeHuman: formatSize(sizeBytes),
          type: dbEntry?.type || "spi",
          pageSize: dbEntry?.pageSize,
          sectorSize: dbEntry?.sectorSize,
          blockSize: dbEntry?.blockSize,
          voltage: dbEntry?.voltage,
        };
      }
    }

    return null;
  }

  async readChip(
    outputPath: string,
    programmer?: string,
    chipName?: string,
  ): Promise<ReadResult> {
    const path = await this.findFlashrom();
    const prog = programmer || "ch341a_spi";
    const start = Date.now();

    const args = ["-p", prog, "-r", outputPath];
    if (chipName) args.push("-c", chipName);

    try {
      await exec(path, args, { timeout: 600000 });
      const fileStats = await stat(outputPath);
      const fileData = await readFile(outputPath);
      const checksum = createHash("sha256").update(fileData).digest("hex");

      return {
        success: true,
        filePath: outputPath,
        sizeBytes: fileStats.size,
        durationMs: Date.now() - start,
        checksum,
      };
    } catch (err: any) {
      return {
        success: false,
        filePath: outputPath,
        sizeBytes: 0,
        durationMs: Date.now() - start,
        checksum: "",
        error: err.stderr || err.message,
      };
    }
  }

  async writeChip(
    inputPath: string,
    programmer?: string,
    chipName?: string,
    verify?: boolean,
  ): Promise<WriteResult> {
    const path = await this.findFlashrom();
    const prog = programmer || "ch341a_spi";
    const start = Date.now();

    if (!existsSync(inputPath)) {
      return {
        success: false,
        backupPath: null,
        verified: false,
        durationMs: 0,
        error: `File not found: ${inputPath}`,
      };
    }

    const backupPath = `${inputPath}.backup.${Date.now()}.bin`;
    const backupResult = await this.readChip(backupPath, prog, chipName);
    if (!backupResult.success) {
      return {
        success: false,
        backupPath: null,
        verified: false,
        durationMs: Date.now() - start,
        error: `Backup failed: ${backupResult.error}`,
      };
    }

    const args = ["-p", prog, "-w", inputPath];
    if (chipName) args.push("-c", chipName);
    if (verify !== false) args.push("--verify");

    try {
      await exec(path, args, { timeout: 600000 });
      return {
        success: true,
        backupPath,
        verified: verify !== false,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        backupPath,
        verified: false,
        durationMs: Date.now() - start,
        error: err.stderr || err.message,
      };
    }
  }

  async eraseChip(
    programmer?: string,
    chipName?: string,
  ): Promise<EraseResult> {
    const path = await this.findFlashrom();
    const prog = programmer || "ch341a_spi";
    const start = Date.now();

    const args = ["-p", prog, "-E"];
    if (chipName) args.push("-c", chipName);

    try {
      await exec(path, args, { timeout: 600000 });
      return { success: true, durationMs: Date.now() - start };
    } catch (err: any) {
      return {
        success: false,
        durationMs: Date.now() - start,
        error: err.stderr || err.message,
      };
    }
  }

  async verifyChip(
    filePath: string,
    programmer?: string,
    chipName?: string,
  ): Promise<VerifyResult> {
    const path = await this.findFlashrom();
    const prog = programmer || "ch341a_spi";
    const start = Date.now();

    if (!existsSync(filePath)) {
      return {
        matches: false,
        filePath,
        chipChecksum: "",
        fileChecksum: "",
        durationMs: 0,
        error: `File not found: ${filePath}`,
      };
    }

    const fileData = await readFile(filePath);
    const fileChecksum = createHash("sha256").update(fileData).digest("hex");

    const args = ["-p", prog, "-v", filePath];
    if (chipName) args.push("-c", chipName);

    const tmpPath = join(tmpdir(), `bios_verify_${Date.now()}.bin`);
    try {
      await exec(path, args, { timeout: 600000 });

      const readResult = await this.readChip(tmpPath, prog, chipName);

      return {
        matches: true,
        filePath,
        chipChecksum: readResult.checksum,
        fileChecksum,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        matches: false,
        filePath,
        chipChecksum: "",
        fileChecksum,
        durationMs: Date.now() - start,
        error: err.stderr || err.message,
      };
    } finally {
      try { await unlink(tmpPath); } catch {}
    }
  }
}
