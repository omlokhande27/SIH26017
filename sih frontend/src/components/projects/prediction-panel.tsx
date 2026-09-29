import { useNavigate } from 'react-router';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import type { Project } from '@/types';
import { RiskLevel } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RiskBadge } from '@/components/ui/risk-badge';
import { StatTile } from './stat-tile';
import { formatShortDate } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface PredictionPanelProps {
  project: Project;
}

export function PredictionPanel({ project }: PredictionPanelProps) {
  const navigate = useNavigate();
  const history = project.predictionHistory ?? [];
  const latest = history[0];

  const delayColor =
    (project.predictedDelay ?? 0) >= 150 ? 'text-[var(--color-risk-critical)]' :
    (project.predictedDelay ?? 0) >= 75 ? 'text-[var(--color-risk-medium)]' : 'text-[var(--color-risk-low)]';

  const isHighRisk = project.riskLevel === RiskLevel.HIGH || project.riskLevel === RiskLevel.CRITICAL;

  return (
    <div className="space-y-6">
      <Card className={cn('overflow-hidden', isHighRisk && 'bg-gradient-to-br from-[var(--color-brand-secondary)] to-[var(--color-brand-primary)] border-transparent')}>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80">
              <Sparkles className="h-4 w-4" />
              Latest AI Prediction
            </p>
            <p className={cn('mt-3 text-4xl font-bold tracking-tight', isHighRisk ? 'text-white' : 'text-gray-900')}>
              {project.predictedDelay !== null ? `${project.predictedDelay} days` : 'N/A'}
            </p>
            <p className={cn('mt-1 text-sm', isHighRisk ? 'text-white/80' : 'text-gray-500')}>
              expected delay, as of {latest ? formatShortDate(latest.date) : 'latest run'}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <RiskBadge risk={project.riskLevel} />
            {latest?.modelVersion && (
              <span className={cn('text-xs font-medium', isHighRisk ? 'text-white/70' : 'text-gray-400')}>
                Model {latest.modelVersion}
              </span>
            )}
            <Button
              variant={isHighRisk ? 'secondary' : 'primary'}
              onClick={() => navigate(`/prediction/${project.id}`)}
            >
              Why this prediction?
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Predicted Delay" value={<span className={delayColor}>{project.predictedDelay ?? 0} days</span>} />
        <StatTile label="Risk Level" value={<RiskBadge risk={project.riskLevel} />} />
        <StatTile label="Last Predicted" value={formatShortDate(project.lastPredictionDate ?? project.updatedAt)} />
        <StatTile label="Model Version" value={latest?.modelVersion ?? '—'} />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Prediction History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No prediction history available.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((entry, idx) => {
                const older = history[idx + 1];
                const trend = older
                  ? entry.predictedDelay === older.predictedDelay ? 'flat'
                    : entry.predictedDelay > older.predictedDelay ? 'up' : 'down'
                  : null;

                return (
                  <div key={entry.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3">
                      {trend === 'up' && <ArrowUpRight className="h-4 w-4 text-[var(--color-risk-high)]" />}
                      {trend === 'down' && <ArrowDownRight className="h-4 w-4 text-[var(--color-risk-low)]" />}
                      {trend === 'flat' && <Minus className="h-4 w-4 text-gray-400" />}
                      {trend === null && <div className="h-4 w-4" />}
                      <span className="text-sm font-medium text-gray-900">{formatShortDate(entry.date)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-gray-900">{entry.predictedDelay} days</span>
                      <RiskBadge risk={entry.riskLevel} className="w-28 justify-center" />
                      <span className="hidden w-10 text-right text-xs font-medium text-gray-400 sm:block">
                        {entry.modelVersion}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}