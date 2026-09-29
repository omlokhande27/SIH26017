import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Plus,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsApi } from '@/api/projects.api';
import { ProjectStatus, RiskLevel } from '@/types';
import type { Project, ProjectIssue } from '@/types';
import { formatPercentage } from '@/utils/formatting';
import { cn } from '@/lib/utils';

const inputClass =
  'mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15';
const labelClass = 'text-sm font-semibold text-slate-700';

/** Categories a manager can pick from when recording a delay cause. */
const CAUSE_CATEGORIES = ['Legal', 'Financial', 'Social', 'Operational', 'Regulatory'] as const;

interface ManagerUpdateState {
  status: ProjectStatus;
  landAcquired: string;
  compensationPaid: string;
  issues: ProjectIssue[];
}

interface ManagerProjectUpdateProps {
  project: Project;
  onSaved: (project: Project) => void;
}

/**
 * Project manager edit scope. Deliberately narrow: project status, how much
 * has been acquired and paid out, and what is currently causing the delay.
 * Official record fields stay with the government officer.
 */
export function ManagerProjectUpdate({ project, onSaved }: ManagerProjectUpdateProps) {
  const [form, setForm] = useState<ManagerUpdateState>(() => ({
    status: project.status,
    landAcquired: String(project.landAcquired),
    compensationPaid: String(project.compensationPaid),
    issues: (project.issues ?? []).map((issue) => ({ ...issue })),
  }));
  const [newCause, setNewCause] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CAUSE_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const landRequired = project.landRequired;
  const compensationRequired = project.compensationRequired;

  const acquisitionProgress = useMemo(
    () =>
      landRequired > 0
        ? Math.min(100, (Number(form.landAcquired) / landRequired) * 100)
        : 0,
    [form.landAcquired, landRequired],
  );

  const compensationProgress = useMemo(
    () =>
      compensationRequired > 0
        ? Math.min(100, (Number(form.compensationPaid) / compensationRequired) * 100)
        : 0,
    [form.compensationPaid, compensationRequired],
  );

  const update = <K extends keyof ManagerUpdateState>(key: K, value: ManagerUpdateState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError('');
  };

  const addCause = () => {
    const title = newCause.trim();
    if (!title) {
      setError('Enter a short description of what is causing the delay.');
      return;
    }
    if (form.issues.some((issue) => issue.title.toLowerCase() === title.toLowerCase())) {
      setError('That cause is already recorded.');
      return;
    }

    const issue: ProjectIssue = {
      id: `iss_${project.id}_${Date.now().toString(36)}`,
      title,
      category: newCategory,
      description: `Recorded by the project manager on ${new Date().toLocaleDateString('en-IN')}.`,
      severity: project.riskLevel,
      status: 'OPEN',
    };
    update('issues', [...form.issues, issue]);
    setNewCause('');
  };

  const removeCause = (id: string) => {
    update('issues', form.issues.filter((issue) => issue.id !== id));
  };

  const toggleCauseStatus = (id: string) => {
    update(
      'issues',
      form.issues.map((issue) =>
        issue.id === id
          ? { ...issue, status: issue.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED' }
          : issue,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const landAcquired = Number(form.landAcquired);
    const compensationPaid = Number(form.compensationPaid);

    if (!Number.isFinite(landAcquired) || landAcquired < 0 || landAcquired > landRequired) {
      setError(`Land acquired must be between 0 and ${landRequired} Ha.`);
      return;
    }
    if (
      !Number.isFinite(compensationPaid) ||
      compensationPaid < 0 ||
      compensationPaid > compensationRequired
    ) {
      setError(`Compensation paid must be between 0 and ${compensationRequired} Cr.`);
      return;
    }
    if (form.status === ProjectStatus.COMPLETED && acquisitionProgress < 100) {
      setError('This project cannot be marked completed while land acquisition is still below 100%.');
      return;
    }

    setSaving(true);
    try {
      const updated = await projectsApi.updateProject(project.id, {
        status: form.status,
        landAcquired,
        compensationPaid,
        issues: form.issues,
        // A manager cannot reclassify risk, so it is carried through unchanged.
        riskLevel: project.riskLevel as RiskLevel,
      });
      onSaved(updated);
      setSaved(true);
    } catch {
      setError('The project could not be updated. Please review the values and try again.');
    } finally {
      setSaving(false);
    }
  };

  const openCauses = form.issues.filter((issue) => issue.status !== 'RESOLVED');
  const resolvedCauses = form.issues.filter((issue) => issue.status === 'RESOLVED');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader className="border-b border-gray-100 pb-4">
          <CardTitle className="text-base">Project status</CardTitle>
          <p className="mt-1 text-xs text-gray-500">
            Mark the project completed once acquisition and compensation are settled.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-2">
            {Object.values(ProjectStatus).map((status) => {
              const isSelected = form.status === status;
              const isComplete = status === ProjectStatus.COMPLETED;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => update('status', status)}
                  aria-pressed={isSelected}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                    isSelected
                      ? isComplete
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-brand-accent bg-brand-subtle text-brand-navy'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
                  {status.replace(/_/g, ' ').toLowerCase()}
                </button>
              );
            })}
          </div>

          {form.status === ProjectStatus.COMPLETED && acquisitionProgress < 100 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Acquisition is at {formatPercentage(acquisitionProgress)}. Raise land acquired to 100% before
              saving a completed status.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-base">Land acquired</CardTitle>
            <p className="mt-1 text-xs text-gray-500">How much land has been taken over so far.</p>
          </CardHeader>
          <CardContent className="p-6">
            <label className={labelClass}>
              Land acquired (Ha)
              <input
                type="number"
                min="0"
                max={landRequired}
                step="any"
                className={inputClass}
                value={form.landAcquired}
                onChange={(event) => update('landAcquired', event.target.value)}
              />
            </label>
            <div className="mt-4">
              <Progress
                label="Acquisition progress"
                percent={acquisitionProgress}
                barClass="bg-brand-primary"
              />
              <p className="mt-1.5 text-[11px] text-gray-500">
                {form.landAcquired} of {landRequired} Ha
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-base">Compensation paid</CardTitle>
            <p className="mt-1 text-xs text-gray-500">How much has been disbursed to landowners.</p>
          </CardHeader>
          <CardContent className="p-6">
            <label className={labelClass}>
              Compensation paid (Cr)
              <input
                type="number"
                min="0"
                max={compensationRequired}
                step="any"
                className={inputClass}
                value={form.compensationPaid}
                onChange={(event) => update('compensationPaid', event.target.value)}
              />
            </label>
            <div className="mt-4">
              <Progress
                label="Compensation paid"
                percent={compensationProgress}
                barClass="bg-emerald-500"
              />
              <p className="mt-1.5 text-[11px] text-gray-500">
                {form.compensationPaid} of {compensationRequired} Cr
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-gray-100 pb-4">
          <CardTitle className="text-base">What is causing the delay</CardTitle>
          <p className="mt-1 text-xs text-gray-500">
            Record and clear the blockers holding up this project.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={newCause}
              onChange={(event) => setNewCause(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCause();
                }
              }}
              placeholder="e.g. Compensation dispute on plot 42"
              aria-label="New delay cause"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
            />
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              aria-label="Cause category"
              className="h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
            >
              {CAUSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <Button type="button" onClick={addCause} variant="outline" className="h-10">
              <Plus className="mr-1.5 h-4 w-4" /> Add cause
            </Button>
          </div>

          {form.issues.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No delay causes recorded. Add one above if something is blocking this project.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...openCauses, ...resolvedCauses].map((issue) => (
                <li key={issue.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      issue.status === 'RESOLVED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700',
                    )}
                  >
                    {issue.category}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      issue.status === 'RESOLVED' ? 'text-slate-400 line-through' : 'text-slate-800',
                    )}
                  >
                    {issue.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCauseStatus(issue.id)}
                    className="shrink-0 text-[11px] font-semibold text-brand-primary hover:underline"
                  >
                    {issue.status === 'RESOLVED' ? 'Reopen' : 'Mark resolved'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCause(issue.id)}
                    aria-label={`Remove ${issue.title}`}
                    className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <TrendingUp className="h-3 w-3" />
            {openCauses.length} open cause{openCauses.length === 1 ? '' : 's'} ·{' '}
            {resolvedCauses.length} resolved
          </p>
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && !error && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Progress saved for this project.
        </div>
      )}

      <div className="flex justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Button type="submit" isLoading={saving}>
          <Save className="mr-2 h-4 w-4" /> Save progress
        </Button>
      </div>
    </form>
  );
}

function Progress({
  label,
  percent,
  barClass,
}: {
  label: string;
  percent: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span>{formatPercentage(percent)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
