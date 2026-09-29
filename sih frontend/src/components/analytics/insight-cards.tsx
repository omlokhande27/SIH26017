import { Activity, Info, Sparkles, TrendingUp } from 'lucide-react';
import type { AnalyticsInsight, InsightTone } from '@/mock/analytics';
import { cn } from '@/lib/utils';

const toneStyles: Record<InsightTone, { icon: typeof Info; ring: string; iconColor: string }> = {
  'risk-high': { icon: TrendingUp, ring: 'border-l-[var(--color-risk-high)]', iconColor: 'text-[var(--color-risk-high)]' },
  'risk-medium': { icon: Activity, ring: 'border-l-[var(--color-risk-medium)]', iconColor: 'text-[var(--color-risk-medium)]' },
  brand: { icon: Sparkles, ring: 'border-l-[var(--color-brand-accent)]', iconColor: 'text-brand-primary' },
  neutral: { icon: Info, ring: 'border-l-gray-400', iconColor: 'text-gray-500' },
};

const MOCK_NOTE = 'Demo insight — the backend analytics service will compute real figures.';

export function InsightCards({ insights }: { insights: AnalyticsInsight[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {insights.map((insight) => {
        const style = toneStyles[insight.tone];
        const Icon = style.icon;
        return (
          <div
            key={insight.id}
            className={cn(
              'rounded-[var(--radius-md)] border border-gray-200 border-l-2 bg-white p-4 shadow-[var(--shadow-sm)]',
              style.ring
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', style.iconColor)} />
                <p className="text-sm font-semibold leading-snug text-gray-900">{insight.title}</p>
              </div>
              <span
                className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400"
                title={MOCK_NOTE}
              >
                Mock
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">{insight.body}</p>
          </div>
        );
      })}
    </div>
  );
}