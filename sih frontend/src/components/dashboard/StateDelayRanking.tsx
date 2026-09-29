import { ArrowUpRight, Trophy } from 'lucide-react';
import type { DelayBand, StateDelayPerformance } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StateDelayRankingProps {
  rows: StateDelayPerformance[];
  onSelectState?: (state: string) => void;
  className?: string;
}

const BAND_STYLES: Record<DelayBand, { bar: string; chip: string; label: string }> = {
  severe: { bar: 'bg-[#B91C1C]', chip: 'bg-red-50 text-red-700 ring-red-200', label: 'Very high' },
  high: { bar: 'bg-[#EA580C]', chip: 'bg-orange-50 text-orange-700 ring-orange-200', label: 'High' },
  moderate: { bar: 'bg-[#EAB308]', chip: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Medium' },
  contained: { bar: 'bg-[#22C55E]', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Low' },
};

/**
 * Ranks states by average predicted delay, worst first, so the list reads as a
 * triage queue. The bar length is the state's average delay relative to the
 * worst state, which keeps the comparison honest across a small portfolio.
 */
export function StateDelayRanking({ rows, onSelectState, className }: StateDelayRankingProps) {
  if (rows.length === 0) {
    return (
      <Card className={cn('h-full', className)}>
        <CardContent className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-gray-500">No state-level delay data is available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('flex h-full flex-col overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">State delay performance</h2>
          <p className="mt-1 text-xs text-gray-500">Average predicted delay per state, highest first.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          <Trophy className="h-3 w-3" />
          {rows.length} states
        </span>
      </div>

      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
        {rows.map((row, index) => {
          const band = BAND_STYLES[row.band];
          const Wrapper = onSelectState ? 'button' : 'div';

          return (
            <Wrapper
              key={row.state}
              {...(onSelectState ? { type: 'button' as const, onClick: () => onSelectState(row.state) } : {})}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left transition-all',
                onSelectState && 'hover:border-brand-accent hover:bg-brand-subtle/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums',
                  index === 0 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600',
                )}
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{row.state}</p>
                  <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1', band.chip)}>
                    {band.label}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn('h-full rounded-full transition-all', band.bar)}
                      style={{ width: `${Math.max(row.intensity * 100, 4)}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-gray-500 tabular-nums">
                    {row.projectCount} proj
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-base font-bold text-gray-900 tabular-nums">{row.averageDelayDays}</p>
                <p className="text-[10px] font-medium text-gray-400">avg days</p>
              </div>

              {onSelectState && (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-brand-primary" />
              )}
            </Wrapper>
          );
        })}
      </CardContent>
    </Card>
  );
}
