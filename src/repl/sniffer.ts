import type { CH341ABackend } from "../backends/ch341a.js";
import * as out from "../output.js";

export interface SpiMonitorOptions {
  intervalMs: number;
  heartbeatEvery?: number;
}

export async function startSpiMonitor(
  backend: CH341ABackend,
  options: SpiMonitorOptions,
): Promise<void> {
  const { intervalMs, heartbeatEvery = 10 } = options;
  let lastId = "";
  let pollCount = 0;
  let changeCount = 0;
  const startTime = Date.now();

  out.header("SPI Bus Monitor");
  out.dim(`Polling every ${intervalMs}ms — Ctrl+C to stop\n`);

  return new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      try {
        const id = await backend.readJedecId();
        const currentId = id.raw;
        pollCount++;

        if (currentId !== lastId) {
          changeCount++;
          const ts = new Date().toISOString().substring(11, 23);
          if (lastId === "") {
            out.info(`[${ts}] Initial: ${currentId} (${formatId(currentId)})`);
          } else {
            out.warn(`[${ts}] CHANGE: ${lastId} → ${currentId} (${formatId(currentId)})`);
          }
          lastId = currentId;
        } else if (pollCount % heartbeatEvery === 0) {
          const ts = new Date().toISOString().substring(11, 23);
          out.dim(`[${ts}] Stable: ${currentId} (${pollCount} polls)`);
        }
      } catch (err: any) {
        const ts = new Date().toISOString().substring(11, 23);
        out.fail(`[${ts}] Read error: ${err.message}`);
      }
    }, intervalMs);

    const onSigInt = () => {
      clearInterval(timer);
      process.removeListener("SIGINT", onSigInt);
      const elapsed = Date.now() - startTime;
      console.log();
      out.header("Monitor Summary");
      out.kvLine("Duration", out.formatDuration(elapsed));
      out.kvLine("Polls", String(pollCount));
      out.kvLine("Changes", String(changeCount));
      out.kvLine("Last ID", lastId || "none");
      console.log();
      resolve();
    };

    process.on("SIGINT", onSigInt);
  });
}

function formatId(id: string): string {
  if (id === "000000" || id === "ffffff") return "no chip";
  return id;
}
