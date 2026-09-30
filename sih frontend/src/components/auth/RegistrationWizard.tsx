import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { OtpInput } from '@/components/ui/otp-input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/types';
import { districtMatches, getDistrictOptions, getStateName, STATE_OPTIONS } from '@/data/india';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import {
  checkIdentifierAvailability,
  finalizeRegistration,
  startEmailVerification,
  verifyEmailOtp,
} from '@/api/registration.api';
import type { RegistrationDetails } from '@/api/registration.api';
import { getPasswordRequirements, passwordMeetsRequirements } from '@/utils/password';
import type { OfficerLevel } from '@/context/auth-context';

type StepId = 'identity' | 'jurisdiction' | 'assignment' | 'identifier' | 'email' | 'password' | 'credentials';

interface StepDefinition {
  id: StepId;
  title: string;
  caption: string;
}

const COMMON_TAIL: StepDefinition[] = [{ id: 'credentials', title: 'Credentials', caption: 'Set email and password' }];

function buildSteps(role: UserRole): StepDefinition[] {
  if (role === UserRole.GOVERNMENT_OFFICER) {
    return [
      { id: 'identity', title: 'Identity', caption: 'Name and profession' },
      { id: 'jurisdiction', title: 'Level', caption: 'Scope of authority' },
      { id: 'identifier', title: 'Officer ID', caption: 'Check registration' },
      ...COMMON_TAIL,
    ];
  }
  if (role === UserRole.PROJECT_MANAGER) {
    return [
      { id: 'identity', title: 'Identity', caption: 'Name and location' },
      { id: 'jurisdiction', title: 'Location', caption: 'State and district' },
      { id: 'assignment', title: 'Project', caption: 'Assigned project' },
      { id: 'identifier', title: 'Manager ID', caption: 'Check registration' },
      ...COMMON_TAIL,
    ];
  }
  return [
    { id: 'identity', title: 'Identity', caption: 'Name and location' },
    { id: 'jurisdiction', title: 'Location', caption: 'State and district' },
    ...COMMON_TAIL,
  ];
}

const OFFICER_LEVELS: { value: OfficerLevel; label: string; hint: string }[] = [
  { value: 'NATIONAL', label: 'National', hint: 'Central government' },
  { value: 'STATE', label: 'State', hint: 'State-level cadre' },
  { value: 'DISTRICT', label: 'District', hint: 'District office' },
];

const PROFESSIONS = [
  'IAS Officer',
  'IPS Officer',
  'Revenue Officer',
  'District Magistrate',
  'Tehsildar / SDM',
  'Land Survey Officer',
  'Public Works Engineer',
  'Forest Officer',
  'SDO / Project Engineer',
  'Other Government Service',
].map((label) => ({ value: label, label }));

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15';

interface RegistrationWizardProps {
  role: UserRole;
  roleTitle: string;
  onBack: () => void;
  onComplete: () => void;
}

export function RegistrationWizard({ role, roleTitle, onBack, onComplete }: RegistrationWizardProps) {
  const steps = useMemo(() => buildSteps(role), [role]);
  const [stepIndex, setStepIndex] = useState(0);

  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [officerLevel, setOfficerLevel] = useState<OfficerLevel | null>(null);
  const [stateCode, setStateCode] = useState('');
  const [district, setDistrict] = useState('');
  const [projectId, setProjectId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierStatus, setIdentifierStatus] = useState<'idle' | 'checking' | 'ok' | 'pending' | 'taken' | 'error'>('idle');
  const [identifierMessage, setIdentifierMessage] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const passwordRequirements = getPasswordRequirements(password);

  const step = steps[stepIndex];
  const districtOptions = useMemo(() => getDistrictOptions(stateCode), [stateCode]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
    staleTime: 60_000,
  });

  const districtProjects = useMemo(() => {
    if (!district || !stateCode) return [];
    return projects
      .filter(
        (project) => project.state === getStateName(stateCode) && districtMatches(district, project.district),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [district, stateCode, projects]);

  const projectOptions = useMemo(
    () =>
      districtProjects.map((project) => ({
        value: project.id,
        label: project.name,
        caption: `${project.code} · ${project.district}`,
      })),
    [districtProjects],
  );

  
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Google login failed');
    }
  };

  const resetErrors = () => {
    setError('');
    setIdentifierMessage('');
    setOtpError('');
    setEmailMessage('');
  };

  const validateCurrentStep = (): string | null => {
    if (step.id === 'identity') {
      if (!fullName.trim()) return 'Enter your full name.';
      if (role === UserRole.GOVERNMENT_OFFICER && !profession) return 'Select your government profession.';
    }
    if (step.id === 'jurisdiction') {
      if (role === UserRole.GOVERNMENT_OFFICER) {
        if (!officerLevel) return 'Select the level you serve at.';
        if (officerLevel !== 'NATIONAL' && !stateCode) return 'Select your state.';
        if (officerLevel === 'DISTRICT' && !district) return 'Select your district.';
        return null;
      }
      if (role !== UserRole.VIEWER) {
        if (!stateCode) return 'Select your state.';
        if (!district) return 'Select your district.';
      }
    }
    if (step.id === 'assignment') {
      if (!projectId) return 'Select the project you are assigned to.';
    }
    if (step.id === 'identifier') {
      if (!identifier.trim()) return role === UserRole.GOVERNMENT_OFFICER ? 'Enter your officer ID.' : 'Enter your manager ID.';
      if (identifierStatus !== 'ok' && identifierStatus !== 'pending') {
        return 'Verify your identifier before continuing.';
      }
    }
    if (step.id === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please enter a valid email address.';
      if (!otpVerified) return 'Verify your email with the one-time code before continuing.';
    }
    return null;
  };

  const goNext = () => {
    const message = validateCurrentStep();
    if (message) {
      setError(message);
      return;
    }
    resetErrors();
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => {
    resetErrors();
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((prev) => prev - 1);
  };

  const handleStateChange = (nextState: string) => {
    setStateCode(nextState);
    setDistrict('');
    setProjectId('');
  };

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    setProjectId('');
  };

  const runIdentifierCheck = async () => {
    const clean = identifier.trim();
    if (!clean) {
      setIdentifierStatus('error');
      setIdentifierMessage(
        role === UserRole.GOVERNMENT_OFFICER ? 'Enter your officer ID first.' : 'Enter your manager ID first.',
      );
      return;
    }
    setIdentifierStatus('checking');
    setIdentifierMessage('Checking…');
    const result = await checkIdentifierAvailability(role === UserRole.GOVERNMENT_OFFICER ? 'officer' : 'manager', clean);
    if (result.pending) setIdentifierStatus('pending');
    else setIdentifierStatus(result.available ? 'ok' : 'taken');
    setIdentifierMessage(result.message);
  };

  const runSendOtp = async () => {
    setSendingOtp(true);
    setOtpError('');
    setEmailMessage('');

    const details: RegistrationDetails = {
      fullName: fullName.trim(),
      requestedRole: role,
      officerId: role === UserRole.GOVERNMENT_OFFICER ? identifier.trim() || undefined : undefined,
      managerId: role === UserRole.PROJECT_MANAGER ? identifier.trim() || undefined : undefined,
      stateCode: stateCode || undefined,
      district: district || undefined,
      profession: profession || undefined,
      officerLevel: officerLevel ?? undefined,
      assignedProjectId: projectId || undefined,
    };

    const result = await startEmailVerification(email, details);
    setEmailMessage(result.message);
    setEmailSent(result.sent);
    setSendingOtp(false);
  };

  const runVerifyOtp = async () => {
    setVerifyingOtp(true);
    setOtpError('');
    const result = await verifyEmailOtp(email, otp);
    setVerifyingOtp(false);
    if (result.verified) {
      setOtpVerified(true);
      setOtpError('');
    } else {
      setOtpVerified(false);
      setOtpError(result.message);
    }
  };

  const handleFinish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step.id !== 'credentials' && step.id !== 'password') {
      goNext();
      return;
    }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!passwordMeetsRequirements(password)) {
      setError('Complete all password requirements before creating the account.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { directSignUp } = await import('@/api/registration.api');
      const details: RegistrationDetails = {
        fullName: fullName.trim(),
        requestedRole: role,
        officerId: role === UserRole.GOVERNMENT_OFFICER ? identifier.trim() || undefined : undefined,
        managerId: role === UserRole.PROJECT_MANAGER ? identifier.trim() || undefined : undefined,
        stateCode: stateCode || undefined,
        district: district || undefined,
        profession: profession || undefined,
        officerLevel: officerLevel ?? undefined,
        assignedProjectId: projectId || undefined,
      };
      const result = await directSignUp(email, password, details);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreated(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-7 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <h3 className="mt-3 text-base font-bold text-emerald-900">Account created</h3>
          <p className="mt-1.5 text-sm leading-6 text-emerald-800">
            Your {roleTitle.toLowerCase()} request was recorded with read-only Viewer access. An administrator
            verifies your details before elevated controls are enabled.
          </p>
        </div>
        <Button type="button" onClick={onComplete} className="w-full">
          Continue to dashboard
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleFinish} noValidate className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5" aria-label="Registration progress">
        {steps.map((item, index) => {
          const isDone = index < stepIndex;
          const isCurrent = index === stepIndex;
          return (
            <li key={item.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  isDone && 'bg-emerald-500 text-white',
                  isCurrent && 'bg-brand-primary text-white',
                  !isDone && !isCurrent && 'bg-slate-200 text-slate-500',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold',
                  isCurrent ? 'text-brand-navy' : isDone ? 'text-emerald-600' : 'text-slate-400',
                )}
              >
                {item.title}
              </span>
              {index < steps.length - 1 && <span className="mx-0.5 h-px w-3 bg-slate-300" />}
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-brand-accent/60 bg-brand-subtle/40 p-3.5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand-primary" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Registering as</p>
            <p className="text-sm font-bold text-slate-900">{roleTitle}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{step.caption}</p>
      </div>

      {/* ── Identity ─────────────────────────────────────────────── */}
      {step.id === 'identity' && (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              {role === UserRole.GOVERNMENT_OFFICER ? 'Full name' : 'Name'} <span className="text-red-500">*</span>
            </span>
            <span className="relative mt-1.5 block">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={role === UserRole.GOVERNMENT_OFFICER ? 'e.g. Asha Verma' : 'e.g. Rohit Nair'}
                autoComplete="name"
                required
                className={inputClass}
              />
            </span>
          </label>

          {role === UserRole.GOVERNMENT_OFFICER && (
            <SelectField
              label="Government profession"
              options={PROFESSIONS}
              value={profession}
              onChange={setProfession}
              placeholder="Select your profession"
              required
            />
          )}
        </div>
      )}

      {/* ── Jurisdiction / Location ──────────────────────────────── */}
      {step.id === 'jurisdiction' && role === UserRole.GOVERNMENT_OFFICER && (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">
              Level you serve at <span className="text-red-500">*</span>
            </legend>
            <div className="mt-2 space-y-2">
              {OFFICER_LEVELS.map((level) => {
                const isSelected = officerLevel === level.value;
                return (
                  <label
                    key={level.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                      isSelected ? 'border-brand-accent bg-brand-subtle/50' : 'border-slate-300 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="officer-level"
                      value={level.value}
                      checked={isSelected}
                      onChange={() => {
                        setOfficerLevel(level.value);
                        if (level.value === 'NATIONAL') {
                          setStateCode('');
                          setDistrict('');
                        }
                      }}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected ? 'border-brand-primary bg-brand-primary' : 'border-slate-300',
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{level.label}</span>
                      <span className="block text-[11px] text-slate-500">{level.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {(officerLevel === 'STATE' || officerLevel === 'DISTRICT') && (
            <SelectField
              label="State"
              options={STATE_OPTIONS}
              value={stateCode}
              onChange={handleStateChange}
              placeholder="Select your state"
              required
            />
          )}

          {officerLevel === 'DISTRICT' && (
            <SelectField
              label="District"
              options={districtOptions}
              value={district}
              onChange={handleDistrictChange}
              placeholder={stateCode ? 'Select your district' : 'Select a state first'}
              disabled={!stateCode}
              required
              emptyMessage={stateCode ? 'No districts available' : 'Select a state first'}
            />
          )}
        </div>
      )}

      {step.id === 'jurisdiction' && role !== UserRole.GOVERNMENT_OFFICER && role !== UserRole.VIEWER && (
        <div className="space-y-4">
          <SelectField
            label="State"
            options={STATE_OPTIONS}
            value={stateCode}
            onChange={handleStateChange}
            placeholder="Select your state"
            required
          />
          <SelectField
            label="District"
            options={districtOptions}
            value={district}
            onChange={handleDistrictChange}
            placeholder={stateCode ? 'Select your district' : 'Select a state first'}
            disabled={!stateCode}
            required
            emptyMessage={stateCode ? 'No districts available' : 'Select a state first'}
          />
        </div>
      )}

      {step.id === 'jurisdiction' && role === UserRole.VIEWER && (
        <div className="space-y-4">
          <SelectField
            label="State"
            options={STATE_OPTIONS}
            value={stateCode}
            onChange={handleStateChange}
            placeholder="Select your state"
            hint="Optional for viewer accounts."
          />
          <SelectField
            label="District"
            options={districtOptions}
            value={district}
            onChange={setDistrict}
            placeholder={stateCode ? 'Select your district' : 'Select a state first'}
            disabled={!stateCode}
            hint="Optional for viewer accounts."
            emptyMessage={stateCode ? 'No districts available' : 'Select a state first'}
          />
        </div>
      )}

      {/* ── Project assignment ───────────────────────────────────── */}
      {step.id === 'assignment' && (
        <SelectField
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          placeholder={district ? 'Select your project' : 'Select a district first'}
          disabled={!district}
          required
          hint={
            district
              ? districtProjects.length > 0
                ? `Showing ${districtProjects.length} project${districtProjects.length === 1 ? '' : 's'} in ${district}.`
                : `No LandGuard projects are recorded in ${district} yet.`
              : undefined
          }
          emptyMessage={district ? `No projects recorded in ${district}` : 'Select a district first'}
        />
      )}

      {/* ── Identifier verification ──────────────────────────────── */}
      {step.id === 'identifier' && (
        <div className="space-y-3">
          <div>
            <span className="text-sm font-semibold text-slate-700">
              {role === UserRole.GOVERNMENT_OFFICER ? 'Officer ID' : 'Manager ID'} <span className="text-red-500">*</span>
            </span>
            <div className="mt-1.5 flex gap-2">
              <span className="relative block flex-1">
                <BadgeCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setIdentifierStatus('idle');
                    setIdentifierMessage('');
                  }}
                  placeholder={role === UserRole.GOVERNMENT_OFFICER ? 'e.g. GOI-2026-00482' : 'e.g. PMA-2026-11847'}
                  autoComplete="off"
                  className={cn(inputClass, 'pr-3 uppercase')}
                />
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={runIdentifierCheck}
                disabled={identifierStatus === 'checking'}
                className="h-11 shrink-0"
              >
                {identifierStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verify
              </Button>
            </div>
            <span className="mt-1.5 block text-[11px] leading-4 text-slate-500">
              Checks whether this ID is already recorded in the LandGuard register. No one-time code is needed.
            </span>
          </div>

          {identifierMessage && (
            <div
              role="status"
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs',
                identifierStatus === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                identifierStatus === 'pending' && 'border-amber-200 bg-amber-50 text-amber-900',
                identifierStatus === 'taken' && 'border-red-200 bg-red-50 text-red-700',
                (identifierStatus === 'error' || identifierStatus === 'checking') && 'border-slate-200 bg-slate-50 text-slate-600',
              )}
            >
              {identifierStatus === 'ok' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              {identifierStatus === 'pending' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {(identifierStatus === 'taken' || identifierStatus === 'error') && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {identifierStatus === 'checking' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
              <span>{identifierMessage}</span>
            </div>
          )}
        </div>
      )}


      {/* ── Email + OTP ──────────────────────────────────────────── */}
      {step.id === 'email' && (
        <div className="space-y-4">
          <div className="pt-2 pb-4">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full h-11 border-slate-300 text-slate-700 bg-white hover:bg-slate-50 flex items-center justify-center gap-2"
              onClick={handleGoogleLogin}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                <path d="M1 1h22v22H1z" fill="none"/>
              </svg>
              Sign up with Google
            </Button>
          </div>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 px-3 text-xs text-slate-400 font-medium uppercase tracking-wider">or email OTP</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>
          
          <div>
            <span className="text-sm font-semibold text-slate-700">
              Email address <span className="text-red-500">*</span>
            </span>
            <div className="mt-1.5 flex gap-2">
              <span className="relative block flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setOtpVerified(false);
                    setEmailSent(false);
                    setOtp('');
                    setEmailMessage('');
                    setOtpError('');
                  }}
                  placeholder="name@department.gov.in"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={runSendOtp}
                disabled={sendingOtp}
                className="h-11 shrink-0"
              >
                {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send code
              </Button>
            </div>
          </div>

          {emailMessage && (
            <div
              role="status"
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs',
                emailSent ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-red-200 bg-red-50 text-red-700',
              )}
            >
              {emailSent ? <Mail className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{emailMessage}</span>
            </div>
          )}

          {emailSent && (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-semibold text-slate-700">
                  One-time code <span className="text-red-500">*</span>
                </span>
                <div className="mt-1.5">
                  <OtpInput value={otp} onChange={setOtp} disabled={verifyingOtp || otpVerified} invalid={Boolean(otpError)} />
                </div>
                {otpError && <p className="mt-1.5 text-xs font-medium text-red-500">{otpError}</p>}
                {otpVerified && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Email address verified
                  </p>
                )}
              </div>

              {!otpVerified && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={runVerifyOtp}
                  disabled={verifyingOtp || otp.length !== 6}
                  className="w-full"
                >
                  {verifyingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Verify code
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Password ─────────────────────────────────────────────── */}
      {step.id === 'credentials' && (
        <div className="space-y-4">
          <div>
            <span className="text-sm font-semibold text-slate-700">
              Email address <span className="text-red-500">*</span>
            </span>
            <span className="relative mt-1.5 block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@department.gov.in"
                autoComplete="email"
                required
                className={inputClass}
              />
            </span>
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700">
              Password <span className="text-red-500">*</span>
            </span>
            <span className="relative mt-1.5 block">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
                minLength={8}
                required
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-16 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </div>

          <div className="mt-2.5 grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
            {passwordRequirements.map((requirement) => (
              <div
                key={requirement.id}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] font-medium',
                  requirement.met ? 'text-emerald-600' : 'text-red-500',
                )}
              >
                {requirement.met ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                {requirement.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={goBack} className="flex-1">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <Button type="submit" isLoading={busy} className="flex-1">
          {step.id === 'credentials'
            ? `Create ${roleTitle.toLowerCase()} account`
            : `Continue to ${steps[stepIndex + 1]?.title ?? 'next'}`}
        </Button>
      </div>

      {step.id === 'credentials' && (
        <p className="text-center text-[11px] leading-5 text-slate-400">
          The account is created in read-only Viewer mode. An administrator verifies your details before enabling{' '}
          {role === UserRole.GOVERNMENT_OFFICER ? 'officer' : role === UserRole.PROJECT_MANAGER ? 'project' : 'extra'}{' '}
          controls.
        </p>
      )}
    </form>
  );
}
