import { Building2, AlertTriangle, Clock, ClipboardCheck, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ExecKpi } from '@/mock/executive';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  kpi: ExecKpi;
  onOpen: (path: string) => void;
}

function resolveIcon(id: ExecKpi['id']) {
  switch (id) {
    case 'total':
      return { Icon: Building2, iconClass: 'text-brand-accent bg-brand-subtle' };
    case 'highRisk':
      return { Icon: AlertTriangle, iconClass: 'text-risk-high bg-risk-high-bg' };
    case 'avgDelay':
      return { Icon: Clock, iconClass: 'text-risk-medium bg-risk-medium-bg' };
    default:
      return { Icon: ClipboardCheck, iconClass: 'text-brand-primary bg-brand-subtle' };
  }
}

function resolveDelta(delta: string, tone: ExecKpi['tone']) {
  const up = delta.startsWith('+') || delta.startsWith('↑');
  const down = delta.startsWith('↓') || delta.startsWith('-');

  if (tone === 'neutral') {
    return { Icon: null, textClass: 'text-gray-500' };
  }
  if (tone === 'good') {
    return { Icon: up ? ArrowUpRight : down ? ArrowDownRight : null, textClass: 'text-risk-low' };
  }
  return { Icon: up ? ArrowUpRight : down ? ArrowDownRight : null, textClass: 'text-risk-high' };
}

export function KpiCard({ kpi, onOpen }: KpiCardProps) {
  const { Icon, iconClass } = resolveIcon(kpi.id);
  const delta = resolveDelta(kpi.delta, kpi.tone);

  return (
    <button
      type="button"
      onClick={() => onOpen(kpi.path)}
      className="group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 rounded-[var(--radius-lg)]"
    >
      <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-accent/50 group-hover:shadow-elevated">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">{kpi.title}</span>
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', iconClass)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>

          <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{kpi.value}</p>

          <div className="mt-3 flex items-center gap-1">
            {delta.Icon && <delta.Icon className={cn('h-3.5 w-3.5', delta.textClass)} />}
            <span className={cn('text-xs font-medium', delta.textClass)}>{kpi.delta}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-accent" />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}