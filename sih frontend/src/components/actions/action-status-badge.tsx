import { Badge } from '@/components/ui/badge';
import { ActionStatus } from '@/types';
import { cn } from '@/lib/utils';

const ACTION_STATUS_CONFIG: Record<ActionStatus, { label: string; badgeClass: string; dot: string }> = {
  [ActionStatus.PENDING]: {
    label: 'Pending',
    badgeClass: 'bg-[var(--color-bg-muted)] text-gray-700',
    dot: 'bg-gray-400',
  },
  [ActionStatus.IN_PROGRESS]: {
    label: 'In Progress',
    badgeClass: 'bg-blue-100 text-blue-800',
    dot: 'bg-blue-500',
  },
  [ActionStatus.COMPLETED]: {
    label: 'Completed',
    badgeClass: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]',
    dot: 'bg-[var(--color-risk-low)]',
  },
  [ActionStatus.OVERDUE]: {
    label: 'Overdue',
    badgeClass: 'bg-[var(--color-risk-high)]/15 text-[var(--color-risk-high)]',
    dot: 'bg-[var(--color-risk-high)]',
  },
  [ActionStatus.BLOCKED]: {
    label: 'Blocked',
    badgeClass: 'bg-gray-800/10 text-gray-700',
    dot: 'bg-gray-700',
  },
};

export function ActionStatusBadge({ status, className }: { status: ActionStatus; className?: string }) {
  const config = ACTION_STATUS_CONFIG[status];
  return (
    <Badge className={cn(config.badgeClass, className)}>
      <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </Badge>
  );
}