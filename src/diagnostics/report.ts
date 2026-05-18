import type { SpiIntegrityReport } from "./spi-integrity.js";
import type { ChipTestReport } from "./component-tests.js";

export interface DiagnosticReport {
  timestamp: string;
  chipId: string;
  chipName: string;
  chipVoltage: number | undefined;
  spiIntegrity: SpiIntegrityReport | null;
  chipTests: ChipTestReport | null;
  overallScore: number;
  overallGrade: "GOOD" | "MARGINAL" | "POOR" | "FAIL";
  recommendations: string[];
}

export function computeOverallScore(report: Partial<DiagnosticReport>): { score: number; grade: DiagnosticReport["overallGrade"] } {
  let score = 100;
  const penalties: number[] = [];

  if (report.spiIntegrity) {
    if (report.spiIntegrity.score < 100) {
      penalties.push(100 - report.spiIntegrity.score);
    }
    if (report.spiIntegrity.pattern === "dead") {
      penalties.push(80);
    }
  }

  if (report.chipTests) {
    const failRatio = report.chipTests.failCount / Math.max(report.chipTests.tests.length, 1);
    penalties.push(failRatio * 50);
  }

  for (const p of penalties) score -= p;
  score = Math.max(0, Math.round(score));

  let grade: DiagnosticReport["overallGrade"];
  if (score >= 90) grade = "GOOD";
  else if (score >= 70) grade = "MARGINAL";
  else if (score >= 40) grade = "POOR";
  else grade = "FAIL";

  return { score, grade };
}

export function generateReportJson(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}
