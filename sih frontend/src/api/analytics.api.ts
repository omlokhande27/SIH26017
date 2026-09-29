import { apiClient } from './client';
import type { DelayTrend } from '../types';

export const analyticsApi = {
  getDelayTrends: async (): Promise<DelayTrend[]> => {
    try {
      const res: any = await apiClient.get('/analytics/delay');
      const analytics = res?.data?.analytics ?? res?.analytics ?? {};
      const buckets = analytics.delay_buckets;
      if (Array.isArray(buckets) && buckets.length > 0) {
        return buckets.map((b: any) => ({
          month: b.label ?? b.bucket ?? '',
          avgDelay: b.average_delay ?? b.avg_delay ?? 0,
          projectCount: b.project_count ?? b.count ?? 0,
        }));
      }
      // Fallback: build a single-point from the aggregate
      return [{
        month: 'Current',
        avgDelay: analytics.average_delay_days ?? 0,
        projectCount: analytics.total_projects ?? 0,
      }];
    } catch (err) {
      console.error('Analytics delay fetch failed:', err);
      return [];
    }
  },
};
