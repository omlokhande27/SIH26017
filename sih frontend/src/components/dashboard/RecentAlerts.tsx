import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NotificationType } from '@/types';
import type { Notification } from '@/types';
import { formatRelativeTime } from '@/utils/formatting';

interface RecentAlertsProps {
  notifications: Notification[];
  onViewAll?: () => void;
  onSelect?: (projectId: string | null) => void;
}

const TYPE_STYLE: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  [NotificationType.RISK_CHANGE]: { icon: AlertTriangle, className: 'bg-red-50 text-red-600' },
  [NotificationType.PREDICTION_READY]: { icon: TrendingUp, className: 'bg-orange-50 text-orange-600' },
  [NotificationType.ACTION_DEADLINE]: { icon: CalendarClock, className: 'bg-amber-50 text-amber-600' },
  [NotificationType.COMPENSATION_UPDATE]: { icon: IndianRupee, className: 'bg-blue-50 text-blue-600' },
  [NotificationType.GENERAL]: { icon: BellRing, className: 'bg-slate-100 text-slate-600' },
};

export function RecentAlerts({ notifications, onViewAll, onSelect }: RecentAlertsProps) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <BellRing className="h-4 w-4 shrink-0 text-brand-accent" />
          <h2 className="truncate text-base font-semibold text-gray-900">Recent alerts &amp; insights</h2>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-center text-sm text-gray-500">
          No alerts have been recorded yet.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-gray-50">
          {notifications.map((notification) => {
            const style = TYPE_STYLE[notification.type] ?? TYPE_STYLE[NotificationType.GENERAL];
            const Icon = style.icon;
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(notification.projectId ?? null)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-gray-900">
                      {notification.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">
                      {notification.message}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-[10px] text-gray-400">
                      {formatRelativeTime(notification.timestamp)}
                    </span>
                    <ChevronGlyph />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-2.5 text-[10px] text-gray-400">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
        Derived from recorded project events.
      </div>
    </Card>
  );
}

function ChevronGlyph() {
  return <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />;
}
