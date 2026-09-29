import { useNavigate } from 'react-router';
import { ArrowRight, CircleDot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PriorityActionItem } from '@/mock/executive';
import { RiskLevel, ActionStatus } from '@/types';
import { cn } from '@/lib/utils';

interface PriorityActionsProps {
  actions: PriorityActionItem[];
}

const statusStyle: Record<ActionStatus, { className: string; label: string }> = {
  [ActionStatus.PENDING]: { className: 'bg-gray-100 text-gray-600 border border-gray-200', label: 'Pending' },
  [ActionStatus.IN_PROGRESS]: { className: 'bg-blue-50 text-blue-700 border border-blue-100', label: 'In Progress' },
  [ActionStatus.COMPLETED]: { className: 'bg-risk-low/10 text-risk-low border border-risk-low-border', label: 'Completed' },
  [ActionStatus.OVERDUE]: { className: 'bg-risk-critical-bg text-risk-critical border border-risk-critical-border', label: 'Overdue' },
  [ActionStatus.BLOCKED]: { className: 'bg-gray-100 text-gray-500 border border-gray-200', label: 'Blocked' },
};

const priorityDot: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-risk-low',
  [RiskLevel.MEDIUM]: 'bg-risk-medium',
  [RiskLevel.HIGH]: 'bg-risk-high',
  [RiskLevel.CRITICAL]: 'bg-risk-critical',
};

export function PriorityActions({ actions }: PriorityActionsProps) {
  const navigate = useNavigate();
  if (actions.length === 0) return null;

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">Priority Actions</h3>
        <button
          type="button"
          onClick={() => navigate('/recommendations')}
          className="text-xs font-semibold text-brand-primary transition-colors hover:text-brand-accent"
        >
          View All
        </button>
      </div>

      <CardContent className="divide-y divide-gray-100 p-0">
        {actions.map((action) => {
          const status = statusStyle[action.status];
          return (
            <div key={action.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-bg-muted/50">
              <span className="relative mt-2.5 flex h-2.5 w-2.5 shrink-0">
                <CircleDot className={cn('h-2.5 w-2.5', priorityDot[action.priority])} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{action.project}</p>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-semibold',
                      action.impact === 'HIGH IMPACT'
                        ? 'bg-risk-high-bg text-risk-high border border-risk-high-border'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    )}
                  >
                    {action.impact}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{action.issue}</p>
                <p className="mt-1.5 text-xs font-medium text-brand-primary">→ {action.recommendedAction}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', status.className)}>
                  {status.label}
                </span>
                {action.daysLeft !== undefined && (
                  <span className="text-[10px] text-gray-400">{action.daysLeft} days left</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      <div className="border-t border-gray-100 px-6 py-3">
        <button
          type="button"
          onClick={() => navigate('/recommendations')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary transition-colors hover:text-brand-accent"
        >
          Open action center
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}