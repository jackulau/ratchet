import { createInterface, type Interface } from "readline";
import { searchChips, CHIP_DATABASE, formatSize, lookupChipByJedecId, lookupChipByName, fuzzyMatchJedec, getChipRecommendations } from "../chips/database.js";
import { CH341ABackend } from "../backends/ch341a.js";
import { CH347Backend } from "../backends/ch347.js";
import * as out from "../output.js";
import { MacroRecorder } from "./macros.js";
import { startSpiMonitor } from "./sniffer.js";
import { startRegisterWatch } from "./watch.js";
import type { ChipInfo } from "../types.js";

const REPL_COMMANDS = [
  "help", "status", "identify", "jedec", "sfdp", "chip-info", "search",
  "read-status", "spi-monitor", "reg-watch",
  "macro", "run", "exit", "quit",
];

interface ReplContext {
  ch341a: CH341ABackend;
  ch347: CH347Backend;
  chip: ChipInfo | null;
  macros: MacroRecorder;
  recording: boolean;
}

async function detectBackend(ctx: ReplContext): Promise<"ch341a" | "ch347" | null> {
  try {
    const info = await ctx.ch341a.detectProgrammer();
    if (info.connected && info.type === "ch341a") return "ch341a";
  } catch {}
  try {
    const info = await ctx.ch347.detectProgrammer();
    if (info.connected) return "ch347";
  } catch {}
  return null;
}

function showHelp(): void {
  out.header("REPL Commands");
  const cmds = [
    ["help", "Show this help"],
    ["status", "Check programmer connection"],
    ["identify", "Identify connected chip"],
    ["jedec", "Read raw JEDEC ID"],
    ["read-status", "Read status registers"],
    ["chip-info <id|name>", "Chip database lookup"],
    ["search [query]", "Search chip database"],
    ["spi-monitor [ms]", "Monitor JEDEC ID changes (Ctrl+C to stop)"],
    ["reg-watch [ms]", "Watch status registers live (Ctrl+C to stop)"],
    ["macro record <name>", "Start recording commands"],
    ["macro stop", "Stop recording"],
    ["macro play <name>", "Replay recorded macro"],
    ["macro list", "List recorded macros"],
    ["macro save <file>", "Save macros to JSON file"],
    ["macro load <file>", "Load macros from JSON file"],
    ["run <file.js>", "Execute JS plugin script"],
    ["exit / quit", "Exit REPL"],
  ];
  const rows = [["Command", "Description"]];
  for (const [cmd, desc] of cmds) rows.push([cmd, desc]);
  out.table(rows);
  console.log();
}

async function handleCommand(line: string, ctx: ReplContext): Promise<boolean> {
  const trimmed = line.trim();
  if (!trimmed) return true;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (ctx.recording && cmd !== "macro") {
    ctx.macros.addCommand(trimmed);
    out.dim(`[recording] ${trimmed}`);
    return true;
  }

  switch (cmd) {
    case "help":
      showHelp();
      break;

    case "exit":
    case "quit":
      return false;

    case "status": {
      const backend = await detectBackend(ctx);
      if (backend) {
        out.ok(`${backend.toUpperCase()} programmer connected`);
      } else {
        out.fail("No programmer detected");
      }
      break;
    }

    case "identify": {
      try {
        const chip = await ctx.ch341a.identifyChip();
        if (chip) {
          ctx.chip = chip;
          out.ok(`${chip.vendorName} ${chip.name}`);
          out.kvLine("JEDEC ID", chip.jedecId);
          out.kvLine("Size", `${chip.sizeHuman} (${chip.sizeBytes.toLocaleString()} bytes)`);
        } else {
          out.fail("No chip detected");
        }
      } catch (err: any) {
        out.fail(err.message);
      }
      break;
    }

    case "jedec": {
      try {
        const id = await ctx.ch341a.readJedecId();
        out.ok(`JEDEC ID: ${id.raw}`);
        out.kvLine("Manufacturer", `0x${id.manufacturer.toString(16).padStart(2, "0")}`);
        out.kvLine("Memory Type", `0x${id.memoryType.toString(16).padStart(2, "0")}`);
        out.kvLine("Capacity", `0x${id.capacity.toString(16).padStart(2, "0")}`);
      } catch (err: any) {
        out.fail(err.message);
      }
      break;
    }

    case "read-status": {
      try {
        const sr = await ctx.ch341a.readStatusRegisters();
        out.header("Status Registers");
        out.kvLine("SR1", `0x${sr.sr1.toString(16).padStart(2, "0")} (${sr.sr1.toString(2).padStart(8, "0")})`);
        out.kvLine("  WIP", (sr.sr1 & 0x01) ? "BUSY" : "idle");
        out.kvLine("  WEL", (sr.sr1 & 0x02) ? "ENABLED" : "disabled");
        out.kvLine("  BP0", (sr.sr1 & 0x04) ? "1" : "0");
        out.kvLine("  BP1", (sr.sr1 & 0x08) ? "1" : "0");
        out.kvLine("  BP2", (sr.sr1 & 0x10) ? "1" : "0");
        out.kvLine("  TB", (sr.sr1 & 0x20) ? "1" : "0");
        out.kvLine("  SEC", (sr.sr1 & 0x40) ? "1" : "0");
        out.kvLine("  SRP0", (sr.sr1 & 0x80) ? "1" : "0");
        out.kvLine("SR2", `0x${sr.sr2.toString(16).padStart(2, "0")} (${sr.sr2.toString(2).padStart(8, "0")})`);
        out.kvLine("SR3", `0x${sr.sr3.toString(16).padStart(2, "0")} (${sr.sr3.toString(2).padStart(8, "0")})`);
      } catch (err: any) {
        out.fail(err.message);
      }
      break;
    }

    case "chip-info": {
      const query = args[0];
      if (!query) { out.fail("Usage: chip-info <jedec_id|name>"); break; }
      const isHex = /^[0-9a-fA-F]{6}$/.test(query);
      if (isHex) {
        const chip = lookupChipByJedecId(query);
        if (chip) {
          out.ok(`${chip.vendor} ${chip.name}`);
          out.kvLine("Size", formatSize(chip.sizeBytes));
          out.kvLine("Voltage", `${chip.voltage}V`);
          const rec = getChipRecommendations(chip);
          out.kvLine("Safe Voltage", rec.safeVoltage);
          out.kvLine("Max Clock", rec.maxSpiClock);
        } else {
          const fuzzy = fuzzyMatchJedec(query);
          out.warn(`Unknown chip — ${fuzzy.manufacturer} (${fuzzy.confidence})`);
        }
      } else {
        const chip = lookupChipByName(query);
        if (chip) {
          out.ok(`${chip.vendor} ${chip.name} — ${formatSize(chip.sizeBytes)}`);
        } else {
          const results = searchChips(query);
          if (results.length > 0) {
            out.info(`${results.length} match(es) for "${query}"`);
          } else {
            out.fail(`No chip matching "${query}"`);
          }
        }
      }
      break;
    }

    case "search": {
      const query = args[0] ?? "";
      const results = searchChips(query);
      if (results.length === 0) {
        out.fail(`No results for "${query}"`);
      } else {
        const label = query ? `${results.length} match(es)` : `All ${results.length} chips`;
        out.header(label);
        const rows = [["Name", "Vendor", "Size", "JEDEC"]];
        for (const c of results.slice(0, 30)) {
          rows.push([c.name, c.vendor, formatSize(c.sizeBytes), c.jedecId || "—"]);
        }
        out.table(rows);
        if (results.length > 30) out.dim(`... and ${results.length - 30} more`);
      }
      break;
    }

    case "spi-monitor": {
      const interval = args[0] ? parseInt(args[0], 10) : 1000;
      out.info(`Monitoring JEDEC ID every ${interval}ms (Ctrl+C to stop)...`);
      await startSpiMonitor(ctx.ch341a, { intervalMs: interval });
      break;
    }

    case "reg-watch": {
      const interval = args[0] ? parseInt(args[0], 10) : 500;
      out.info(`Watching status registers every ${interval}ms (Ctrl+C to stop)...`);
      await startRegisterWatch(ctx.ch341a, { intervalMs: interval });
      break;
    }

    case "macro": {
      const sub = args[0]?.toLowerCase();
      if (sub === "record") {
        const name = args[1];
        if (!name) { out.fail("Usage: macro record <name>"); break; }
        ctx.macros.startRecording(name);
        ctx.recording = true;
        out.ok(`Recording macro "${name}" — type "macro stop" to finish`);
      } else if (sub === "stop") {
        ctx.macros.stopRecording();
        ctx.recording = false;
        out.ok("Recording stopped");
      } else if (sub === "play") {
        const name = args[1];
        if (!name) { out.fail("Usage: macro play <name>"); break; }
        const commands = ctx.macros.getCommands(name);
        if (!commands) { out.fail(`No macro named "${name}"`); break; }
        out.info(`Playing macro "${name}" (${commands.length} commands)`);
        for (const c of commands) {
          out.dim(`> ${c}`);
          await handleCommand(c, ctx);
        }
        out.ok(`Macro "${name}" complete`);
      } else if (sub === "list") {
        const list = ctx.macros.list();
        if (list.length === 0) {
          out.info("No macros recorded");
        } else {
          const rows = [["Name", "Commands", "Created"]];
          for (const m of list) rows.push([m.name, String(m.commandCount), m.createdAt]);
          out.table(rows);
        }
      } else if (sub === "save") {
        const file = args[1];
        if (!file) { out.fail("Usage: macro save <file>"); break; }
        try {
          await ctx.macros.save(file);
          out.ok(`Macros saved to ${file}`);
        } catch (err: any) { out.fail(err.message); }
      } else if (sub === "load") {
        const file = args[1];
        if (!file) { out.fail("Usage: macro load <file>"); break; }
        try {
          await ctx.macros.load(file);
          out.ok(`Macros loaded from ${file}`);
        } catch (err: any) { out.fail(err.message); }
      } else {
        out.fail("Usage: macro record|stop|play|list|save|load");
      }
      break;
    }

    case "run": {
      const file = args[0];
      if (!file) { out.fail("Usage: run <file.js>"); break; }
      const { runScript } = await import("./plugins.js");
      await runScript(file, ctx.ch341a);
      break;
    }

    default:
      out.fail(`Unknown command: ${cmd}`);
      out.dim("Type 'help' for available commands");
  }
  return true;
}

export async function startRepl(): Promise<void> {
  const ctx: ReplContext = {
    ch341a: new CH341ABackend(),
    ch347: new CH347Backend(),
    chip: null,
    macros: new MacroRecorder(),
    recording: false,
  };

  console.log();
  out.header("biospy interactive console");
  out.dim("Type 'help' for commands, 'exit' to quit\n");

  const backend = await detectBackend(ctx);
  if (backend) {
    out.ok(`${backend.toUpperCase()} programmer detected`);
    try {
      const chip = await ctx.ch341a.identifyChip();
      if (chip) {
        ctx.chip = chip;
        out.ok(`Chip: ${chip.vendorName} ${chip.name} (${chip.sizeHuman})`);
      }
    } catch {}
  } else {
    out.warn("No programmer detected — hardware commands will fail");
  }
  console.log();

  const isTTY = process.stdin.isTTY;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: isTTY ? "biospy> " : "",
    completer: (line: string) => {
      const hits = REPL_COMMANDS.filter(c => c.startsWith(line.toLowerCase()));
      return [hits.length ? hits : REPL_COMMANDS, line];
    },
    terminal: isTTY ?? false,
  });

  let ctrlCCount = 0;
  let ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  rl.on("SIGINT", () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log("\nExiting...");
      rl.close();
      return;
    }
    console.log("\n(Press Ctrl+C again to exit)");
    rl.prompt();
    if (ctrlCTimer) clearTimeout(ctrlCTimer);
    ctrlCTimer = setTimeout(() => { ctrlCCount = 0; }, 1000);
  });

  rl.prompt();

  for await (const line of rl) {
    try {
      const shouldContinue = await handleCommand(line, ctx);
      if (!shouldContinue) {
        rl.close();
        break;
      }
    } catch (err: any) {
      out.fail(err.message);
    }
    rl.prompt();
  }

  console.log("Goodbye.");
}
