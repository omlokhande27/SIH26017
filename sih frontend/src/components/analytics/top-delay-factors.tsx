import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { FactorScore } from '@/mock/analytics';

interface FactorTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: FactorScore }>;
}

function FactorTooltip({ active, payload }: FactorTooltipProps) {
  if (!active || !payload?.length) return null;
  const factor = payload[0].payload;
  if (!factor) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{factor.name}</p>
      <p className="mt-1 text-gray-600">Aggregate exposure</p>
      <p className="font-semibold text-brand-primary tabular-nums">{factor.score}/100</p>
      <p className="mt-1.5 text-gray-600">Affected projects</p>
      <p className="font-semibold text-gray-900 tabular-nums">{factor.projectCount}</p>
    </div>
  );
}

export function TopDelayFactors({ factors }: { factors: FactorScore[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={factors} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#EDF0F3" />
          <XAxis
            type="number"
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8494A7' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#6B7280' }}
          />
          <Tooltip content={<FactorTooltip />} cursor={{ fill: 'rgba(15, 36, 64, 0.04)' }} />
          <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={18}>
            {factors.map((factor, index) => (
              <Cell
                key={factor.key}
                fill={index === 0 ? 'var(--color-brand-primary)' : 'var(--color-brand-accent)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}