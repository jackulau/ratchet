export interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  durationMs: number;
}

export interface ChipTestReport {
  tests: TestResult[];
  passCount: number;
  failCount: number;
  skipCount: number;
  overallStatus: "pass" | "fail" | "partial";
  chipId: string;
  timestamp: number;
}

export function buildTestReport(tests: TestResult[], chipId: string): ChipTestReport {
  const passCount = tests.filter((t) => t.status === "pass").length;
  const failCount = tests.filter((t) => t.status === "fail").length;
  const skipCount = tests.filter((t) => t.status === "skip").length;

  let overallStatus: ChipTestReport["overallStatus"] = "pass";
  if (failCount > 0) overallStatus = "fail";
  else if (skipCount > 0 && passCount > 0) overallStatus = "partial";

  return {
    tests,
    passCount,
    failCount,
    skipCount,
    overallStatus,
    chipId,
    timestamp: Date.now(),
  };
}

export function formatTestSummary(report: ChipTestReport): string {
  const total = report.tests.length;
  const lines: string[] = [];
  lines.push(`Chip: ${report.chipId}`);
  lines.push(`Tests: ${report.passCount}/${total} passed, ${report.failCount} failed, ${report.skipCount} skipped`);
  lines.push(`Status: ${report.overallStatus.toUpperCase()}`);
  return lines.join("\n");
}
