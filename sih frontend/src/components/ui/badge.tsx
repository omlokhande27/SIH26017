import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--color-bg-muted)] text-gray-800',
    success: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]',
    warning: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]',
    error: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]',
    outline: 'border border-gray-200 text-gray-800',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
