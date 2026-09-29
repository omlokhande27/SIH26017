import { ChevronDown, RotateCcw } from 'lucide-react';
import { RiskLevel, ProjectStatus, ProjectSector } from '@/types';
import { getSectorLabel, getStatusLabel } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import {
  DEFAULT_FILTERS,
  DELAY_RANGES,
  filtersAreActive,
  type RiskFilterRisk,
  type RiskFilters,
} from './risk-filter-model';

// ─────────────────────────────────────────────────────────────────────────────
// Filter bar UI
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_PILLS: Array<{ key: RiskFilterRisk; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: RiskLevel.CRITICAL, label: 'Critical' },
  { key: RiskLevel.HIGH, label: 'High' },
  { key: RiskLevel.MEDIUM, label: 'Medium' },
  { key: RiskLevel.LOW, label: 'Low' },
];

const pillClass: Record<RiskFilterRisk, string> = {
  ALL: 'border-gray-200 bg-white text-gray-600 hover:border-brand-accent/40 hover:text-brand-primary',
  [RiskLevel.CRITICAL]: 'border-[var(--color-risk-critical)]/40 bg-[var(--color-risk-critical)]/10 text-[var(--color-risk-critical)]',
  [RiskLevel.HIGH]: 'border-[var(--color-risk-high)]/40 bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]',
  [RiskLevel.MEDIUM]: 'border-[var(--color-risk-medium)]/40 bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]',
  [RiskLevel.LOW]: 'border-[var(--color-risk-low)]/40 bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]',
};

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

export interface FilterBarProps {
  filters: RiskFilters;
  onChange: (next: RiskFilters) => void;
  stateOptions: string[];
  sectorOptions: ProjectSector[];
  statusOptions: ProjectStatus[];
  levelCounts?: Partial<Record<RiskLevel, number>>;
}

export function FilterBar({ filters, onChange, stateOptions, sectorOptions, statusOptions, levelCounts }: FilterBarProps) {
  const setField = <K extends keyof RiskFilters>(key: K, value: RiskFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filters</p>
        {filtersAreActive(filters) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-brand-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {LEVEL_PILLS.map((pill) => {
            const selected = filters.risk === pill.key;
            const count = pill.key === 'ALL' ? undefined : levelCounts?.[pill.key];
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setField('risk', pill.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  selected ? pillClass[pill.key] : 'border-gray-200 bg-white text-gray-500 hover:border-brand-accent/40 hover:text-brand-primary'
                )}
              >
                {pill.label}
                {count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="State"
            value={filters.state}
            options={[{ value: 'ALL', label: 'All states' }, ...stateOptions.map((s) => ({ value: s, label: s }))]}
            onChange={(value) => setField('state', value)}
          />
          <FilterSelect
            label="Sector"
            value={filters.sector}
            options={[
              { value: 'ALL', label: 'All sectors' },
              ...sectorOptions.map((s) => ({ value: s, label: getSectorLabel(s) })),
            ]}
            onChange={(value) => setField('sector', value as ProjectSector | 'ALL')}
          />
          <FilterSelect
            label="Delay"
            value={filters.delay}
            options={DELAY_RANGES.map((r) => ({ value: r.key, label: r.label }))}
            onChange={(value) => setField('delay', value as RiskFilters['delay'])}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            options={[
              { value: 'ALL', label: 'All statuses' },
              ...statusOptions.map((s) => ({ value: s, label: getStatusLabel(s) })),
            ]}
            onChange={(value) => setField('status', value as ProjectStatus | 'ALL')}
          />
        </div>
      </div>
    </div>
  );
}