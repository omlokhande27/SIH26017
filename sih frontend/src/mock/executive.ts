import { RiskLevel, ActionStatus } from '../types';
import type { LucideIcon } from 'lucide-react';
import { Plus, Brain, ShieldAlert, FileText, Pencil } from 'lucide-react';

export interface QuickActionDef {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
}

export const quickActionDefs: QuickActionDef[] = [
  { label: 'Add Project', description: 'Register a new project', path: '/projects/new', icon: Plus },
  { label: 'Edit Projects', description: 'Update project portal records', path: '/projects', icon: Pencil },
  { label: 'Run Prediction', description: 'Run AI delay analysis', path: '/prediction', icon: Brain },
  { label: 'View High Risk', description: 'Filter risk monitor', path: '/risk-monitor?level=HIGH', icon: ShieldAlert },
  { label: 'Generate Report', description: 'Create a statutory report', path: '/reports', icon: FileText },
];

// ── KPI row ────────────────────────────────────────────────────────────────

export type KpiId = 'total' | 'highRisk' | 'avgDelay' | 'pendingActions';
export type DeltaTone = 'good' | 'bad' | 'neutral';

export interface ExecKpi {
  id: KpiId;
  title: string;
  value: string;
  delta: string;
  tone: DeltaTone;
  path: string;
}

export const execKpis: ExecKpi[] = [
  { id: 'total', title: 'Total Projects', value: '128', delta: '+6 this month', tone: 'good', path: '/projects' },
  { id: 'highRisk', title: 'High Risk', value: '18', delta: '↑ 4 this week', tone: 'bad', path: '/risk-monitor?level=HIGH' },
  { id: 'avgDelay', title: 'Avg Predicted Delay', value: '143 Days', delta: '↓ 12 days', tone: 'good', path: '/analytics' },
  { id: 'pendingActions', title: 'Pending Actions', value: '27', delta: '8 critical', tone: 'bad', path: '/recommendations' },
];

// ── Risk distribution ──────────────────────────────────────────────────────

export interface RiskBucket {
  key: 'LOW' | 'MEDIUM' | 'HIGH';
  label: string;
  count: number;
  color: string;
}

export const execRiskDistribution: RiskBucket[] = [
  { key: 'HIGH', label: 'High', count: 18, color: 'var(--color-risk-high)' },
  { key: 'MEDIUM', label: 'Medium', count: 42, color: 'var(--color-risk-medium)' },
  { key: 'LOW', label: 'Low', count: 68, color: 'var(--color-risk-low)' },
];

export const execRiskOverview = {
  trend: '4 projects moved to High Risk this week.',
  monitorPath: '/risk-monitor',
};

// ── High-risk projects ─────────────────────────────────────────────────────

export interface ExecHighRiskProject {
  id: string;
  name: string;
  state: string;
  district: string;
  sector: string;
  risk: RiskLevel;
  delay: number;
  topIssue: string;
}

export const execHighRiskProjects: ExecHighRiskProject[] = [
  {
    id: 'proj_9',
    name: 'Highway Expansion',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    sector: 'Road',
    risk: RiskLevel.HIGH,
    delay: 287,
    topIssue: 'Compensation Pending',
  },
  {
    id: 'proj_10',
    name: 'Metro Corridor',
    state: 'Delhi',
    district: 'New Delhi',
    sector: 'Metro',
    risk: RiskLevel.HIGH,
    delay: 231,
    topIssue: 'Active Litigation',
  },
  {
    id: 'proj_11',
    name: 'Ring Road – Southern Arc',
    state: 'Maharashtra',
    district: 'Pune',
    sector: 'Road',
    risk: RiskLevel.HIGH,
    delay: 197,
    topIssue: 'Boundary Disputes',
  },
  {
    id: 'proj_12',
    name: 'Irrigation Canal Project',
    state: 'Telangana',
    district: 'Hyderabad',
    sector: 'Irrigation',
    risk: RiskLevel.HIGH,
    delay: 165,
    topIssue: 'Compensation Pending',
  },
  {
    id: 'proj_13',
    name: 'Expressway Interchange',
    state: 'Haryana',
    district: 'Gurugram',
    sector: 'Highway',
    risk: RiskLevel.HIGH,
    delay: 142,
    topIssue: 'Utility Shifting',
  },
];

// ── Delay trend ────────────────────────────────────────────────────────────

export interface DelayTrendPoint {
  date: string;
  avgDelay: number;
  highRiskCount: number;
}

export type TrendRange = '7D' | '30D' | '90D' | '1Y';

const today = new Date('2026-09-12T00:00:00Z');

function buildDelayTrend(rangeDays: number, points: number, startDelay: number): DelayTrendPoint[] {
  const out: DelayTrendPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - Math.round((rangeDays * i) / (points - 1)));
    const progress = (points - 1 - i) / (points - 1);
    const drift = (143 - startDelay) * progress;
    const noise = Math.sin(i * 1.7) * 4 + Math.cos(i * 0.9) * 3;
    const highRiskCount = Math.max(6, Math.round(8 + progress * 10 + Math.cos(i * 1.3) * 2));
    out.push({
      date: d.toISOString().slice(0, 10),
      avgDelay: Math.round(startDelay + drift + noise),
      highRiskCount,
    });
  }
  return out;
}

export const execDelayTrends: Record<TrendRange, DelayTrendPoint[]> = {
  '7D': buildDelayTrend(7, 8, 132),
  '30D': buildDelayTrend(30, 11, 127),
  '90D': buildDelayTrend(90, 13, 116),
  '1Y': buildDelayTrend(365, 12, 108),
};

// ── AI insight ─────────────────────────────────────────────────────────────

export interface InsightFactor {
  name: string;
  share: number; // percentage contribution
  trend: 'up' | 'down' | 'flat';
}

export const execAiInsight = {
  summary:
    '18 projects are currently classified as high risk. Compensation-related issues are currently the leading contributor to predicted delays.',
  factors: [
    { name: 'Compensation backlog', share: 34, trend: 'up' },
    { name: 'Legal disputes', share: 27, trend: 'up' },
    { name: 'Utility shifting', share: 14, trend: 'flat' },
    { name: 'Clearance delays', share: 11, trend: 'down' },
    { name: 'Land survey backlog', share: 9, trend: 'flat' },
  ] as InsightFactor[],
};

// ── Priority actions ───────────────────────────────────────────────────────

export interface PriorityActionItem {
  id: string;
  priority: RiskLevel;
  project: string;
  issue: string;
  impact: 'HIGH IMPACT' | 'MEDIUM IMPACT' | 'LOW IMPACT';
  recommendedAction: string;
  status: ActionStatus;
  daysLeft?: number;
}

export const execPriorityActions: PriorityActionItem[] = [
  {
    id: 'act_1',
    priority: RiskLevel.CRITICAL,
    project: 'Metro Corridor',
    issue: 'Heritage clearance blocked',
    impact: 'HIGH IMPACT',
    recommendedAction: 'Escalate to state authority within 48 hours.',
    status: ActionStatus.IN_PROGRESS,
    daysLeft: 3,
  },
  {
    id: 'act_2',
    priority: RiskLevel.HIGH,
    project: 'Highway Expansion',
    issue: 'Compensation pending',
    impact: 'HIGH IMPACT',
    recommendedAction: 'Expedite pending compensation approvals.',
    status: ActionStatus.IN_PROGRESS,
    daysLeft: 8,
  },
  {
    id: 'act_3',
    priority: RiskLevel.HIGH,
    project: 'Ring Road – Southern Arc',
    issue: 'Boundary disputes',
    impact: 'MEDIUM IMPACT',
    recommendedAction: 'Deploy additional survey teams in two villages.',
    status: ActionStatus.PENDING,
    daysLeft: 14,
  },
  {
    id: 'act_4',
    priority: RiskLevel.HIGH,
    project: 'Irrigation Canal Project',
    issue: 'Compensation pending',
    impact: 'MEDIUM IMPACT',
    recommendedAction: 'Disburse verified claims in two tranches.',
    status: ActionStatus.PENDING,
    daysLeft: 21,
  },
  {
    id: 'act_5',
    priority: RiskLevel.MEDIUM,
    project: 'Expressway Interchange',
    issue: 'Utility shifting',
    impact: 'LOW IMPACT',
    recommendedAction: 'Approve revised utility shifting plan.',
    status: ActionStatus.COMPLETED,
  },
];

// ── Intervention outcomes ──────────────────────────────────────────────────

export interface InterventionOutcome {
  id: string;
  project: string;
  intervention: string;
  before: number;
  after: number;
  improvement: number;
  date: string;
}

export const execOutcomes: InterventionOutcome[] = [
  {
    id: 'out_1',
    project: 'Highway Expansion',
    intervention: 'Compensation intervention',
    before: 287,
    after: 214,
    improvement: 73,
    date: '2026-09-05',
  },
  {
    id: 'out_2',
    project: 'Metro Corridor',
    intervention: 'Litigation fast-tracking',
    before: 231,
    after: 198,
    improvement: 33,
    date: '2026-09-08',
  },
];

// ── Aggregate narrative numbers ────────────────────────────────────────────

export const execNarrative = {
  greetingName: 'Officer',
  headerDescription:
    'Monitor project health, identify emerging risks, and take action before delays become critical.',
};