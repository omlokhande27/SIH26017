import { useParams, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Sparkles, FileText, MapPin, Hash, Tag, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import type { TabItem } from '@/components/ui/tabs';
import { RiskBadge } from '@/components/ui/risk-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatTile } from '@/components/projects/stat-tile';
import { ProjectInfoCard } from '@/components/projects/project-info-card';
import { AcquisitionSummary } from '@/components/projects/acquisition-summary';
import { CompensationSummary } from '@/components/projects/compensation-summary';
import { IssuesPanel } from '@/components/projects/issues-panel';
import { PredictionPanel } from '@/components/projects/prediction-panel';
import { RecommendationPreview } from '@/components/projects/recommendation-preview';
import { CaseInvestigationPanel } from '@/components/dashboard/CaseInvestigationPanel';
import { buildEarlyWarningCase, isElevatedRiskProject } from '@/utils/command-center';
import { useAuth } from '@/context/useAuth';
import { UserRole } from '@/types';
import { formatINR, formatPercentage, formatShortDate, getSectorLabel } from '@/utils/formatting';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { Skeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

const TAB_IDS = ['overview', 'land', 'compensation', 'issues', 'prediction', 'recommendations'];

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, canManage, editScopeFor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') ?? 'overview';
  const defaultTabId = TAB_IDS.includes(requestedTab) ? requestedTab : 'overview';

  const { data: project, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProjectById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader title="Loading Project" description="Please wait..." />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in">
        <ErrorState
          title="Could not load project"
          message="There was an error loading the project details."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const canEditThisProject = editScopeFor(project) !== 'none';
  const isAssignedManager =
    editScopeFor(project) === 'assigned' && currentUser?.role === UserRole.PROJECT_MANAGER;

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
        <p className="text-gray-500 mb-6">The project you are looking for does not exist or you don't have access to it.</p>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
      </div>
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', content: <ProjectInfoCard project={project} /> },
    { id: 'land', label: 'Land Acquisition', content: <AcquisitionSummary project={project} /> },
    { id: 'compensation', label: 'Compensation', content: <CompensationSummary project={project} /> },
    { id: 'issues', label: 'Issues & Risks', content: <IssuesPanel project={project} /> },
    ...(canManage
      ? [{ id: 'prediction', label: 'Prediction History', content: <PredictionPanel project={project} /> }]
      : []),
    { id: 'recommendations', label: 'Recommendations', content: <RecommendationPreview project={project} /> },
  ];

  const delay = project.predictedDelay;
  const delayColor = delay === null ? 'text-gray-400' : delay >= 150 ? 'text-[var(--color-risk-critical)]' : delay >= 75 ? 'text-[var(--color-risk-medium)]' : 'text-[var(--color-risk-low)]';

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{project.code}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.district}, {project.state}</span>
            <span className="inline-flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{getSectorLabel(project.sector)}</span>
          </span>
        }
        breadcrumbs={
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand-primary)] hover:text-[var(--color-brand-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Projects
          </button>
        }
        actions={
          <>
            <StatusBadge status={project.status} />
            <RiskBadge risk={project.riskLevel} />
            {canEditThisProject && (
              <>
                <Button variant="outline" onClick={() => navigate(`/projects/${project.id}/edit`)} className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  {isAssignedManager ? 'Update Progress' : 'Edit Project'}
                </Button>
                <Button onClick={() => navigate(`/prediction/${project.id}`)} className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Run AI Analysis
                </Button>
                <Button variant="outline" onClick={() => navigate('/reports')} className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Generate Report
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Latest Predicted Delay"
          value={<span className={delayColor}>{delay !== null ? `${delay} days` : '—'}</span>}
          sub={project.lastPredictionDate ? `as of ${formatShortDate(project.lastPredictionDate)}` : undefined}
        />
        <StatTile label="Land Acquisition" value={formatPercentage(project.acquisitionPercentage)} sub={`${project.landAcquired.toFixed(1)} / ${project.landRequired.toFixed(1)} Ha`} />
        <StatTile label="Pending Compensation" value={formatINR(project.compensationPending)} sub={`of ${formatINR(project.compensationRequired)}`} />
        <StatTile label="Affected Families" value={String(project.affectedFamilies ?? project.affectedLandowners ?? '—')} sub={`${project.affectedLandowners ?? '—'} landowners`} />
      </div>

      {isElevatedRiskProject(project) && <CaseInvestigationPanel caseItem={buildEarlyWarningCase(project)} />}

      <Tabs
        tabs={tabs}
        defaultTabId={defaultTabId}
        onChange={(tabId) => setSearchParams({ tab: tabId }, { replace: true })}
        className="bg-[var(--color-bg-surface)] rounded-[var(--radius-lg)] border border-gray-200 p-6"
      />
    </div>
  );
}