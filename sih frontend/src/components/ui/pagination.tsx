import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
  className?: string;
}

function getPageNumbers(page: number, pageCount: number): Array<number | '...'> {
  const pages: Array<number | '...'> = [];
  const total = pageCount;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }

  const first = 1;
  const last = total;

  pages.push(first);
  if (page > 3) pages.push('...');

  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (page < total - 2) pages.push('...');
  pages.push(last);

  return pages;
}

export function Pagination({ page, pageCount, onPageChange, totalItems, pageSize, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4', className)}>
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{start}</span>–<span className="font-medium text-gray-900">{end}</span>{' '}
        of <span className="font-medium text-gray-900">{totalItems}</span> projects
      </p>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-accent)]"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {getPageNumbers(page, pageCount).map((item, index) =>
          item === '...' ? (
            <span key={`ellipsis-${index}`} className="flex h-8 w-8 items-center justify-center text-gray-400">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-accent)]',
                item === page
                  ? 'bg-[var(--color-brand-primary)] text-white'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-accent)]"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}