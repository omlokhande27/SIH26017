import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  Landmark,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import type { AccessMode } from '@/context/auth-context';
import { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { RegistrationWizard } from '@/components/auth/RegistrationWizard';
import { isValidEmail } from '@/utils/password';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.GOVERNMENT_OFFICER]: 'Government Officer',
  [UserRole.PROJECT_MANAGER]: 'Project Manager',
  [UserRole.WORKER]: 'Field Worker',
  [UserRole.VIEWER]: 'Viewer',
};

interface RoleFormConfig {
  /** Official identity document number that an administrator verifies. */
  identifierLabel?: string;
  identifierPlaceholder?: string;
  identifierHint?: string;
  /** Department, directorate, or agency the person belongs to. */
  organizationLabel?: string;
  organizationPlaceholder?: string;
  organizationRequired?: boolean;
  showDesignation?: boolean;
  designationRequired?: boolean;
  /** Shown on the sign-in and registration screens for this role. */
  note: string;
}

const ROLE_OPTIONS: { role: UserRole; title: string; icon: LucideIcon; form: RoleFormConfig }[] = [
  {
    role: UserRole.GOVERNMENT_OFFICER,
    title: 'Government Officer',
    icon: Landmark,
    form: {
      identifierLabel: 'Government employee ID',
      identifierPlaceholder: 'e.g. GOI-2026-00482',
      identifierHint: 'Printed on your government identity card. An administrator verifies this before officer controls are enabled.',
      organizationLabel: 'Department / Directorate',
      organizationPlaceholder: 'e.g. Land Revenue Department',
      organizationRequired: true,
      showDesignation: true,
      designationRequired: true,
      note: 'Officer controls stay disabled until an administrator verifies your government ID.',
    },
  },
  {
    role: UserRole.PROJECT_MANAGER,
    title: 'Project Manager',
    icon: BriefcaseBusiness,
    form: {
      identifierLabel: 'Agency registration ID',
      identifierPlaceholder: 'e.g. PMA-2026-11847',
      identifierHint: 'Your agency or consultancy registration number, verified before project controls are enabled.',
      organizationLabel: 'Agency / Consultancy',
      organizationPlaceholder: 'e.g. Sterling Infra Consultants',
      organizationRequired: true,
      note: 'Project controls stay disabled until an administrator verifies your agency ID.',
    },
  },
  {
    role: UserRole.VIEWER,
    title: 'Viewer',
    icon: Eye,
    form: {
      note: 'Viewer access is read-only and needs no official ID.',
    },
  },
];

interface RoleOptionProps {
  title: string;
  icon: LucideIcon;
  onSelect: () => void;
}

function RoleOption({ title, icon: Icon, onSelect }: RoleOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex h-full flex-col items-center gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center transition-all duration-200 hover:-translate-y-1 hover:border-transparent hover:shadow-xl hover:shadow-brand-navy/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-navy opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-brand-accent/20 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-subtle text-brand-primary ring-1 ring-brand-primary/10 transition-all duration-200 group-hover:bg-white/15 group-hover:text-white group-hover:ring-white/25">
        <Icon className="h-7 w-7" />
      </span>

      <span className="relative text-base font-bold tracking-tight text-slate-900 transition-colors duration-200 group-hover:text-white">
        {title}
      </span>
    </button>
  );
}

interface SelectedRoleBannerProps {
  title: string;
  note: string;
  icon: LucideIcon;
  onChange: () => void;
}

function SelectedRoleBanner({ title, note, icon: Icon, onChange }: SelectedRoleBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-accent/60 bg-brand-subtle/50 p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Selected account type</p>
        <p className="text-sm font-bold leading-5 text-slate-900">{title}</p>
        <p className="text-[11px] leading-4 text-slate-500">{note}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="mt-0.5 shrink-0 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-brand-accent hover:text-brand-primary"
      >
        Change
      </button>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login, requestPasswordReset, setAccessMode } = useAuth();

  const [authAction, setAuthAction] = useState<'signin' | 'signup'>('signin');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const selectedMode: AccessMode = selectedRole === null || selectedRole === UserRole.VIEWER ? 'VIEWER' : 'OFFICER';
  const activeRoleOption = ROLE_OPTIONS.find((option) => option.role === selectedRole) ?? null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const clearMessages = () => {
    setError('');
    setEmailError('');
    setResetMessage('');
  };

  const chooseRole = (role: UserRole) => {
    setSelectedRole(role);
    clearMessages();
  };

  const backToRoleSelection = () => {
    setSelectedRole(null);
    clearMessages();
  };

  const chooseAuthAction = (action: 'signin' | 'signup') => {
    setAuthAction(action);
    setSelectedRole(null);
    clearMessages();
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setEmailError('');
    setResetMessage('');

    if (!selectedRole) {
      setError('Select your account type first.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const user = await login({ email, password });
      const officerAccessGranted = setAccessMode(selectedMode, user);
      const accessNotice = selectedMode === 'VIEWER'
        ? 'Viewer mode is active. Project creation and workflow controls are disabled.'
        : officerAccessGranted
          ? undefined
          : 'This account is not provisioned for officer controls, so read-only viewer access was applied.';

      navigate('/dashboard', { replace: true, state: accessNotice ? { accessNotice } : undefined });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      await requestPasswordReset(email);
      setResetMessage(`Reset email sent to ${email.trim()}. Open it, select “Choose a new password,” and follow the secure link. If it is not visible, check your spam or promotions folder. The link expires and can be used once.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to send the reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef3f8] lg:grid lg:grid-cols-[minmax(420px,0.95fr)_minmax(560px,1.05fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-brand-navy px-12 py-10 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-brand-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-8 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />

        <Link to="/" className="relative z-10 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to website
        </Link>

        <div className="relative z-10 my-auto max-w-xl py-16">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur">
            <ShieldCheck className="h-7 w-7 text-sky-300" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Secure role-based workspace</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">
            The right access for every decision-maker.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-blue-100/75">
            Monitor land-acquisition risk, review project evidence, and take corrective action through a workspace matched to your responsibility.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            {ROLE_OPTIONS.map((option) => (
              <div
                key={option.role}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm"
              >
                <option.icon className="h-4 w-4 text-sky-300" />
                <span className="text-sm font-semibold">{option.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 border-t border-white/10 pt-6 text-xs text-white/45">
          <LockKeyhole className="h-4 w-4" />
          Access is verified against your database-assigned role.
        </div>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-[560px]">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-brand-primary lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to website
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-32px_rgba(15,36,64,0.35)]">
            <div className="rounded-t-2xl border-b border-slate-100 bg-white px-6 py-6 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy text-white shadow-md">
                  <ShieldCheck className="h-6 w-6 text-sky-300" />
                </div>
                <div>
                  <p className="text-base font-bold tracking-wide text-brand-navy">LANDGUARD AI</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Decision Support Portal</p>
                </div>
              </div>
              <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
                {selectedRole === null
                  ? authAction === 'signup'
                    ? 'Choose your account type'
                    : 'Select your account type'
                  : authAction === 'signup'
                    ? `Register as ${ROLE_LABELS[selectedRole]}`
                    : `Sign in as ${ROLE_LABELS[selectedRole]}`}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {selectedRole === null
                  ? authAction === 'signup'
                    ? 'Each account type has its own registration requirements.'
                    : 'Choose one of the three options to continue to the sign-in screen.'
                  : authAction === 'signup'
                    ? 'Complete the details required for this account type.'
                    : 'Enter your registered credentials to open your workspace.'}
              </p>
            </div>

            {authAction === 'signup' && selectedRole !== null ? (
              <div className="relative z-10 px-6 py-6 sm:px-8 sm:py-7">
                <RegistrationWizard
                  role={selectedRole}
                  roleTitle={ROLE_LABELS[selectedRole]}
                  onBack={backToRoleSelection}
                  onComplete={() => {
                    const role = selectedRole ?? UserRole.VIEWER;
                    navigate('/dashboard', {
                      replace: true,
                      state: {
                        accessNotice: role === UserRole.VIEWER
                          ? 'Your account was created with Viewer access. An administrator must approve officer access.'
                          : `Your ${ROLE_LABELS[role].toLowerCase()} request was recorded. An administrator must verify your ID before ${role === UserRole.GOVERNMENT_OFFICER ? 'officer' : 'project'} controls are enabled.`,
                      },
                    });
                  }}
                />
              </div>
            ) : (
            <form onSubmit={handleLogin} noValidate className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
              <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/80 p-1" role="tablist" aria-label="Account authentication">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authAction === 'signin'}
                  onClick={() => chooseAuthAction('signin')}
                  className={cn(
                    'rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
                    authAction === 'signin' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  Existing Account
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authAction === 'signup'}
                  onClick={() => chooseAuthAction('signup')}
                  className={cn(
                    'rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
                    authAction === 'signup' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  Create Account
                </button>
              </div>

              {selectedRole === null ? (
                <div className="space-y-5">
                  <fieldset>
                    <legend className="sr-only">Choose your account type</legend>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {ROLE_OPTIONS.map((option) => (
                        <RoleOption
                          key={option.role}
                          title={option.title}
                          icon={option.icon}
                          onSelect={() => chooseRole(option.role)}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                    <p className="text-xs leading-5 text-slate-600">
                      {authAction === 'signin'
                        ? 'Access is verified against your database profile. Selecting a role here does not grant extra permissions.'
                        : 'Your request is reviewed by an administrator. Every new account starts with read-only Viewer access until verified.'}
                    </p>
                  </div>
                </div>
              ) : (
                <SelectedRoleBanner
                  title={ROLE_LABELS[selectedRole]}
                  note={activeRoleOption?.form.note ?? ''}
                  icon={activeRoleOption?.icon ?? Eye}
                  onChange={backToRoleSelection}
                />
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {selectedRole !== null && (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Email address</span>
                  <span className="relative mt-1.5 block">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailError('');
                        setResetMessage('');
                      }}
                      aria-invalid={Boolean(emailError)}
                      placeholder="name@department.gov.in"
                      autoComplete="email"
                      required
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
                    />
                  </span>
                </label>

                {emailError && <p className="-mt-2 text-xs font-medium text-red-400">Please enter a valid email address.</p>}
                {resetMessage && <p className="-mt-2 text-xs font-medium text-emerald-600">{resetMessage}</p>}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-700">Password</span>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs font-semibold text-brand-primary transition-colors hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resetLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                  </div>
                  <span className="relative mt-1.5 block">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </div>
              </div>
              )}

              {selectedRole !== null && (
                <>
                  <Button type="submit" size="lg" isLoading={loading} className="w-full">
                    {loading ? 'Verifying access…' : `Sign in as ${ROLE_LABELS[selectedRole]}`}
                  </Button>

                  <p className="text-center text-[11px] leading-5 text-slate-400">
                    Existing accounts are authenticated by Supabase. Selecting a role does not override your assigned permissions.
                  </p>
                </>
              )}

              {authAction === 'signin' && selectedRole === null ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-center text-sm text-slate-600">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => chooseAuthAction('signup')}
                    className="font-bold text-brand-primary underline-offset-2 hover:underline"
                  >
                    Create one
                  </button>
                </p>
              ) : (
                <p className="text-center text-sm text-slate-500">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => chooseAuthAction('signup')}
                    className="font-semibold text-brand-primary underline-offset-2 hover:underline"
                  >
                    Create one
                  </button>
                </p>
              )}
            </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
