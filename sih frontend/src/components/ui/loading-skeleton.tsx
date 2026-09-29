import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200', className)}
      {...props}
    />
  );
}

export function SkeletonLine({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} {...props} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 shadow-sm">
      <Skeleton className="h-10 w-10 rounded-full mb-4" />
      <SkeletonLine className="w-1/3 mb-2" />
      <SkeletonLine className="w-full mb-2" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex border-b border-gray-200 bg-gray-50 p-4 gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex p-4 gap-4">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
