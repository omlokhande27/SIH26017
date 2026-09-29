import { RiskLevel, ProjectSector } from '../types';
import type { Project, Prediction, PredictionExplanation, RiskFactor } from '../types';
import { mockProjects } from './projects';
import { formatINR, formatPercentage, getSectorLabel } from '../utils/formatting';

// ─────────────────────────────────────────────────────────────────────────────
// Mock "model backend".
//
// This layer stands in for the prediction service. It computes factor
// contributions from real project indicators (compensation, acquisition,
// recorded legal issues). The frontend never derives contributions itself —
// it only visualizes what this "backend" returns.
// ─────────────────────────────────────────────────────────────────────────────

const legalIssueTitles = ['Litigation', 'Land Dispute', 'Title Issue'];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function projectSeed(project: Project): number {
  let h = 0;
  const s = `${project.id}:${project.code}:${project.state}:${project.district}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}

function severityScale(severity: RiskLevel): number {
  switch (severity) {
    case RiskLevel.CRITICAL: return 1.2;
    case RiskLevel.HIGH: return 1;
    case RiskLevel.MEDIUM: return 0.6;
    default: return 0.3;
  }
}

interface FactorDraft {
  key: string;
  name: string;
  category: string;
  score: number;
  description: string;
}

function buildFactorDrafts(project: Project): FactorDraft[] {
  const drafts: FactorDraft[] = [];
  const issues = project.issues ?? [];
  const seed = projectSeed(project);

  const compRequired = project.compensationRequired || 1;
  const compPending = Math.max(0, project.compensationPending ?? 0);
  const compRatio = (compPending / compRequired) * 100;

  if (compRatio > 5) {
    drafts.push({
      key: 'compensation',
      name: 'Pending Compensation',
      category: 'Financial',
      score: clamp01(compRatio / 100),
      description: `${formatINR(compPending)} of ${formatINR(compRequired)} required compensation (${formatPercentage(compRatio)}) remains unpaid, increasing the likelihood of acquisition-related delays.`,
    });
  }

  const acqPct = project.acquisitionPercentage ?? 0;
  const acqGap = clamp01(1 - acqPct / 100);
  if (acqGap > 0.05) {
    drafts.push({
      key: 'acquisition',
      name: 'Low Acquisition %',
      category: 'Operational',
      score: acqGap * 0.9,
      description: `Only ${formatPercentage(acqPct)} of required land has been acquired (${project.landAcquired} of ${project.landRequired} Ha), leaving the construction schedule without a usable right of way.`,
    });
  }

  const legalIssues = issues.filter((i) => legalIssueTitles.includes(i.title));
  if (legalIssues.length > 0) {
    const strongest = Math.max(...legalIssues.map((i) => severityScale(i.severity)));
    drafts.push({
      key: 'litigation',
      name: 'Active Litigation',
      category: 'Legal',
      score: 0.45 + strongest * 0.3,
      description: `${legalIssues.length} active legal dispute${legalIssues.length > 1 ? 's' : ''} over valuation and title${legalIssues.length > 1 ? 's' : ''} remain unresolved, blocking award and possession.`,
    });
  }

  const possession = issues.find((i) => i.title === 'Possession Pending');
  if (possession) {
    drafts.push({
      key: 'possession',
      name: 'Possession Pending',
      category: 'Operational',
      score: 0.3 + severityScale(possession.severity) * 0.25,
      description: 'Awarded parcels have not yet been handed over to the implementing agency, stalling site access and physical progress.',
    });
  }

  const rnr = issues.find((i) => i.title === 'R&R Pending');
  if (rnr) {
    drafts.push({
      key: 'resettlement',
      name: 'Rehabilitation Pending',
      category: 'Social',
      score: 0.25 + severityScale(rnr.severity) * 0.2,
      description: 'Rehabilitation and resettlement packages await coordination, restricting lawful use of acquired parcels.',
    });
  }

  // Stable ambient administrative overhead — deterministic, no fabricated ML internals.
  drafts.push({
    key: 'administrative',
    name: 'Administrative Coordination',
    category: 'Regulatory',
    score: 0.12 + ((seed % 10) / 10) * 0.15,
    description: `Multi-agency approval and coordination overhead across ${project.state} is elevated for projects at this stage of acquisition.`,
  });

  return drafts;
}

export function buildFactorsForProject(project: Project): RiskFactor[] {
  const drafts = buildFactorDrafts(project);
  const total = drafts.reduce((sum, d) => sum + d.score, 0) || 1;

  let acc = 0;
  return drafts.map((draft, idx) => {
    const contributionScore =
      idx === drafts.length - 1
        ? Math.round((1 - acc) * 100) / 100
        : Math.round((draft.score / total) * 100) / 100;
    acc += contributionScore;

    return {
      id: `rf_${project.id}_${draft.key}`,
      name: draft.name,
      category: draft.category,
      weight: contributionScore,
      value: Math.round(contributionScore * 100),
      impact: 'NEGATIVE' as const,
      description: draft.description,
      contributionScore,
    };
  });
}

export function factorContributionRisk(score: number): RiskLevel {
  if (score >= 0.28) return RiskLevel.HIGH;
  if (score >= 0.15) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

export function summarizeDelay(days: number): string {
  const months = Math.round(days / 30.44);
  if (months < 1) return `${days} day${days > 1 ? 's' : ''}`;
  if (months < 12) return `~${months} month${months > 1 ? 's' : ''}`;
  return `~${Math.round(months / 12)} year${Math.round(months / 12) > 1 ? 's' : ''}`;
}

function estimateDelay(factors: RiskFactor[]): number {
  const byKey: Record<string, number> = {};
  for (const f of factors) {
    const key = f.id.split('_').pop() ?? 'admin';
    byKey[key] = f.contributionScore ?? 0;
  }
  const score =
    (byKey.compensation ?? 0) * 420 +
    (byKey.acquisition ?? 0) * 300 +
    (byKey.litigation ?? 0) * 260 +
    (byKey.possession ?? 0) * 180 +
    (byKey.resettlement ?? 0) * 140 +
    (byKey.administrative ?? 0) * 120;
  return Math.round(Math.max(15, Math.min(540, score)));
}

export function generatePrediction(project: Project, at = new Date().toISOString()): Prediction {
  return {
    id: `pred_${project.id}_${at}`,
    projectId: project.id,
    projectName: project.name,
    predictedDelay: project.predictedDelay ?? estimateDelay(buildFactorsForProject(project)),
    riskLevel: project.riskLevel,
    factors: buildFactorsForProject(project),
    createdAt: at,
    modelVersion: 'v1.0',
    dataOrigin: 'demo',
  };
}

export function generatePredictionHistory(project: Project): Prediction[] {
  const latestDate = project.lastPredictionDate ?? project.updatedAt;
  const previous = (project.predictionHistory ?? []).filter((e) => e.date !== latestDate);
  return previous
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => ({
      id: entry.id,
      projectId: project.id,
      projectName: project.name,
      predictedDelay: entry.predictedDelay,
      riskLevel: entry.riskLevel,
      factors: buildFactorsForProject(project),
      createdAt: entry.date,
      modelVersion: entry.modelVersion ?? 'v0.9',
      dataOrigin: 'demo',
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanation content (backend-composed, human-readable)
// ─────────────────────────────────────────────────────────────────────────────

const recommendationByKey: Record<string, string> = {
  compensation: 'Expedite fund disbursement through dedicated payment teams',
  acquisition: 'Prioritize acquisition on the critical path segments',
  litigation: 'Organize fast-track Lok Adalats to clear pending valuation cases',
  possession: 'Streamline possession handover to the implementing agency',
  resettlement: 'Fast-track rehabilitation and resettlement packages',
  administrative: 'Simplify inter-agency approval workflows for pending clearances',
};

function keyOf(factor: RiskFactor): string {
  return factor.id.split('_').pop() ?? '';
}

export function buildPredictionExplanation(prediction: Prediction): PredictionExplanation {
  const factors = prediction.factors
    .slice()
    .sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0));

  const top = factors[0];
  const project = mockProjects.find((p) => p.id === prediction.projectId);

  const peers = mockProjects.filter((p) => p.sector === project?.sector && p.id !== project?.id);
  const peerAvg = peers.length
    ? Math.round(peers.reduce((s, p) => s + (p.predictedDelay ?? 0), 0) / peers.length)
    : 0;

  return {
    predictionId: prediction.id,
    summary: `The model estimates a ${summarizeDelay(prediction.predictedDelay)} delay for ${prediction.projectName}, driven primarily by ${top ? top.name.toLowerCase() : 'acquisition pressures'}. ${top ? top.description : ''}`,
    topFactors: factors,
    historicalComparison:
      peerAvg > 0
        ? `Comparable ${getSectorLabel(project?.sector ?? ProjectSector.ROAD)} projects in ${project?.state ?? 'the region'} averaged ${peerAvg} days of delay at a similar stage.`
        : 'Comparable projects were limited for this region and sector in the sample set.',
    recommendations: factors
      .slice(0, 3)
      .map((f) => recommendationByKey[keyOf(f)])
      .filter((r): r is string => Boolean(r)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Showcase predictions — these explicitly carry a backend-provided confidence.
// Generated runs (runAnalysis) deliberately do not.
// ─────────────────────────────────────────────────────────────────────────────

const showcaseIds = ['proj_1', 'proj_2', 'proj_4', 'proj_6'];
const showcaseConfidence: Record<string, number> = {
  proj_1: 88,
  proj_2: 92,
  proj_4: 85,
  proj_6: 90,
};
const showcaseModelVersion: Record<string, string> = {
  proj_1: 'v1.0',
  proj_2: 'v1.0',
  proj_4: 'v1.0',
  proj_6: 'v1.0',
};

export const mockPredictions: Prediction[] = showcaseIds
  .map((projectId) => mockProjects.find((p) => p.id === projectId))
  .filter((p): p is Project => Boolean(p))
  .map((project) => ({
    id: `pred_${project.id}`,
    projectId: project.id,
    projectName: project.name,
    predictedDelay: project.predictedDelay ?? estimateDelay(buildFactorsForProject(project)),
    riskLevel: project.riskLevel,
    confidence: showcaseConfidence[project.id],
    factors: buildFactorsForProject(project),
    createdAt: project.lastPredictionDate ?? project.updatedAt,
    modelVersion: showcaseModelVersion[project.id],
    dataOrigin: 'demo',
  }));

// ─────────────────────────────────────────────────────────────────────────────
// Runtime store for freshly generated runs
// ─────────────────────────────────────────────────────────────────────────────

const generatedPredictions = new Map<string, Prediction>();

export function findPrediction(predictionId: string): Prediction | null {
  const showcase = mockPredictions.find((p) => p.id === predictionId);
  if (showcase) return showcase;
  for (const p of generatedPredictions.values()) {
    if (p.id === predictionId) return p;
  }
  return null;
}

export function getPredictionForProject(project: Project): Prediction {
  const generated = generatedPredictions.get(project.id);
  if (generated) return generated;
  const showcase = mockPredictions.find((p) => p.projectId === project.id);
  if (showcase) return showcase;
  return generatePrediction(project);
}

export function runAnalysis(project: Project): Prediction {
  const prediction = generatePrediction(project);
  generatedPredictions.set(project.id, prediction);
  return prediction;
}