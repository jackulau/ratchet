import type { CH341ABackend } from "../backends/ch341a.js";
import * as out from "../output.js";

export interface RegisterWatchOptions {
  intervalMs: number;
}

interface StatusBits {
  sr1: number;
  sr2: number;
  sr3: number;
}

const SR1_BITS = [
  { bit: 0, name: "WIP", desc: "Write In Progress" },
  { bit: 1, name: "WEL", desc: "Write Enable Latch" },
  { bit: 2, name: "BP0", desc: "Block Protect 0" },
  { bit: 3, name: "BP1", desc: "Block Protect 1" },
  { bit: 4, name: "BP2", desc: "Block Protect 2" },
  { bit: 5, name: "TB", desc: "Top/Bottom" },
  { bit: 6, name: "SEC", desc: "Sector/Block" },
  { bit: 7, name: "SRP0", desc: "Status Reg Protect" },
];

export async function startRegisterWatch(
  backend: CH341ABackend,
  options: RegisterWatchOptions,
): Promise<void> {
  const { intervalMs } = options;
  let prev: StatusBits | null = null;
  let pollCount = 0;
  let changeCount = 0;
  const startTime = Date.now();

  out.header("Register Watch");
  out.dim(`Polling every ${intervalMs}ms — Ctrl+C to stop\n`);

  return new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      try {
        const sr = await backend.readStatusRegisters();
        pollCount++;

        const changed = prev !== null && (sr.sr1 !== prev.sr1 || sr.sr2 !== prev.sr2 || sr.sr3 !== prev.sr3);

        if (changed || prev === null) {
          if (changed) changeCount++;
          const ts = new Date().toISOString().substring(11, 23);
          const label = changed ? "CHANGED" : "Initial";

          if (process.stdout.isTTY) {
            process.stdout.write(`\x1b[2J\x1b[H`);
          }

          out.header(`Status Registers [${ts}] ${label}`);
          console.log();

          out.kvLine("SR1", `0x${sr.sr1.toString(16).padStart(2, "0")}  ${sr.sr1.toString(2).padStart(8, "0")}`);
          for (const b of SR1_BITS) {
            const val = (sr.sr1 >> b.bit) & 1;
            const prevVal = prev ? (prev.sr1 >> b.bit) & 1 : val;
            const marker = (prev !== null && val !== prevVal) ? " ← CHANGED" : "";
            out.kvLine(`  ${b.name}`, `${val}${marker}`);
          }
          console.log();
          out.kvLine("SR2", `0x${sr.sr2.toString(16).padStart(2, "0")}  ${sr.sr2.toString(2).padStart(8, "0")}`);
          out.kvLine("SR3", `0x${sr.sr3.toString(16).padStart(2, "0")}  ${sr.sr3.toString(2).padStart(8, "0")}`);
          console.log();
          out.dim(`Polls: ${pollCount} | Changes: ${changeCount} | Interval: ${intervalMs}ms`);
        }

        prev = { ...sr };
      } catch (err: any) {
        out.fail(`Read error: ${err.message}`);
      }
    }, intervalMs);

    const onSigInt = () => {
      clearInterval(timer);
      process.removeListener("SIGINT", onSigInt);
      const elapsed = Date.now() - startTime;
      console.log();
      out.header("Watch Summary");
      out.kvLine("Duration", out.formatDuration(elapsed));
      out.kvLine("Polls", String(pollCount));
      out.kvLine("Changes", String(changeCount));
      console.log();
      resolve();
    };

    process.on("SIGINT", onSigInt);
  });
}
