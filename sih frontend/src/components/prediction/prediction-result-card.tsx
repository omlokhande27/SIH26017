import { useNavigate } from 'react-router';
import { ArrowRight, ListChecks, Sparkles } from 'lucide-react';
import type { Prediction } from '@/types';
import { RiskLevel } from '@/types';
import { RiskBadge } from '@/components/ui/risk-badge';
import { Button } from '@/components/ui/button';
import { summarizeDelay } from '@/utils/prediction-helpers';
import { formatDateTime } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface PredictionResultCardProps {
  prediction: Prediction;
}

const delayColorByRisk: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'text-[var(--color-risk-low)]',
  [RiskLevel.MEDIUM]: 'text-[var(--color-risk-medium)]',
  [RiskLevel.HIGH]: 'text-[var(--color-risk-high)]',
  [RiskLevel.CRITICAL]: 'text-[var(--color-risk-critical)]',
};

export function PredictionResultCard({ prediction }: PredictionResultCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-sm',
        prediction.riskLevel === RiskLevel.CRITICAL || prediction.riskLevel === RiskLevel.HIGH
          ? 'border-[var(--color-risk-high)]/25'
          : 'border-gray-200'
      )}
    >
      <div
        className={cn(
          'h-1.5 w-full',
          prediction.riskLevel === RiskLevel.CRITICAL
            ? 'bg-[var(--color-risk-critical)]'
            : prediction.riskLevel === RiskLevel.HIGH
              ? 'bg-[var(--color-risk-high)]'
              : prediction.riskLevel === RiskLevel.MEDIUM
                ? 'bg-[var(--color-risk-medium)]'
                : 'bg-[var(--color-risk-low)]'
        )}
      />

      <div className="flex flex-col items-center px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Predicted Delay</p>

        <div className="mt-4 flex items-baseline gap-3">
          <span
            className={cn(
              'text-7xl font-bold leading-none tracking-tight tabular-nums',
              delayColorByRisk[prediction.riskLevel]
            )}
          >
            {prediction.predictedDelay}
          </span>
          <span className="text-lg font-semibold uppercase tracking-wider text-gray-500">Days</span>
        </div>

        <p className="mt-2 text-sm text-gray-400">est. {summarizeDelay(prediction.predictedDelay)} beyond baseline schedule</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <RiskBadge risk={prediction.riskLevel} />
          {prediction.confidence !== undefined && prediction.confidence !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
              <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
              Confidence {prediction.confidence}%
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2.5 text-xs text-gray-400">
          <span className="font-medium text-gray-500">Model {prediction.modelVersion}</span>
          <span className="h-1 w-1 rounded-full bg-gray-300" />
          <span>Prediction generated: {formatDateTime(prediction.createdAt)}</span>
        </div>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => navigate(`/prediction/${prediction.projectId}`)}>
            Why this prediction?
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate('/recommendations')}>
            <ListChecks className="mr-2 h-4 w-4" />
            View Recommendations
          </Button>
        </div>
      </div>
    </div>
  );
}