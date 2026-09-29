import { AlertTriangle, Clock3, IndianRupee, Info, Timer, TrendingUp } from 'lucide-react';
import type { IntelligenceMetric, IntelligenceMetricId } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const metricConfig: Record<IntelligenceMetricId, { icon: typeof Clock3; iconClass: string; valueClass: string }> = {
  delayedCases: { icon: Timer, iconClass: 'bg-amber-50 text-amber-700', valueClass: 'text-amber-900' },
  highRiskCases: { icon: AlertTriangle, iconClass: 'bg-red-50 text-red-700', valueClass: 'text-red-900' },
  averageDelay: { icon: Clock3, iconClass: 'bg-blue-50 text-blue-700', valueClass: 'text-blue-900' },
  additionalExpenditure: { icon: IndianRupee, iconClass: 'bg-emerald-50 text-emerald-700', valueClass: 'text-emerald-900' },
};

interface IntelligenceMetricCardProps {
  metric: IntelligenceMetric;
  onOpen: (path: string) => void;
}

export function IntelligenceMetricCard({ metric, onOpen }: IntelligenceMetricCardProps) {
  const config = metricConfig[metric.id];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(metric.path)}
      title={metric.detail}
      className="group block w-full rounded-[var(--radius-lg)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
    >
      <Card className="h-full border-gray-200 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-accent/50 group-hover:shadow-elevated">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">{metric.label}</p>
              <p className={cn('mt-3 font-bold tracking-tight tabular-nums', metric.id === 'additionalExpenditure' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl', config.valueClass)}>{metric.value}</p>
            </div>
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', config.iconClass)}>
              <Icon className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-gray-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>{metric.detail}</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary opacity-0 transition-opacity group-hover:opacity-100">
            <TrendingUp className="h-3.5 w-3.5" /> Open related view
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
