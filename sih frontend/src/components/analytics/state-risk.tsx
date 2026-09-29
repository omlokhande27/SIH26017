import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StateRiskPoint } from '@/utils/analytics-helpers';

interface StateTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: StateRiskPoint }>;
}

function StateTooltip({ active, payload }: StateTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{point.state}</p>
      <p className="mt-1 text-gray-600">High-risk projects</p>
      <p className="font-semibold text-risk-high tabular-nums">{point.highCount}</p>
    </div>
  );
}

export function StateRiskChart({ data }: { data: StateRiskPoint[] }) {
  const top = data.slice(0, 8);

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F3" />
          <XAxis
            dataKey="short"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8494A7' }}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8494A7' }}
          />
          <Tooltip content={<StateTooltip />} cursor={{ fill: 'rgba(15, 36, 64, 0.04)' }} />
          <Bar dataKey="highCount" fill="var(--color-risk-high)" radius={[6, 6, 0, 0]} barSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}