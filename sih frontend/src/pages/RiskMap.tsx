import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { FilterBar } from '@/components/risk/risk-filters';
import { DEFAULT_FILTERS, applyRiskFilters, type RiskFilters } from '@/components/risk/risk-filter-model';
import { IndiaRiskMap } from '@/components/risk/india-risk-map';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { RiskLevel } from '@/types';

export default function RiskMap() {
  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  });

  const [filters, setFilters] = useState<RiskFilters>(DEFAULT_FILTERS);

  const stateOptions = useMemo(() => [...new Set(projects.map((project) => project.state))].sort(), [projects]);
  const sectorOptions = useMemo(() => [...new Set(projects.map((project) => project.sector))], [projects]);
  const statusOptions = useMemo(() => [...new Set(projects.map((project) => project.status))], [projects]);

  const levelCounts = useMemo(() => {
    const counts: Partial<Record<RiskLevel, number>> = {};
    for (const project of projects) counts[project.riskLevel] = (counts[project.riskLevel] ?? 0) + 1;
    return counts;
  }, [projects]);

  const filtered = useMemo(() => projects.filter((project) => applyRiskFilters(project, filters)), [projects, filters]);

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading risk map...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-red-500">Failed to load risk map data.</div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="India Project Risk Map"
        description="Geographic risk footprint across India. Select a marker to open the underlying case record."
      />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        stateOptions={stateOptions}
        sectorOptions={sectorOptions}
        statusOptions={statusOptions}
        levelCounts={levelCounts}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_12px_35px_-24px_rgba(15,36,64,0.45)]">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">India geographic risk layer</h2>
            <p className="text-xs text-gray-500">Markers are plotted only when coordinates are available in the project record.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 font-semibold text-gray-600">{filtered.length} projects visible</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">{new Set(filtered.map((project) => project.state)).size} states represented</span>
          </div>
        </div>
        <IndiaRiskMap projects={filtered} heightClass="h-[650px]" />
      </div>
    </div>
  );
}
