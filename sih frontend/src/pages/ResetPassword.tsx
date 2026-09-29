import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { getPasswordRequirements, passwordMeetsRequirements } from '@/utils/password';
import { cn } from '@/lib/utils';

type RecoveryState = 'checking' | 'ready' | 'expired' | 'updated';

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requirements = getPasswordRequirements(password);
  const passwordIsValid = passwordMeetsRequirements(password);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setRecoveryState(data.session ? 'ready' : 'expired');
      } catch {
        if (mounted) setRecoveryState('expired');
      }
    }

    void checkRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || session) setRecoveryState('ready');
      if (event === 'SIGNED_OUT') setRecoveryState('expired');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (recoveryState !== 'ready') return;
    if (!passwordIsValid) {
      setError('Complete all password requirements before saving.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setRecoveryState('updated');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-5 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-32px_rgba(15,36,64,0.35)]">
        <div className="bg-brand-navy px-6 py-7 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <ShieldCheck className="h-6 w-6 text-sky-300" />
            </span>
            <div>
              <p className="text-base font-bold tracking-wide">LANDGUARD AI</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Secure account recovery</p>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Create a new password</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100/70">Use the secure link from your LandGuard email to replace your old password.</p>
        </div>

        {recoveryState === 'checking' && (
          <div className="px-6 py-12 text-center sm:px-8" role="status" aria-live="polite">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-accent">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-accent border-t-transparent" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Checking your secure link</h2>
            <p className="mt-1.5 text-sm text-slate-500">Please wait a moment while we verify the recovery link.</p>
          </div>
        )}

        {recoveryState === 'expired' && (
          <div className="px-6 py-10 text-center sm:px-8" role="alert">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-900">This reset link is invalid or expired</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              For your security, password reset links expire and can only be used once. Return to sign in and request a fresh email.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary"
            >
              <Mail className="h-4 w-4" /> Request a new reset email
            </Link>
          </div>
        )}

        {recoveryState === 'updated' && (
          <div className="px-6 py-10 text-center sm:px-8" role="status">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Password updated successfully</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Your new password is active. Sign in with it to continue to your workspace.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary"
            >
              Continue to sign in <ArrowLeft className="h-4 w-4 rotate-180" />
            </Link>
          </div>
        )}

        {recoveryState === 'ready' && (
          <form onSubmit={handleSubmit} noValidate className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p><span className="font-semibold">Secure link verified.</span> Choose a new password to secure your account.</p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="new-password">New password</label>
              <div className="relative mt-1.5">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a strong new password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2.5 grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
                  {requirements.map((requirement) => (
                    <div key={requirement.id} className={cn('flex items-center gap-1.5 text-[11px] font-medium', requirement.met ? 'text-emerald-600' : 'text-red-500')}>
                      {requirement.met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {requirement.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="confirm-password">Confirm new password</label>
              <div className="relative mt-1.5">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <Button type="submit" size="lg" isLoading={loading} className="w-full">Save new password</Button>

            <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
