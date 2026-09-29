import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
//  'react-router';
import {
  ArrowLeft, AlertCircle, AlertOctagon, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Files, Gavel, Hand, IndianRupee, Map, Route, Save, Scale, Trees, Users, FileWarning,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RiskBadge } from '@/components/ui/risk-badge';
import { projectsApi } from '@/api/projects.api';
import { RiskLevel, ProjectSector } from '@/types';
import type { CreateProjectInput, Project } from '@/types';
import { formatINR, formatPercentage, getSectorLabel } from '@/utils/formatting';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Data & constants
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'landguard.addProject.draft';

const STEPS: Array<{ id: string; title: string; icon: LucideIcon }> = [
  { id: 'basic', title: 'Basic Details', icon: Building2 },
  { id: 'land', title: 'Land Acquisition', icon: Map },
  { id: 'compensation', title: 'Compensation', icon: IndianRupee },
  { id: 'legal', title: 'Legal Issues', icon: Scale },
  { id: 'risk', title: 'Risk Factors', icon: AlertOctagon },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
];

const STATES = [
  'Uttar Pradesh', 'Maharashtra', 'Tamil Nadu', 'Karnataka', 'Telangana', 'Gujarat', 'Rajasthan',
  'Madhya Pradesh', 'West Bengal', 'Bihar', 'Odisha', 'Kerala', 'Punjab', 'Haryana', 'Delhi',
  'Andhra Pradesh', 'Jharkhand', 'Assam', 'Chhattisgarh',
];

interface DraftState {
  name: string;
  code: string;
  state: string;
  district: string;
  sector: ProjectSector | '';
  agency: string;
  startDate: string;
  completionDate: string;
  landRequired: string;
  landAcquired: string;
  landowners: string;
  families: string;
  notificationDate: string;
  awardDate: string;
  possessionDate: string;
  compensationRequired: string;
  compensationPaid: string;
  litigation: boolean;
  landDispute: boolean;
  titleIssue: boolean;
  landRecordIssue: boolean;
  compensationDispute: boolean;
  rrPending: boolean;
  rowIssue: boolean;
  encroachment: boolean;
  forestClearance: boolean;
  possessionPending: boolean;
  adminDelay: boolean;
}

const initialDraft: DraftState = {
  name: '', code: '', state: '', district: '', sector: '', agency: '',
  startDate: '', completionDate: '',
  landRequired: '', landAcquired: '', landowners: '', families: '',
  notificationDate: '', awardDate: '', possessionDate: '',
  compensationRequired: '', compensationPaid: '',
  litigation: false, landDispute: false, titleIssue: false, landRecordIssue: false, compensationDispute: false,
  rrPending: false, rowIssue: false, encroachment: false, forestClearance: false, possessionPending: false, adminDelay: false,
};

interface ToggleItem {
  key: keyof DraftState;
  title: string;
  description: string;
  icon: LucideIcon;
}

const LEGAL_ITEMS: ToggleItem[] = [
  { key: 'litigation', title: 'Litigation', description: 'Court cases over land valuation or acquisition', icon: Gavel },
  { key: 'landDispute', title: 'Land Dispute', description: 'Boundary or ownership conflicts on parcels', icon: Map },
  { key: 'titleIssue', title: 'Title Issue', description: 'Incomplete or unclear land titles', icon: FileWarning },
  { key: 'landRecordIssue', title: 'Land Record Issue', description: 'Discrepancies in revenue records', icon: Files },
  { key: 'compensationDispute', title: 'Compensation Dispute', description: 'Disagreements on compensation amounts', icon: IndianRupee },
];

const RISK_ITEMS: ToggleItem[] = [
  { key: 'rrPending', title: 'R&R Pending', description: 'Rehabilitation & resettlement not started', icon: Users },
  { key: 'rowIssue', title: 'RoW Issue', description: 'Right-of-way conflicts on the corridor', icon: Route },
  { key: 'encroachment', title: 'Encroachment', description: 'Unauthorised occupation of required land', icon: AlertOctagon },
  { key: 'forestClearance', title: 'Forest Clearance Pending', description: 'Awaiting forest clearance approvals', icon: Trees },
  { key: 'possessionPending', title: 'Possession Pending', description: 'Awarded land not yet handed over', icon: Hand },
  { key: 'adminDelay', title: 'Administrative Delay', description: 'Approvals or paperwork bottlenecks', icon: Clock },
];

type Errors = Record<string, string>;

const baseInput =
  'w-full rounded-[var(--radius-md)] border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-accent)] focus:border-[var(--color-brand-primary)] disabled:cursor-not-allowed disabled:bg-gray-50';
const normalRing = 'border-gray-300 hover:border-gray-400';
const errorRing = 'border-red-300 focus:border-red-500 focus:ring-red-100';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const parseNumber = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;

function estimateRisk(draft: DraftState): RiskLevel {
  const flagged = LEGAL_ITEMS.filter((i) => draft[i.key]).length + RISK_ITEMS.filter((i) => draft[i.key]).length;
  if (flagged >= 5) return RiskLevel.CRITICAL;
  if (flagged >= 3) return RiskLevel.HIGH;
  if (flagged >= 1) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function toCreateInput(draft: DraftState): CreateProjectInput {
  return {
    name: draft.name.trim(),
    code: draft.code.trim(),
    state: draft.state,
    district: draft.district.trim(),
    sector: draft.sector as ProjectSector,
    implementingAgency: draft.agency.trim(),
    startDate: toIsoDate(draft.startDate) ?? new Date().toISOString(),
    completionDate: toIsoDate(draft.completionDate) ?? new Date().toISOString(),
    landRequired: parseNumber(draft.landRequired),
    landAcquired: parseNumber(draft.landAcquired),
    affectedLandowners: parseNumber(draft.landowners),
    affectedFamilies: parseNumber(draft.families),
    notificationDate: toIsoDate(draft.notificationDate),
    awardDate: toIsoDate(draft.awardDate),
    possessionDate: toIsoDate(draft.possessionDate),
    compensationRequired: parseNumber(draft.compensationRequired),
    compensationPaid: parseNumber(draft.compensationPaid),
    legalIssues: LEGAL_ITEMS.filter((i) => draft[i.key]).map((i) => i.title),
    riskFactors: RISK_ITEMS.filter((i) => draft[i.key]).map((i) => i.title),
  };
}

function validateBasic(draft: DraftState): Errors {
  const e: Errors = {};
  if (!draft.name.trim()) e.name = 'Project name is required';
  else if (draft.name.trim().length < 3) e.name = 'Enter at least 3 characters';
  if (!draft.code.trim()) e.code = 'Project code is required';
  else if (!/^[A-Za-z0-9-]{3,}$/.test(draft.code.trim())) e.code = 'Use letters, numbers and dashes (e.g. UP-HWY-2026-014)';
  if (!draft.state) e.state = 'Select a state';
  if (!draft.district.trim()) e.district = 'District is required';
  if (!draft.sector) e.sector = 'Select a sector';
  if (!draft.agency.trim()) e.agency = 'Implementing agency is required';
  if (!draft.startDate) e.startDate = 'Planned start date is required';
  if (!draft.completionDate) e.completionDate = 'Planned completion date is required';
  else if (draft.startDate && draft.completionDate <= draft.startDate) e.completionDate = 'Must be after the start date';
  return e;
}

function validateLand(draft: DraftState): Errors {
  const e: Errors = {};
  const required = parseNumber(draft.landRequired);
  const acquired = parseNumber(draft.landAcquired);
  if (!draft.landRequired) e.landRequired = 'Land required is required';
  else if (required <= 0) e.landRequired = 'Must be greater than 0';
  if (draft.landAcquired !== '' && acquired < 0) e.landAcquired = 'Cannot be negative';
  else if (required > 0 && acquired > required) e.landAcquired = 'Cannot exceed land required';
  if (draft.landowners !== '' && parseNumber(draft.landowners) < 0) e.landowners = 'Cannot be negative';
  if (draft.families !== '' && parseNumber(draft.families) < 0) e.families = 'Cannot be negative';
  if (draft.notificationDate && draft.awardDate && draft.awardDate < draft.notificationDate) e.awardDate = 'Must be after notification';
  return e;
}

function validateCompensation(draft: DraftState): Errors {
  const e: Errors = {};
  const required = parseNumber(draft.compensationRequired);
  const paid = parseNumber(draft.compensationPaid);
  if (!draft.compensationRequired) e.compensationRequired = 'Total compensation required';
  else if (required < 0) e.compensationRequired = 'Cannot be negative';
  if (draft.compensationPaid === '') e.compensationPaid = 'Total compensation paid';
  else if (paid > required) e.compensationPaid = 'Paid cannot exceed required';
  return e;
}

function validateStep(index: number, draft: DraftState): Errors {
  switch (STEPS[index].id) {
    case 'basic': return validateBasic(draft);
    case 'land': return validateLand(draft);
    case 'compensation': return validateCompensation(draft);
    default: return {};
  }
}

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...initialDraft, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form primitives
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'date';
  step?: string;
  min?: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  className?: string;
}

function TextField({ id, label, value, onChange, error, hint, required, type = 'text', step, min, prefix, suffix, placeholder, className }: TextFieldProps) {
  const inputClass = cn(
    baseInput,
    error ? errorRing : normalRing,
    prefix && 'pl-8',
    suffix && 'pr-14',
    (type === 'number' || type === 'date') && 'tabular-nums'
  );

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-gray-500">{prefix}</span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={placeholder}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-400">{suffix}</span>
        )}
      </div>
    </Field>
  );
}

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  error?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

function SelectField({ id, label, value, onChange, options, error, placeholder = 'Select...', required, className }: SelectFieldProps) {
  return (
    <Field label={label} htmlFor={id} error={error} required={required} className={className}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(baseInput, 'appearance-none bg-white pr-9 cursor-pointer', error ? errorRing : normalRing, !value && 'text-gray-400')}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2',
        checked ? 'bg-[var(--color-brand-primary)]' : 'bg-gray-300'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

interface ToggleGroupProps {
  items: ToggleItem[];
  values: DraftState;
  onChange: (key: keyof DraftState, value: boolean) => void;
}

function ToggleGroup({ items, values, onChange }: ToggleGroupProps) {
  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-[var(--radius-lg)] border border-gray-200 bg-white">
      {items.map((item) => {
        const Icon = item.icon;
        const checked = Boolean(values[item.key]);
        return (
          <div key={item.key} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--color-bg-muted)]/60">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors',
                  checked ? 'bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]' : 'bg-gray-100 text-gray-400'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className={cn('text-sm font-medium', checked ? 'text-gray-900' : 'text-gray-700')}>{item.title}</p>
                <p className="truncate text-xs text-gray-400">{item.description}</p>
              </div>
            </div>
            <Switch checked={checked} onChange={(v) => onChange(item.key, v)} />
          </div>
        );
      })}
    </div>
  );
}

function StepIndicator({ current, onSelect }: { current: number; onSelect: (index: number) => void }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const completed = i < current;
        const active = i === current;
        return (
          <li key={step.id} className={cn('relative flex flex-1 flex-col items-center', i > 0 && '')}>
            {i > 0 && (
              <div
                aria-hidden="true"
                className={cn(
                  'absolute top-4 right-1/2 -left-1/2 h-0.5 transition-colors',
                  i <= current ? 'bg-[var(--color-brand-primary)]' : 'bg-gray-200'
                )}
              />
            )}
            <button
              type="button"
              disabled={!completed}
              onClick={() => onSelect(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2',
                completed
                  ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white'
                  : active
                    ? 'border-[var(--color-brand-primary)] bg-white text-[var(--color-brand-primary)]'
                    : 'border-gray-300 bg-white text-gray-400',
                completed && 'cursor-pointer'
              )}
            >
              {completed ? <Check className="h-4 w-4" /> : i + 1}
            </button>
            <span
              className={cn(
                'mt-2 text-center text-[11px] font-medium leading-tight sm:text-xs',
                active ? 'text-[var(--color-brand-primary)]' : completed ? 'text-gray-700' : 'text-gray-400'
              )}
            >
              {step.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review summary
// ─────────────────────────────────────────────────────────────────────────────

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-6 first:border-t-0 first:pt-0">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

function ChipList({ values, emptyMessage }: { values: string[]; emptyMessage: string }) {
  if (values.length === 0) {
    return <p className="text-sm italic text-gray-400">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-bg-muted)] px-3 py-1 text-xs font-medium text-gray-700">
          <Check className="h-3 w-3 text-[var(--color-brand-primary)]" />
          {v}
        </span>
      ))}
    </div>
  );
}

function ReviewSummary({ draft }: { draft: DraftState }) {
  const required = parseNumber(draft.landRequired);
  const acquired = parseNumber(draft.landAcquired);
  const compRequired = parseNumber(draft.compensationRequired);
  const compPaid = parseNumber(draft.compensationPaid);
  const progress = required > 0 ? (acquired / required) * 100 : 0;
  const pending = Math.max(0, compRequired - compPaid);
  const risk = estimateRisk(draft);
  const legalSelected = LEGAL_ITEMS.filter((i) => draft[i.key]).map((i) => i.title);
  const riskSelected = RISK_ITEMS.filter((i) => draft[i.key]).map((i) => i.title);
  const datesLabel = [
    draft.notificationDate && `Notification: ${draft.notificationDate}`,
    draft.awardDate && `Award: ${draft.awardDate}`,
    draft.possessionDate && `Possession: ${draft.possessionDate}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-[var(--radius-lg)] border border-gray-200 bg-[var(--color-bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Summary</h3>
          <p className="text-xs text-gray-400">Verify the details before creating the project</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Provisional risk:</span>
          <RiskBadge risk={risk} />
        </div>
      </div>

      <CardContent className="space-y-6 p-6">
        <ReviewSection title="Project Details">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <KVRow label="Project Name" value={draft.name || '—'} />
            <KVRow label="Project Code" value={(draft.code || '—').toUpperCase()} />
            <KVRow label="Location" value={draft.district ? `${draft.district}, ${draft.state}` : '—'} />
            <KVRow label="Sector" value={draft.sector ? getSectorLabel(draft.sector) : '—'} />
            <KVRow label="Implementing Agency" value={draft.agency || '—'} />
            <KVRow label="Timeline" value={draft.startDate ? `${draft.startDate} → ${draft.completionDate}` : '—'} />
          </div>
        </ReviewSection>

        <ReviewSection title="Land Status">
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {acquired.toFixed(1)} / {required.toFixed(1)} Ha
              </span>
              <span className="font-semibold text-[var(--color-brand-primary)]">{formatPercentage(progress)}</span>
            </div>
            <ProgressBar value={progress} size="md" />
          </div>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <KVRow label="Affected Landowners" value={draft.landowners || '0'} />
            <KVRow label="Affected Families" value={draft.families || '0'} />
            {datesLabel && <KVRow label="Acquisition Dates" value={datesLabel} />}
          </div>
        </ReviewSection>

        <ReviewSection title="Compensation">
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {formatINR(compPaid)} paid of {formatINR(compRequired)}
              </span>
              <span className="text-xs text-gray-400">Pending {formatINR(pending)}</span>
            </div>
            <ProgressBar value={compPaid} max={Math.max(compRequired, 1)} size="md" variant={pending === 0 ? 'success' : 'default'} />
          </div>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-3">
            <KVRow label="Required" value={formatINR(compRequired)} />
            <KVRow label="Paid" value={formatINR(compPaid)} />
            <KVRow label="Pending" value={<span className={cn(pending > 0 && 'text-[var(--color-risk-medium)]')}>{formatINR(pending)}</span>} />
          </div>
        </ReviewSection>

        <ReviewSection title="Legal Issues">
          <ChipList values={legalSelected} emptyMessage="No legal issues reported" />
        </ReviewSection>

        <ReviewSection title="Risk Factors">
          <ChipList values={riskSelected} emptyMessage="No other risk factors reported" />
        </ReviewSection>
      </CardContent>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AddProject() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>(() => loadDraft() ?? initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [restored, setRestored] = useState(() => loadDraft() !== null);

  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = !createdProject && JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (navigateTimer.current) clearTimeout(navigateTimer.current);
  }, []);

  const showBanner = (message: string) => {
    setBanner(message);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 3200);
  };

  const update = (key: keyof DraftState, value: string | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const goNext = () => {
    const stepErrors = validateStep(stepIndex, draft);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const goToStep = (index: number) => {
    if (index >= stepIndex) return;
    setErrors({});
    setStepIndex(index);
  };

  const saveDraft = () => {
    if (!dirty) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    showBanner('Draft saved to this browser.');
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraft(initialDraft);
    setRestored(false);
    setErrors({});
  };

  const handleSave = async () => {
    const failing: { index: number; errors: Errors }[] = [];
    STEPS.forEach((_, i) => {
      const stepErrors = validateStep(i, draft);
      if (Object.keys(stepErrors).length > 0) failing.push({ index: i, errors: stepErrors });
    });
    if (failing.length > 0) {
      setStepIndex(failing[0].index);
      setErrors(failing[0].errors);
      return;
    }

    setSubmitting(true);
    try {
      const project = await projectsApi.createProject(toCreateInput(draft));
      localStorage.removeItem(DRAFT_KEY);
      
      // Invalidate relevant caches so the UI shows the new project and metrics instantly
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] });
      
      setCreatedProject(project);
      navigateTimer.current = setTimeout(() => navigate(`/projects/${project.id}`), 2400);
    } catch {
      showBanner('Could not create the project. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const step = STEPS[stepIndex];
  const StepIcon = step.icon;
  const isReview = stepIndex === STEPS.length - 1;

  const landProgress = draft.landRequired ? (parseNumber(draft.landAcquired) / parseNumber(draft.landRequired)) * 100 : 0;
  const compRequired = parseNumber(draft.compensationRequired);
  const compPaid = parseNumber(draft.compensationPaid);
  const compPending = Math.max(0, compRequired - compPaid);

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6 pb-16">
      <PageHeader
        title="Add New Project"
        description="Register a land acquisition project for monitoring and AI-driven prediction."
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
          dirty && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-risk-medium)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-risk-medium)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-risk-medium)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-risk-medium)]" />
              </span>
              Unsaved changes
            </span>
          )
        }
      />

      {restored && !createdProject && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-blue-900">
            <FileWarning className="h-4 w-4 text-blue-600" />
            A previous draft was restored. Continue editing or discard it to start fresh.
          </p>
          <Button variant="outline" size="sm" onClick={discardDraft}>
            Discard Draft
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-gray-200 bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
        <div className="h-1 bg-gradient-to-r from-[var(--color-brand-primary)] via-[var(--color-brand-accent)] to-[var(--color-brand-secondary)]" />

        <div className="px-6 pt-6 pb-2 sm:px-8">
          <StepIndicator current={stepIndex} onSelect={goToStep} />
        </div>

        <div className="mx-6 mt-6 mb-6 sm:mx-8">
          <div className="flex items-start gap-3 border-b border-gray-100 pb-5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]">
              <StepIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h2 className="mt-0.5 text-xl font-bold text-gray-900">{step.title}</h2>
            </div>
          </div>

          <div className="pt-6">
            {stepIndex === 0 && (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <TextField id="name" label="Project Name" value={draft.name} onChange={(v) => update('name', v)} error={errors.name} placeholder="e.g. Highway Expansion" required className="md:col-span-2" />
                <TextField id="code" label="Project Code" value={draft.code} onChange={(v) => update('code', v)} error={errors.code} placeholder="e.g. UP-HWY-2026-014" hint="Unique code used across the platform" required className="md:col-span-2" />
                <SelectField id="state" label="State" value={draft.state} onChange={(v) => update('state', v)} options={STATES.map((s) => ({ value: s, label: s }))} error={errors.state} required />
                <TextField id="district" label="District" value={draft.district} onChange={(v) => update('district', v)} error={errors.district} placeholder="e.g. Lucknow" required />
                <SelectField
                  id="sector"
                  label="Sector"
                  value={draft.sector}
                  onChange={(v) => update('sector', v)}
                  options={Object.values(ProjectSector).map((s) => ({ value: s, label: getSectorLabel(s) }))}
                  error={errors.sector}
                  required
                />
                <TextField id="agency" label="Implementing Agency" value={draft.agency} onChange={(v) => update('agency', v)} error={errors.agency} placeholder="e.g. NHAI, State PWD" required className="md:col-span-2" />
                <TextField id="startDate" label="Planned Start Date" type="date" value={draft.startDate} onChange={(v) => update('startDate', v)} error={errors.startDate} required />
                <TextField id="completionDate" label="Planned Completion Date" type="date" value={draft.completionDate} onChange={(v) => update('completionDate', v)} error={errors.completionDate} required />
              </div>
            )}

            {stepIndex === 1 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <TextField id="landRequired" label="Land Required" type="number" step="any" min="0" value={draft.landRequired} onChange={(v) => update('landRequired', v)} error={errors.landRequired} suffix="Ha" placeholder="0.00" required />
                  <TextField id="landAcquired" label="Land Acquired" type="number" step="any" min="0" value={draft.landAcquired} onChange={(v) => update('landAcquired', v)} error={errors.landAcquired} suffix="Ha" placeholder="0.00" />
                  <TextField id="landowners" label="Affected Landowners" type="number" step="1" min="0" value={draft.landowners} onChange={(v) => update('landowners', v)} error={errors.landowners} placeholder="0" />
                  <TextField id="families" label="Affected Families" type="number" step="1" min="0" value={draft.families} onChange={(v) => update('families', v)} error={errors.families} placeholder="0" />
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-accent)]/30 bg-[var(--color-brand-primary)]/5 p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">Acquisition Progress</span>
                    <span className="text-sm font-bold text-[var(--color-brand-primary)]">{formatPercentage(landProgress)}</span>
                  </div>
                  <ProgressBar value={landProgress} size="lg" variant="default" />
                  <p className="mt-2 text-xs text-gray-500">
                    {parseNumber(draft.landAcquired).toFixed(1)} / {parseNumber(draft.landRequired).toFixed(1)} = {formatPercentage(landProgress)}
                    <span className="text-gray-400"> · UI progress calculation, not an AI prediction</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <TextField id="notificationDate" label="Notification Date" type="date" value={draft.notificationDate} onChange={(v) => update('notificationDate', v)} />
                  <TextField id="awardDate" label="Award Date" type="date" value={draft.awardDate} onChange={(v) => update('awardDate', v)} error={errors.awardDate} />
                  <TextField id="possessionDate" label="Possession Date" type="date" value={draft.possessionDate} onChange={(v) => update('possessionDate', v)} />
                </div>
              </div>
            )}

            {stepIndex === 2 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <TextField id="compensationRequired" label="Total Compensation Required" type="number" step="any" min="0" prefix="₹" value={draft.compensationRequired} onChange={(v) => update('compensationRequired', v)} error={errors.compensationRequired} placeholder="0.00 Cr" required />
                  <TextField id="compensationPaid" label="Total Compensation Paid" type="number" step="any" min="0" prefix="₹" value={draft.compensationPaid} onChange={(v) => update('compensationPaid', v)} error={errors.compensationPaid} placeholder="0.00 Cr" required />
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-accent)]/30 bg-[var(--color-brand-primary)]/5 p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">Compensation Pending</span>
                    <span className={cn('text-sm font-bold', compPending > 0 ? 'text-[var(--color-risk-medium)]' : 'text-[var(--color-risk-low)]')}>
                      {formatINR(compPending)}
                    </span>
                  </div>
                  <ProgressBar value={compPaid} max={Math.max(compRequired, 1)} size="lg" variant={compPending === 0 ? 'success' : 'warning'} />
                  <p className="mt-2 text-xs text-gray-500">
                    {formatINR(compPaid)} of {formatINR(compRequired)} disbursed
                  </p>
                </div>
              </div>
            )}

            {stepIndex === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Flag any ongoing or anticipated legal issues. These feed into the provisional risk estimate.
                </p>
                <ToggleGroup items={LEGAL_ITEMS} values={draft} onChange={update} />
              </div>
            )}

            {stepIndex === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Flag non-legal impediments that could delay land acquisition and project execution.
                </p>
                <ToggleGroup items={RISK_ITEMS} values={draft} onChange={update} />
              </div>
            )}

            {stepIndex === 5 && <ReviewSummary draft={draft} />}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-[var(--color-bg-muted)]/50 px-6 py-4 sm:px-8">
          <div>
            {stepIndex > 0 && (
              <Button type="button" variant="ghost" onClick={goBack} className="flex items-center gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {dirty && (
              <Button type="button" variant="outline" onClick={saveDraft} className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
            )}
            {!isReview ? (
              <Button type="button" onClick={goNext} className="flex items-center gap-1.5">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} isLoading={submitting} className="flex items-center gap-2">
                {!submitting && <Check className="h-4 w-4" />}
                Save Project
              </Button>
            )}
          </div>
        </div>
      </div>

      {banner && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-[var(--color-risk-low)]/30 bg-white px-4 py-2.5 shadow-lg">
          <CheckCircle2 className="h-5 w-5 text-[var(--color-risk-low)]" />
          <span className="text-sm font-medium text-gray-800">{banner}</span>
        </div>
      )}

      {blocker.state === 'blocked' && (
        <Modal
          isOpen
          onClose={() => blocker.reset()}
          title="Unsaved changes"
          footer={
            <>
              <Button variant="outline" onClick={() => blocker.reset()}>
                Keep Editing
              </Button>
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Discard Changes
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            You have unsaved project details. If you leave now, the entered information will be lost unless you save a draft first.
          </p>
        </Modal>
      )}

      <Modal
        isOpen={Boolean(createdProject)}
        onClose={() => navigate('/projects')}
        title="Project Created"
        className="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Back to Projects
            </Button>
            <Button onClick={() => createdProject && navigate(`/projects/${createdProject.id}`)} className="flex items-center gap-2">
              View Project
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-risk-low)]/10">
            <CheckCircle2 className="h-8 w-8 text-[var(--color-risk-low)]" />
          </div>
          <h4 className="mt-4 text-lg font-semibold text-gray-900">
            {createdProject?.name}
          </h4>
          <p className="mt-1 text-sm text-gray-500">
            {createdProject?.code} · {createdProject?.district}, {createdProject?.state}
          </p>
          <p className="mt-4 text-sm text-gray-600">
            The project has been registered and is ready for monitoring. Redirecting to the project page...
          </p>
        </div>
      </Modal>
    </div>
  );
}