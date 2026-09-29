import { ChevronRight } from 'lucide-react';
import type { DataOrigin, RiskFactor } from '@/types';
import { RiskLevel } from '@/types';
import { factorContributionRisk } from '@/utils/prediction-helpers';
import { cn } from '@/lib/utils';

const severityChip: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]',
  [RiskLevel.MEDIUM]: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]',
  [RiskLevel.HIGH]: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]',
  [RiskLevel.CRITICAL]: 'bg-[var(--color-risk-critical)]/10 text-[var(--color-risk-critical)]',
};

const barColor: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-[var(--color-risk-low)]',
  [RiskLevel.MEDIUM]: 'bg-[var(--color-risk-medium)]',
  [RiskLevel.HIGH]: 'bg-[var(--color-risk-high)]',
  [RiskLevel.CRITICAL]: 'bg-[var(--color-risk-critical)]',
};

function severityLabel(level: RiskLevel): string {
  switch (level) {
    case RiskLevel.CRITICAL: return 'Critical';
    case RiskLevel.HIGH: return 'High';
    case RiskLevel.MEDIUM: return 'Medium';
    default: return 'Low';
  }
}

interface ContributionBarProps {
  factor: RiskFactor;
  onSelect: (factor: RiskFactor) => void;
}

function ContributionBar({ factor, onSelect }: ContributionBarProps) {
  const level = factorContributionRisk(factor.contributionScore ?? 0);
  const score = factor.contributionScore ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(factor)}
      className="group w-full rounded-lg p-3 text-left transition-colors hover:bg-[var(--color-bg-muted)]"
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{factor.name}</span>
        <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', severityChip[level])}>
          {severityLabel(level)}
        </span>
        <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
          {score.toFixed(2)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn('h-full rounded-full transition-all', barColor[level])}
            style={{ width: `${Math.max(score * 100, 2)}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{factor.category}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{factor.description}</p>
    </button>
  );
}

interface ContributionBarsProps {
  factors: RiskFactor[];
  onSelect: (factor: RiskFactor) => void;
  dataOrigin?: DataOrigin;
}

export function ContributionBars({ factors, onSelect, dataOrigin }: ContributionBarsProps) {
  const sorted = factors.slice().sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0));

  return (
    <div>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white p-1">
        {sorted.map((factor) => (
          <ContributionBar key={factor.id} factor={factor} onSelect={onSelect} />
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px] text-gray-400">
        {dataOrigin === 'live'
          ? 'Contribution scores and impact levels are provided by the connected prediction service for this run.'
          : 'Contribution scores and impact levels come from the current demo prediction layer.'}
      </p>
    </div>
  );
}