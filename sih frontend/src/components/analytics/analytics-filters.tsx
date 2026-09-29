import { ChevronDown } from 'lucide-react';
import { RiskLevel } from '@/types';
import type { ProjectSector } from '@/types';
import { getSectorLabel } from '@/utils/formatting';
import type { AnalyticsFilters, AnalyticsRange } from '@/utils/analytics-helpers';

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: 'ALL', label: 'All time' },
  { value: '90D', label: 'Last 90 days' },
  { value: '30D', label: 'Last 30 days' },
  { value: '7D', label: 'Last 7 days' },
];

const RISK_OPTIONS: Array<{ value: AnalyticsFilters['risk']; label: string }> = [
  { value: 'ALL', label: 'All risk levels' },
  { value: RiskLevel.HIGH, label: 'High risk' },
  { value: RiskLevel.MEDIUM, label: 'Medium risk' },
  { value: RiskLevel.LOW, label: 'Low risk' },
];

interface AnalyticsFiltersBarProps {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  stateOptions: string[];
  sectorOptions: ProjectSector[];
  analyzedCount: number;
  totalCount: number;
}

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

export function AnalyticsFiltersBar({
  filters,
  onChange,
  stateOptions,
  sectorOptions,
  analyzedCount,
  totalCount,
}: AnalyticsFiltersBarProps) {
  const setField = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Date Range"
          value={filters.range}
          options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(value) => setField('range', value as AnalyticsRange)}
        />
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
          onChange={(value) => setField('sector', value)}
        />
        <FilterSelect
          label="Risk Level"
          value={filters.risk}
          options={RISK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(value) => setField('risk', value as AnalyticsFilters['risk'])}
        />
        <p className="ml-auto text-xs text-gray-500">
          Analysing <span className="font-semibold text-gray-700">{analyzedCount}</span> of {totalCount} projects
        </p>
      </div>
    </div>
  );
}