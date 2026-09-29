import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional secondary line shown under the label. */
  caption?: string;
}

interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  invalid?: boolean;
  /** Shown when options are empty because a parent selection is missing. */
  emptyMessage?: string;
  className?: string;
}

/**
 * Single-select dropdown styled for the authentication screens. The trigger
 * keeps the chevron on the right edge so the control reads as a picker rather
 * than a plain text input.
 */
export function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  hint,
  invalid = false,
  emptyMessage = 'No options available',
  className,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const isOpen = open && !disabled;

  const toggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setSearch('');
        // Flip the panel above the trigger when there is not enough room
        // below, so the list always stays inside the viewport.
        const trigger = containerRef.current?.getBoundingClientRect();
        if (trigger) {
          const panelHeight = Math.min(options.length, 6) * 42 + (options.length > 8 ? 48 : 0) + 16;
          const roomBelow = window.innerHeight - trigger.bottom;
          setDropUp(roomBelow < panelHeight && trigger.top > roomBelow);
        }
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      return next;
    });
  };

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label,
    [options, value],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, search]);

  const select = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className={cn('block', className)} ref={containerRef}>
      <span className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      <div className="relative mt-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-invalid={invalid}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-lg border bg-white pl-3 pr-10 text-left text-sm transition',
            'focus:outline-none focus:ring-3',
            invalid
              ? 'border-red-300 focus:border-red-400 focus:ring-red-500/15'
              : 'border-slate-300 focus:border-brand-accent focus:ring-brand-accent/15',
            disabled && 'cursor-not-allowed bg-slate-50 text-slate-400',
            !disabled && 'hover:border-slate-400',
          )}
        >
          <span className={cn('truncate', selectedLabel ? 'text-slate-900' : 'text-slate-400')}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              'pointer-events-none absolute right-3 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
              isOpen && 'rotate-180 text-brand-primary',
            )}
          />
        </button>

        {isOpen && (
          <div
            className={cn(
              'absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10',
              dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
          >
            {options.length > 8 && (
              <div className="border-b border-slate-100 p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Type to filter"
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-accent"
                />
              </div>
            )}

            <ul id={listboxId} role="listbox" className="max-h-60 overflow-y-auto overscroll-contain py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-slate-400">{emptyMessage}</li>
              ) : (
                filtered.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => select(option)}
                        className={cn(
                          'flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-brand-subtle/60 font-semibold text-brand-navy'
                            : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option.label}</span>
                          {option.caption && (
                            <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">
                              {option.caption}
                            </span>
                          )}
                        </span>
                        {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {hint && <span className="mt-1.5 block text-[11px] leading-4 text-slate-500">{hint}</span>}
    </div>
  );
}
