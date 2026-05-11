import type { SerialConfig, SerialMessage } from "../types.js";

const MAX_LOG_ENTRIES = 10000;

export class SerialDebug {
  private port: any = null;
  private log: SerialMessage[] = [];
  private connected = false;
  private connecting = false;

  async listPorts(): Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string }>> {
    const { SerialPort } = await import("serialport");
    const ports = await SerialPort.list();
    return ports
      .filter(
        (p) =>
          p.manufacturer?.includes("WCH") ||
          p.manufacturer?.includes("1a86") ||
          p.vendorId?.toLowerCase() === "1a86" ||
          p.path.includes("wch") ||
          p.path.includes("ch34") ||
          p.path.includes("usbserial") ||
          p.path.includes("ttyUSB") ||
          p.path.includes("ttyACM") ||
          /^COM\d+$/i.test(p.path),
      )
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
      }));
  }

  async connect(config: SerialConfig): Promise<{ success: boolean; error?: string }> {
    if (this.connected) return { success: false, error: "Already connected" };
    if (this.connecting) return { success: false, error: "Connection in progress" };

    this.connecting = true;
    try {
      const { SerialPort } = await import("serialport");

      this.port = new SerialPort({
        path: config.port,
        baudRate: config.baudRate,
        dataBits: config.dataBits || 8,
        stopBits: config.stopBits || 1,
        parity: config.parity || "none",
      });

      this.port.on("data", (data: Buffer) => {
        this.log.push({
          timestamp: Date.now(),
          data: data.toString("utf8"),
          direction: "rx",
        });
        if (this.log.length > MAX_LOG_ENTRIES) {
          this.log = this.log.slice(-MAX_LOG_ENTRIES);
        }
      });

      this.port.on("error", (err: Error) => {
        if (this.connected) {
          this.log.push({
            timestamp: Date.now(),
            data: `ERROR: ${err.message}`,
            direction: "rx",
          });
          this.cleanup();
        }
      });

      this.port.on("close", () => {
        this.cleanup();
      });

      this.connected = true;
      return { success: true };
    } catch (err: any) {
      this.cleanup();
      return { success: false, error: err.message };
    } finally {
      this.connecting = false;
    }
  }

  private cleanup(): void {
    this.connected = false;
    if (this.port) {
      try { this.port.removeAllListeners(); } catch {}
      try { if (this.port.isOpen) this.port.close(); } catch {}
    }
    this.port = null;
  }

  async send(data: string): Promise<{ success: boolean; error?: string }> {
    if (!this.port || !this.connected) {
      return { success: false, error: "Not connected" };
    }

    return new Promise((resolve) => {
      this.port.write(data, (err: Error | null) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          this.log.push({
            timestamp: Date.now(),
            data,
            direction: "tx",
          });
          resolve({ success: true });
        }
      });
    });
  }

  getLog(since?: number): SerialMessage[] {
    if (since) {
      return this.log.filter((m) => m.timestamp >= since);
    }
    return [...this.log];
  }

  clearLog(): void {
    this.log = [];
  }

  async disconnect(): Promise<void> {
    if (this.port) {
      return new Promise((resolve) => {
        if (this.port && this.port.isOpen) {
          this.port.close(() => {
            this.cleanup();
            resolve();
          });
        } else {
          this.cleanup();
          resolve();
        }
      });
    }
  }

  getConnected(): boolean {
    return this.connected;
  }
}
