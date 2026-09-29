import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { RiskBucket } from '@/utils/analytics-helpers';

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: RiskBucket }>;
  total: number;
}

function DonutTooltip({ active, payload, total }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  if (!bucket) return null;
  const percentage = total > 0 ? ((bucket.count / total) * 100).toFixed(1) : '0';

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="flex items-center gap-1.5 font-semibold text-gray-900">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bucket.color }} />
        {bucket.label} Risk
      </p>
      <p className="mt-0.5 text-gray-600">
        {bucket.count} projects · {percentage}% of portfolio
      </p>
    </div>
  );
}

export function ProjectsRiskDonut({ buckets }: { buckets: RiskBucket[] }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={buckets}
              dataKey="count"
              nameKey="label"
              innerRadius={70}
              outerRadius={96}
              paddingAngle={2}
              stroke="none"
            >
              {buckets.map((bucket) => (
                <Cell key={bucket.key} fill={bucket.color} className="transition-opacity hover:opacity-80" />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{total}</span>
          <span className="text-xs font-medium uppercase tracking-widest text-gray-400">Projects</span>
        </div>
      </div>

      <div className="mt-4 w-full space-y-1.5">
        {buckets.map((bucket) => {
          const percentage = total > 0 ? ((bucket.count / total) * 100).toFixed(1) : '0';
          return (
            <div key={bucket.key} className="flex w-full items-center gap-3 rounded-lg px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: bucket.color }} />
              <span className="text-sm font-medium text-gray-700">{bucket.label} Risk</span>
              <span className="ml-auto text-sm font-semibold text-gray-900 tabular-nums">{bucket.count}</span>
              <span className="w-12 text-right text-xs text-gray-400 tabular-nums">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}