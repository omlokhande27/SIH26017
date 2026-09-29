import { useMemo } from 'react';
import { ScatterChart, Scatter, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ScatterPoint } from '@/mock/analytics';

interface ScatterTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ScatterPoint }>;
}

function ScatterTooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{point.name}</p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex justify-between gap-6">
          <dt className="text-gray-600">Acquisition</dt>
          <dd className="font-semibold text-gray-900 tabular-nums">{point.acquisitionPercentage}%</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-gray-600">Predicted delay</dt>
          <dd className="font-semibold text-gray-900 tabular-nums">{point.predictedDelay} days</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="text-gray-600">Risk</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-gray-900">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: point.color }} />
            {point.riskLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const LEGEND = [
  { label: 'Low Risk', color: 'var(--color-risk-low)' },
  { label: 'Medium Risk', color: 'var(--color-risk-medium)' },
  { label: 'High Risk', color: 'var(--color-risk-high)' },
];

export function AcquisitionScatter({ data }: { data: ScatterPoint[] }) {
  const points = useMemo(
    () =>
      data.map((p) => ({
        x: p.acquisitionPercentage,
        y: p.predictedDelay,
        name: p.name,
        acquisitionPercentage: p.acquisitionPercentage,
        predictedDelay: p.predictedDelay,
        riskLabel: p.riskLabel,
        color: p.color,
      })),
    [data]
  );

  return (
    <div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDF0F3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Acquisition"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#8494A7' }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Delay"
              domain={[0, 480]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#8494A7' }}
            />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#CBD2DA' }} />
            <Scatter data={points} fill="var(--color-brand-accent)">
              {points.map((point, index) => (
                <Cell key={index} fill={point.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}