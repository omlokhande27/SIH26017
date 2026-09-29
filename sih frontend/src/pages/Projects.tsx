import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { MoreHorizontal, Eye, Sparkles, Map, SearchX, FilterX, Plus, Pencil, History } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import type { FilterOption } from '@/components/ui/filter-dropdown';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatTile } from '@/components/projects/stat-tile';
import { ComparablesPopover } from '@/components/projects/ComparablesPopover';
import {
  AcquisitionValue,
  DelayDaysCell,
  DelayProbabilityCell,
  RiskDot,
  RiskPercentCell,
} from '@/components/projects/project-columns';
import { useAuth } from '@/context/useAuth';
import { ProjectSector, RiskLevel, ProjectStatus } from '@/types';
import type { Project } from '@/types';
import { buildDelayRiskInsight } from '@/utils/project-insights';
import { formatShortDate, getSectorLabel, getRiskLabel, getStatusLabel } from '@/utils/formatting';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { Skeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from '@/lib/utils';

type SortKey =
  | 'name'
  | 'code'
  | 'acquisitionPercentage'
  | 'riskLevel'
  | 'riskScore'
  | 'predictedDelay'
  | 'delayProbability'
  | 'updatedAt';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

const RISK_RANK: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.CRITICAL]: 3,
};

const toOptions = (values: string[], labels?: Record<string, string>): FilterOption[] =>
  values.map((value) => ({ value, label: labels?.[value] ?? value }));

interface SortableThProps {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (column: SortKey) => void;
  className?: string;
}

function SortableTh({ label, column, sortKey, sortDir, onToggle, className }: SortableThProps) {
  const active = sortKey === column;
  const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
  return (
    <th className={cn('px-6 py-4 font-medium', className)}>
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={cn(
          'inline-flex items-center gap-1 uppercase transition-colors hover:text-gray-900',
          active ? 'text-[var(--color-brand-primary)]' : 'text-gray-500'
        )}
      >
        {label}
        {arrow && <span className="text-xs">{arrow}</span>}
      </button>
    </th>
  );
}



export default function ProjectsPage() {
  const { canManage, isOfficer, editScopeFor: scopeFor } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const canAddProject = isOfficer && canManage;

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

  const SUMMARY_CHIPS = [
    { key: 'total', label: 'Total Projects', count: projectSummary.total, dotClass: 'bg-[var(--color-brand-primary)]' },
    { key: 'high', label: 'High Risk', count: projectSummary.highRisk, dotClass: 'bg-[var(--color-risk-high)]' },
    { key: 'medium', label: 'Medium Risk', count: projectSummary.mediumRisk, dotClass: 'bg-[var(--color-risk-medium)]' },
    { key: 'low', label: 'Low Risk', count: projectSummary.lowRisk, dotClass: 'bg-[var(--color-risk-low)]' },
  ];

  const stateOptions = useMemo(
    () => toOptions([...new Set(projects.map((p) => p.state))].sort()),
    [projects]
  );

  const districtOptions = useMemo(() => {
    const pool = states.length > 0 ? projects.filter((p) => states.includes(p.state)) : projects;
    return toOptions([...new Set(pool.map((p) => p.district))].sort());
  }, [states, projects]);

  const sectorOptions = useMemo(
    () => toOptions(Object.values(ProjectSector), Object.fromEntries(Object.values(ProjectSector).map((s) => [s, getSectorLabel(s)]))),
    []
  );

  const riskOptions = useMemo(
    () => toOptions(Object.values(RiskLevel), Object.fromEntries(Object.values(RiskLevel).map((r) => [r, getRiskLabel(r)]))),
    []
  );

  const statusOptions = useMemo(
    () => toOptions(Object.values(ProjectStatus), Object.fromEntries(Object.values(ProjectStatus).map((s) => [s, getStatusLabel(s)]))),
    []
  );

  const sortValue = (p: Project, key: SortKey): string | number => {
    switch (key) {
      case 'name': return p.name.toUpperCase();
      case 'code': return p.code.toUpperCase();
      case 'acquisitionPercentage': return p.acquisitionPercentage;
      case 'riskLevel': return RISK_RANK[p.riskLevel];
      case 'riskScore': return buildDelayRiskInsight(p).riskScore;
      case 'predictedDelay': return p.predictedDelay ?? Number.MAX_SAFE_INTEGER;
      case 'delayProbability': return buildDelayRiskInsight(p).delayProbability;
      case 'updatedAt': return new Date(p.updatedAt).getTime();
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;

    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.district.toLowerCase().includes(q) ||
          p.state.toLowerCase().includes(q)
      );
    }
    if (states.length) list = list.filter((p) => states.includes(p.state));
    if (districts.length) list = list.filter((p) => districts.includes(p.district));
    if (sectors.length) list = list.filter((p) => sectors.includes(p.sector));
    if (risks.length) list = list.filter((p) => risks.includes(p.riskLevel));
    if (statuses.length) list = list.filter((p) => statuses.includes(p.status));

    const multiplier = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * multiplier;
      }
      return ((va as number) - (vb as number)) * multiplier;
    });
  }, [search, states, districts, sectors, risks, statuses, sortKey, sortDir, projects]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Derived once per visible row, outside the table body, so the table stays cheap.
  const rows = useMemo(
    () => pageItems.map((project) => ({ project, insight: buildDelayRiskInsight(project) })),
    [pageItems],
  );

  const hasFilters = search.trim() !== '' ||
    states.length > 0 || districts.length > 0 || sectors.length > 0 || risks.length > 0 || statuses.length > 0;

  const clearAll = () => {
    setSearch('');
    setStates([]);
    setDistricts([]);
    setSectors([]);
    setRisks([]);
    setStatuses([]);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'code' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const activeChips: Array<{ id: string; label: string; onClear: () => void }> = [];
  states.forEach((s) => activeChips.push({ id: `state-${s}`, label: s, onClear: () => setStates((prev) => prev.filter((v) => v !== s)) }));
  districts.forEach((d) => activeChips.push({ id: `district-${d}`, label: d, onClear: () => setDistricts((prev) => prev.filter((v) => v !== d)) }));
  sectors.forEach((s) => activeChips.push({ id: `sector-${s}`, label: getSectorLabel(s as ProjectSector), onClear: () => setSectors((prev) => prev.filter((v) => v !== s)) }));
  risks.forEach((r) => activeChips.push({ id: `risk-${r}`, label: getRiskLabel(r as RiskLevel), onClear: () => setRisks((prev) => prev.filter((v) => v !== r)) }));
  statuses.forEach((s) => activeChips.push({ id: `status-${s}`, label: getStatusLabel(s as ProjectStatus), onClear: () => setStatuses((prev) => prev.filter((v) => v !== s)) }));

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader title="Projects" description="Loading projects..." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in">
        <ErrorState
          title="Could not load projects"
          message="The projects data source is unavailable. Please check that the backend is running."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Projects"
          description="Manage and monitor all land acquisition infrastructure projects."
          className="mb-0"
        />
        {canAddProject && (
          <Button onClick={() => navigate('/projects/new')} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Project
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SUMMARY_CHIPS.map((chip) => (
          <StatTile
            key={chip.key}
            label={chip.label}
            value={
              <span className="flex items-center gap-2">
                <span className={cn('inline-block h-2.5 w-2.5 rounded-full', chip.dotClass)} />
                {chip.count}
              </span>
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by project, code, district or state..."
            className="w-full sm:w-72"
          />
          <FilterDropdown label="State" multiple options={stateOptions} value={states} onChange={(v) => { setStates(v as string[]); setPage(1); }} />
          <FilterDropdown label="District" multiple options={districtOptions} value={districts} onChange={(v) => { setDistricts(v as string[]); setPage(1); }} />
          <FilterDropdown label="Sector" multiple options={sectorOptions} value={sectors} onChange={(v) => { setSectors(v as string[]); setPage(1); }} />
          <FilterDropdown label="Risk Level" multiple options={riskOptions} value={risks} onChange={(v) => { setRisks(v as string[]); setPage(1); }} />
          <FilterDropdown label="Status" multiple options={statusOptions} value={statuses} onChange={(v) => { setStatuses(v as string[]); setPage(1); }} />
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear Filters
            </Button>
          )}
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-muted)] px-3 py-1 text-xs font-medium text-gray-700"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onClear}
                  className="text-gray-400 hover:text-gray-700"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <FilterX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {pageItems.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No projects found"
          description="No projects match your current search and filter criteria. Try adjusting or clearing the filters."
          action={hasFilters ? (
            <Button variant="outline" onClick={clearAll}>
              Clear Filters
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-[var(--color-bg-muted)] border-b border-gray-100">
                <tr>
                  <SortableTh label="Project" column="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortableTh label="Code" column="code" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <th className="px-6 py-4 font-medium text-gray-500">State</th>
                  <th className="px-6 py-4 font-medium text-gray-500">District</th>
                  <th className="px-6 py-4 font-medium text-gray-500">Sector</th>
                  <SortableTh label="Land Acquisition" column="acquisitionPercentage" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortableTh label="Risk" column="riskLevel" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortableTh label="Risk %" column="riskScore" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortableTh label="Delay" column="predictedDelay" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortableTh label="Delay Probability" column="delayProbability" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <th className="px-6 py-4 font-medium text-gray-500">Status</th>
                  <SortableTh label="Updated" column="updatedAt" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <th className="px-6 py-4 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ project, insight }) => {
                  return (
                    <tr
                      key={project.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{project.name}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-gray-500">{project.code}</td>
                      <td className="px-6 py-4 text-gray-600">{project.state}</td>
                      <td className="px-6 py-4 text-gray-600">{project.district}</td>
                      <td className="px-6 py-4 text-gray-600">{getSectorLabel(project.sector)}</td>
                      <td className="px-6 py-4">
                        <AcquisitionValue value={project.acquisitionPercentage} />
                      </td>
                      <td className="px-6 py-4">
                        <RiskDot risk={project.riskLevel} />
                      </td>
                      <td className="px-6 py-4">
                        <RiskPercentCell insight={insight} />
                      </td>
                      <td className="px-6 py-4">
                        <DelayDaysCell days={project.predictedDelay} />
                      </td>
                      <td className="px-6 py-4">
                        <DelayProbabilityCell insight={insight} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {formatShortDate(project.updatedAt)}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <ComparablesPopover
                            project={project}
                            trigger={
                              <button
                                type="button"
                                title="Previous similar data: amount, delay, days"
                                aria-label={`Previous similar data for ${project.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-subtle hover:text-brand-primary"
                              >
                                <History className="h-4 w-4" />
                              </button>
                            }
                          />
                          <Dropdown
                          align="right"
                          trigger={
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
                              <MoreHorizontal className="h-4 w-4" />
                            </span>
                          }
                          items={[
                            { id: 'view', label: 'View Details', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/projects/${project.id}`) },
                            ...(scopeFor(project) !== 'none'
                              ? [{
                                  id: 'edit',
                                  label: scopeFor(project) === 'assigned' ? 'Update Progress' : 'Edit Project',
                                  icon: <Pencil className="h-4 w-4" />,
                                  onClick: () => navigate(`/projects/${project.id}/edit`),
                                }]
                              : []),
                            ...(canManage
                              ? [
                                  { id: 'predict', label: 'Run AI Prediction', icon: <Sparkles className="h-4 w-4" />, onClick: () => navigate(`/prediction/${project.id}`) },
                                ]
                              : []),
                            { id: 'risk', label: 'View on Risk Map', icon: <Map className="h-4 w-4" />, onClick: () => navigate('/risk-map') },
                          ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={safePage}
            pageCount={pageCount}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}