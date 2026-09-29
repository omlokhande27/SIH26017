import { useEffect, useState } from 'react';
import { BrainCircuit, Check } from 'lucide-react';
import { ANALYSIS_STAGES, ANALYSIS_DURATION_MS } from './analysis-progress.constants';
import { cn } from '@/lib/utils';

const STAGE_TICK_MS = ANALYSIS_DURATION_MS / ANALYSIS_STAGES.length;

interface AnalysisProgressProps {
  projectName: string;
}

function StageIcon({ state }: { state: 'done' | 'running' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-[var(--color-brand-accent)]/25" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-brand-accent)]" />
      </span>
    );
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />;
}

export function AnalysisProgress({ projectName }: AnalysisProgressProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i < ANALYSIS_STAGES.length - 1 ? i + 1 : i)),
      STAGE_TICK_MS
    );
    return () => clearInterval(timer);
  }, []);

  const progress = ((index + 1) / ANALYSIS_STAGES.length) * 100;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-brand-accent/20 bg-white shadow-sm">
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full rounded-r-full bg-[var(--color-brand-accent)] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-accent/30 bg-brand-accent/10">
            <BrainCircuit className="h-5 w-5 animate-pulse text-brand-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold uppercase tracking-wide text-gray-900">Analyzing Project</h3>
            <p className="text-xs text-gray-500">Running analysis for {projectName}</p>
          </div>
        </div>

        <ul className="mt-6 space-y-4">
          {ANALYSIS_STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-3">
              <StageIcon state={i < index ? 'done' : i === index ? 'running' : 'pending'} />
              <span
                className={cn(
                  'text-sm transition-colors',
                  i < index
                    ? 'font-medium text-gray-900'
                    : i === index
                      ? 'font-semibold text-brand-primary'
                      : 'text-gray-400'
                )}
              >
                {stage}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}