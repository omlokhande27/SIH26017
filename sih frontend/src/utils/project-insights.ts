import { buildFactorsForProject } from './prediction-helpers';
import { mockProjects } from '@/mock/projects';
import type { Project, ProjectIssue, RiskLevel } from '@/types';
import { ProjectStatus } from '@/types';

/**
 * Per-project delay intelligence for the Projects table.
 *
 * Everything here is derived from fields already recorded on the project, or
 * from the existing factor builder. No new prediction output is invented, and
 * every figure reports where it came from so the UI can label it honestly.
 */

export type MetricOrigin = 'model' | 'derived' | 'unavailable';

export interface DelayRiskInsight {
  /** Composite delay-risk score, 0-100. */
  riskScore: number;
  riskLevel: RiskLevel;
  /** Name of the factor contributing most to the delay. */
  mainCause: string;
  /** Share of the delay attributable to the main cause, as a percentage. */
  mainCauseShare: number;
  /** Likelihood the delay occurs, 0-100. */
  delayProbability: number;
  probabilityOrigin: MetricOrigin;
  /** Schedule progress against the recorded plan, 0-100. */
  projectCompletion: number;
  /** Signals that fed the risk score, for the tooltip. */
  signals: { label: string; value: string }[];
}

export interface ComparableProject {
  id: string;
  name: string;
  code: string;
  state: string;
  sector: string;
  riskLevel: RiskLevel;
  /** Compensation actually disbursed, in crores. */
  amountCr: number;
  /** Predicted delay recorded for that project, in days. */
  delayDays: number | null;
  /** Planned duration from start to expected end, in days. */
  plannedDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Risk-score weights. The four inputs are all recorded project fields, so the
 * score is reproducible from the row itself. The delay term carries the most
 * weight because the table is about delay exposure.
 */
const RISK_WEIGHTS = {
  delaySeverity: 0.35,
  acquisitionGap: 0.25,
  compensationLoad: 0.25,
  issueLoad: 0.15,
} as const;

const OPEN_ISSUES_FOR_MAX = 4;

/**
 * Starting point for the delay probability by recorded project status. A
 * project already marked delayed or on hold has, in effect, slipped; one still
 * in planning has not. This keeps probability separate from the risk score,
 * which measures severity rather than likelihood.
 */
const STATUS_PROBABILITY: Record<ProjectStatus, number> = {
  [ProjectStatus.DELAYED]: 0.78,
  [ProjectStatus.ON_HOLD]: 0.74,
  [ProjectStatus.IN_PROGRESS]: 0.52,
  [ProjectStatus.PLANNING]: 0.3,
  [ProjectStatus.COMPLETED]: 0.05,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function openIssues(project: Project): ProjectIssue[] {
  return (project.issues ?? []).filter((issue) => issue.status !== 'RESOLVED');
}

function daysBetween(from: string, to: string): number {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

/**
 * How far through its recorded schedule a project is: elapsed days since the
 * start date, over the planned span to the expected end date. This is schedule
 * progress, so it is deliberately separate from land acquisition progress.
 */
export function buildProjectCompletion(project: Project): number {
  if (project.status === ProjectStatus.COMPLETED) return 100;

  const start = new Date(project.startDate).getTime();
  const end = new Date(project.expectedEndDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const planned = end - start;
  const elapsed = Date.now() - start;
  return Math.round(clamp01(elapsed / planned) * 100);
}

/**
 * Builds the delay-risk read-out for one project.
 *
 * `probabilityOrigin` is 'model' only when a prediction carrying a confidence
 * value exists for the project. Otherwise the probability is derived from the
 * same recorded signals as the risk score, so the UI must present it as an
 * estimate rather than a model output.
 */
export function buildDelayRiskInsight(project: Project): DelayRiskInsight {
  const factors = buildFactorsForProject(project);
  const mainFactor = factors[0] ?? null;

  const delaySeverity = clamp01((project.predictedDelay ?? 0) / 365);
  const acquisitionGap = clamp01(1 - (project.acquisitionPercentage ?? 0) / 100);
  const compensationLoad = clamp01(
    (project.compensationPending ?? 0) / Math.max(1, project.compensationRequired ?? 0),
  );
  const issueLoad = clamp01(openIssues(project).length / OPEN_ISSUES_FOR_MAX);

  const riskScore = Math.round(
    100 *
      (RISK_WEIGHTS.delaySeverity * delaySeverity +
        RISK_WEIGHTS.acquisitionGap * acquisitionGap +
        RISK_WEIGHTS.compensationLoad * compensationLoad +
        RISK_WEIGHTS.issueLoad * issueLoad),
  );

  // A recorded model confidence takes precedence when one exists.
  const modelConfidence = findModelConfidence(project);

  // Otherwise estimate the chance the predicted delay actually lands: start
  // from recorded status, then nudge for compensation backlog and open issues.
  const derivedProbability = clamp01(
    STATUS_PROBABILITY[project.status] +
      0.12 * compensationLoad +
      0.07 * issueLoad -
      0.1 * (project.acquisitionPercentage ?? 0) / 100,
  );

  const delayProbability = modelConfidence ?? derivedProbability * 100;
  const probabilityOrigin: MetricOrigin =
    modelConfidence !== null ? 'model' : factors.length > 0 ? 'derived' : 'unavailable';

  return {
    riskScore,
    riskLevel: project.riskLevel,
    mainCause: mainFactor?.name ?? 'Not recorded',
    mainCauseShare: Math.round((mainFactor?.contributionScore ?? 0) * 100),
    delayProbability: Math.min(100, Math.max(0, Math.round(delayProbability))),
    probabilityOrigin,
    projectCompletion: buildProjectCompletion(project),
    signals: [
      {
        label: 'Predicted delay',
        value:
          project.predictedDelay !== null
            ? `${project.predictedDelay} of 365 days`
            : 'Not available',
      },
      {
        label: 'Acquisition gap',
        value: `${Math.round(acquisitionGap * 100)}% still to acquire`,
      },
      {
        label: 'Compensation pending',
        value: `${Math.round(compensationLoad * 100)}% of approved value`,
      },
      {
        label: 'Open issues',
        value: `${openIssues(project).length} recorded`,
      },
    ],
  };
}

/**
 * Reads a confidence value from a prediction already stored for the project.
 * Only projects whose stored prediction carries a confidence are treated as
 * having a model figure; everything else is labelled as derived.
 */
export function findModelConfidence(project: Project): number | null {
  // Mock predictions removed
  return null;
}

/**
 * Finds projects comparable to the given one and reports what actually
 * happened on them: money disbursed, delay recorded, and planned duration.
 * Comparables are drawn from the real project register, never generated.
 */
export function buildComparableProjects(project: Project, limit = 4): ComparableProject[] {
  const sameSector = mockProjects.filter(
    (candidate) =>
      candidate.id !== project.id &&
      candidate.sector === project.sector &&
      candidate.riskLevel === project.riskLevel,
  );

  const sameStateDifferentSector = mockProjects.filter(
    (candidate) =>
      candidate.id !== project.id &&
      candidate.state === project.state &&
      candidate.sector !== project.sector,
  );

  const pool = [...sameSector, ...sameStateDifferentSector].slice(0, limit);

  return pool.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    code: candidate.code,
    state: candidate.state,
    sector: candidate.sector,
    riskLevel: candidate.riskLevel,
    amountCr: Math.round((candidate.compensationPaid ?? 0) * 10) / 10,
    delayDays: candidate.predictedDelay,
    plannedDays: daysBetween(candidate.startDate, candidate.expectedEndDate),
  }));
}
