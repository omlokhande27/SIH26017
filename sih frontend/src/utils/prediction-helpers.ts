import { RiskLevel } from '../types';
import type { Project, RiskFactor } from '../types';
import { formatINR, formatPercentage } from './formatting';

// ─────────────────────────────────────────────────────────────────────────────
// Prediction utility functions.
//
// Extracted from the mock prediction layer so that components can compute
// factor contributions from real project indicators without importing mock
// data arrays. These functions take a Project and return computed data.
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
