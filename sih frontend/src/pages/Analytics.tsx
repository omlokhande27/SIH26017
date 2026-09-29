import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AnalyticsFiltersBar } from '@/components/analytics/analytics-filters';
import { InsightCards } from '@/components/analytics/insight-cards';
import { ChartCard } from '@/components/analytics/chart-card';
import { ProjectsRiskDonut } from '@/components/analytics/projects-risk-donut';
import { TopDelayFactors } from '@/components/analytics/top-delay-factors';
import { DelayDistribution } from '@/components/analytics/delay-distribution';
import { AcquisitionScatter } from '@/components/analytics/acquisition-scatter';
import { RiskTrendChart } from '@/components/analytics/risk-trend';
import { StateRiskChart } from '@/components/analytics/state-risk';
import {
  DEFAULT_ANALYTICS_FILTERS,
  projectMatchesAnalyticsFilters,
  computeAnalytics,
  type AnalyticsFilters,
} from '@/utils/analytics-helpers';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';

export default function Analytics() {
  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  });

  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);

  const stateOptions = useMemo(() => [...new Set(projects.map((p) => p.state))].sort(), [projects]);
  const sectorOptions = useMemo(() => [...new Set(projects.map((p) => p.sector))], [projects]);

  const filtered = useMemo(
    () => projects.filter((p) => projectMatchesAnalyticsFilters(p, filters)),
    [projects, filters]
  );
  const analysis = useMemo(() => computeAnalytics(filtered), [filtered]);

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading analytics...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-red-500">Failed to load analytics data.</div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Analytics"
        description="Understand project-level and portfolio-level delay patterns."
      />

      <AnalyticsFiltersBar
        filters={filters}
        onChange={setFilters}
        stateOptions={stateOptions}
        sectorOptions={sectorOptions}
        analyzedCount={filtered.length}
        totalCount={projects.length}
      />

      <InsightCards insights={analysis.insights} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Projects by Risk" subtitle="Share of the portfolio by current risk level.">
          <ProjectsRiskDonut buckets={analysis.riskDistribution} />
        </ChartCard>

        <ChartCard title="Top Delay Factors" subtitle="Aggregate factor exposure across analysed projects.">
          <TopDelayFactors factors={analysis.topFactors} />
        </ChartCard>

        <ChartCard title="Predicted Delay Distribution" subtitle="Latest predicted delay per project, in ranges of days.">
          <DelayDistribution buckets={analysis.delayDistribution} total={analysis.analyzedCount} />
        </ChartCard>

        <ChartCard
          title="Acquisition % vs Predicted Delay"
          subtitle="Each dot is a project — hover for its details."
        >
          <AcquisitionScatter data={analysis.scatter} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Risk Trend Over Time"
          subtitle="Portfolio risk and average predicted delay across recent model runs."
          className="lg:col-span-2"
        >
          <RiskTrendChart data={analysis.trend} />
        </ChartCard>

        <ChartCard title="State-wise Risk" subtitle="High-risk projects by state.">
          <StateRiskChart data={analysis.stateRisk} />
        </ChartCard>
      </div>
    </div>
  );
}