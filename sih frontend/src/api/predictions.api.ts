import { apiClient, delay } from './client';
import { mockProjects } from '../mock/projects';
import {
  mockPredictions,
  findPrediction,
  getPredictionForProject,
  runAnalysis,
  generatePredictionHistory,
  buildPredictionExplanation,
} from '../mock/predictions';
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
    name: r.title || r.rule_id,
    category: r.category || 'Risk Analysis',
    weight: Math.round(r.contribution || 10),
    value: r.contribution || 10,
    impact: 'NEGATIVE',
    description: r.description || '',
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
    createdAt: assessment.created_at || new Date().toISOString(),
    modelVersion: p?.model_version || '0.1.0-median_baseline',
    dataOrigin: 'live',
  };
}

export const predictionsApi = {
  getPredictions: async (): Promise<Prediction[]> => {
    return mockPredictions;
  },

  getPredictionByProjectId: async (projectId: string): Promise<Prediction | null> => {
    try {
      const res: any = await apiClient.get(`/projects/${projectId}/predictions/latest`);
      if (res && res.success && res.data?.prediction) {
        const p = res.data.prediction;
        const project = mockProjects.find((m) => m.id === projectId);
        return {
          id: p.id,
          projectId,
          projectName: project?.name || 'Project',
          predictedDelay: Number(p.predicted_delay_days ?? 0),
          riskLevel: (p.risk_level as RiskLevel) || RiskLevel.MEDIUM,
          factors: [],
          createdAt: p.created_at,
          modelVersion: p.model_version || '0.1.0',
          dataOrigin: 'live',
        };
      }
    } catch {
      // fallback
    }
    const project = mockProjects.find((p) => p.id === projectId);
    if (!project) return null;
    return getPredictionForProject(project);
  },

  generatePrediction: async (projectId: string): Promise<Prediction | null> => {
    const project = mockProjects.find((p) => p.id === projectId);
    try {
      const res: any = await apiClient.post(`/projects/${projectId}/predictions`);
      if (res && res.success && res.data) {
        return mapAssessmentToPrediction(res.data, projectId, project?.name || 'Project');
      }
    } catch (err) {
      console.warn('Backend prediction error, running local rule engine:', err);
    }

    await delay(1200);
    if (!project) return null;
    return runAnalysis(project);
  },

  getPredictionExplanation: async (predictionId: string): Promise<PredictionExplanation> => {
    const prediction = findPrediction(predictionId);
    if (prediction?.projectId) {
      try {
        const res: any = await apiClient.post(`/projects/${prediction.projectId}/ai-summary`);
        if (res && res.success && res.data?.summary) {
          return {
            predictionId,
            summary: res.data.summary,
            topFactors: prediction.factors.slice(0, 3),
            historicalComparison: 'Analyzed against regional infrastructure baseline.',
            recommendations: prediction.factors.map((f) => `Mitigate ${f.name}`),
          };
        }
      } catch {
        // fallback to built-in explanation
      }
    }

    await delay(300);
    return prediction
      ? buildPredictionExplanation(prediction)
      : {
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
      if (res && res.success && Array.isArray(res.data?.predictions) && res.data.predictions.length > 0) {
        const project = mockProjects.find((p) => p.id === projectId);
        return res.data.predictions.map((p: any) => ({
          id: p.id,
          projectId,
          projectName: project?.name || 'Project',
          predictedDelay: Number(p.predicted_delay_days ?? 0),
          riskLevel: (p.risk_level as RiskLevel) || RiskLevel.MEDIUM,
          factors: [],
          createdAt: p.created_at,
          modelVersion: p.model_version || '0.1.0',
          dataOrigin: 'live',
        }));
      }
    } catch {
      // fallback
    }
    const project = mockProjects.find((p) => p.id === projectId);
    if (!project) return [];
    return generatePredictionHistory(project);
  },
};