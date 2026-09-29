import { ArrowRight, Brain, CircleHelp, MapPin, ShieldAlert } from 'lucide-react';
import type { EarlyWarningCase } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatINR, formatPercentage } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface CaseInvestigationPanelProps {
  caseItem: EarlyWarningCase | null;
  onViewCase?: (id: string) => void;
}

function factorBarColor(index: number) {
  if (index === 0) return 'bg-risk-high';
  if (index === 1) return 'bg-risk-medium';
  return 'bg-brand-accent';
}

export function CaseInvestigationPanel({ caseItem, onViewCase }: CaseInvestigationPanelProps) {
  if (!caseItem) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full min-h-[420px] items-center justify-center p-6">
          <EmptyState
            icon={CircleHelp}
            title="Select an early-warning case"
            description="Choose a flagged case to inspect its risk factors, predicted impact, and available system recommendations."
          />
        </CardContent>
      </Card>
    );
  }

  const { project, factors } = caseItem;
  const sortedFactors = factors.slice().sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0));
  const sourceLabel = caseItem.explanationSource === 'model' ? 'Demo model output' : 'Derived from project fields';

  return (
    <Card className="h-full">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Case investigation</p>
            <h2 className="mt-1 text-base font-bold text-gray-900">{project.name}</h2>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" /> {project.district}, {project.state} · {project.code}
            </p>
          </div>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500">{sourceLabel}</span>
        </div>
      </div>

      <CardContent className="max-h-[650px] space-y-5 overflow-y-auto p-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs leading-5 text-blue-800">
          <Brain className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <p>
            <span className="font-semibold">Explanation source:</span> {sourceLabel}. This is not a live ML service output; connect the prediction API before using it for statutory decisions.
          </p>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Why is this case risky?</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Contribution</span>
          </div>
          {sortedFactors.length > 0 ? (
            <div className="space-y-3">
              {sortedFactors.map((factor, index) => {
                const contribution = Math.round((factor.contributionScore ?? 0) * 100);
                return (
                  <div key={factor.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-gray-700" title={factor.name}>{factor.name}</span>
                      <span className="shrink-0 font-bold tabular-nums text-gray-900">{contribution}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className={cn('h-full rounded-full', factorBarColor(index))} style={{ width: `${Math.max(contribution, 2)}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-gray-400">{factor.category}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-500">No risk-factor output is available for this case.</p>
          )}
        </section>

        <section className="border-t border-gray-100 pt-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Predicted impact</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ImpactTile label="Current delay" value={caseItem.currentDelay === null ? 'Not available' : `${caseItem.currentDelay} days`} />
            <ImpactTile label="Predicted delay" value={caseItem.predictedDelay === null ? 'Not available' : `${caseItem.predictedDelay} days`} />
            <ImpactTile label="Additional delay" value={caseItem.additionalDelay === null ? 'Not available' : `${caseItem.additionalDelay} days`} />
            <ImpactTile label="Acquisition progress" value={formatPercentage(project.acquisitionPercentage)} />
            <ImpactTile label="Risk probability" value={caseItem.riskProbability === null ? 'Not provided' : `${caseItem.riskProbability}%`} />
            <ImpactTile label="Pending compensation" value={caseItem.financialExposure === null ? 'Not available' : formatINR(caseItem.financialExposure)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-gray-400">Fields marked “Not available” are not present in the current project data model.</p>
        </section>

        <section className="border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Recommended action</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">System-generated · demo</span>
          </div>
          {caseItem.recommendations.length > 0 ? (
            <ul className="space-y-2">
              {caseItem.recommendations.map((recommendation) => (
                <li key={recommendation} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-700">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-accent" />
                  {recommendation}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-xs leading-5 text-gray-500">No backend recommendation is available for this case yet.</p>
          )}
        </section>

        {onViewCase && (
          <Button className="w-full" onClick={() => onViewCase(project.id)}>
            View Full Case <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xs font-bold text-gray-800">{value}</p>
    </div>
  );
}
