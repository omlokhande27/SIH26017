import React from 'react';
import { ProjectStatus } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

interface StatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<ProjectStatus, { className: string; label: string }> = {
    [ProjectStatus.PLANNING]: { className: 'bg-blue-100 text-blue-800', label: 'Planning' },
    [ProjectStatus.IN_PROGRESS]: { className: 'bg-cyan-100 text-cyan-800', label: 'In Progress' },
    [ProjectStatus.DELAYED]: { className: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]', label: 'Delayed' },
    [ProjectStatus.ON_HOLD]: { className: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]', label: 'On Hold' },
    [ProjectStatus.COMPLETED]: { className: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]', label: 'Completed' },
  };

  const { className: badgeClass, label } = config[status] || { className: '', label: 'Unknown' };

  return (
    <Badge className={cn(badgeClass, className)}>
      {label}
    </Badge>
  );
}
