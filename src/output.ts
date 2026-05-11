const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

const isTTY = process.stdout.isTTY;

function c(color: string, text: string): string {
  return isTTY ? `${color}${text}${RESET}` : text;
}

export function ok(msg: string): void {
  console.log(c(GREEN, "  ✓ ") + msg);
}

export function fail(msg: string): void {
  console.error(c(RED, "  ✗ ") + msg);
}

export function warn(msg: string): void {
  console.log(c(YELLOW, "  ⚠ ") + msg);
}

export function info(msg: string): void {
  console.log(c(CYAN, "  → ") + msg);
}

export function header(msg: string): void {
  console.log("\n" + c(BOLD, msg));
}

export function dim(msg: string): void {
  console.log(c(DIM, "    " + msg));
}

export function kvLine(key: string, value: string): void {
  const paddedKey = (key + ":").padEnd(16);
  console.log(`    ${c(DIM, paddedKey)} ${value}`);
}

export function table(rows: string[][]): void {
  if (rows.length === 0) return;

  const cols = rows[0].length;
  const widths: number[] = Array(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], (row[i] || "").length);
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map((cell, i) => cell.padEnd(widths[i]));
    const line = "    " + cells.join("  ");
    if (r === 0) {
      console.log(c(BOLD, line));
      console.log("    " + widths.map((w) => "─".repeat(w)).join("  "));
    } else {
      console.log(line);
    }
  }
}

export function progressBar(percent: number, width = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percent.toFixed(0)}%`;
}

export function writeProgress(label: string, percent: number, extra?: string): void {
  if (!isTTY) return;
  const bar = progressBar(percent);
  const suffix = extra ? ` ${c(DIM, extra)}` : "";
  process.stdout.write(`\r  ${label} ${bar}${suffix}  `);
  if (percent >= 100) process.stdout.write("\n");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
