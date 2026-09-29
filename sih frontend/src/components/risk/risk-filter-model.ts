import { RiskLevel, ProjectStatus, ProjectSector } from '@/types';
import type { Project } from '@/types';

export type RiskFilterRisk = RiskLevel | 'ALL';
export type DelayRangeKey = 'ALL' | '0-90' | '90-180' | '180-365' | '365+';

export interface RiskFilters {
  risk: RiskFilterRisk;
  state: string;
  sector: ProjectSector | 'ALL';
  delay: DelayRangeKey;
  status: ProjectStatus | 'ALL';
}

export const DEFAULT_FILTERS: RiskFilters = {
  risk: 'ALL',
  state: 'ALL',
  sector: 'ALL',
  delay: 'ALL',
  status: 'ALL',
};

export const DELAY_RANGES: Array<{ key: DelayRangeKey; label: string; test: (delay: number) => boolean }> = [
  { key: 'ALL', label: 'Any delay', test: () => true },
  { key: '0-90', label: 'Under 3 months', test: (d) => d > 0 && d <= 90 },
  { key: '90-180', label: '3–6 months', test: (d) => d > 90 && d <= 180 },
  { key: '180-365', label: '6–12 months', test: (d) => d > 180 && d <= 365 },
  { key: '365+', label: 'Over 12 months', test: (d) => d > 365 },
];

export function filtersAreActive(filters: RiskFilters): boolean {
  return (
    filters.risk !== 'ALL' ||
    filters.state !== 'ALL' ||
    filters.sector !== 'ALL' ||
    filters.delay !== 'ALL' ||
    filters.status !== 'ALL'
  );
}

export function applyRiskFilters(project: Project, filters: RiskFilters): boolean {
  if (filters.risk !== 'ALL' && project.riskLevel !== filters.risk) return false;
  if (filters.state !== 'ALL' && project.state !== filters.state) return false;
  if (filters.sector !== 'ALL' && project.sector !== filters.sector) return false;
  if (filters.status !== 'ALL' && project.status !== filters.status) return false;
  if (filters.delay !== 'ALL') {
    const delay = project.predictedDelay;
    if (delay === null) return false;
    const range = DELAY_RANGES.find((r) => r.key === filters.delay);
    if (range && !range.test(delay)) return false;
  }
  return true;
}