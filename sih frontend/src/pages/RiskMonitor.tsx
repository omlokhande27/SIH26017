import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/risk/risk-filters';
import { DEFAULT_FILTERS, applyRiskFilters, type RiskFilters } from '@/components/risk/risk-filter-model';
import { ProjectRiskCard } from '@/components/risk/project-risk-card';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { Skeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { getRiskColor } from '@/utils/formatting';
import { riskRank } from '@/utils/risk';
import { RiskLevel } from '@/types';
import type { Project } from '@/types';
import { cn } from '@/lib/utils';

type SortKey = 'risk' | 'delay' | 'updated' | 'acquisition';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'risk', label: 'Highest risk' },
  { key: 'delay', label: 'Highest predicted delay' },
  { key: 'updated', label: 'Most recently changed' },
  { key: 'acquisition', label: 'Lowest acquisition progress' },
];

const GROUPS: RiskLevel[] = [RiskLevel.CRITICAL, RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW];

const groupLabel: Record<RiskLevel, string> = {
  [RiskLevel.CRITICAL]: 'Critical',
  [RiskLevel.HIGH]: 'High',
  [RiskLevel.MEDIUM]: 'Medium',
  [RiskLevel.LOW]: 'Low',
};

function parseRiskLevel(value: string | null): RiskLevel | 'ALL' {
  if (!value) return 'ALL';
  const normalized = value.trim().toUpperCase();
  return GROUPS.includes(normalized as RiskLevel) ? (normalized as RiskLevel) : 'ALL';
}

function sortProjects(list: Project[], sort: SortKey): Project[] {
  const copy = list.slice();
  switch (sort) {
    case 'delay':
      copy.sort((a, b) => (b.predictedDelay ?? -1) - (a.predictedDelay ?? -1));
      break;
    case 'updated':
      copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'acquisition':
      copy.sort((a, b) => (a.acquisitionPercentage ?? 0) - (b.acquisitionPercentage ?? 0));
      break;
    case 'risk':
    default:
      copy.sort(
        (a, b) =>
          riskRank(b.riskLevel) - riskRank(a.riskLevel) ||
          (b.predictedDelay ?? -1) - (a.predictedDelay ?? -1)
      );
      break;
  }
  return copy;
}

export default function RiskMonitor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterState, setFilterState] = useState<RiskFilters>(DEFAULT_FILTERS);
  const requestedRisk = parseRiskLevel(searchParams.get('level'));
  const filters = useMemo(
    () => requestedRisk === 'ALL' ? filterState : { ...filterState, risk: requestedRisk },
    [filterState, requestedRisk]
  );
  const [sort, setSort] = useState<SortKey>('risk');
  const [collapsed, setCollapsed] = useState<Partial<Record<RiskLevel, boolean>>>({});

  const { data: projects = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  });

  const projectSummary = useMemo(() => {
    const total = projects.length;
    const highRisk = projects.filter((p) => p.riskLevel === RiskLevel.HIGH || p.riskLevel === RiskLevel.CRITICAL).length;
    const mediumRisk = projects.filter((p) => p.riskLevel === RiskLevel.MEDIUM).length;
    const lowRisk = projects.filter((p) => p.riskLevel === RiskLevel.LOW).length;
    return { total, highRisk, mediumRisk, lowRisk };
  }, [projects]);

  const stateOptions = useMemo(
    () => [...new Set(projects.map((p) => p.state))].sort(),
    [projects]
  );
  const sectorOptions = useMemo(
    () => [...new Set(projects.map((p) => p.sector))],
    [projects]
  );
  const statusOptions = useMemo(
    () => [...new Set(projects.map((p) => p.status))],
    [projects]
  );

  const levelCounts = useMemo(() => {
    const counts: Partial<Record<RiskLevel, number>> = {};
    for (const p of projects) counts[p.riskLevel] = (counts[p.riskLevel] ?? 0) + 1;
    return counts;
  }, [projects]);

  const filtered = useMemo(
    () => projects.filter((p) => applyRiskFilters(p, filters)),
    [filters, projects]
  );

  const groups = useMemo(
    () =>
      GROUPS.map((level) => ({
        level,
        label: groupLabel[level],
        list: sortProjects(
          filtered.filter((p) => p.riskLevel === level),
          sort
        ),
      })),
    [filtered, sort]
  );

  const toggleGroup = (level: RiskLevel) => {
    setCollapsed((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const handleFilterChange = (next: RiskFilters) => {
    setFilterState(next);
    if (searchParams.has('level')) setSearchParams({}, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader title="Risk Monitor" description="Loading risk data..." />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in">
        <ErrorState
          title="Could not load risk monitor"
          message="There was an error loading the project data."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Risk Monitor"
          description="Operational list of projects requiring attention, grouped by risk level."
        />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-risk-high-border)] bg-[var(--color-risk-high)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-risk-high)]">
            {projectSummary.highRisk} High Risk
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-risk-medium-border)] bg-[var(--color-risk-medium)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-risk-medium)]">
            {projectSummary.mediumRisk} Medium Risk
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-risk-low-border)] bg-[var(--color-risk-low)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-risk-low)]">
            {projectSummary.lowRisk} Low Risk
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">
            <ShieldAlert className="h-3.5 w-3.5 text-brand-accent" />
            {projectSummary.total} tracked
          </span>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        stateOptions={stateOptions}
        sectorOptions={sectorOptions}
        statusOptions={statusOptions}
        levelCounts={levelCounts}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {projects.length} projects
        </p>
        <label className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-gray-200 bg-white px-2.5">
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-gray-700 outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No projects match these filters"
          description="Try adjusting the risk level, state, sector, delay range or project status."
          action={
            <button
              type="button"
              onClick={() => handleFilterChange(DEFAULT_FILTERS)}
              className="rounded-[var(--radius-md)] bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-secondary"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.level];
            return (
              <Card key={group.level} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.level)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-muted/50"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown
                    className={cn('h-4 w-4 text-gray-400 transition-transform', isCollapsed && '-rotate-90')}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getRiskColor(group.level) }}
                  />
                  <span className="text-sm font-bold uppercase tracking-wider text-gray-900">{group.label}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {group.list.length}
                  </span>
                  {group.list.length === 0 && (
                    <span className="text-xs text-gray-400">No projects match the current filters</span>
                  )}
                </button>

                {!isCollapsed && (
                  <CardContent className="p-3 pt-0">
                    {group.list.length === 0 ? (
                      <p className="px-3 pb-2 pt-1 text-sm text-gray-400">No projects in this group.</p>
                    ) : (
                      <div className="space-y-2">
                        {group.list.map((project) => (
                          <ProjectRiskCard key={project.id} project={project} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}