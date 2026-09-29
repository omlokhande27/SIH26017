import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Brain, ChevronDown, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DataOrigin } from '@/types';
import { cn } from '@/lib/utils';

export interface InsightFactor {
  name: string;
  share: number;
  trend: 'up' | 'down' | 'flat';
}

function TrendIcon({ trend }: { trend: InsightFactor['trend'] }) {
  if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-risk-high" />;
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-risk-low" />;
  return <Minus className="h-3.5 w-3.5 text-gray-400" />;
}

interface AiInsightPanelProps {
  insight?: { summary: string; factors: InsightFactor[] };
  dataOrigin?: DataOrigin;
}

export function AiInsightPanel({ insight, dataOrigin = 'demo' }: AiInsightPanelProps) {
  const navigate = useNavigate();
  const [showFactors, setShowFactors] = useState(false);

  return (
    <Card className="relative h-full overflow-hidden border-brand-accent/25 bg-gradient-to-br from-brand-subtle/70 via-white to-white">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-accent/30 bg-brand-accent/10">
            <Brain className="h-5 w-5 text-brand-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">AI Insight</h3>
            <p className="text-[11px] font-medium uppercase tracking-wider text-brand-accent/70">
              {dataOrigin === 'demo' ? 'Demo model output · not live ML' : 'Model output · current run'}
            </p>
          </div>
        </div>

        {insight && <p className="mt-5 text-sm leading-relaxed text-gray-800">{insight.summary}</p>}

        {showFactors && insight && (
          <div className="mt-5 space-y-3 rounded-lg border border-brand-accent/15 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Leading contributors to predicted delay
            </p>
            {insight.factors.map((factor) => (
              <div key={factor.name} className="flex items-center gap-3">
                <span className="w-40 truncate text-xs font-medium text-gray-700">{factor.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-brand-accent"
                    style={{ width: `${factor.share}%` }}
                  />
                </div>
                <span className="w-9 text-right text-xs font-semibold text-gray-900 tabular-nums">
                  {factor.share}%
                </span>
                <TrendIcon trend={factor.trend} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowFactors((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-accent/40 px-3.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-subtle"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showFactors && 'rotate-180')} />
            Explore Risk Factors
          </button>
          <button
            type="button"
            onClick={() => navigate('/prediction')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-secondary"
          >
            Run Analysis
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}