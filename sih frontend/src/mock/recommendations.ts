import { RiskLevel, ActionStatus } from '../types';
import type { ActionOutcome, ActionOutcomeStatus, Recommendation } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock action service.
//
// Stands in for a backend ACT engine: it manages recommendation records plus
// the status lifecycle (start / block / complete). Outcomes generated on
// completion are explicit mock figures — the real backend will supply verified
// prediction deltas once live.
// ─────────────────────────────────────────────────────────────────────────────

export const mockRecommendations: Recommendation[] = [
  {
    id: 'rec_7',
    projectId: 'proj_9',
    projectName: 'Highway Expansion',
    title: 'Resolve Pending Compensation',
    description:
      'Compensation approvals for 14 villages remain unpaid, stalling award and possession. Clearing these unlocks delivery of the critical-path segments.',
    priority: RiskLevel.HIGH,
    category: 'Financial',
    estimatedImpact: 'Reduces predicted delay by ~45 days',
    deadline: '2026-09-16T00:00:00Z',
    actionStatus: ActionStatus.PENDING,
    createdAt: '2026-09-08T10:00:00Z',
    priorityRank: 1,
    riskFactor: 'Pending Compensation',
    recommendedAction: 'Expedite pending compensation approvals.',
    impact: RiskLevel.HIGH,
    owner: 'Land Acquisition Officer',
    riskLevel: RiskLevel.HIGH,
    predictedDelayAtRecommendation: 287,
  },
  {
    id: 'rec_2',
    projectId: 'proj_2',
    projectName: 'Mumbai Metro Line 7 Extension',
    title: 'Escalate Environmental Clearance',
    description: 'Pending clearance for depot land is the primary bottleneck and needs immediate state-level intervention.',
    priority: RiskLevel.CRITICAL,
    category: 'Regulatory',
    estimatedImpact: 'Reduces predicted delay by ~90 days',
    deadline: '2026-09-15T00:00:00Z',
    actionStatus: ActionStatus.IN_PROGRESS,
    assignedTo: 'usr_2',
    createdAt: '2026-09-07T10:00:00Z',
    priorityRank: 2,
    riskFactor: 'Regulatory Clearance',
    recommendedAction: 'Escalate the environmental clearance to the state authority immediately.',
    impact: RiskLevel.HIGH,
    owner: 'Environmental Clearance Cell',
    riskLevel: RiskLevel.CRITICAL,
    predictedDelayAtRecommendation: 412,
    startedAt: '2026-09-08T09:15:00Z',
  },
  {
    id: 'rec_4',
    projectId: 'proj_6',
    projectName: 'Patna River Bridge Construction',
    title: 'Engage Local Community Leaders',
    description: 'Resistance from riverbank settlements requires active dialogue and rehabilitation guarantees.',
    priority: RiskLevel.CRITICAL,
    category: 'Social',
    estimatedImpact: 'Prevents indefinite project halt',
    deadline: '2026-09-18T00:00:00Z',
    actionStatus: ActionStatus.PENDING,
    createdAt: '2026-09-05T10:00:00Z',
    priorityRank: 3,
    riskFactor: 'Community Resistance & R&R',
    recommendedAction: 'Engage community leaders and provide rehabilitation guarantees.',
    impact: RiskLevel.HIGH,
    owner: 'Community Liaison Officer',
    riskLevel: RiskLevel.CRITICAL,
    predictedDelayAtRecommendation: 356,
  },
  {
    id: 'rec_1',
    projectId: 'proj_1',
    projectName: 'Lucknow-Agra Expressway Extension',
    title: 'Expedite Compensation Disbursement',
    description: 'Slow disbursement is causing unrest and legal challenges. Fast-track the transfer for the remaining 80 Cr.',
    priority: RiskLevel.HIGH,
    category: 'Financial',
    estimatedImpact: 'Reduces predicted delay by ~45 days',
    deadline: '2026-09-20T00:00:00Z',
    actionStatus: ActionStatus.PENDING,
    createdAt: '2026-09-08T10:00:00Z',
    priorityRank: 4,
    riskFactor: 'Pending Compensation',
    recommendedAction: 'Fast-track disbursement for the remaining compensation.',
    impact: RiskLevel.HIGH,
    owner: 'Land Acquisition Officer',
    riskLevel: RiskLevel.HIGH,
    predictedDelayAtRecommendation: 287,
  },
  {
    id: 'rec_3',
    projectId: 'proj_4',
    projectName: 'Kanpur Ring Road Project',
    title: 'Resolve Land Boundary Disputes',
    description: 'Boundary demarcations are unclear in 3 villages. Extra teams can resolve this in 2 weeks.',
    priority: RiskLevel.MEDIUM,
    category: 'Operational',
    estimatedImpact: 'Reduces predicted delay by ~30 days',
    deadline: '2026-09-25T00:00:00Z',
    actionStatus: ActionStatus.PENDING,
    createdAt: '2026-09-06T10:00:00Z',
    priorityRank: 5,
    riskFactor: 'Land Boundary Disputes',
    recommendedAction: 'Deploy additional survey teams to close outstanding boundary demarcations.',
    impact: RiskLevel.MEDIUM,
    owner: 'Survey & Demarcation Team',
    riskLevel: RiskLevel.HIGH,
    predictedDelayAtRecommendation: 203,
  },
  {
    id: 'rec_5',
    projectId: 'proj_3',
    projectName: 'Delhi-Jaipur Highway Upgrade',
    title: 'Align Utility Shifting Approvals',
    description: 'Water and electricity line shifting is lagging behind the land acquisition pace.',
    priority: RiskLevel.MEDIUM,
    category: 'Operational',
    estimatedImpact: 'Reduces predicted delay by ~20 days',
    deadline: '2026-10-05T00:00:00Z',
    actionStatus: ActionStatus.COMPLETED,
    assignedTo: 'usr_3',
    createdAt: '2026-09-01T10:00:00Z',
    priorityRank: 6,
    riskFactor: 'Utility Shifting Approvals',
    recommendedAction: 'Bring utility shifting in line with the acquisition schedule.',
    impact: RiskLevel.MEDIUM,
    owner: 'Utility Coordination Officer',
    riskLevel: RiskLevel.MEDIUM,
    predictedDelayAtRecommendation: 95,
    startedAt: '2026-09-04T11:30:00Z',
    completedAt: '2026-09-10T14:00:00Z',
    outcome: {
      status: 'IMPROVED',
      beforeDelay: 95,
      afterDelay: 71,
      note: 'Re-running the prediction model after the intervention yields an estimated 71 days of delay.',
      isMock: true,
    },
  },
  {
    id: 'rec_6',
    projectId: 'proj_7',
    projectName: 'Bhopal Metro Corridor',
    title: 'Initiate Advance Tender for Civil Works',
    description: '70% land acquired. Start civil works to maintain momentum while remaining patches are cleared.',
    priority: RiskLevel.LOW,
    category: 'Operational',
    estimatedImpact: 'Advances project completion by ~15 days',
    deadline: '2026-10-15T00:00:00Z',
    actionStatus: ActionStatus.PENDING,
    createdAt: '2026-09-08T14:00:00Z',
    priorityRank: 7,
    riskFactor: 'Acquisition Progress',
    recommendedAction: 'Invite tenders for civil works on the already-acquired land parcels.',
    impact: RiskLevel.LOW,
    owner: 'Procurement Cell',
    riskLevel: RiskLevel.MEDIUM,
    predictedDelayAtRecommendation: 78,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runtime store (fresh for each session)
// ─────────────────────────────────────────────────────────────────────────────

const actionStore = new Map<string, Recommendation>();

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function mockOutcomeFor(rec: Recommendation): ActionOutcome {
  const before = rec.predictedDelayAtRecommendation;
  const roll = hashString(`${rec.id}:${rec.projectId}:outcome`) % 100;

  let status: ActionOutcomeStatus;
  if (roll < 55) status = 'IMPROVED';
  else if (roll < 75) status = 'NO_IMPROVEMENT';
  else if (roll < 87) status = 'RISK_INCREASED';
  else status = 'AWAITING_PREDICTION';

  let after: number | null = before;
  let note = '';
  if (status === 'IMPROVED') {
    const saving = Math.max(15, Math.round((before * (12 + (roll % 28))) / 100));
    after = Math.max(0, before - saving);
    note = `Re-running the prediction model after the intervention yields an estimated ${after} days of projected delay.`;
  } else if (status === 'NO_IMPROVEMENT') {
    after = before;
    note = 'A fresh model run shows no measurable change in the predicted delay.';
  } else if (status === 'RISK_INCREASED') {
    after = before + Math.round((before * (5 + (roll % 12))) / 100);
    note = 'The updated model run indicates the predicted delay has widened further.';
  } else {
    after = null;
    note = 'A refreshed prediction is queued; the outcome will surface once the next model run completes.';
  }

  return { status, beforeDelay: before, afterDelay: after, note, isMock: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service API (consumed by api/recommendations.api.ts)
// ─────────────────────────────────────────────────────────────────────────────

export function getRecommendations(): Recommendation[] {
  return mockRecommendations.map((rec) => actionStore.get(rec.id) ?? rec);
}

export function getAction(id: string): Recommendation | null {
  return getRecommendations().find((rec) => rec.id === id) ?? null;
}

export function startAction(id: string): Recommendation {
  const current = getRecommendations().find((rec) => rec.id === id);
  if (!current) throw new Error(`Recommendation not found: ${id}`);
  const updated: Recommendation = {
    ...current,
    actionStatus: ActionStatus.IN_PROGRESS,
    startedAt: new Date().toISOString(),
    blockedAt: null,
    blockedReason: undefined,
  };
  actionStore.set(id, updated);
  return updated;
}

export function blockAction(id: string, reason: string): Recommendation {
  const current = getRecommendations().find((rec) => rec.id === id);
  if (!current) throw new Error(`Recommendation not found: ${id}`);
  const updated: Recommendation = {
    ...current,
    actionStatus: ActionStatus.BLOCKED,
    blockedAt: new Date().toISOString(),
    blockedReason: reason,
  };
  actionStore.set(id, updated);
  return updated;
}

export function reopenAction(id: string): Recommendation {
  const current = getRecommendations().find((rec) => rec.id === id);
  if (!current) throw new Error(`Recommendation not found: ${id}`);
  const updated: Recommendation = {
    ...current,
    actionStatus: ActionStatus.PENDING,
    blockedAt: null,
    blockedReason: undefined,
  };
  actionStore.set(id, updated);
  return updated;
}

export function completeAction(id: string): Recommendation {
  const current = getRecommendations().find((rec) => rec.id === id);
  if (!current) throw new Error(`Recommendation not found: ${id}`);
  const updated: Recommendation = {
    ...current,
    actionStatus: ActionStatus.COMPLETED,
    completedAt: new Date().toISOString(),
    outcome: mockOutcomeFor(current),
  };
  actionStore.set(id, updated);
  return updated;
}