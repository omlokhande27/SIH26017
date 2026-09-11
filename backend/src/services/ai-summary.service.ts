import { env, features } from '../config/env';
import { DependencyUnavailableError } from '../utils/errors';
import { AppError } from '../middleware/error.middleware';
import { getProjectById, type ProjectRow } from './project.service';
import { getStoredAssessment } from './prediction.service';

/**
 * Optional AI explanation layer.
 *
 * ###########################################################################
 * # WHAT THE LLM IS AND IS NOT ALLOWED TO DO                                #
 * #                                                                        #
 * # IS:   turn an already-computed assessment into readable prose.         #
 * #                                                                        #
 * # IS NOT: compute a risk score, estimate a delay, decide a database      #
 * #         value, rank a recommendation, or supply any project fact.      #
 * #                                                                        #
 * # Every number in the output was produced by the deterministic rule      #
 * # engine or read from the database BEFORE the model was called. The      #
 * # model receives that verified structure and nothing else — it cannot    #
 * # query anything, and it is never given credentials, tokens, or raw      #
 * # table access.                                                          #
 * ###########################################################################
 *
 * The whole layer is optional. Without `OPENAI_API_KEY` the backend starts
 * normally, every dashboard and analytics endpoint works, and only this one
 * endpoint returns 503 — because a system whose core function depends on a
 * third-party LLM being reachable is a system that stops working when it is not.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The instruction the model is held to.
 *
 * The negative constraints are the load-bearing part. An LLM handed an
 * assessment will otherwise reach for the register officials expect — "the AI
 * predicts a 596-day delay with high confidence" — and that sentence is false
 * in two ways at once: no model produced the figure, and the confidence is LOW.
 */
const SYSTEM_PROMPT = `You are a decision-support assistant for Indian government infrastructure officials, summarising a land-acquisition risk assessment.

USE ONLY THE PROVIDED FACTS.
- Do not invent project details, numbers, dates, names, or locations.
- Do not add context, history, or comparisons that are not in the input.
- If information is missing, say plainly that it is unavailable. Never fill a gap with a plausible guess.

HOW TO DESCRIBE THE NUMBERS.
- The risk score and risk level come from a DETERMINISTIC RULE ENGINE, not from a machine-learning model. Describe them as rule-based findings.
- The delay figure may be a BASELINE_MEDIAN: the historical median across past projects, carrying no project-specific signal. When prediction_type is BASELINE_MEDIAN you MUST describe it as a historical reference point, not a prediction, and you MUST NOT call it an AI or machine-learning prediction, a forecast, or accurate.
- Never state or imply an accuracy figure, confidence percentage, or probability that is not given to you.
- If assessment_complete is false, say clearly that the assessment is incomplete because required project data is missing, and that a low risk score reflects missing records as much as low risk.

Write for a senior official: plain, specific, no marketing language, no hedging filler. Use exactly these seven sections as markdown headings:

## Executive Summary
## Current Risk Situation
## Main Delay Factors
## Why This Project Is At Risk
## Recommended Administrative Actions
## Priority Actions
## Data Limitations`;

export interface AiSummaryResult {
  content_type: 'AI_GENERATED_EXPLANATION';
  summary: string;
  provenance: {
    risk_assessment_source: 'RULE_ENGINE';
    delay_estimate_source: string;
    recommendations_source: 'RULE_ENGINE';
    ai_role: string;
    ai_provider: 'openai';
    ai_model: string;
    generated_at: string;
    prediction_id: string;
  };
  facts_provided: Record<string, unknown>;
}

/**
 * Assemble exactly the facts the model may see.
 *
 * Built field by field from the stored assessment. Nothing is spread from a
 * database row, so a column added later cannot reach a third party by
 * accident — the same discipline the ML payload builder uses, for the same
 * reason, against a bigger blast radius: this leaves the building.
 */
function buildFacts(
  project: ProjectRow,
  assessment: Awaited<ReturnType<typeof getStoredAssessment>>,
): Record<string, unknown> {
  const p = assessment.prediction;

  return {
    project: {
      name: project.project_name,
      code: project.project_code,
      state: project.state,
      district: project.district,
      sector: project.sector,
      implementing_agency: project.implementing_agency,
      status: project.project_status,
      planned_start_date: project.planned_start_date,
      planned_completion_date: project.planned_completion_date,
    },
    risk_assessment: {
      source: 'DETERMINISTIC_RULE_ENGINE',
      risk_score: p.risk_score,
      risk_level: p.risk_level,
      rule_coverage_pct: p.rule_coverage_pct,
      assessment_complete: p.assessment_complete,
      missing_core_inputs: p.missing_core_inputs,
      assessed_at: p.created_at,
    },
    delay_estimate: {
      value_days: p.predicted_delay_days,
      prediction_type: p.prediction_type,
      confidence: p.confidence,
      // Spelled out for the model rather than left to inference.
      interpretation:
        p.prediction_type === 'BASELINE_MEDIAN'
          ? 'This is the historical median delay across past projects. It is NOT a machine-learning prediction and carries no project-specific signal.'
          : 'Experimental model estimate. Low confidence.',
    },
    triggered_rules: assessment.explanations.map((e) => ({
      rule_id: e.feature_name,
      contribution_to_risk_score: e.contribution_score,
      rank: e.rank,
      source: e.explanation_source,
    })),
    recommendations: assessment.recommendations.map((r) => ({
      title: r.title,
      priority: r.priority,
      rationale: r.description,
      action: r.recommended_action,
      triggered_by_rule: r.source_rule_id,
      status: r.status,
      source: 'DETERMINISTIC_RULE_ENGINE',
    })),
    known_limitations: p.limitations,
  };
}

export async function generateAiSummary(projectId: string): Promise<AiSummaryResult> {
  if (!features.llmExplanations || !env.OPENAI_API_KEY) {
    throw new DependencyUnavailableError(
      'AI summaries are not configured on this deployment. Set OPENAI_API_KEY to enable them. ' +
        'All risk assessment, delay estimation and recommendation endpoints are unaffected.',
    );
  }

  // Gather the verified facts BEFORE calling out. If there is no assessment,
  // this throws 404 and no request is made — there is nothing to summarise,
  // and asking a model to write about an absent assessment is how invented
  // findings get produced.
  const [project, assessment] = await Promise.all([
    getProjectById(projectId),
    getStoredAssessment(projectId),
  ]);

  const facts = buildFacts(project, assessment);

  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        // The key authenticates this backend. It is read from the environment,
        // never logged, and never returned in a response.
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // Low temperature: this is a restatement task, not a creative one.
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Summarise this land-acquisition risk assessment using only these facts:\n\n' +
              JSON.stringify(facts, null, 2),
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[ai] request failed', { detail: (err as Error).message });
    throw new DependencyUnavailableError('The AI summary provider is unavailable.');
  }

  if (!response.ok) {
    // Detail to the log; the caller gets a stable sentence. A provider error
    // body can echo the prompt, which contains project data.
    const detail = await response.text().catch(() => '');
    console.error('[ai] provider returned an error', {
      status: response.status,
      detail: detail.slice(0, 300),
    });

    if (response.status === 401 || response.status === 403) {
      throw new DependencyUnavailableError(
        'The AI provider rejected this backend’s credentials.',
      );
    }
    if (response.status === 429) {
      throw new AppError(429, 'The AI provider is rate limiting requests. Try again shortly.');
    }
    throw new DependencyUnavailableError('The AI summary provider returned an error.');
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const summary = body.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    throw new DependencyUnavailableError('The AI provider returned an empty summary.');
  }

  return {
    // The label is part of the contract, not decoration. A client rendering
    // this must be able to mark it as generated text rather than a finding.
    content_type: 'AI_GENERATED_EXPLANATION',
    summary,
    provenance: {
      risk_assessment_source: 'RULE_ENGINE',
      delay_estimate_source: String(assessment.prediction.prediction_type ?? 'UNKNOWN'),
      recommendations_source: 'RULE_ENGINE',
      ai_role:
        'The AI only rephrased an assessment that was already computed. It produced no number, ' +
        'no risk level and no recommendation.',
      ai_provider: 'openai',
      ai_model: body.model ?? MODEL,
      generated_at: new Date().toISOString(),
      prediction_id: assessment.prediction.id,
    },
    // Returned so a reviewer can check the summary against exactly what the
    // model was given, rather than taking the prose on trust.
    facts_provided: facts,
  };
}

/** Exposed for tests. */
export const __testing = { buildFacts, SYSTEM_PROMPT };
