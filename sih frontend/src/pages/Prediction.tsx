import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Coins, Gauge, Landmark, MapPin, Radar, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ProjectSelect } from '@/components/prediction/project-select';
import { AnalysisProgress } from '@/components/prediction/analysis-progress';
import { ANALYSIS_DURATION_MS } from '@/components/prediction/analysis-progress.constants';
import { PredictionResultCard } from '@/components/prediction/prediction-result-card';
import { projectsApi } from '@/api/projects.api';
import { predictionsApi } from '@/api/predictions.api';
import { formatINR, formatPercentage, getSectorLabel } from '@/utils/formatting';
import type { Project, Prediction } from '@/types';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Phase = 'idle' | 'running' | 'done';

function OverviewRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-50 py-2.5 last:border-0">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </span>
      <span className="text-right text-sm font-medium text-gray-900">{children}</span>
    </div>
  );
}

export default function Prediction() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => projectsApi.getProjects(),
  });

  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const presetRef = useRef<string | null>(searchParams.get('project'));

  const analyze = useCallback(async (target: Project) => {
    setPrediction(null);
    setPhase('running');
    const startedAt = Date.now();
    const result = await predictionsApi.generatePrediction(target.id);
    const elapsed = Date.now() - startedAt;
    if (elapsed < ANALYSIS_DURATION_MS) await sleep(ANALYSIS_DURATION_MS - elapsed);
    setPrediction(result);
    setPhase(result ? 'done' : 'idle');
  }, []);

  useEffect(() => {
    if (!presetRef.current || projects.length === 0) return;
    const id = presetRef.current;
    presetRef.current = null;
    const preset = projects.find((p) => p.id === id);
    if (!preset) return;
    setProject(preset);
    setSearchParams({}, { replace: true });
    void analyze(preset);
  }, [projects, analyze, setSearchParams]);

  const handleChangeProject = (p: Project | null) => {
    setProject(p);
    setPrediction(null);
    setPhase('idle');
  };

  const acqPct = project ? project.acquisitionPercentage ?? 0 : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="AI Delay Prediction"
        description="Analyze current project indicators to estimate potential acquisition-related delay."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Project</p>
                <p className="mt-1 text-sm text-gray-600">Select the project you want the model to analyze.</p>
              </div>
              <ProjectSelect
                projects={projects}
                value={project}
                onChange={handleChangeProject}
                placeholder="Select Project"
              />
              {projectsLoading && <p className="text-xs text-gray-400">Loading projects…</p>}
              <Button
                className="w-full"
                size="lg"
                disabled={!project || phase === 'running'}
                isLoading={phase === 'running'}
                onClick={() => project && void analyze(project)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze Project
              </Button>
            </CardContent>
          </Card>

          {project && phase !== 'running' && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Project Overview</p>
                  <span className="text-[11px] text-gray-400">Current indicators</span>
                </div>

                <OverviewRow icon={<MapPin className="h-3.5 w-3.5" />} label="State">
                  {project.district}, {project.state}
                </OverviewRow>
                <OverviewRow icon={<Landmark className="h-3.5 w-3.5" />} label="Sector">
                  {getSectorLabel(project.sector)}
                </OverviewRow>
                <OverviewRow icon={<Gauge className="h-3.5 w-3.5" />} label="Acquisition">
                  <span>
                    {formatPercentage(acqPct)}{' '}
                    <span className="font-normal text-gray-400">
                      ({project.landAcquired}/{project.landRequired} Ha)
                    </span>
                  </span>
                </OverviewRow>
                <OverviewRow icon={<Coins className="h-3.5 w-3.5" />} label="Compensation">
                  <span>
                    {formatINR(project.compensationPending ?? 0)} pending{' '}
                    <span className="font-normal text-gray-400">of {formatINR(project.compensationRequired)}</span>
                  </span>
                </OverviewRow>
                <OverviewRow icon={<Radar className="h-3.5 w-3.5" />} label="Current Risk">
                  <RiskBadge risk={project.riskLevel} />
                </OverviewRow>

                <div className="mt-4 rounded-lg bg-[var(--color-bg-muted)]/60 px-3 py-2.5 text-[11px] leading-relaxed text-gray-500">
                  The model reviews {project.state} acquisition data, compensation status, legal issues and
                  administrative factors before producing a delay estimate.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-3">
          {phase === 'running' && project && <AnalysisProgress projectName={project.name} />}

          {phase === 'done' && prediction && <PredictionResultCard prediction={prediction} />}

          {phase === 'idle' && !project && (
            <div className="flex h-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-gray-200 bg-white/60 p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-accent/10">
                <Radar className="h-7 w-7 text-brand-accent" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Select a project to begin</h3>
              <p className="mt-1.5 max-w-sm text-sm text-gray-500">
                Choose a project from the list and run the analysis. The model will estimate the acquisition-related
                delay and explain the key contributing factors.
              </p>
            </div>
          )}

          {phase === 'idle' && project && (
            <div className="flex h-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-gray-200 bg-white/60 p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-accent/10">
                <Sparkles className="h-7 w-7 text-brand-accent" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Ready to analyze {project.name}</h3>
              <p className="mt-1.5 max-w-sm text-sm text-gray-500">
                The model will assess land acquisition status, compensation, legal issues and administrative factors,
                then return a predicted delay and risk rating.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}