import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DelayBucket } from '@/utils/analytics-helpers';

interface BucketTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DelayBucket }>;
  total: number;
}

function BucketTooltip({ active, payload, total }: BucketTooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  if (!bucket) return null;
  const percentage = total > 0 ? ((bucket.count / total) * 100).toFixed(1) : '0';

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs shadow-elevated">
      <p className="font-semibold text-gray-900">{bucket.label} days</p>
      <p className="mt-1 text-gray-600">Predicted delay</p>
      <p className="font-semibold text-brand-primary tabular-nums">
        {bucket.count} projects · {percentage}%
      </p>
    </div>
  );
}

export function DelayDistribution({ buckets, total }: { buckets: DelayBucket[]; total: number }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F3" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8494A7' }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8494A7' }}
          />
          <Tooltip content={<BucketTooltip total={total} />} cursor={{ fill: 'rgba(15, 36, 64, 0.04)' }} />
          <Bar dataKey="count" fill="var(--color-brand-accent)" radius={[6, 6, 0, 0]} barSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}