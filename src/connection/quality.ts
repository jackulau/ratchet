/**
 * Connection quality scoring module.
 *
 * Takes raw connection test data (JEDEC reads, timing, status register)
 * and produces a 0-100 quality score with category breakdowns and
 * actionable diagnostic messages.
 */

// ── Types ──

export interface CategoryScore {
  name: string;
  score: number;     // 0-100
  weight: number;    // fraction (e.g. 0.50)
  diagnostic?: string;
}

export interface ConnectionQualityResult {
  score: number;           // 0-100 overall
  grade: string;           // "Excellent" | "Good" | "Fair" | "Poor"
  categories: CategoryScore[];
  diagnostics: string[];   // actionable recommendations
}

/** Raw data fed into the scoring engine. */
export interface RawConnectionData {
  jedecReadings: string[];       // hex strings per read, e.g. ["ef4017", "ef4017", ...]
  timingsMs: number[];           // per-read latency in ms
  statusRegisterOk: boolean;     // true if SR1 was readable
}

// ── Constants ──

const WEIGHT_CONSISTENCY   = 0.50;
const WEIGHT_JEDEC         = 0.20;
const WEIGHT_TIMING        = 0.15;
const WEIGHT_STATUS        = 0.15;

const INVALID_JEDEC = new Set(["000000", "ffffff"]);

// ── Helpers ──

function gradeFromScore(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

/**
 * Compute consistency score (0-100).
 * Counts how many of the readings match the most common valid value.
 * JEDEC "000000" and "ffffff" are treated as failures, not valid samples.
 */
function scoreConsistency(readings: string[]): { score: number; diagnostic?: string } {
  // Filter out invalid JEDEC values
  const valid = readings.filter(r => !INVALID_JEDEC.has(r));
  if (valid.length === 0) {
    return {
      score: 0,
      diagnostic: "Reseat clip or probe — all JEDEC reads returned invalid data",
    };
  }

  // Most common valid value
  const freq = new Map<string, number>();
  for (const v of valid) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let bestCount = 0;
  for (const count of freq.values()) {
    if (count > bestCount) bestCount = count;
  }

  const ratio = bestCount / readings.length;
  const score = Math.round(ratio * 100);

  if (score < 70) {
    const bad = readings.length - bestCount;
    return {
      score,
      diagnostic: `Reseat SOIC clip — ${bad}/${readings.length} reads inconsistent`,
    };
  }
  return { score };
}

/**
 * Compute JEDEC validity score (0-100).
 * Checks whether the most-common reading is a valid (non-zero, non-FF) JEDEC ID.
 */
function scoreJedec(readings: string[]): { score: number; diagnostic?: string } {
  const valid = readings.filter(r => !INVALID_JEDEC.has(r));
  if (valid.length === 0) {
    return {
      score: 0,
      diagnostic: "Check chip orientation — JEDEC ID reads as all-zero or all-one",
    };
  }

  // All valid reads are good for JEDEC scoring
  const ratio = valid.length / readings.length;
  const score = Math.round(ratio * 100);

  if (score < 70) {
    return {
      score,
      diagnostic: "Check chip orientation — some JEDEC reads returned invalid values",
    };
  }
  return { score };
}

/**
 * Compute timing stability score (0-100).
 * Lower coefficient of variation = more stable = higher score.
 */
function scoreTiming(timings: number[]): { score: number; diagnostic?: string } {
  if (timings.length < 2) {
    return { score: 0, diagnostic: "Insufficient timing data to assess stability" };
  }

  const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
  if (mean === 0) return { score: 100 };

  const variance = timings.reduce((sum, t) => sum + (t - mean) ** 2, 0) / timings.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  // cv < 0.1 → perfect; cv > 1.0 → terrible
  const score = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));

  if (score < 70) {
    return {
      score,
      diagnostic: "Shorten USB cable or remove hub — response times are unstable",
    };
  }
  return { score };
}

/**
 * Compute status register score (0 or 100).
 */
function scoreStatus(ok: boolean): { score: number; diagnostic?: string } {
  if (!ok) {
    return {
      score: 0,
      diagnostic: "Status register unreadable — verify VCC voltage and chip power",
    };
  }
  return { score: 100 };
}

// ── Main scoring function ──

/**
 * Compute an overall connection quality score from raw test data.
 *
 * Returns 0 if fewer than 2 successful reads are available
 * (not enough data for meaningful scoring).
 */
export function computeQualityScore(data: RawConnectionData): ConnectionQualityResult {
  // Guard: need at least 2 readings for meaningful stats
  if (data.jedecReadings.length < 2 || data.timingsMs.length < 2) {
    return {
      score: 0,
      grade: "Poor",
      categories: [
        { name: "Consistency",     score: 0, weight: WEIGHT_CONSISTENCY },
        { name: "JEDEC Validity",  score: 0, weight: WEIGHT_JEDEC },
        { name: "Timing Stability",score: 0, weight: WEIGHT_TIMING },
        { name: "Status Register", score: 0, weight: WEIGHT_STATUS },
      ],
      diagnostics: ["Not enough data — fewer than 2 successful reads"],
    };
  }

  const consistency = scoreConsistency(data.jedecReadings);
  const jedec       = scoreJedec(data.jedecReadings);
  const timing      = scoreTiming(data.timingsMs);
  const status      = scoreStatus(data.statusRegisterOk);

  const weighted =
    consistency.score * WEIGHT_CONSISTENCY +
    jedec.score       * WEIGHT_JEDEC +
    timing.score      * WEIGHT_TIMING +
    status.score      * WEIGHT_STATUS;

  const score = Math.round(weighted);
  const grade = gradeFromScore(score);

  const categories: CategoryScore[] = [
    { name: "Consistency",      score: consistency.score, weight: WEIGHT_CONSISTENCY, diagnostic: consistency.diagnostic },
    { name: "JEDEC Validity",   score: jedec.score,       weight: WEIGHT_JEDEC,       diagnostic: jedec.diagnostic },
    { name: "Timing Stability", score: timing.score,      weight: WEIGHT_TIMING,      diagnostic: timing.diagnostic },
    { name: "Status Register",  score: status.score,      weight: WEIGHT_STATUS,      diagnostic: status.diagnostic },
  ];

  const diagnostics: string[] = [];
  for (const cat of categories) {
    if (cat.diagnostic) diagnostics.push(cat.diagnostic);
  }

  return { score, grade, categories, diagnostics };
}
