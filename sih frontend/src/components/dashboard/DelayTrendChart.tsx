import { useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DelayTrendPoint, TrendRange } from '@/types';
import { cn } from '@/lib/utils';

const ranges: TrendRange[] = ['7D', '30D', '90D', '1Y'];

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: DelayTrendPoint }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{shortDate(String(label ?? ''))}</p>
      <p className="mt-1 text-gray-600">Avg predicted delay</p>
      <p className="font-semibold text-risk-medium">{point?.avgDelay} days</p>
      <p className="mt-1.5 text-gray-600">High-risk projects</p>
      <p className="font-semibold text-risk-high">{point?.highRiskCount}</p>
    </div>
  );
}

interface DelayTrendChartProps {
  data?: Record<TrendRange, DelayTrendPoint[]>;
}

export function DelayTrendChart({ data }: DelayTrendChartProps) {
  const [range, setRange] = useState<TrendRange>('7D');
  const chartData = data ? data[range] : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex rounded-lg border border-gray-200 bg-bg-muted p-0.5">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                range === r ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[260px] w-full lg:h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="delayGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-brand-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F3" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              tick={{ fontSize: 11, fill: '#8494A7' }}
            />
            <YAxis
              yAxisId="delay"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#8494A7' }}
              domain={['dataMin - 10', 'dataMax + 10']}
            />
            <YAxis yAxisId="count" hide />
            <Tooltip content={<TrendTooltip />} />
            <Area
              yAxisId="delay"
              type="monotone"
              dataKey="avgDelay"
              name="Avg predicted delay"
              stroke="var(--color-brand-accent)"
              strokeWidth={2.5}
              fill="url(#delayGradient)"
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="highRiskCount"
              name="High-risk projects"
              stroke="#CBD2DA"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}