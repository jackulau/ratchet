import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { CH341ABackend } from "../backends/ch341a.js";
import * as out from "../output.js";

interface PluginContext {
  log: (msg: string) => void;
  warn: (msg: string) => void;
  fail: (msg: string) => void;
  identify: () => Promise<any>;
  readJedec: () => Promise<any>;
  readStatus: () => Promise<any>;
}

export async function runScript(
  filePath: string,
  backend: CH341ABackend,
  options?: { timeoutMs?: number },
): Promise<void> {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    out.fail(`Script not found: ${absPath}`);
    return;
  }

  const ctx: PluginContext = {
    log: (msg: string) => out.info(msg),
    warn: (msg: string) => out.warn(msg),
    fail: (msg: string) => out.fail(msg),
    identify: () => backend.identifyChip(),
    readJedec: () => backend.readJedecId(),
    readStatus: () => backend.readStatusRegisters(),
  };

  const timeoutMs = options?.timeoutMs ?? 30000;

  out.info(`Running script: ${filePath}`);

  try {
    const fileUrl = pathToFileURL(absPath).href;
    const mod = await Promise.race([
      import(fileUrl),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    if (typeof mod.default === "function") {
      await Promise.race([
        mod.default(ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Script execution timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      out.ok("Script completed");
    } else {
      out.warn("Script has no default export function");
    }
  } catch (err: any) {
    out.fail(`Script error: ${err.message}`);
  }
}
