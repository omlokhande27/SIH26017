import { RiskLevel } from '../types';
import type { Project } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock analytics service.
//
// This layer stands in for a backend analytics service. It computes all
// portfolio aggregates (risk distribution, factor exposure, delay
// distributions, trends, state heat, insights) from project indicators.
// Anything rendered on the Analytics page is produced here — the frontend
// never derives these figures itself.
//
// All numbers are mock/demo figures until the real backend service exists.
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyticsRange = 'ALL' | '7D' | '30D' | '90D';
export type AnalyticsRiskFilter = 'ALL' | Exclude<RiskLevel, 'CRITICAL'>;

export interface AnalyticsFilters {
  range: AnalyticsRange;
  state: string;
  sector: string | 'ALL';
  risk: AnalyticsRiskFilter;
}

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  range: 'ALL',
  state: 'ALL',
  sector: 'ALL',
  risk: 'ALL',
};

// Anchor point so filter ranges are deterministic against mock timestamps.
const REFERENCE_DATE = new Date('2026-09-12T00:00:00Z');

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'ALL'>, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
};

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export function projectMatchesAnalyticsFilters(project: Project, filters: AnalyticsFilters): boolean {
  if (filters.state !== 'ALL' && project.state !== filters.state) return false;
  if (filters.sector !== 'ALL' && project.sector !== filters.sector) return false;
  if (filters.risk === 'HIGH' && !(project.riskLevel === RiskLevel.HIGH || project.riskLevel === RiskLevel.CRITICAL)) {
    return false;
  }
  if (filters.risk === 'MEDIUM' && project.riskLevel !== RiskLevel.MEDIUM) return false;
  if (filters.risk === 'LOW' && project.riskLevel !== RiskLevel.LOW) return false;
  if (filters.range !== 'ALL') {
    const days = RANGE_DAYS[filters.range];
    const cutoff = new Date(REFERENCE_DATE.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const recent = project.lastPredictionDate ?? project.updatedAt;
    if (recent < cutoff) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskBucket {
  key: 'HIGH' | 'MEDIUM' | 'LOW';
  label: string;
  color: string;
  count: number;
}

export type DelayFactorKey =
  | 'compensation'
  | 'litigation'
  | 'acquisition'
  | 'resettlement'
  | 'rightOfWay'
  | 'possession';

export interface FactorScore {
  key: DelayFactorKey;
  name: string;
  score: number; // 0-100 aggregate exposure
  projectCount: number;
}

export interface DelayBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface ScatterPoint {
  projectId: string;
  name: string;
  acquisitionPercentage: number;
  predictedDelay: number;
  riskLabel: string;
  color: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  highRiskCount: number;
  avgDelay: number;
}

export interface StateRiskPoint {
  state: string;
  short: string;
  highCount: number;
}

export type InsightTone = 'risk-high' | 'risk-medium' | 'brand' | 'neutral';

export interface AnalyticsInsight {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
}

export interface AnalyticsResult {
  analyzedCount: number;
  riskDistribution: RiskBucket[];
  topFactors: FactorScore[];
  delayDistribution: DelayBucket[];
  scatter: ScatterPoint[];
  trend: TrendPoint[];
  stateRisk: StateRiskPoint[];
  insights: AnalyticsInsight[];
  avgPredictedDelay: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FACTOR_DEFS: Array<{ key: DelayFactorKey; name: string }> = [
  { key: 'compensation', name: 'Compensation' },
  { key: 'litigation', name: 'Litigation' },
  { key: 'acquisition', name: 'Acquisition Progress' },
  { key: 'resettlement', name: 'R&R' },
  { key: 'rightOfWay', name: 'RoW' },
  { key: 'possession', name: 'Possession' },
];

const LEGAL_TITLES = ['Litigation', 'Land Dispute', 'Title Issue'];

const riskBucketColor: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'var(--color-risk-high)',
  MEDIUM: 'var(--color-risk-medium)',
  LOW: 'var(--color-risk-low)',
};

const STATE_ABBR: Record<string, string> = {
  'Uttar Pradesh': 'UP',
  Maharashtra: 'MH',
  'Tamil Nadu': 'TN',
  Karnataka: 'KA',
  Telangana: 'TS',
  Gujarat: 'GJ',
  Rajasthan: 'RJ',
  'Madhya Pradesh': 'MP',
  'West Bengal': 'WB',
  Bihar: 'BR',
  Odisha: 'OD',
  Kerala: 'KL',
  Punjab: 'PB',
  Haryana: 'HR',
  Delhi: 'DL',
  'Andhra Pradesh': 'AP',
  Jharkhand: 'JH',
  Assam: 'AS',
  Chhattisgarh: 'CG',
};

const severityValue = (level: RiskLevel): number =>
  level === RiskLevel.CRITICAL ? 4 : level === RiskLevel.HIGH ? 3 : level === RiskLevel.MEDIUM ? 2 : 1;

const isHighRisk = (level: RiskLevel): boolean => level === RiskLevel.HIGH || level === RiskLevel.CRITICAL;

const isHighBucket = (level: RiskLevel): 'HIGH' | 'MEDIUM' | 'LOW' =>
  isHighRisk(level) ? 'HIGH' : level === RiskLevel.MEDIUM ? 'MEDIUM' : 'LOW';

const average = (values: number[]): number =>
  values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

// Per-project factor exposure (0-100), derived from recorded project indicators.
function factorScoresOf(project: Project): Record<DelayFactorKey, number> {
  const issues = project.issues ?? [];

  const compRequired = project.compensationRequired || 1;
  const compensation = Math.min(100, Math.max(0, (project.compensationPending / compRequired) * 100));

  const acquisition = Math.min(100, Math.max(0, 100 - project.acquisitionPercentage));

  const legal = issues.filter((i) => LEGAL_TITLES.includes(i.title));
  const maxLegal = legal.reduce((max, i) => Math.max(max, severityValue(i.severity)), 0);
  const litigation = legal.length ? Math.min(100, 30 + (maxLegal - 1) * 20 + (legal.length - 1) * 8) : 0;

  const possessionIssue = issues.find((i) => i.title === 'Possession Pending');
  const possession = possessionIssue ? Math.min(95, 25 + (severityValue(possessionIssue.severity) - 1) * 22) : 0;

  const rnrIssue = issues.find((i) => i.title === 'R&R Pending');
  const resettlement = rnrIssue ? Math.min(90, 20 + (severityValue(rnrIssue.severity) - 1) * 18) : 0;

  // Right of way becomes unavailable while acquisition is incomplete and
  // awarded land is not yet handed over.
  const rightOfWay = Math.min(100, acquisition * 0.65 + possession * 0.35);

  return { compensation, litigation, acquisition, resettlement, rightOfWay, possession };
}

function aggregateFactor(projects: Project[], key: DelayFactorKey): FactorScore {
  const def = FACTOR_DEFS.find((f) => f.key === key) ?? { key, name: key };
  const scores = projects.map((p) => factorScoresOf(p)[key]).filter((s) => s > 0);
  return {
    key: def.key,
    name: def.name,
    score: average(scores),
    projectCount: scores.length,
  };
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return start.toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const DELAY_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0–60', min: 0, max: 60 },
  { label: '60–120', min: 60, max: 120 },
  { label: '120–180', min: 120, max: 180 },
  { label: '180–240', min: 180, max: 240 },
  { label: '240–300', min: 240, max: 300 },
  { label: '300–360', min: 300, max: 360 },
  { label: '360+', min: 360, max: Number.POSITIVE_INFINITY },
];

function buildTrend(projects: Project[]): TrendPoint[] {
  const buckets = new Map<string, { count: number; delaySum: number; entries: number }>();
  for (const project of projects) {
    for (const entry of project.predictionHistory ?? []) {
      const key = weekKey(entry.date);
      const bucket = buckets.get(key) ?? { count: 0, delaySum: 0, entries: 0 };
      if (isHighRisk(entry.riskLevel)) bucket.count += 1;
      bucket.delaySum += entry.predictedDelay;
      bucket.entries += 1;
      buckets.set(key, bucket);
    }
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: weekLabel(key),
      highRiskCount: b.count,
      avgDelay: b.entries > 0 ? Math.round(b.delaySum / b.entries) : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildStateRisk(projects: Project[]): StateRiskPoint[] {
  const counts = new Map<string, number>();
  for (const project of projects) {
    if (!isHighRisk(project.riskLevel)) continue;
    counts.set(project.state, (counts.get(project.state) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([state, highCount]) => ({
      state,
      short: STATE_ABBR[state] ?? state.slice(0, 3),
      highCount,
    }))
    .sort((a, b) => b.highCount - a.highCount);
}

function buildInsights(projects: Project[], topFactors: FactorScore[], stateRisk: StateRiskPoint[], trend: TrendPoint[]): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  const leading = topFactors[0];
  if (leading && leading.projectCount > 0) {
    const tone: InsightTone = leading.score >= 60 ? 'risk-high' : leading.score >= 34 ? 'risk-medium' : 'neutral';
    insights.push({
      id: 'leading-factor',
      title: `${leading.name} is the leading delay factor`,
      body: `It carries the highest aggregate exposure (${leading.score}/100) and is present in ${leading.projectCount} of ${projects.length} analysed projects.`,
      tone,
    });
  }

  const belowThreshold = projects.filter((p) => p.acquisitionPercentage < 60 && p.predictedDelay !== null);
  const atOrAbove = projects.filter((p) => p.acquisitionPercentage >= 60 && p.predictedDelay !== null);
  if (belowThreshold.length >= 4 && atOrAbove.length >= 4) {
    const avgBelow = average(belowThreshold.map((p) => p.predictedDelay ?? 0));
    const avgAbove = average(atOrAbove.map((p) => p.predictedDelay ?? 0));
    const deltaPct = avgAbove > 0 ? Math.round(((avgBelow - avgAbove) / avgAbove) * 100) : 0;
    insights.push({
      id: 'acquisition-delay',
      title: 'Acquisition progress drives predicted delays',
      body: `Projects below 60% acquisition progress average ${avgBelow} days of predicted delay versus ${avgAbove} days for the rest — ${deltaPct}% ${deltaPct >= 0 ? 'higher' : 'lower'}.`,
      tone: deltaPct >= 0 ? 'risk-medium' : 'neutral',
    });
  }

  const topState = stateRisk[0];
  if (topState && topState.highCount > 0) {
    insights.push({
      id: 'top-state',
      title: `${topState.state} leads high-risk exposure`,
      body: `The state currently holds ${topState.highCount} high-risk projects — the most in the analysed portfolio.`,
      tone: 'risk-medium',
    });
  }

  if (trend.length >= 2) {
    const first = trend[0].avgDelay;
    const last = trend[trend.length - 1].avgDelay;
    const direction = last > first ? 'rising' : last < first ? 'falling' : 'steady';
    insights.push({
      id: 'trend-direction',
      title: `Average predicted delay is ${direction}`,
      body: `Across the latest ${trend.length} weekly model runs, the portfolio average moved from ${first} to ${last} days.`,
      tone: direction === 'rising' ? 'risk-high' : direction === 'falling' ? 'neutral' : 'brand',
    });
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeAnalytics(projects: Project[]): AnalyticsResult {
  const delays = projects.map((p) => p.predictedDelay).filter((d): d is number => d !== null);

  const riskDistribution: RiskBucket[] = (['HIGH', 'MEDIUM', 'LOW'] as const).map((key) => ({
    key,
    label: key === 'HIGH' ? 'High' : key === 'MEDIUM' ? 'Medium' : 'Low',
    color: riskBucketColor[key],
    count: projects.filter((p) => isHighBucket(p.riskLevel) === key).length,
  }));

  const topFactors = FACTOR_DEFS.map((f) => aggregateFactor(projects, f.key)).sort((a, b) => b.score - a.score);

  const delayDistribution: DelayBucket[] = DELAY_BUCKETS.map((bucket) => ({
    label: bucket.label,
    min: bucket.min,
    max: bucket.max,
    count: delays.filter((d) => d >= bucket.min && d < bucket.max).length,
  }));

  const scatter: ScatterPoint[] = projects
    .filter((p) => p.predictedDelay !== null)
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      acquisitionPercentage: p.acquisitionPercentage,
      predictedDelay: p.predictedDelay as number,
      riskLabel: isHighRisk(p.riskLevel) ? 'High Risk' : p.riskLevel === RiskLevel.MEDIUM ? 'Medium Risk' : 'Low Risk',
      color: riskBucketColor[isHighBucket(p.riskLevel)],
    }));

  const trend = buildTrend(projects);
  const stateRisk = buildStateRisk(projects);

  return {
    analyzedCount: projects.length,
    riskDistribution,
    topFactors,
    delayDistribution,
    scatter,
    trend,
    stateRisk,
    insights: buildInsights(projects, topFactors, stateRisk, trend),
    avgPredictedDelay: average(delays),
  };
}