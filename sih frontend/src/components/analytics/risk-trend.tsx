import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TrendPoint } from '@/utils/analytics-helpers';

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;

  const avgDelay = payload.find((p) => p.dataKey === 'avgDelay')?.value;
  const highRiskCount = payload.find((p) => p.dataKey === 'highRiskCount')?.value;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{label}</p>
      <p className="mt-1 text-gray-600">Average predicted delay</p>
      <p className="font-semibold text-brand-primary tabular-nums">{avgDelay} days</p>
      <p className="mt-1.5 text-gray-600">High-risk projects</p>
      <p className="font-semibold text-risk-high tabular-nums">{highRiskCount}</p>
    </div>
  );
}

export function RiskTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-4">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-brand-accent)]" />
          Avg predicted delay
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-0.5 w-4 rounded-full border-t border-dashed border-gray-400" />
          High-risk projects
        </span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="analyticsTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-brand-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F3" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
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
              fill="url(#analyticsTrendGradient)"
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