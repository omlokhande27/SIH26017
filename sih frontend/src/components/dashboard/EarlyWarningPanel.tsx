import { AlertTriangle, ArrowRight, MapPin, ShieldAlert } from 'lucide-react';
import type { EarlyWarningCase } from '@/types';
import { RiskBadge } from '@/components/ui/risk-badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatINR } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface EarlyWarningPanelProps {
  cases: EarlyWarningCase[];
  selectedId?: string | null;
  onSelect?: (caseItem: EarlyWarningCase) => void;
  onViewCase: (id: string) => void;
  onViewAll: () => void;
}

export function EarlyWarningPanel({ cases, selectedId, onSelect, onViewCase, onViewAll }: EarlyWarningPanelProps) {
  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Early Warning System</h2>
            <p className="mt-0.5 text-xs text-gray-500">Cases with elevated predicted delay or critical risk.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">{cases.length} flagged</span>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500">Demo data</span>
        </div>
      </div>

      {cases.length === 0 ? (
        <CardContent className="p-5">
          <EmptyState
            icon={ShieldAlert}
            title="No early warnings"
            description="No projects currently meet the elevated-risk criteria."
          />
        </CardContent>
      ) : (
        <>
          <CardContent className="max-h-[560px] space-y-2 overflow-y-auto p-3">
            {cases.map((caseItem) => {
              const selected = selectedId === caseItem.project.id;
              return (
                <div
                  key={caseItem.project.id}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    selected ? 'border-brand-accent bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect ? onSelect(caseItem) : onViewCase(caseItem.project.id)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">{caseItem.project.name}</p>
                          <RiskBadge risk={caseItem.project.riskLevel} />
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3" /> {caseItem.project.district}, {caseItem.project.state}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Predicted delay</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                          {caseItem.predictedDelay === null ? 'Not available' : `${caseItem.predictedDelay} days`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Risk probability</p>
                        <p className="mt-0.5 font-semibold text-gray-800">
                          {caseItem.riskProbability === null ? 'Not provided' : `${caseItem.riskProbability}%`}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Financial exposure</p>
                        <p className="mt-0.5 font-semibold text-gray-800">
                          {caseItem.financialExposure === null ? 'Not available' : formatINR(caseItem.financialExposure)}
                        </p>
                      </div>
                      <div className="col-span-2 rounded-lg bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Main issue</p>
                        <p className="mt-0.5 truncate font-semibold text-gray-800" title={caseItem.mainIssue}>{caseItem.mainIssue}</p>
                      </div>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200/70 pt-3">
                    <span className="text-[10px] text-gray-400">Case ID: {caseItem.project.code}</span>
                    <button
                      type="button"
                      onClick={() => onViewCase(caseItem.project.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-secondary"
                    >
                      View Case <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
          <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 text-right">
            <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-secondary">
              Open full Risk Monitor <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
