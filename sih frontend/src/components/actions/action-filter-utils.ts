import type { Recommendation } from '@/types';
import { ActionStatus, RiskLevel } from '@/types';

export type PriorityFilter = 'ALL' | number;
export type ActionRiskFilter = 'ALL' | RiskLevel;
export type ActionStatusFilter = 'ALL' | ActionStatus;

export interface ActionFilters {
  priority: PriorityFilter;
  project: string;
  risk: ActionRiskFilter;
  status: ActionStatusFilter;
}

export const DEFAULT_ACTION_FILTERS: ActionFilters = {
  priority: 'ALL',
  project: 'ALL',
  risk: 'ALL',
  status: 'ALL',
};

export function matchesActionFilters(rec: Recommendation, filters: ActionFilters): boolean {
  if (filters.priority !== 'ALL' && rec.priorityRank !== filters.priority) return false;
  if (filters.project !== 'ALL' && rec.projectName !== filters.project) return false;
  if (filters.risk !== 'ALL' && rec.priority !== filters.risk) return false;
  if (filters.status !== 'ALL' && rec.actionStatus !== filters.status) return false;
  return true;
}

export function actionFiltersActive(filters: ActionFilters): boolean {
  return filters.priority !== 'ALL' || filters.project !== 'ALL' || filters.risk !== 'ALL' || filters.status !== 'ALL';
}
