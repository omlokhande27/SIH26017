import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  className?: string;
}

export function FilterDropdown({ label, options, value, onChange, multiple = false, className }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSelected = (optVal: string) => {
    if (multiple && Array.isArray(value)) return value.includes(optVal);
    return value === optVal;
  };

  const handleSelect = (optVal: string) => {
    if (multiple) {
      const arr = Array.isArray(value) ? value : [];
      if (arr.includes(optVal)) {
        onChange(arr.filter(v => v !== optVal));
      } else {
        onChange([...arr, optVal]);
      }
    } else {
      onChange(optVal);
      setIsOpen(false);
    }
  };

  const clearFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
    setIsOpen(false);
  };

  const hasValue = multiple ? Array.isArray(value) && value.length > 0 : !!value;

  return (
    <div className={cn('relative inline-block text-left', className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex w-full items-center justify-between gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]',
          hasValue && 'ring-[var(--color-brand-primary)] bg-blue-50'
        )}
      >
        <span className="flex items-center gap-2">
          {label}
          {hasValue && (
            <span className="flex items-center justify-center rounded-full bg-[var(--color-brand-primary)] text-[10px] font-bold text-white px-1.5 min-w-[1.25rem] h-5">
              {multiple && Array.isArray(value) ? value.length : '1'}
            </span>
          )}
        </span>
        {hasValue ? (
          <X className="-mr-1 h-4 w-4 text-gray-400 hover:text-gray-600" onClick={clearFilter} />
        ) : (
          <ChevronDown className="-mr-1 h-4 w-4 text-gray-400" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1 max-h-60 overflow-auto">
            {options.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="group flex cursor-pointer items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                <span>{option.label}</span>
                {isSelected(option.value) && <Check className="h-4 w-4 text-[var(--color-brand-primary)]" />}
              </div>
            ))}
          </div>
          {hasValue && (
            <div className="border-t border-gray-100 p-2">
              <button
                onClick={(e) => clearFilter(e)}
                className="w-full rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-center"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
