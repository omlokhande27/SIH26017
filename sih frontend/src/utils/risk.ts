import { RiskLevel } from '@/types';
import type { Project } from '@/types';

export function riskRank(level: RiskLevel): number {
  switch (level) {
    case RiskLevel.LOW: return 0;
    case RiskLevel.MEDIUM: return 1;
    case RiskLevel.HIGH: return 2;
    case RiskLevel.CRITICAL: return 3;
    default: return 0;
  }
}

export type RiskMovement = 'up' | 'down' | 'flat';

export interface RiskMovementInfo {
  direction: RiskMovement;
  label: string;
}

export function riskMovementLabel(direction: RiskMovement): string {
  switch (direction) {
    case 'up': return 'Moved up';
    case 'down': return 'Moved down';
    default: return 'Unchanged';
  }
}

/**
 * Compares the latest prediction run against the previous run to indicate
 * whether risk moved up, moved down or stayed unchanged. Falls back to a
 * delay trend when both runs share the same risk band.
 */
export function getRiskMovement(project: Project): RiskMovement {
  const history = project.predictionHistory ?? [];
  if (history.length < 2) return 'flat';

  const latest = history[0];
  const previous = history[1];

  const latestRank = riskRank(latest.riskLevel);
  const previousRank = riskRank(previous.riskLevel);

  if (latestRank > previousRank) return 'up';
  if (latestRank < previousRank) return 'down';

  const delta = latest.predictedDelay - previous.predictedDelay;
  if (delta > 5) return 'up';
  if (delta < -5) return 'down';
  return 'flat';
}