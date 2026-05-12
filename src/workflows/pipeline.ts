import { createHash } from "node:crypto";
import { analyzeBiosHealthFromBuffer, type BiosHealthReport } from "../analysis/recovery.js";
import { repairAuto, repairFromReference, type RepairReport } from "../analysis/repair.js";
import { computeQualityScore, type ConnectionQualityResult } from "../connection/quality.js";
import type { RawConnectionData } from "../connection/quality.js";
import type { ChipInfo } from "../types.js";

// ─── Task 1: Pipeline step infrastructure ───

export interface StepResult {
  name: string;
  number: number;
  success: boolean;
  detail: string;
  durationMs: number;
}

export interface PipelineResult {
  success: boolean;
  stepsCompleted: number;
  stepResults: StepResult[];
  errorStep: string | null;
  errorDetail: string | null;
  totalDurationMs: number;
  context: PipelineContext;
}

export interface PipelineContext {
  // Input config
  dryRun: boolean;
  referencePath: string | null;
  outputDir: string;
  skipWrite: boolean;

  // State accumulated during pipeline
  qualityScore: number;
  qualityResult: ConnectionQualityResult | null;
  chipInfo: ChipInfo | null;
  imageData: Buffer | null;
  imagePath: string | null;
  healthReport: BiosHealthReport | null;
  repairedData: Buffer | null;
  repairReport: RepairReport | null;
  repairsNeeded: boolean;
  writeVerified: boolean;
  finalHealthReport: BiosHealthReport | null;
  metadata: BackupMetadata | null;

  // Backend interface (injected for testability)
  backend: PipelineBackend;
}

export interface PipelineBackend {
  connectionTest(): Promise<{ stable: boolean; reads: number; matches: number; jedecId: string; timings: number[]; statusRegister: number | null }>;
  identifyChip(): Promise<ChipInfo | null>;
  readChipDoubleVerify(outputPath: string, onProgress?: any): Promise<{ success: boolean; sizeBytes: number; checksum: string; durationMs: number; filePath: string; error?: string }>;
  writeChip(inputPath: string, onProgress?: any, opts?: any): Promise<{ success: boolean; verified: boolean; durationMs: number; error?: string; backupPath: string | null }>;
  verifyChip(filePath: string): Promise<{ matches: boolean; chipChecksum: string; fileChecksum: string; durationMs: number }>;
  isWriteProtected(): Promise<boolean>;
  disableWriteProtection(): Promise<void>;
}

export type PipelineStep = {
  name: string;
  number: number;
  total: number;
  execute: (ctx: PipelineContext) => Promise<string>;
};

export function createContext(opts: {
  backend: PipelineBackend;
  dryRun?: boolean;
  referencePath?: string | null;
  outputDir?: string;
  skipWrite?: boolean;
}): PipelineContext {
  return {
    dryRun: opts.dryRun ?? false,
    referencePath: opts.referencePath ?? null,
    outputDir: opts.outputDir ?? ".",
    skipWrite: opts.skipWrite ?? false,
    qualityScore: 0,
    qualityResult: null,
    chipInfo: null,
    imageData: null,
    imagePath: null,
    healthReport: null,
    repairedData: null,
    repairReport: null,
    repairsNeeded: false,
    writeVerified: false,
    finalHealthReport: null,
    metadata: null,
    backend: opts.backend,
  };
}

export async function runPipeline(steps: PipelineStep[], ctx: PipelineContext): Promise<PipelineResult> {
  const stepResults: StepResult[] = [];
  const pipelineStart = Date.now();

  for (const step of steps) {
    const stepStart = Date.now();
    try {
      const detail = await step.execute(ctx);
      stepResults.push({
        name: step.name,
        number: step.number,
        success: true,
        detail,
        durationMs: Date.now() - stepStart,
      });
    } catch (err: any) {
      stepResults.push({
        name: step.name,
        number: step.number,
        success: false,
        detail: err.message,
        durationMs: Date.now() - stepStart,
      });
      return {
        success: false,
        stepsCompleted: stepResults.length,
        stepResults,
        errorStep: step.name,
        errorDetail: err.message,
        totalDurationMs: Date.now() - pipelineStart,
        context: ctx,
      };
    }
  }

  return {
    success: true,
    stepsCompleted: stepResults.length,
    stepResults,
    errorStep: null,
    errorDetail: null,
    totalDurationMs: Date.now() - pipelineStart,
    context: ctx,
  };
}

// ─── Task 2: Full-backup workflow ───

export interface BackupMetadata {
  timestamp: string;
  chipInfo: ChipInfo | null;
  qualityScore: number;
  healthReport: BiosHealthReport | null;
  sha256: string;
  sizeBytes: number;
  biosVersion: string | null;
}

export function generateBackupMetadata(ctx: PipelineContext): BackupMetadata {
  const sha256 = ctx.imageData ? createHash("sha256").update(ctx.imageData).digest("hex") : "";
  return {
    timestamp: new Date().toISOString(),
    chipInfo: ctx.chipInfo,
    qualityScore: ctx.qualityScore,
    healthReport: ctx.healthReport,
    sha256,
    sizeBytes: ctx.imageData ? ctx.imageData.length : 0,
    biosVersion: null,
  };
}

function makeQualityStep(num: number, total: number): PipelineStep {
  return {
    name: "Connection quality check",
    number: num,
    total,
    async execute(ctx) {
      const ct = await ctx.backend.connectionTest();
      const jedecReadings: string[] = [];
      for (let i = 0; i < ct.matches; i++) jedecReadings.push(ct.jedecId);
      for (let i = ct.matches; i < ct.reads; i++) jedecReadings.push("000000");
      const rawData: RawConnectionData = {
        jedecReadings,
        timingsMs: ct.timings,
        statusRegisterOk: ct.statusRegister !== null,
      };
      const quality = computeQualityScore(rawData);
      ctx.qualityScore = quality.score;
      ctx.qualityResult = quality;
      if (quality.score < 50) {
        throw new Error(`Connection quality too low: ${quality.score}/100 (${quality.grade})`);
      }
      ctx.chipInfo = await ctx.backend.identifyChip();
      return `Quality: ${quality.score}/100 (${quality.grade})` + (ctx.chipInfo ? `, Chip: ${ctx.chipInfo.name}` : "");
    },
  };
}

function makeReadStep(num: number, total: number): PipelineStep {
  return {
    name: "Read chip (double-verify)",
    number: num,
    total,
    async execute(ctx) {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { readFile: rf, unlink } = await import("node:fs/promises");
      const tmpPath = join(tmpdir(), `biospy-pipeline-read-${Date.now()}.bin`);
      const result = await ctx.backend.readChipDoubleVerify(tmpPath);
      if (!result.success) throw new Error(result.error || "Read failed");
      ctx.imageData = await rf(tmpPath);
      ctx.imagePath = tmpPath;
      try { await unlink(tmpPath); } catch {}
      return `Read ${ctx.imageData.length} bytes, SHA256: ${result.checksum.substring(0, 16)}...`;
    },
  };
}

function makeAnalyzeStep(num: number, total: number): PipelineStep {
  return {
    name: "Analyze health",
    number: num,
    total,
    async execute(ctx) {
      if (!ctx.imageData) throw new Error("No image data to analyze");
      ctx.healthReport = analyzeBiosHealthFromBuffer(ctx.imageData);
      const passes = ctx.healthReport.checks.filter(c => c.status === "pass").length;
      const warns = ctx.healthReport.checks.filter(c => c.status === "warn").length;
      const fails = ctx.healthReport.checks.filter(c => c.status === "fail").length;
      return `Health: ${passes} pass, ${warns} warn, ${fails} fail — ${ctx.healthReport.overallStatus}`;
    },
  };
}

export function buildBackupPipeline(ctx: PipelineContext): PipelineStep[] {
  const total = 4;
  return [
    makeQualityStep(1, total),
    makeReadStep(2, total),
    makeAnalyzeStep(3, total),
    {
      name: "Save backup with metadata",
      number: 4,
      total,
      async execute(ctx) {
        ctx.metadata = generateBackupMetadata(ctx);
        return `Metadata generated: ${ctx.metadata.sha256.substring(0, 16)}..., ${ctx.metadata.sizeBytes} bytes`;
      },
    },
  ];
}

// ─── Task 3: Full-repair workflow ───

export function buildRepairPipeline(ctx: PipelineContext): PipelineStep[] {
  const hasRef = ctx.referencePath !== null;
  const total = 7;
  const steps: PipelineStep[] = [
    makeQualityStep(1, total),
    makeReadStep(2, total),
    makeAnalyzeStep(3, total),
    {
      name: hasRef ? "Repair from reference" : "Auto-repair",
      number: 4,
      total,
      async execute(ctx) {
        if (!ctx.imageData) throw new Error("No image data to repair");
        if (hasRef && ctx.referencePath) {
          const { readFile: rf } = await import("node:fs/promises");
          const refData = await rf(ctx.referencePath);
          const { repaired, report } = repairFromReference(ctx.imageData, refData);
          ctx.repairedData = repaired as Buffer;
          ctx.repairReport = report;
          ctx.repairsNeeded = report.totalBytesChanged > 0;
        } else {
          const { repaired, report } = repairAuto(ctx.imageData);
          ctx.repairedData = repaired as Buffer;
          ctx.repairReport = report;
          ctx.repairsNeeded = report.totalBytesChanged > 0;
        }
        if (!ctx.repairsNeeded) return "No repairs needed — image is healthy";
        return `Repaired: ${ctx.repairReport!.totalBytesChanged} bytes changed, ${ctx.repairReport!.actions.length} actions`;
      },
    },
    {
      name: "Write repaired image",
      number: 5,
      total,
      async execute(ctx) {
        if (!ctx.repairsNeeded || ctx.skipWrite) {
          return ctx.skipWrite ? "Write skipped (--skip-write)" : "No repairs needed — write skipped";
        }
        if (!ctx.repairedData) throw new Error("No repaired data to write");

        // Check and disable write protection
        const wp = await ctx.backend.isWriteProtected();
        if (wp) await ctx.backend.disableWriteProtection();

        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { writeFile: wf, unlink } = await import("node:fs/promises");
        const tmpPath = join(tmpdir(), `biospy-pipeline-write-${Date.now()}.bin`);
        await wf(tmpPath, ctx.repairedData);
        const result = await ctx.backend.writeChip(tmpPath, undefined, { skipBackup: false, skipVerify: false });
        try { await unlink(tmpPath); } catch {}
        if (!result.success) throw new Error(result.error || "Write failed");
        return `Write complete${wp ? " (write protection auto-disabled)" : ""}`;
      },
    },
    {
      name: "Post-write verify",
      number: 6,
      total,
      async execute(ctx) {
        if (!ctx.repairsNeeded || ctx.skipWrite) {
          return "Verify skipped — no write performed";
        }
        if (!ctx.repairedData) throw new Error("No repaired data to verify");

        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { writeFile: wf, unlink } = await import("node:fs/promises");
        const tmpPath = join(tmpdir(), `biospy-pipeline-verify-${Date.now()}.bin`);
        await wf(tmpPath, ctx.repairedData);
        const result = await ctx.backend.verifyChip(tmpPath);
        try { await unlink(tmpPath); } catch {}
        ctx.writeVerified = result.matches;
        if (!result.matches) throw new Error("Post-write verification FAILED — chip content does not match repaired image");
        return "Verification passed — chip matches repaired image";
      },
    },
    {
      name: "Final health report",
      number: 7,
      total,
      async execute(ctx) {
        const imageToCheck = ctx.repairsNeeded && !ctx.skipWrite ? ctx.repairedData : ctx.imageData;
        if (!imageToCheck) throw new Error("No image data for final health check");
        ctx.finalHealthReport = analyzeBiosHealthFromBuffer(imageToCheck);
        const status = ctx.finalHealthReport.overallStatus;
        return `Final health: ${status}`;
      },
    },
  ];
  return steps;
}
