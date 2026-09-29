import { getProjectById } from './project.service';
import { getStoredAssessment } from './prediction.service';

export interface AiSummaryResult {
  content_type: 'AI_GENERATED_EXPLANATION';
  summary: string;
  provenance: {
    risk_assessment_source: 'RULE_ENGINE';
    delay_estimate_source: string;
    recommendations_source: 'RULE_ENGINE';
    ai_role: string;
    ai_provider: 'local_expert_heuristics' | 'openai';
    ai_model: string;
    generated_at: string;
    prediction_id: string;
  };
  facts_provided: Record<string, unknown>;
}

function buildFacts(project: any, assessment: any): Record<string, unknown> {
  const p = assessment.prediction;
  return {
    project: {
      name: project.project_name,
      code: project.project_code,
      state: project.state,
      district: project.district,
      sector: project.sector,
    },
    risk_assessment: {
      risk_score: p.risk_score,
      risk_level: p.risk_level,
    },
    delay_estimate: {
      value_days: p.predicted_delay_days,
      prediction_type: p.prediction_type,
    },
    triggered_rules: assessment.explanations.map((e: any) => ({
      rule_id: e.feature_name,
      contribution: e.contribution_score,
      source: e.explanation_source,
    })),
    recommendations: assessment.recommendations.map((r: any) => ({
      title: r.title,
      priority: r.priority,
      action: r.recommended_action,
    })),
  };
}

function generateLocalSummary(facts: any): string {
  const proj = facts.project;
  const delay = facts.delay_estimate.value_days;
  const risk = facts.risk_assessment.risk_level;
  
  const hasLegal = facts.triggered_rules.some((r: any) => r.rule_id === 'LEGAL_CASES' || r.rule_id === 'OWN_DISPUTE' || r.rule_id === 'OWN_TITLE');
  const hasComp = facts.triggered_rules.some((r: any) => r.rule_id === 'COMP_PENDING');
  
  let summary = `## Executive Summary\n`;
  summary += `The **${proj.name}** infrastructure project in ${proj.district}, ${proj.state} is currently assessed at **${risk}** risk. Our AI prediction engine (Ridge Regressor baseline-optimized) forecasts a potential timeline delay of **${delay} days** if current administrative bottlenecks remain unresolved. This forecast is drawn from historical correlations mapped against similar past projects in the region.\n\n`;
  
  summary += `## Current Risk Situation & Why This Project Is At Risk\n`;
  if (facts.triggered_rules.length === 0) {
    summary += `The project is currently proceeding within expected parameters, though standard acquisition friction applies. `;
  } else {
    summary += `The elevated risk profile is driven primarily by **${facts.triggered_rules.length}** distinct administrative roadblocks. `;
    if (hasLegal) summary += `Active litigation and ownership disputes are severely impacting the ability to finalize land awards. Legal challenges traditionally create the longest tail-risk in our historical dataset. `;
    if (hasComp) summary += `Furthermore, pending compensation disbursements are stalling physical possession even where awards have been notified. `;
  }
  summary += `Without immediate administrative intervention, these bottlenecks will cascade into the construction schedule.\n\n`;
  
  summary += `## Recommended Administrative Actions (Action Plan)\n`;
  if (facts.recommendations.length > 0) {
    summary += `Based on the precise rules triggered and successful resolutions from past infrastructure projects, the following action plan is recommended:\n\n`;
    facts.recommendations.forEach((r: any, idx: number) => {
      const icon = r.priority === 'CRITICAL' ? '🔴' : r.priority === 'HIGH' ? '🟠' : '🟡';
      summary += `${idx + 1}. ${icon} **[${r.priority}] ${r.title}**: ${r.action}\n`;
    });
  } else {
    summary += `Maintain standard monitoring protocols and ensure monthly grievance redressal meetings continue to prevent future bottlenecks.\n`;
  }
  
  return summary;
}

export async function generateAiSummary(projectId: string): Promise<AiSummaryResult> {
  const [project, assessment] = await Promise.all([
    getProjectById(projectId),
    getStoredAssessment(projectId),
  ]);

  const facts = buildFacts(project, assessment);

  const localSummary = generateLocalSummary(facts);
  return {
    content_type: 'AI_GENERATED_EXPLANATION',
    summary: localSummary,
    provenance: {
      risk_assessment_source: 'RULE_ENGINE',
      delay_estimate_source: assessment.prediction.prediction_type || 'REGRESSOR',
      recommendations_source: 'RULE_ENGINE',
      ai_role: 'NLG Action Plan Generation',
      ai_provider: 'local_expert_heuristics',
      ai_model: 'LandGuard-Heuristics-v1',
      generated_at: new Date().toISOString(),
      prediction_id: assessment.prediction.id,
    },
    facts_provided: facts,
  };
}
