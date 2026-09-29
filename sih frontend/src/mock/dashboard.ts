import type { DashboardSummary } from '../types';

export const mockDashboardSummary: DashboardSummary = {
  totalProjects: 8,
  activeProjects: 6, // Excluding ON_HOLD ones (proj_2, proj_6)
  atRiskProjects: 4, // HIGH (proj_1, proj_4) + CRITICAL (proj_2, proj_6)
  criticalProjects: 2, // CRITICAL (proj_2, proj_6)
  avgPredictedDelay: 184, // Approximate average of delays
  totalCompensationPending: 374, // 80+100+36+44+20+50+40+4 = 374
  riskDistribution: {
    low: 2,
    medium: 2,
    high: 2,
    critical: 2
  },
  recentActivity: [
    {
      id: 'act_1',
      type: 'RISK_UPDATE',
      message: 'Mumbai Metro Line 7 Extension moved to Critical Risk',
      projectId: 'proj_2',
      projectName: 'Mumbai Metro Line 7 Extension',
      timestamp: '2026-09-09T14:30:00Z',
      read: false
    },
    {
      id: 'act_2',
      type: 'PREDICTION_UPDATE',
      message: 'New AI prediction generated for Kanpur Ring Road',
      projectId: 'proj_4',
      projectName: 'Kanpur Ring Road Project',
      timestamp: '2026-09-09T10:15:00Z',
      read: false
    },
    {
      id: 'act_3',
      type: 'STATUS_UPDATE',
      message: 'Bengaluru Suburban Rail Phase 2 land acquisition reached 90%',
      projectId: 'proj_5',
      projectName: 'Bengaluru Suburban Rail Phase 2',
      timestamp: '2026-09-08T16:20:00Z',
      read: true
    },
    {
      id: 'act_4',
      type: 'COMPENSATION_UPDATE',
      message: '₹20 Cr disbursed for Bengaluru Suburban Rail',
      projectId: 'proj_5',
      projectName: 'Bengaluru Suburban Rail Phase 2',
      timestamp: '2026-09-07T16:45:00Z',
      read: true
    },
    {
      id: 'act_5',
      type: 'DOCUMENT_UPLOAD',
      message: 'New survey reports uploaded for Lucknow-Agra Expressway',
      projectId: 'proj_1',
      projectName: 'Lucknow-Agra Expressway Extension',
      timestamp: '2026-09-06T11:00:00Z',
      read: true
    }
  ]
};
