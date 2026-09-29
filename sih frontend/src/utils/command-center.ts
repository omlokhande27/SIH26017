import { buildFactorsForProject } from './prediction-helpers';
import { RiskLevel } from '@/types';
import type { DataOrigin, EarlyWarningCase, Project } from '@/types';

export function isElevatedRiskProject(project: Project): boolean {
  return project.riskLevel === RiskLevel.HIGH || project.riskLevel === RiskLevel.CRITICAL;
}

function openIssueFor(project: Project, factors: ReturnType<typeof buildFactorsForProject>): string {
  const issue = project.issues?.find((item) => item.status !== 'RESOLVED');
  return issue?.title ?? factors[0]?.name ?? 'No recorded issue';
}

export function buildEarlyWarningCase(project: Project, origin: DataOrigin = 'demo'): EarlyWarningCase {
  const prediction = null;
  const factors = buildFactorsForProject(project);
  const recommendations: string[] = [];

  return {
    project,
    predictionId: null,
    modelVersion: null,
    riskProbability: null,
    factors,
    explanationSource: factors.length > 0 ? 'derived' : 'unavailable',
    mainIssue: openIssueFor(project, factors),
    // These fields are intentionally nullable until the live model supplies them.
    currentDelay: null,
    predictedDelay: project.predictedDelay,
    additionalDelay: null,
    financialExposure: project.compensationPending ?? null,
    recommendations,
    origin,
  };
}
