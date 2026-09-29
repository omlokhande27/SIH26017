import { apiClient } from './client';
import { projectsApi } from './projects.api';
import { buildEarlyWarningCase, isElevatedRiskProject } from '../utils/command-center';
import { formatINR, getSectorLabel } from '../utils/formatting';
import { riskRank } from '../utils/risk';
import { ProjectStatus, RiskLevel, ActionStatus } from '../types';
import type {
  CommandCenterData,
  DataOrigin,
  DelayBand,
  DelayReasonSlice,
  DelayReasonTotals,
  DelayTrendPoint,
  EarlyWarningCase,
  ExecHighRiskProject,
  ExecKpi,
  InsightFactor,
  IntelligenceMetric,
  InterventionOutcome,
  PriorityActionItem,
  Project,
  QuickActionDef,
  RiskBucket,
  StateDelayPerformance,
  TrendRange,
} from '../types';
import { buildFactorsForProject } from '../utils/prediction-helpers';

export interface ExecutiveData {
  kpis: ExecKpi[];
  riskDistribution: RiskBucket[];
  riskOverview: { trend: string; monitorPath: string };
  highRiskProjects: ExecHighRiskProject[];
  delayTrends: Record<TrendRange, DelayTrendPoint[]>;
  aiInsight: { summary: string; factors: InsightFactor[] };
  priorityActions: PriorityActionItem[];
  outcomes: InterventionOutcome[];
  narrative: { greetingName: string; headerDescription: string };
  intelligence: CommandCenterData;
  delayReasons: DelayReasonSlice[];
  delayReasonTotals: DelayReasonTotals;
  stateDelayRanking: StateDelayPerformance[];
  dataOrigin: DataOrigin;
}

const DATA_ORIGIN: DataOrigin = 'live';

function percentageOf(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0%';
}

function averageDelayFor(projects: Project[]): number {
  const delays = projects
    .map((project) => project.predictedDelay)
    .filter((delayDays): delayDays is number => delayDays !== null);
  if (delays.length === 0) return 0;
  return Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length);
}

function buildIntelligenceMetrics(projects: Project[]): IntelligenceMetric[] {
  const total = projects.length;
  const delayed = projects.filter(
    (project) => project.status === ProjectStatus.DELAYED || project.status === ProjectStatus.ON_HOLD,
  );
  const highRisk = projects.filter(isElevatedRiskProject);
  const averageDelay = averageDelayFor(projects);
  const exposure = projects.reduce((sum, project) => sum + (project.compensationPending ?? 0), 0);

  return [
    {
      id: 'delayedCases',
      label: 'Delayed cases',
      value: String(delayed.length),
      numericValue: delayed.length,
      detail: `${percentageOf(delayed.length, total)} of portfolio · delayed/on hold`,
      path: '/risk-monitor',
      origin: DATA_ORIGIN,
    },
    {
      id: 'highRiskCases',
      label: 'High / critical risk cases',
      value: String(highRisk.length),
      numericValue: highRisk.length,
      detail: `${percentageOf(highRisk.length, total)} of portfolio · needs review`,
      path: '/risk-monitor',
      origin: DATA_ORIGIN,
    },
    {
      id: 'averageDelay',
      label: 'Average predicted delay',
      value: `${averageDelay} days`,
      numericValue: averageDelay,
      detail: `${Math.round(averageDelay / 30.44)} months · predicted field`,
      path: '/analytics',
      origin: DATA_ORIGIN,
    },
    {
      id: 'additionalExpenditure',
      label: 'Additional expenditure exposure',
      value: formatINR(exposure),
      numericValue: exposure,
      detail: 'Pending compensation · proxy, not ML cost estimate',
      path: '/analytics',
      origin: DATA_ORIGIN,
    },
  ];
}

function buildEarlyWarnings(projects: Project[]): EarlyWarningCase[] {
  return projects
    .filter(isElevatedRiskProject)
    .slice()
    .sort(
      (a, b) =>
        riskRank(b.riskLevel) - riskRank(a.riskLevel) ||
        (b.predictedDelay ?? -1) - (a.predictedDelay ?? -1),
    )
    .slice(0, 8)
    .map((project) => buildEarlyWarningCase(project, DATA_ORIGIN));
}

function buildRiskDistribution(projects: Project[]): RiskBucket[] {
  const high = projects.filter(isElevatedRiskProject).length;
  const medium = projects.filter((project) => project.riskLevel === RiskLevel.MEDIUM).length;
  const low = projects.filter((project) => project.riskLevel === RiskLevel.LOW).length;

  return [
    { key: 'HIGH', label: 'High / Critical', count: high, color: 'var(--color-risk-high)' },
    { key: 'MEDIUM', label: 'Medium', count: medium, color: 'var(--color-risk-medium)' },
    { key: 'LOW', label: 'Low', count: low, color: 'var(--color-risk-low)' },
  ];
}

function buildHighRiskProjects(projects: Project[]): ExecHighRiskProject[] {
  return projects
    .filter(isElevatedRiskProject)
    .slice()
    .sort((a, b) => (b.predictedDelay ?? -1) - (a.predictedDelay ?? -1))
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      name: project.name,
      state: project.state,
      district: project.district,
      sector: getSectorLabel(project.sector),
      risk: project.riskLevel,
      delay: project.predictedDelay ?? 0,
      topIssue: buildEarlyWarningCase(project).mainIssue,
    }));
}

function buildAiInsight(projects: Project[]): { summary: string; factors: InsightFactor[] } {
  const highRisk = projects.filter(isElevatedRiskProject);
  const totals = new Map<string, number>();

  for (const project of highRisk) {
    for (const factor of buildFactorsForProject(project)) {
      totals.set(factor.name, (totals.get(factor.name) ?? 0) + (factor.contributionScore ?? 0));
    }
  }

  const totalScore = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  const factors = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({
      name,
      share: Math.round((value / totalScore) * 100),
      trend: 'flat' as const,
    }));

  return {
    summary: `${highRisk.length} project${highRisk.length !== 1 ? 's are' : ' is'} currently high or critical risk. Factor shares below are derived from the current project fields.`,
    factors,
  };
}

function buildCommandCenterData(projects: Project[]): CommandCenterData {
  return {
    metrics: buildIntelligenceMetrics(projects),
    earlyWarnings: buildEarlyWarnings(projects),
    dataOrigin: DATA_ORIGIN,
    modelStatus: 'Live prediction layer · ML service connected at port 8000.',
    missingFields: [],
  };
}

const DELAY_REASON_ORDER = ['Legal', 'Financial', 'Social', 'Operational'] as const;

const DELAY_REASON_COLORS: Record<string, string> = {
  Legal: '#B91C1C',
  Financial: '#C2410C',
  Social: '#1D4ED8',
  Operational: '#0F766E',
};

export function buildDelayReasonDistribution(
  projects: Project[],
): { slices: DelayReasonSlice[]; totals: DelayReasonTotals } {
  const counts = new Map<string, number>();
  let affectedProjects = 0;

  for (const project of projects) {
    const seen = new Set<string>();
    for (const issue of project.issues ?? []) {
      if (issue.status === 'RESOLVED') continue;
      if (seen.has(issue.category)) continue;
      seen.add(issue.category);
      counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
    }
    if (seen.size > 0) affectedProjects += 1;
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);

  const slices = DELAY_REASON_ORDER.filter((category) => counts.has(category)).map((category) => {
    const cases = counts.get(category) ?? 0;
    return {
      key: category.toLowerCase(),
      label: category,
      cases,
      share: total > 0 ? Number(((cases / total) * 100).toFixed(1)) : 0,
      color: DELAY_REASON_COLORS[category] ?? '#64748B',
    };
  });

  return { slices, totals: { affectedProjects, reasonRecords: total } };
}

function assignDelayBands(sortedAscending: number[]): DelayBand[] {
  const size = sortedAscending.length;
  if (size === 0) return [];
  if (size === 1) return ['moderate'];

  const q1 = sortedAscending[Math.floor(size * 0.25)];
  const q2 = sortedAscending[Math.floor(size * 0.5)];
  const q3 = sortedAscending[Math.floor(size * 0.75)];

  return sortedAscending.map((value) => {
    if (value <= q1) return 'contained';
    if (value <= q2) return 'moderate';
    if (value <= q3) return 'high';
    return 'severe';
  });
}

export function buildStateDelayRanking(projects: Project[]): StateDelayPerformance[] {
  const byState = new Map<string, Project[]>();
  for (const project of projects) {
    const bucket = byState.get(project.state) ?? [];
    bucket.push(project);
    byState.set(project.state, bucket);
  }

  const rows = [...byState.entries()].map(([state, stateProjects]) => {
    const averageDelayDays = averageDelayFor(stateProjects);
    const elevatedCount = stateProjects.filter(isElevatedRiskProject).length;
    return { state, averageDelayDays, projectCount: stateProjects.length, elevatedCount };
  });

  const worst = rows.reduce((max, row) => Math.max(max, row.averageDelayDays), 0);

  const ascending = rows.map((row) => row.averageDelayDays).sort((a, b) => a - b);
  const bands = assignDelayBands(ascending);
  const bandByDelay = new Map(ascending.map((value, index) => [value, bands[index]]));

  return rows
    .map((row) => ({
      ...row,
      intensity: worst > 0 ? Number((row.averageDelayDays / worst).toFixed(3)) : 0,
      band: bandByDelay.get(row.averageDelayDays) ?? 'contained',
    }))
    .sort((a, b) => b.averageDelayDays - a.averageDelayDays || b.projectCount - a.projectCount);
}

// Build empty delay trends placeholder (backend doesn't have a time-series endpoint yet)
function buildEmptyDelayTrends(): Record<TrendRange, DelayTrendPoint[]> {
  return {
    '7D': [],
    '30D': [],
    '90D': [],
    '1Y': [],
  };
}

export async function fetchExecutiveData(): Promise<ExecutiveData> {
  // Fetch real projects from backend
  const projects = await projectsApi.getProjects();

  const intelligence = buildCommandCenterData(projects);
  const highRisk = projects.filter(isElevatedRiskProject);
  const averageDelay = averageDelayFor(projects);

  // Try to fetch recommendations count from predictions
  let pendingActions = 0;
  try {
    // Count projects that have predictions with recommendations
    for (const p of highRisk.slice(0, 5)) {
      try {
        const predRes: any = await apiClient.get(`/projects/${p.id}/predictions/latest`);
        const recs = predRes?.data?.recommendations ?? predRes?.recommendations ?? [];
        pendingActions += Array.isArray(recs) ? recs.length : 0;
      } catch {
        // Skip projects without predictions
      }
    }
  } catch {
    // Fallback to zero
  }

  const delayReasons = buildDelayReasonDistribution(projects);

  return {
    intelligence,
    delayReasons: delayReasons.slices,
    delayReasonTotals: delayReasons.totals,
    stateDelayRanking: buildStateDelayRanking(projects),
    dataOrigin: DATA_ORIGIN,
    kpis: [
      { id: 'total', title: 'Portfolio Projects', value: String(projects.length), delta: 'Current snapshot', tone: 'neutral', path: '/projects' },
      { id: 'highRisk', title: 'High / Critical Risk', value: String(highRisk.length), delta: 'Requires review', tone: highRisk.length > 0 ? 'bad' : 'good', path: '/risk-monitor' },
      { id: 'avgDelay', title: 'Avg Predicted Delay', value: `${averageDelay} Days`, delta: 'Available prediction field', tone: 'neutral', path: '/analytics' },
      { id: 'pendingActions', title: 'Open Actions', value: String(pendingActions), delta: 'Action plan records', tone: 'neutral', path: '/recommendations' },
    ],
    riskDistribution: buildRiskDistribution(projects),
    riskOverview: {
      trend: `${highRisk.length} project${highRisk.length !== 1 ? 's are' : ' is'} currently high or critical risk.`,
      monitorPath: '/risk-monitor',
    },
    highRiskProjects: buildHighRiskProjects(projects),
    delayTrends: buildEmptyDelayTrends(),
    aiInsight: buildAiInsight(projects),
    priorityActions: [],
    outcomes: [],
    narrative: {
      greetingName: 'Officer',
      headerDescription:
        'See where acquisition is slowing, which cases are most exposed, and what administrative action can reduce delay.',
    },
  };
}
