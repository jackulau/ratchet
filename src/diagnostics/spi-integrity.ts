export interface SpiReading {
  jedecId: string;
  timestamp: number;
}

export type SpiPattern = "stable" | "intermittent" | "noisy" | "dead" | "no-chip";

export interface SpiIntegrityReport {
  score: number;
  pattern: SpiPattern;
  readings: SpiReading[];
  uniqueIds: string[];
  dominantId: string;
  dominantCount: number;
  totalReads: number;
  recommendation: string;
  statusRegisterConsistent: boolean;
}

export function analyzeSpiReadings(readings: SpiReading[]): SpiIntegrityReport {
  if (readings.length === 0) {
    return {
      score: 0,
      pattern: "no-chip",
      readings: [],
      uniqueIds: [],
      dominantId: "",
      dominantCount: 0,
      totalReads: 0,
      recommendation: "No readings — check programmer connection",
      statusRegisterConsistent: false,
    };
  }

  const idCounts = new Map<string, number>();
  for (const r of readings) {
    idCounts.set(r.jedecId, (idCounts.get(r.jedecId) || 0) + 1);
  }

  const uniqueIds = [...idCounts.keys()];
  let dominantId = "";
  let dominantCount = 0;
  for (const [id, count] of idCounts) {
    if (count > dominantCount) {
      dominantId = id;
      dominantCount = count;
    }
  }

  const score = Math.round((dominantCount / readings.length) * 100);

  let pattern: SpiPattern;
  if (dominantId === "000000" || dominantId === "ffffff") {
    pattern = "dead";
  } else if (score === 100) {
    pattern = "stable";
  } else if (score >= 80) {
    pattern = "intermittent";
  } else {
    pattern = "noisy";
  }

  let recommendation: string;
  if (pattern === "dead") {
    recommendation = "All reads return 0x000000 or 0xFFFFFF — no chip detected. Check: (1) SOIC clip seating on chip, (2) pin 1 alignment, (3) programmer is powered, (4) chip is a valid SPI flash.";
  } else if (score >= 95) {
    recommendation = "Connection is solid. Safe to proceed with read/write operations.";
  } else if (score >= 80) {
    recommendation = "Connection is marginal — some reads are inconsistent. Reseat the SOIC clip and ensure firm pressure on all 8 pins. Avoid touching the clip during operations.";
  } else if (score >= 50) {
    recommendation = "Connection is unreliable — too many inconsistent reads. Do NOT attempt write operations. Fix the physical connection first: clean chip pads, check clip spring tension, try a different clip or use a ZIF socket.";
  } else {
    recommendation = "Connection is very poor or no chip present. Check all physical connections, verify chip is correct type, and ensure programmer is working (try 'biospy test-connection').";
  }

  return {
    score,
    pattern,
    readings,
    uniqueIds,
    dominantId,
    dominantCount,
    totalReads: readings.length,
    recommendation,
    statusRegisterConsistent: true,
  };
}

export function formatScoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${score}%`;
}
