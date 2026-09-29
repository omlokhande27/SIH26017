import { apiClient } from './client';
import type { DashboardSummary } from '../types';

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const res: any = await apiClient.get('/dashboard/overview');
    const overview = res?.data?.overview ?? res?.overview ?? {};
    return {
      totalProjects: overview.total_projects ?? 0,
      activeProjects: overview.active_projects ?? 0,
      atRiskProjects: (overview.high_risk_projects ?? 0) + (overview.critical_risk_projects ?? 0),
      criticalProjects: overview.critical_risk_projects ?? 0,
      avgPredictedDelay: overview.avg_predicted_delay ?? 0,
      totalCompensationPending: overview.total_compensation_pending ?? 0,
      riskDistribution: {
        low: overview.low_risk_projects ?? 0,
        medium: overview.medium_risk_projects ?? 0,
        high: overview.high_risk_projects ?? 0,
        critical: overview.critical_risk_projects ?? 0,
      },
      recentActivity: [],
    };
  },
};
