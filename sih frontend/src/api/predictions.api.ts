import { apiClient } from './client';
import type { Prediction, PredictionExplanation, RiskFactor } from '../types';
import { RiskLevel } from '../types';

function mapAssessmentToPrediction(assessment: any, projectId: string, projectName: string): Prediction {
  const p = assessment.prediction;
  const ra = assessment.risk_assessment;
  const rules = ra?.triggered_rules || [];

  const riskLevelMap: Record<string, RiskLevel> = {
    LOW: RiskLevel.LOW,
    MEDIUM: RiskLevel.MEDIUM,
    HIGH: RiskLevel.HIGH,
    CRITICAL: RiskLevel.CRITICAL,
  };

  const factors: RiskFactor[] = rules.map((r: any, idx: number) => ({
    id: r.rule_id || `factor-${idx}`,
    name: r.title || r.factor || r.rule_id,
    category: r.category || 'Risk Analysis',
    weight: Math.round(r.contribution || 10),
    value: r.contribution || 10,
    impact: 'NEGATIVE',
    description: r.reason || r.description || '',
    contributionScore: r.contribution,
  }));

  return {
    id: p?.id || `pred-${Date.now()}`,
    projectId,
    projectName,
    predictedDelay: Number(p?.predicted_delay_days ?? 0),
    riskLevel: riskLevelMap[ra?.risk_level] || RiskLevel.MEDIUM,
    confidence: p?.confidence === 'HIGH' ? 88 : p?.confidence === 'MEDIUM' ? 72 : 55,
    factors,
    createdAt: assessment.created_at || p?.created_at || new Date().toISOString(),
    modelVersion: p?.model_version || '0.1.0-median_baseline',
    dataOrigin: 'live',
  };
}

export const predictionsApi = {
  getPredictionByProjectId: async (projectId: string): Promise<Prediction | null> => {
    try {
      const projRes: any = await apiClient.get(`/projects/${projectId}`);
      const projectName = projRes?.data?.project?.project_name || 'Project';

      const res: any = await apiClient.get(`/projects/${projectId}/predictions/latest`);
      if (res && res.success && res.data) {
         // Some endpoints return 'prediction', some return the full assessment at data.
         const assessment = res.data.prediction ? res.data : { prediction: res.data };
         return mapAssessmentToPrediction(assessment, projectId, projectName);
      }
    } catch (err) {
      console.error('Backend getPredictionByProjectId failed:', err);
      throw err;
    }
    return null;
  },

  generatePrediction: async (projectId: string): Promise<Prediction | null> => {
    try {
      const projRes: any = await apiClient.get(`/projects/${projectId}`);
      const projectName = projRes?.data?.project?.project_name || 'Project';

      const res: any = await apiClient.post(`/projects/${projectId}/predictions`);
      if (res && res.success && res.data) {
        return mapAssessmentToPrediction(res.data, projectId, projectName);
      }
    } catch (err) {
      console.error('Backend generatePrediction error:', err);
      throw err;
    }
    return null;
  },

  getPredictionExplanation: async (projectId: string, predictionId: string): Promise<PredictionExplanation> => {
    try {
      const res: any = await apiClient.post(`/projects/${projectId}/ai-summary`);
      if (res && res.success && res.data?.summary) {
        return {
          predictionId,
          summary: res.data.summary,
          topFactors: [], // Will be hydrated by UI
          historicalComparison: 'Analyzed against regional infrastructure baseline.',
          recommendations: [], // Replaced by real recommendations endpoint usually
        };
      }
    } catch (err) {
      console.error('AI Summary failed:', err);
    }

    // Fallback explanation if OpenAI is not configured or throws an error
    return {
        predictionId,
        summary: 'AI analysis indicates potential delays due to a combination of acquisition factors.',
        topFactors: [],
        historicalComparison: 'Typical for similar projects.',
        recommendations: ['Monitor closely.'],
      };
  },

  getPredictionHistory: async (projectId: string): Promise<Prediction[]> => {
    try {
      const res: any = await apiClient.get(`/projects/${projectId}/predictions`);
      if (res && res.success && Array.isArray(res.data?.predictions)) {
        const projRes: any = await apiClient.get(`/projects/${projectId}`);
        const projectName = projRes?.data?.project?.project_name || 'Project';

        return res.data.predictions.map((p: any) => ({
          id: p.id,
          projectId,
          projectName: projectName,
          predictedDelay: Number(p.predicted_delay_days ?? 0),
          riskLevel: (p.risk_level as RiskLevel) || RiskLevel.MEDIUM,
          factors: [],
          createdAt: p.created_at,
          modelVersion: p.model_version || '0.1.0',
          dataOrigin: 'live',
        }));
      }
    } catch (err) {
      console.error('Backend getPredictionHistory failed:', err);
      throw err;
    }
    return [];
  },
};
