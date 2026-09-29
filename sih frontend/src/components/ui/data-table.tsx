import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeletonTable } from './loading-skeleton';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  keyExtractor: (item: T) => string;
  emptyState?: React.ReactNode;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  className?: string;
}

export function DataTable<T>({ 
  data, 
  columns, 
  isLoading = false, 
  keyExtractor, 
  emptyState,
  onSort,
  className 
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    const isAsc = sortKey === key && sortDir === 'asc';
    const newDir = isAsc ? 'desc' : 'asc';
    setSortKey(key);
    setSortDir(newDir);
    if (onSort) onSort(key, newDir);
  };

  if (isLoading) {
    return <SkeletonTable rows={5} cols={columns.length} />;
  }

  if (data.length === 0) {
    return (
      <div className={cn("w-full rounded-[var(--radius-lg)] border border-gray-200 bg-white", className)}>
        {emptyState || (
          <EmptyState 
            icon={Search} 
            title="No results found" 
            description="We couldn't find any data matching your criteria." 
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("w-full overflow-hidden rounded-[var(--radius-lg)] border border-gray-200 bg-white shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500",
                    col.sortable && "cursor-pointer hover:bg-gray-100"
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((item) => (
              <tr 
                key={keyExtractor(item)}
                className="hover:bg-gray-50 transition-colors"
              >
                {columns.map((col) => (
                  <td key={`${keyExtractor(item)}-${col.key}`} className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {col.render ? col.render(item) : (item as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
