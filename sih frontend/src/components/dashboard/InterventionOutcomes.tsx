import { ArrowRight, CheckCircle2, Clock3, LineChart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { InterventionOutcome } from '@/mock/executive';
import { formatDate } from '@/utils/formatting';

interface InterventionOutcomesProps {
  outcomes: InterventionOutcome[];
}

export function InterventionOutcomes({ outcomes }: InterventionOutcomesProps) {
  if (outcomes.length === 0) return null;

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-subtle text-brand-primary">
            <LineChart className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Recent intervention outcomes</h3>
            <p className="mt-0.5 text-xs text-gray-500">Predicted delay before and after recorded interventions</p>
          </div>
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500">
          {outcomes.length} recorded
        </span>
      </div>

      <CardContent className="p-0">
        <ul className="divide-y divide-gray-100" aria-label="Recent intervention outcomes">
          {outcomes.map((outcome) => {
            const hasUpdatedValue = outcome.after !== null;
            return (
              <li key={outcome.id} className="px-5 py-4 transition-colors hover:bg-gray-50/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{outcome.project}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{outcome.intervention}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {hasUpdatedValue ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {outcome.improvement} days reduced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                        <Clock3 className="h-3.5 w-3.5" />
                        Awaiting next run
                      </span>
                    )}
                    <p className="mt-1.5 text-[10px] text-gray-400">{formatDate(outcome.date)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                  <div className="min-w-[112px]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Before intervention</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800">{outcome.before} days</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" />
                  <div className="min-w-[112px]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">After intervention</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800">
                      {hasUpdatedValue ? `${outcome.after} days` : 'Not available'}
                    </p>
                  </div>
                  <p className="ml-auto hidden text-[11px] text-gray-400 sm:block">Model comparison</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
