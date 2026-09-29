import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { DelayReasonSlice, DelayReasonTotals } from '@/types';
import { cn } from '@/lib/utils';

interface DelayReasonDonutProps {
  slices: DelayReasonSlice[];
  totals: DelayReasonTotals;
  className?: string;
}

const LEADING_RATIO = 0.32;

export function DelayReasonDonut({ slices, totals, className }: DelayReasonDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (slices.length === 0) {
    return (
      <div className={cn('flex h-[300px] items-center justify-center', className)}>
        <p className="text-sm text-gray-500">No recorded delay reasons.</p>
      </div>
    );
  }

  const active = activeIndex !== null ? slices[activeIndex] : null;
  const leading = slices[0];

  return (
    <div
      className={cn('flex flex-col', className)}
      onMouseLeave={() => setActiveIndex(null)}
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative h-[240px] w-full shrink-0 sm:w-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="cases"
                nameKey="label"
                innerRadius={72}
                outerRadius={100}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {slices.map((slice, index) => {
                  const isActive = activeIndex === index;
                  return (
                    <Cell
                      key={slice.key}
                      fill={slice.color}
                      opacity={activeIndex === null || isActive ? 1 : 0.28}
                      stroke={isActive ? '#ffffff' : 'none'}
                      strokeWidth={isActive ? 4 : 2}
                      style={{
                        transition: 'opacity 160ms ease, stroke-width 160ms ease',
                        cursor: 'pointer',
                        filter: isActive ? `drop-shadow(0 4px 10px ${slice.color}66)` : 'none',
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            {active ? (
              <>
                <span className="text-3xl font-bold leading-none tabular-nums" style={{ color: active.color }}>
                  {active.cases}
                </span>
                <span className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  {active.label}
                </span>
                <span className="mt-1 text-[10px] text-gray-400">
                  {active.share}% of reasons
                </span>
              </>
            ) : (
              <>
                <span className="text-4xl font-bold leading-none tracking-tight text-gray-900 tabular-nums">
                  {totals.affectedProjects}
                </span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Projects affected
                </span>
                <span className="mt-1.5 text-[10px] leading-4 text-gray-500">
                  Hover a slice for detail
                </span>
              </>
            )}
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {slices.map((slice, index) => {
            const isActive = activeIndex === index;
            const isDimmed = activeIndex !== null && !isActive;
            const width = (slice.cases / (slices[0]?.cases || 1)) * 100;

            return (
              <li key={slice.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
                    isActive
                      ? 'border-transparent bg-gray-50 shadow-sm'
                      : 'border-transparent hover:border-gray-100 hover:bg-gray-50/70',
                    isDimmed && 'opacity-60',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate text-[13px] font-semibold text-gray-800">
                      {slice.label}
                    </span>
                    <span className="ml-auto shrink-0 text-sm font-bold text-gray-900 tabular-nums">
                      {slice.cases}
                    </span>
                    <span className="w-11 shrink-0 text-right text-[11px] font-medium text-gray-400 tabular-nums">
                      {slice.share}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(width * LEADING_RATIO, 3)}%`,
                        backgroundColor: slice.color,
                        opacity: isDimmed ? 0.5 : 1,
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] leading-4 text-gray-400">
        {leading.label} is the leading reason across {totals.reasonRecords} recorded entries.{' '}
        {totals.affectedProjects} projects carry at least one unresolved issue, and a project can hold
        more than one reason.
      </p>
    </div>
  );
}
