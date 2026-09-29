import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsApi } from '@/api/projects.api';
import { ManagerProjectUpdate } from '@/components/projects/manager-project-update';
import { describeEditDenial } from '@/utils/permissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/context/useAuth';
import { ProjectSector, ProjectStatus, RiskLevel } from '@/types';
import type { UpdateProjectInput } from '@/types';
import { formatPercentage, getSectorLabel, getStatusLabel } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface EditFormState {
  name: string;
  code: string;
  state: string;
  district: string;
  sector: ProjectSector;
  status: ProjectStatus;
  riskLevel: RiskLevel;
  implementingAgency: string;
  startDate: string;
  expectedEndDate: string;
  landRequired: string;
  landAcquired: string;
  affectedLandowners: string;
  affectedFamilies: string;
  compensationRequired: string;
  compensationPaid: string;
  description: string;
}

const inputClass = 'mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15';
const labelClass = 'text-sm font-semibold text-gray-700';

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : '';
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EditProject() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const { currentUser, editScopeFor } = useAuth();
  
  const { data: project, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProjectById(id!),
    enabled: !!id,
  });
  
  const scope = editScopeFor(project);
  const isManagerScope = scope === 'assigned';

  const [form, setForm] = useState<EditFormState>({
    name: '',
    code: '',
    state: '',
    district: '',
    sector: ProjectSector.ROAD,
    status: ProjectStatus.PLANNING,
    riskLevel: RiskLevel.MEDIUM,
    implementingAgency: '',
    startDate: '',
    expectedEndDate: '',
    landRequired: '0',
    landAcquired: '0',
    affectedLandowners: '0',
    affectedFamilies: '0',
    compensationRequired: '0',
    compensationPaid: '0',
    description: '',
  });

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name ?? '',
        code: project.code ?? '',
        state: project.state ?? '',
        district: project.district ?? '',
        sector: project.sector ?? ProjectSector.ROAD,
        status: project.status ?? ProjectStatus.PLANNING,
        riskLevel: project.riskLevel ?? RiskLevel.MEDIUM,
        implementingAgency: project.implementingAgency ?? '',
        startDate: dateInput(project.startDate),
        expectedEndDate: dateInput(project.expectedEndDate),
        landRequired: String(project.landRequired ?? 0),
        landAcquired: String(project.landAcquired ?? 0),
        affectedLandowners: String(project.affectedLandowners ?? 0),
        affectedFamilies: String(project.affectedFamilies ?? 0),
        compensationRequired: String(project.compensationRequired ?? 0),
        compensationPaid: String(project.compensationPaid ?? 0),
        description: project.description ?? '',
      });
    }
  }, [project]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (isLoading) {
    return (
      <div className="animate-fade-in mx-auto max-w-5xl space-y-6">
        <PageHeader title="Loading Project" description="Please wait..." />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in mx-auto max-w-5xl">
        <ErrorState
          title="Could not load project"
          message="There was an error loading the project details."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Project not found. <button type="button" onClick={() => navigate('/projects')} className="font-semibold text-brand-primary">Return to projects</button>
      </div>
    );
  }

  if (scope === 'none') {
    const denial = describeEditDenial(currentUser, project);
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h1 className="text-base font-bold text-amber-900">{denial.title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-amber-800">{denial.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="mt-4"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to project
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isManagerScope) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6 pb-12">
        <PageHeader
          title="Update project progress"
          description={`Record progress and delay causes for ${project.name}.`}
          breadcrumbs={(
            <button type="button" onClick={() => navigate(`/projects/${project.id}`)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:text-brand-secondary">
              <ArrowLeft className="h-4 w-4" /> Back to project
            </button>
          )}
          actions={(
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <ShieldCheck className="h-3.5 w-3.5" /> Project manager scope
            </span>
          )}
        />

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          As project manager you can update this project's status, acquisition and compensation
          progress, and what is causing the delay. Official record fields and other projects stay with
          the government officer.
        </p>

        <ManagerProjectUpdate
          project={project}
          onSaved={(updated) => {
            setForm((current) => ({
              ...current,
              status: updated.status,
              landAcquired: String(updated.landAcquired),
              compensationPaid: String(updated.compensationPaid),
            }));
          }}
        />
      </div>
    );
  }

  const update = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const landRequired = numberValue(form.landRequired);
    const landAcquired = numberValue(form.landAcquired);
    const compensationRequired = numberValue(form.compensationRequired);
    const compensationPaid = numberValue(form.compensationPaid);

    if (form.name.trim().length < 3) return setError('Project name must contain at least 3 characters.');
    if (!form.code.trim()) return setError('Project code is required.');
    if (!form.state.trim() || !form.district.trim()) return setError('State and district are required.');
    if (!form.expectedEndDate || form.expectedEndDate <= form.startDate) return setError('Completion date must be after the start date.');
    if (landRequired <= 0 || landAcquired < 0 || landAcquired > landRequired) return setError('Land acquisition values are invalid.');
    if (compensationRequired < 0 || compensationPaid < 0 || compensationPaid > compensationRequired) return setError('Compensation values are invalid.');

    setSaving(true);
    setError('');
    try {
      const changes: UpdateProjectInput = {
        name: form.name,
        code: form.code,
        state: form.state,
        district: form.district,
        sector: form.sector,
        status: form.status,
        riskLevel: form.riskLevel,
        implementingAgency: form.implementingAgency,
        startDate: form.startDate,
        completionDate: form.expectedEndDate,
        expectedEndDate: form.expectedEndDate,
        landRequired,
        landAcquired,
        affectedLandowners: numberValue(form.affectedLandowners),
        affectedFamilies: numberValue(form.affectedFamilies),
        compensationRequired,
        compensationPaid,
        description: form.description,
      };
      await projectsApi.updateProject(project.id, changes);
      // Invalidate ALL relevant caches so the UI shows the newly generated prediction instantly
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['prediction'] });
      queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] });
      
      navigate(`/projects/${project.id}`, { replace: true });
    } catch {
      setError('The project could not be updated. Please review the values and try again.');
    } finally {
      setSaving(false);
    }
  };

  const acquisitionProgress = numberValue(form.landRequired) > 0
    ? Math.min(100, (numberValue(form.landAcquired) / numberValue(form.landRequired)) * 100)
    : 0;
  const compensationProgress = numberValue(form.compensationRequired) > 0
    ? Math.min(100, (numberValue(form.compensationPaid) / numberValue(form.compensationRequired)) * 100)
    : 0;

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6 pb-12">
      <PageHeader
        title="Edit Project"
        description={`Update the official portal record for ${project.name}.`}
        breadcrumbs={(
          <button type="button" onClick={() => navigate(`/projects/${project.id}`)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:text-brand-secondary">
            <ArrowLeft className="h-4 w-4" /> Back to project
          </button>
        )}
        actions={(
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Officer edit access
          </span>
        )}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-base">Project information</CardTitle>
            <p className="mt-1 text-xs text-gray-500">Changes are reflected across the project list and detail dashboard.</p>
          </CardHeader>
          <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
            <label className={labelClass}>Project name<input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} required /></label>
            <label className={labelClass}>Project code<input className={inputClass} value={form.code} onChange={(event) => update('code', event.target.value.toUpperCase())} required /></label>
            <label className={labelClass}>State<input className={inputClass} value={form.state} onChange={(event) => update('state', event.target.value)} required /></label>
            <label className={labelClass}>District<input className={inputClass} value={form.district} onChange={(event) => update('district', event.target.value)} required /></label>
            <label className={labelClass}>Sector<select className={cn(inputClass, 'cursor-pointer')} value={form.sector} onChange={(event) => update('sector', event.target.value as ProjectSector)}>{Object.values(ProjectSector).map((sector) => <option key={sector} value={sector}>{getSectorLabel(sector)}</option>)}</select></label>
            <label className={labelClass}>Implementing agency<input className={inputClass} value={form.implementingAgency} onChange={(event) => update('implementingAgency', event.target.value)} /></label>
            <label className={labelClass}>Project status<select className={cn(inputClass, 'cursor-pointer')} value={form.status} onChange={(event) => update('status', event.target.value as ProjectStatus)}>{Object.values(ProjectStatus).map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}</select></label>
            <label className={labelClass}>Risk level<select className={cn(inputClass, 'cursor-pointer')} value={form.riskLevel} onChange={(event) => update('riskLevel', event.target.value as RiskLevel)}>{Object.values(RiskLevel).map((risk) => <option key={risk} value={risk}>{risk}</option>)}</select></label>
            <label className={labelClass}>Start date<input type="date" className={inputClass} value={form.startDate} onChange={(event) => update('startDate', event.target.value)} required /></label>
            <label className={labelClass}>Expected completion<input type="date" className={inputClass} value={form.expectedEndDate} onChange={(event) => update('expectedEndDate', event.target.value)} required /></label>
            <label className={`${labelClass} sm:col-span-2`}>Description<textarea rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15" value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-gray-100 pb-4"><CardTitle className="text-base">Land and community</CardTitle></CardHeader>
            <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
              <label className={labelClass}>Land required (Ha)<input type="number" min="0" step="any" className={inputClass} value={form.landRequired} onChange={(event) => update('landRequired', event.target.value)} /></label>
              <label className={labelClass}>Land acquired (Ha)<input type="number" min="0" step="any" className={inputClass} value={form.landAcquired} onChange={(event) => update('landAcquired', event.target.value)} /></label>
              <label className={labelClass}>Affected landowners<input type="number" min="0" className={inputClass} value={form.affectedLandowners} onChange={(event) => update('affectedLandowners', event.target.value)} /></label>
              <label className={labelClass}>Affected families<input type="number" min="0" className={inputClass} value={form.affectedFamilies} onChange={(event) => update('affectedFamilies', event.target.value)} /></label>
              <div className="sm:col-span-2 rounded-lg bg-gray-50 p-3">
                <div className="flex justify-between text-xs font-semibold text-gray-600"><span>Acquisition progress</span><span>{formatPercentage(acquisitionProgress)}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${acquisitionProgress}%` }} /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-gray-100 pb-4"><CardTitle className="text-base">Compensation</CardTitle></CardHeader>
            <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
              <label className={labelClass}>Required (Cr)<input type="number" min="0" step="any" className={inputClass} value={form.compensationRequired} onChange={(event) => update('compensationRequired', event.target.value)} /></label>
              <label className={labelClass}>Paid (Cr)<input type="number" min="0" step="any" className={inputClass} value={form.compensationPaid} onChange={(event) => update('compensationPaid', event.target.value)} /></label>
              <div className="sm:col-span-2 rounded-lg bg-gray-50 p-3">
                <div className="flex justify-between text-xs font-semibold text-gray-600"><span>Compensation paid</span><span>{formatPercentage(compensationProgress)}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${compensationProgress}%` }} /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex flex-col-reverse justify-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
          <Button type="button" variant="ghost" onClick={() => navigate(`/projects/${project.id}`)}>Cancel</Button>
          <Button type="submit" isLoading={saving}><Save className="mr-2 h-4 w-4" /> Save changes</Button>
        </div>
      </form>
    </div>
  );
}
