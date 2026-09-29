import { cn } from '@/lib/utils';
import type { DelayRiskInsight } from '@/utils/project-insights';
import { RiskLevel } from '@/types';

const ORIGIN_NOTE: Record<DelayRiskInsight['probabilityOrigin'], string> = {
  model: 'Model confidence',
  derived: 'Derived estimate',
  unavailable: 'Not available',
};

const RISK_DOT: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-[var(--color-risk-low)]',
  [RiskLevel.MEDIUM]: 'bg-[var(--color-risk-medium)]',
  [RiskLevel.HIGH]: 'bg-[var(--color-risk-high)]',
  [RiskLevel.CRITICAL]: 'bg-[var(--color-risk-critical)]',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'Low',
  [RiskLevel.MEDIUM]: 'Medium',
  [RiskLevel.HIGH]: 'High',
  [RiskLevel.CRITICAL]: 'Critical',
};

function riskPercentTone(score: number): string {
  if (score >= 65) return 'text-[var(--color-risk-critical)]';
  if (score >= 40) return 'text-[var(--color-risk-medium)]';
  return 'text-[var(--color-risk-low)]';
}

function probabilityTone(value: number): string {
  if (value >= 70) return 'text-[var(--color-risk-critical)]';
  if (value >= 40) return 'text-[var(--color-risk-medium)]';
  return 'text-gray-600';
}

/** Risk column: colour only, with the level available on hover. */
export function RiskDot({ risk }: { risk: RiskLevel }) {
  return (
    <span
      title={`${RISK_LABEL[risk]} risk`}
      aria-label={`${RISK_LABEL[risk]} risk`}
      className={cn('block h-3.5 w-3.5 rounded-full', RISK_DOT[risk])}
    />
  );
}

/** Land acquisition column: the recorded number only. */
export function AcquisitionValue({ value }: { value: number }) {
  return (
    <span className="text-sm font-medium tabular-nums text-gray-800">
      {value.toFixed(1)}%
    </span>
  );
}

/** Risk percentage column: the calculated composite score. */
export function RiskPercentCell({ insight }: { insight: DelayRiskInsight }) {
  return (
    <span
      title="Weighted from recorded fields: predicted delay 35%, acquisition gap 25%, compensation pending 25%, open issues 15%."
      className={cn('text-sm font-bold tabular-nums', riskPercentTone(insight.riskScore))}
    >
      {insight.riskScore}%
    </span>
  );
}

/** Delay column: days only. */
export function DelayDaysCell({ days }: { days: number | null }) {
  if (days === null) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-gray-900">
      {days} days
    </span>
  );
}

/** Probability column: the chance that the delay above occurs. */
export function DelayProbabilityCell({ insight }: { insight: DelayRiskInsight }) {
  if (insight.probabilityOrigin === 'unavailable') {
    return <span className="text-sm text-gray-400">—</span>;
  }

  return (
    <span
      title={`${ORIGIN_NOTE[insight.probabilityOrigin]} · chance that the predicted delay occurs`}
      className={cn('text-sm font-semibold tabular-nums', probabilityTone(insight.delayProbability))}
    >
      {insight.delayProbability}%
    </span>
  );
}
