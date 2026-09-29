import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Hourglass } from 'lucide-react';
import type { ActionOutcome, ActionOutcomeStatus } from '@/types';
import { cn } from '@/lib/utils';

const OUTCOME_STATUS_CONFIG: Record<ActionOutcomeStatus, { label: string; className: string }> = {
  IMPROVED: { label: 'Outcome Improved', className: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]' },
  NO_IMPROVEMENT: { label: 'No measurable improvement', className: 'bg-gray-100 text-gray-600' },
  RISK_INCREASED: { label: 'Risk increased', className: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]' },
  AWAITING_PREDICTION: { label: 'Awaiting new prediction', className: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]' },
};

const MOCK_NOTE = 'Mock outcome — the backend analytics service will supply verified prediction deltas.';

function ComparisonBar({ label, days, max, color }: { label: string; days: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(4, Math.round((days / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-900 tabular-nums">{days} days</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function OutcomePanel({ outcome, projectName, compact = false }: { outcome: ActionOutcome; projectName: string; compact?: boolean }) {
  const config = OUTCOME_STATUS_CONFIG[outcome.status];
  const isAwaiting = outcome.status === 'AWAITING_PREDICTION';
  const max = Math.max(outcome.beforeDelay, outcome.afterDelay ?? outcome.beforeDelay, 1);
  const afterColor =
    outcome.status === 'IMPROVED'
      ? 'var(--color-risk-low)'
      : outcome.status === 'RISK_INCREASED'
        ? 'var(--color-risk-high)'
        : '#9CA3AF';

  let deltaChip: ReactNode;
  if (isAwaiting || outcome.afterDelay === null) {
    deltaChip = (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-risk-medium)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--color-risk-medium)]">
        <Hourglass className="h-3 w-3" /> Pending next model run
      </span>
    );
  } else {
    const delta = outcome.afterDelay - outcome.beforeDelay;
    if (delta < 0) {
      deltaChip = (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-risk-low)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--color-risk-low)]">
          <ArrowDownRight className="h-3 w-3" /> {Math.abs(delta)} days saved
        </span>
      );
    } else if (delta > 0) {
      deltaChip = (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-risk-high)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--color-risk-high)]">
          <ArrowUpRight className="h-3 w-3" /> {delta} days worse
        </span>
      );
    } else {
      deltaChip = (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">
          <Minus className="h-3 w-3" /> No measurable change
        </span>
      );
    }
  }

  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-gray-200 bg-[var(--color-bg-app)] p-4', compact && 'p-3.5')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Action Outcome</p>
        <span
          className="rounded bg-gray-200/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500"
          title={MOCK_NOTE}
        >
          Mock
        </span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Project</p>
            <p className="text-sm font-medium text-gray-900">{projectName}</p>
          </div>
          <div className="flex items-end justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Prediction before intervention</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900 tabular-nums">{outcome.beforeDelay} days</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Updated prediction</p>
              <p className={cn('mt-0.5 text-lg font-bold tabular-nums', isAwaiting ? 'text-[var(--color-risk-medium)]' : 'text-gray-900')}>
                {outcome.afterDelay !== null ? `${outcome.afterDelay} days` : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', config.className)}>{config.label}</span>
            {deltaChip}
          </div>
        </div>

        <div className="space-y-3">
          <ComparisonBar label="Before intervention" days={outcome.beforeDelay} max={max} color="#94A3B8" />
          {outcome.afterDelay !== null && (
            <ComparisonBar label="Updated prediction" days={outcome.afterDelay} max={max} color={afterColor} />
          )}
          <p className="text-[11px] leading-relaxed text-gray-500">{outcome.note}</p>
        </div>
      </div>
    </div>
  );
}