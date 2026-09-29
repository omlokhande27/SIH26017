import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  Brain,
  Database,
  Eye,
  Plus,
  Radar,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { IntelligenceMetricCard } from '@/components/dashboard/IntelligenceMetricCard';
import { TopAtRiskProjects } from '@/components/dashboard/TopAtRiskProjects';
import { RecentAlerts } from '@/components/dashboard/RecentAlerts';
import { DelayReasonDonut } from '@/components/dashboard/DelayReasonDonut';
import { StateDelayRanking } from '@/components/dashboard/StateDelayRanking';
import { RiskDonut } from '@/components/dashboard/RiskDonut';
import { DelayTrendChart } from '@/components/dashboard/DelayTrendChart';
import { AiInsightPanel } from '@/components/dashboard/AiInsightPanel';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { IndiaDelayMap } from '@/components/risk/india-delay-map';
import { fetchExecutiveData } from '@/api/executive.api';
import type { RiskBucket, QuickActionDef, Notification } from '@/types';

const quickActionDefs: QuickActionDef[] = [
  { label: 'Add Project', description: 'Register a new project', path: '/projects/new', icon: Plus },
  { label: 'Edit Projects', description: 'Update project portal records', path: '/projects', icon: Pencil },
  { label: 'Run Prediction', description: 'Run AI delay analysis', path: '/prediction', icon: Brain },
  { label: 'View High Risk', description: 'Filter risk monitor', path: '/risk-monitor?level=HIGH', icon: ShieldAlert },
  { label: 'Generate Report', description: 'Create a statutory report', path: '/reports', icon: FileText },
];

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function DashboardSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <Skeleton className="mb-2 h-4 w-48" />
        <Skeleton className="mb-3 h-8 w-96 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-[var(--radius-lg)] border border-gray-200 bg-white p-5 shadow-sm">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="mb-3 h-8 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-[380px] rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 shadow-sm">
          <Skeleton className="mb-6 h-5 w-36" />
          <div className="mx-auto h-48 w-48 rounded-full bg-gray-100" />
        </div>
        <div className="h-[380px] rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 shadow-sm">
          <Skeleton className="mb-6 h-5 w-44" />
          <Skeleton className="mb-3 h-4 w-full" />
          <Skeleton className="mb-3 h-4 w-5/6" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    </div>
  );
}

function WorkflowSection({ step, title, description, action }: { step: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-accent">{step}</p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canManage, isOfficer } = useAuth();
  const accessNotice = (location.state as { accessNotice?: string } | null)?.accessNotice;
  const visibleAccessNotice = accessNotice?.toLowerCase().includes('viewer mode is active') ? undefined : accessNotice;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: fetchExecutiveData,
  });

  if (isError) {
    return (
      <div className="animate-fade-in">
        <ErrorState
          title="Could not load the Command Center"
          message="The dashboard data source is unavailable. Please try again in a moment."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Land Acquisition Delay Intelligence</h1>
        <p className="mb-6 text-gray-500">Loading your early-warning command center…</p>
        <DashboardSkeleton />
      </div>
    );
  }

  const total = data.riskDistribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const openRiskLevel = (bucket: RiskBucket) => {
    navigate(bucket.key === 'HIGH' ? '/risk-monitor' : `/risk-monitor?level=${bucket.key}`);
  };
  const handleViewCase = (id: string) => navigate(`/projects/${id}`);
  const handleViewState = (state: string) => {
    navigate(`/risk-monitor?state=${encodeURIComponent(state)}`);
  };
  const alerts: Notification[] = []; // No backend notification endpoint yet

  return (
    <div className="animate-fade-in space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-navy/20 bg-brand-navy p-6 text-white shadow-[0_20px_45px_-28px_rgba(15,36,64,0.75)] sm:p-8">
        <div className="dashboard-grid-overlay pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-accent/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200">
                {canManage ? <ShieldCheck className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {canManage ? 'Officer command workspace' : 'Viewer workspace'}
              </span>
            </div>
            <p className="mt-5 text-sm font-medium text-sky-200">
              {greetingFor(new Date().getHours())}, {user?.name?.split(' ')[0] || data.narrative.greetingName}.
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">Land Acquisition Delay Intelligence</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75 sm:text-base">{data.narrative.headerDescription}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isOfficer && canManage ? (
              <>
                <Button onClick={() => navigate('/projects/new')} className="border-white/0 bg-white text-brand-navy shadow-lg hover:bg-blue-50">
                  <Plus className="mr-2 h-4 w-4" /> Add Project
                </Button>
                <Button variant="outline" onClick={() => navigate('/prediction')} className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15">
                  <Brain className="mr-2 h-4 w-4" /> Run AI Analysis
                </Button>
              </>
            ) : canManage ? (
              <>
                <Button onClick={() => navigate('/projects')} className="border-white/0 bg-white text-brand-navy shadow-lg hover:bg-blue-50">
                  Update Project Progress <ArrowRight className="mr-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => navigate('/prediction')} className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15">
                  <Brain className="mr-2 h-4 w-4" /> Run AI Analysis
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => navigate('/projects')} className="border-white/0 bg-white text-brand-navy shadow-lg hover:bg-blue-50">
                  Explore Projects <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => navigate('/risk-map')} className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15">
                  <Radar className="mr-2 h-4 w-4" /> Open Risk Map
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="relative z-10 mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
          <div className="flex items-center gap-2.5 text-xs text-white/65"><span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,0.12)]" /> Portfolio monitoring active</div>
          <div className="flex items-center gap-2.5 text-xs text-white/65"><Database className="h-3.5 w-3.5 text-sky-200" /> {isOfficer && canManage ? 'Full portfolio management' : canManage ? 'Project progress updates only' : 'Read-only data access'}</div>
          <div className="flex items-center gap-2.5 text-xs text-white/65"><Activity className="h-3.5 w-3.5 text-sky-200" /> {data.intelligence.modelStatus}</div>
        </div>
      </section>

      {visibleAccessNotice && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{visibleAccessNotice}</p>
        </div>
      )}

      <section aria-labelledby="intelligence-metrics-heading">
        <WorkflowSection
          step="01 · Portfolio signal"
          title="Land Acquisition Delay Intelligence"
          description="Start with the four measures that tell an officer where attention is required."
        />
        <div id="intelligence-metrics-heading" className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.intelligence.metrics.map((metric) => (
            <IntelligenceMetricCard key={metric.id} metric={metric} onOpen={(path) => navigate(path)} />
          ))}
        </div>
      </section>

      {/* Top at-risk cases and recent alerts, side by side. */}
      <section aria-labelledby="triage-heading" className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <div id="triage-heading" className="sr-only">Triage and alerts</div>
        <TopAtRiskProjects
          projects={data.highRiskProjects}
          onViewAll={() => navigate('/risk-monitor')}
          onSelect={handleViewCase}
        />
        <RecentAlerts
          notifications={alerts}
          onViewAll={() => navigate('/risk-monitor')}
          onSelect={(projectId) => navigate(projectId ? `/projects/${projectId}` : '/risk-monitor')}
        />
      </section>

      {/* Risk overview, as before. */}
      <section aria-labelledby="risk-overview-heading">
        <WorkflowSection
          step="02 · Severity"
          title="Risk Overview"
          description="Understand the distribution of predicted acquisition risk before opening individual cases."
        />
        <Card className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 id="risk-overview-heading" className="text-base font-bold text-gray-900">Risk distribution</h2>
              <p className="mt-1 text-xs text-gray-500">Click a risk level to open the filtered monitor.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-gray-400">{total} cases</span>
          </div>
          <CardContent className="p-5">
            <RiskDonut buckets={data.riskDistribution} totalProjects={total} onSelect={openRiskLevel} />
          </CardContent>
        </Card>
      </section>

      {/* Delay trend and delay reasons, side by side as graphs. */}
      <section aria-labelledby="cause-heading">
        <WorkflowSection
          step="03 · Cause"
          title="Why projects are slipping"
          description="Trend the portfolio average and break the recorded reasons apart side by side."
        />
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          <Card className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
              <Radar className="h-4 w-4 shrink-0 text-brand-accent" />
              <div className="min-w-0">
                <h2 id="cause-heading" className="truncate text-base font-semibold text-gray-900">Predicted delay trend</h2>
                <p className="truncate text-xs text-gray-500">Average predicted delay across the portfolio</p>
              </div>
            </div>
            <CardContent className="flex-1 p-5"><DelayTrendChart /></CardContent>
          </Card>

          <Card className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">Delay reasons</h2>
                <p className="truncate text-xs text-gray-500">Projects affected by each open issue category</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-400">{total} projects</span>
            </div>
            <CardContent className="flex-1 p-5">
              <DelayReasonDonut slices={data.delayReasons} totals={data.delayReasonTotals} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Map and state list, matched to the same height. */}
      <section className="space-y-4 border-t border-gray-200 pt-6" aria-labelledby="footprint-heading">
        <WorkflowSection
          step="04 · Where"
          title="State-level delay footprint"
          description="States shaded by average predicted delay, ranked worst first so effort goes where it matters."
        />
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="flex h-[620px] flex-col overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 id="footprint-heading" className="truncate text-base font-semibold text-gray-900">Delayed cases by region</h2>
                <p className="truncate text-xs text-gray-500">Darker shading means a longer average predicted delay.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/risk-map')} className="shrink-0">
                Open full map <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <IndiaDelayMap
                rows={data.stateDelayRanking}
                onStateSelect={handleViewState}
                className="h-full"
              />
            </div>
          </Card>

          <StateDelayRanking
            rows={data.stateDelayRanking}
            onSelectState={handleViewState}
            className="h-[620px]"
          />
        </div>

        {canManage && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <AiInsightPanel insight={data.aiInsight} dataOrigin={data.dataOrigin} />
            <QuickActions visibleActions={quickActionDefs} />
          </div>
        )}
      </section>
    </div>
  );
}
