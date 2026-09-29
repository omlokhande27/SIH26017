import { apiClient } from './client';
import type { Recommendation } from '../types';
import { ActionStatus, RiskLevel } from '../types';

// Map a backend recommendation (from prediction response) to frontend type
function mapBackendRecommendation(rec: any, projectId: string, projectName: string, index: number): Recommendation {
  const now = new Date().toISOString();
  return {
    id: rec.id ?? `rec_${projectId}_${index}`,
    projectId,
    projectName,
    title: rec.title ?? rec.action ?? 'Recommendation',
    description: rec.rationale ?? rec.description ?? '',
    priority: (rec.priority as RiskLevel) ?? RiskLevel.MEDIUM,
    category: rec.source_rule_id ?? rec.category ?? 'General',
    estimatedImpact: rec.impact ?? 'Potential delay reduction',
    deadline: rec.deadline ?? '',
    actionStatus: ActionStatus.PENDING,
    assignedTo: rec.assigned_to,
    createdAt: rec.created_at ?? now,
    priorityRank: index + 1,
    riskFactor: rec.source_rule_id ?? rec.risk_factor ?? '',
    recommendedAction: rec.action ?? rec.title ?? '',
    impact: (rec.priority as RiskLevel) ?? RiskLevel.MEDIUM,
    owner: rec.assigned_to ?? 'Unassigned',
    riskLevel: (rec.priority as RiskLevel) ?? RiskLevel.MEDIUM,
    predictedDelayAtRecommendation: rec.predicted_delay ?? 0,
  };
}

export const recommendationsApi = {
  getRecommendations: async (): Promise<Recommendation[]> => {
    try {
      // Fetch all projects, then get latest predictions for each to collect recommendations
      const projectsRes: any = await apiClient.get('/projects?limit=100');
      const projects = projectsRes?.data?.projects ?? [];
      const allRecs: Recommendation[] = [];

      // Fetch predictions in parallel (limited to avoid overwhelming the backend)
      const fetchPromises = projects.slice(0, 20).map(async (p: any) => {
        try {
          const predRes: any = await apiClient.get(`/projects/${p.id}/predictions/latest`);
          const recs = predRes?.data?.recommendations ?? predRes?.recommendations ?? [];
          if (Array.isArray(recs)) {
            return recs.map((rec: any, idx: number) =>
              mapBackendRecommendation(rec, p.id, p.project_name, idx)
            );
          }
        } catch {
          // No prediction for this project
        }
        return [];
      });

      const results = await Promise.all(fetchPromises);
      for (const recs of results) {
        allRecs.push(...recs);
      }

      return allRecs;
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      return [];
    }
  },

  getRecommendation: async (id: string): Promise<Recommendation | null> => {
    // Recommendations don't have individual endpoints; search through all
    const all = await recommendationsApi.getRecommendations();
    return all.find((r) => r.id === id) ?? null;
  },

  getRecommendationsByProjectId: async (projectId: string): Promise<Recommendation[]> => {
    try {
      const predRes: any = await apiClient.get(`/projects/${projectId}/predictions/latest`);
      const recs = predRes?.data?.recommendations ?? predRes?.recommendations ?? [];
      const projectName = predRes?.data?.prediction?.project_name ?? 'Project';
      if (Array.isArray(recs)) {
        return recs.map((rec: any, idx: number) =>
          mapBackendRecommendation(rec, projectId, projectName, idx)
        );
      }
    } catch {
      // No prediction for this project
    }
    return [];
  },

  // Action status mutations — operate on local state since backend
  // doesn't have a dedicated recommendations CRUD table.
  startAction: async (id: string): Promise<Recommendation> => {
    const rec = await recommendationsApi.getRecommendation(id);
    if (!rec) throw new Error('Recommendation not found');
    return { ...rec, actionStatus: ActionStatus.IN_PROGRESS, startedAt: new Date().toISOString() };
  },

  blockAction: async (id: string, reason: string): Promise<Recommendation> => {
    const rec = await recommendationsApi.getRecommendation(id);
    if (!rec) throw new Error('Recommendation not found');
    return { ...rec, actionStatus: ActionStatus.BLOCKED, blockedAt: new Date().toISOString(), blockedReason: reason };
  },

  reopenAction: async (id: string): Promise<Recommendation> => {
    const rec = await recommendationsApi.getRecommendation(id);
    if (!rec) throw new Error('Recommendation not found');
    return { ...rec, actionStatus: ActionStatus.PENDING, blockedAt: null, blockedReason: undefined };
  },

  completeAction: async (id: string): Promise<Recommendation> => {
    const rec = await recommendationsApi.getRecommendation(id);
    if (!rec) throw new Error('Recommendation not found');
    return { ...rec, actionStatus: ActionStatus.COMPLETED, completedAt: new Date().toISOString() };
  },
};