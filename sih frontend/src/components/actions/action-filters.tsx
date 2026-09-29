import { ChevronDown, RotateCcw } from 'lucide-react';
import { RiskLevel, ActionStatus } from '@/types';
import { cn } from '@/lib/utils';
import type { ActionFilters, ActionRiskFilter, ActionStatusFilter } from './action-filter-utils';
import { DEFAULT_ACTION_FILTERS, actionFiltersActive } from './action-filter-utils';

const STATUS_OPTIONS: Array<{ value: ActionStatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: ActionStatus.PENDING, label: 'Pending' },
  { value: ActionStatus.IN_PROGRESS, label: 'In Progress' },
  { value: ActionStatus.COMPLETED, label: 'Completed' },
  { value: ActionStatus.BLOCKED, label: 'Blocked' },
];

const RISK_OPTIONS: Array<{ value: ActionRiskFilter; label: string }> = [
  { value: 'ALL', label: 'All risk levels' },
  { value: RiskLevel.CRITICAL, label: 'Critical' },
  { value: RiskLevel.HIGH, label: 'High' },
  { value: RiskLevel.MEDIUM, label: 'Medium' },
  { value: RiskLevel.LOW, label: 'Low' },
];

interface FilterSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-gray-200 bg-white px-2.5 transition-colors hover:border-brand-accent/40">
      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent pr-4 text-sm font-medium text-gray-700 outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      </span>
    </label>
  );
}

interface ActionFiltersBarProps {
  filters: ActionFilters;
  onChange: (next: ActionFilters) => void;
  priorityOptions: number[];
  projectOptions: string[];
  countByStatus: Record<ActionStatus, number>;
  totalCount: number;
  shownCount: number;
}

export function ActionFiltersBar({
  filters,
  onChange,
  priorityOptions,
  projectOptions,
  countByStatus,
  shownCount,
}: ActionFiltersBarProps) {
  const setField = <K extends keyof ActionFilters>(key: K, value: ActionFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Priority"
          value={String(filters.priority)}
          options={[{ value: 'ALL', label: 'All priorities' }, ...priorityOptions.map((p) => ({ value: String(p), label: `Priority ${p}` }))]}
          onChange={(value) => setField('priority', value === 'ALL' ? 'ALL' : Number(value))}
        />
        <FilterSelect
          label="Project"
          value={filters.project}
          options={[{ value: 'ALL', label: 'All projects' }, ...projectOptions.map((p) => ({ value: p, label: p }))]}
          onChange={(value) => setField('project', value)}
        />
        <FilterSelect
          label="Risk"
          value={filters.risk}
          options={RISK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(value) => setField('risk', value as RiskLevel | 'ALL')}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((option) => {
            const active = filters.status === option.value;
            const count = option.value === 'ALL' ? undefined : countByStatus[option.value] ?? 0;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setField('status', option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  active
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-accent/40 hover:text-brand-primary'
                )}
              >
                {option.label}
                {count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>

        {actionFiltersActive(filters) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_ACTION_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-brand-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}

        {shownCount > 0 && (
          <p className="ml-auto text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{shownCount}</span> actions
          </p>
        )}
      </div>
    </div>
  );
}