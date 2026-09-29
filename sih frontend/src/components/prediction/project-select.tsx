import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Project } from '@/types';
import { cn } from '@/lib/utils';

interface ProjectSelectProps {
  projects: Project[];
  value: Project | null;
  onChange: (project: Project | null) => void;
  placeholder?: string;
}

export function ProjectSelect({ projects, value, onChange, placeholder = 'Select Project' }: ProjectSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? projects.filter((p) => `${p.name} ${p.code} ${p.district} ${p.state}`.toLowerCase().includes(q))
      : projects;
    return base.slice(0, 200);
  }, [projects, query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const openPanel = () => {
    setOpen(true);
    setQuery('');
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const select = (p: Project) => {
    onChange(p);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-label="Select Project"
        onClick={() => {
          if (open) setOpen(false);
          else openPanel();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (open) setOpen(false);
            else openPanel();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border bg-white px-3.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]',
          open
            ? 'border-[var(--color-brand-primary)] ring-2 ring-[var(--color-brand-accent)]'
            : 'border-gray-200 hover:border-[var(--color-brand-accent)]/50'
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {value ? (
            <>
              <span className="font-medium text-gray-900">{value.name}</span>
              <span className="text-gray-400"> — {value.district}</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        {value && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              setOpen(false);
            }}
            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </div>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-[var(--radius-md)] border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, options.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === 'Enter') {
                  if (options[highlight]) select(options[highlight]);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="Search projects…"
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1" aria-label="Select Project">
            {options.length === 0 && (
              <li className="px-3.5 py-3 text-sm text-gray-400">No projects match &quot;{query}&quot;.</li>
            )}
            {options.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.id === p.id}
                  onClick={() => select(p)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors',
                    i === highlight ? 'bg-[var(--color-bg-muted)]' : 'bg-transparent'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">{p.name}</span>
                    <span className="block truncate text-xs text-gray-400">
                      {p.code} · {p.district}, {p.state}
                    </span>
                  </span>
                  {value?.id === p.id && <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-primary)]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}