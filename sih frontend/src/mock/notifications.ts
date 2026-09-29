import { NotificationType } from '../types';
import type { Notification } from '../types';

export const mockNotifications: Notification[] = [
  {
    id: 'notif_1',
    type: NotificationType.RISK_CHANGE,
    title: 'Risk Level Escalated',
    message: 'Mumbai Metro Line 7 Extension has moved to CRITICAL Risk.',
    projectId: 'proj_2',
    projectName: 'Mumbai Metro Line 7 Extension',
    timestamp: '2026-09-09T14:30:00Z',
    read: false,
    priority: 'HIGH'
  },
  {
    id: 'notif_2',
    type: NotificationType.PREDICTION_READY,
    title: 'New AI Prediction Available',
    message: 'New AI prediction available for Kanpur Ring Road.',
    projectId: 'proj_4',
    projectName: 'Kanpur Ring Road Project',
    timestamp: '2026-09-09T10:15:00Z',
    read: false,
    priority: 'MEDIUM'
  },
  {
    id: 'notif_3',
    type: NotificationType.ACTION_DEADLINE,
    title: 'Action Deadline Approaching',
    message: 'Deadline to resolve land dispute in Lucknow-Agra Expressway is in 2 days.',
    projectId: 'proj_1',
    projectName: 'Lucknow-Agra Expressway Extension',
    timestamp: '2026-09-08T09:00:00Z',
    read: true,
    priority: 'HIGH'
  },
  {
    id: 'notif_4',
    type: NotificationType.COMPENSATION_UPDATE,
    title: 'Compensation Disbursement',
    message: '₹20 Cr disbursed for Bengaluru Suburban Rail Phase 2.',
    projectId: 'proj_5',
    projectName: 'Bengaluru Suburban Rail Phase 2',
    timestamp: '2026-09-07T16:45:00Z',
    read: true,
    priority: 'LOW'
  },
  {
    id: 'notif_5',
    type: NotificationType.RISK_CHANGE,
    title: 'Risk Level Updated',
    message: 'Delhi-Jaipur Highway Upgrade risk level reduced to MEDIUM.',
    projectId: 'proj_3',
    projectName: 'Delhi-Jaipur Highway Upgrade',
    timestamp: '2026-09-06T11:20:00Z',
    read: true,
    priority: 'MEDIUM'
  },
  {
    id: 'notif_6',
    type: NotificationType.GENERAL,
    title: 'System Maintenance',
    message: 'Scheduled downtime for LandGuard AI on 12th Sept, 02:00 AM IST.',
    timestamp: '2026-09-05T08:00:00Z',
    read: true,
    priority: 'LOW'
  },
  {
    id: 'notif_7',
    type: NotificationType.COMPENSATION_UPDATE,
    title: 'Compensation Deadline',
    message: 'Compensation deadline approaching for Lucknow-Agra Expressway.',
    projectId: 'proj_1',
    projectName: 'Lucknow-Agra Expressway Extension',
    timestamp: '2026-09-04T10:00:00Z',
    read: true,
    priority: 'HIGH'
  },
  {
    id: 'notif_8',
    type: NotificationType.PREDICTION_READY,
    title: 'Quarterly Analysis Ready',
    message: 'Q3 2026 Land Acquisition Prediction models have been updated.',
    timestamp: '2026-09-01T09:00:00Z',
    read: true,
    priority: 'MEDIUM'
  }
];
