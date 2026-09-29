import React from 'react';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}

export function StatTile({ label, value, sub, className }: StatTileProps) {
  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-gray-200 bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-sm)]', className)}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}