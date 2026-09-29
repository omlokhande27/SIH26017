import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  BellOff,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  KeyRound,
  LogOut,
  Mail,
  MonitorSmartphone,
  Pencil,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useViewerNotifications } from '@/hooks/useViewerNotifications';
import { cn } from '@/lib/utils';

const LAST_VISIT_KEY = 'landguard-last-visit';
const CURRENT_VISIT_KEY = 'landguard-current-visit';

interface LastVisit {
  path: string;
  label: string;
  at: string;
}

function readLastVisit(): LastVisit | null {
  try {
    const value = localStorage.getItem(LAST_VISIT_KEY);
    return value ? JSON.parse(value) as LastVisit : null;
  } catch {
    return null;
  }
}

function pageLabel(pathname: string) {
  const value = pathname.split('/').filter(Boolean).at(-1);
  if (!value) return 'Dashboard home';
  if (/^(proj|pred|rec)_/.test(value)) return 'Record details';
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function AccountDetail({ icon: Icon, label, value, tone }: { icon: typeof UserRound; label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50/70 p-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-gray-500 shadow-sm">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={cn('mt-0.5 truncate text-xs font-semibold', tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-gray-800')} title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function UserMenu() {
  const {
    currentUser,
    accessRole,
    accessMode,
    canManage,
    setAccessMode,
    updateProfile,
    requestPasswordReset,
    logout,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastVisit, setLastVisit] = useState<LastVisit | null>(readLastVisit);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [passwordResetState, setPasswordResetState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [passwordResetError, setPasswordResetError] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileForm, setProfileForm] = useState({
    fullName: currentUser?.name ?? '',
    department: currentUser?.department ?? '',
    designation: currentUser?.designation ?? '',
  });
  const { enabled: updatesEnabled, permission, enable, disable } = useViewerNotifications();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_VISIT_KEY, JSON.stringify({
        path: location.pathname,
        label: pageLabel(location.pathname),
        at: new Date().toISOString(),
      }));
    } catch {
      // Visit history is optional when browser storage is unavailable.
    }
  }, [location.pathname]);

  if (!currentUser) return null;

  const openMenu = () => {
    const previous = readLastVisit();
    try {
      const current = {
        path: location.pathname,
        label: pageLabel(location.pathname),
        at: new Date().toISOString(),
      };
      localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(current));
      localStorage.setItem(CURRENT_VISIT_KEY, JSON.stringify(current));
    } catch {
      // The menu still opens when storage is unavailable.
    }
    setLastVisit(previous);
    setIsOpen((open) => !open);
  };

  const handleLogout = async () => {
    setIsSigningOut(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('Unable to sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaveState('saving');
    setProfileSaveError('');

    try {
      await updateProfile(profileForm);
      setProfileSaveState('saved');
      setIsEditingProfile(false);
    } catch (error) {
      setProfileSaveState('idle');
      setProfileSaveError(error instanceof Error ? error.message : 'Unable to save profile details.');
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser.email) return;

    setPasswordResetState('sending');
    setPasswordResetError('');
    try {
      await requestPasswordReset(currentUser.email);
      setPasswordResetState('sent');
    } catch (error) {
      setPasswordResetState('idle');
      setPasswordResetError(error instanceof Error ? error.message : 'Unable to send the reset email.');
    }
  };

  const browserStatus = permission === 'granted'
    ? 'Browser alerts on'
    : permission === 'denied'
      ? 'Browser alerts blocked'
      : permission === 'unsupported'
        ? 'Browser unsupported'
        : 'Permission not requested';

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={openMenu}
        aria-label="Open account details"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-brand-primary text-xs font-bold text-white shadow-sm">
          {initials(currentUser.name)}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </span>
        <ChevronDown className={cn('hidden h-3.5 w-3.5 text-gray-500 transition-transform sm:block', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[60] mt-2 max-h-[calc(100vh-4rem)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-[0_24px_65px_-24px_rgba(15,36,64,0.5)]">
          <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy to-[#173c62] px-4 py-4 text-white">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand-accent/25 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm font-bold shadow-lg">
                {initials(currentUser.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-bold">{currentUser.name}</p>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                </div>
                <p className="mt-0.5 truncate text-xs text-blue-100/70" title={currentUser.email}>{currentUser.email}</p>
                <p className="mt-1 truncate text-[10px] text-white/50" title={`${currentUser.department} · ${currentUser.designation}`}>
                  {currentUser.department} · {currentUser.designation}
                </p>
              </div>
            </div>
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[10px] font-bold text-sky-200">
                <ShieldCheck className="h-3 w-3" /> {accessMode === 'OFFICER' ? 'Officer mode' : 'Viewer mode'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[10px] font-bold text-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> Active session
              </span>
            </div>
          </section>

          <div className="space-y-4 p-3.5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Workspace mode</h3>
                <span className="text-[10px] font-semibold text-brand-primary">{formatLabel(accessRole ?? currentUser.role)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={accessMode === 'VIEWER'}
                  onClick={() => setAccessMode('VIEWER')}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-xs font-semibold transition',
                    accessMode === 'VIEWER' ? 'border-brand-accent bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  Viewer
                  <span className="mt-0.5 block text-[9px] font-normal text-gray-400">Read only</span>
                </button>
                <button
                  type="button"
                  aria-pressed={accessMode === 'OFFICER'}
                  onClick={() => canManage && setAccessMode('OFFICER')}
                  disabled={!canManage}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-xs font-semibold transition',
                    accessMode === 'OFFICER' ? 'border-brand-accent bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    !canManage && 'cursor-not-allowed opacity-45',
                  )}
                >
                  Officer
                  <span className="mt-0.5 block text-[9px] font-normal text-gray-400">Manage & edit</span>
                </button>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Notifications</h3>
                <button
                  type="button"
                  aria-pressed={updatesEnabled}
                  onClick={() => updatesEnabled ? disable() : void enable()}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[10px] font-bold transition',
                    updatesEnabled ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-200',
                  )}
                >
                  {updatesEnabled ? 'Turn off' : 'Turn on'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AccountDetail icon={updatesEnabled ? BellRing : BellOff} label="Project & risk" value={updatesEnabled ? 'Turned on' : 'Turned off'} tone={updatesEnabled ? 'success' : 'warning'} />
                <AccountDetail icon={MonitorSmartphone} label="Browser" value={browserStatus} tone={permission === 'granted' ? 'success' : 'warning'} />
                <AccountDetail icon={Mail} label="Risk email alerts" value="Not configured" />
                <AccountDetail icon={Building2} label="Account role" value={formatLabel(accessRole ?? currentUser.role)} />
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Profile & activity</h3>
                {!isEditingProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileForm({
                        fullName: currentUser.name,
                        department: currentUser.department,
                        designation: currentUser.designation,
                      });
                      setProfileSaveError('');
                      setProfileSaveState('idle');
                      setIsEditingProfile(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold text-brand-primary hover:bg-blue-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleSaveProfile} className="space-y-2.5 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Full name</span>
                    <input
                      value={profileForm.fullName}
                      onChange={(event) => setProfileForm((form) => ({ ...form, fullName: event.target.value }))}
                      className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Department</span>
                    <input
                      value={profileForm.department}
                      onChange={(event) => setProfileForm((form) => ({ ...form, department: event.target.value }))}
                      className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Designation</span>
                    <input
                      value={profileForm.designation}
                      onChange={(event) => setProfileForm((form) => ({ ...form, designation: event.target.value }))}
                      className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15"
                    />
                  </label>
                  <p className="flex items-start gap-1.5 text-[10px] leading-4 text-gray-500">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Role, email, and government ID remain protected by your administrator.
                  </p>
                  {profileSaveError && <p role="alert" className="text-[10px] leading-4 text-red-600">{profileSaveError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingProfile(false);
                        setProfileSaveError('');
                      }}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaveState === 'saving'}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-brand-primary text-[10px] font-bold text-white hover:bg-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-3 w-3" /> {profileSaveState === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <AccountDetail icon={UserRound} label="Name" value={currentUser.name} />
                    <AccountDetail icon={Mail} label="Email" value={currentUser.email} />
                    <AccountDetail icon={KeyRound} label="Authentication" value="Supabase session" tone="success" />
                    <AccountDetail icon={Clock3} label="Last visit" value={lastVisit ? `${lastVisit.label} · ${formatDateTime(lastVisit.at)}` : 'First recorded visit'} />
                  </div>
                  {profileSaveState === 'saved' && <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Profile details saved.</p>}
                  <p className="mt-2 truncate px-1 text-[9px] text-gray-400" title={currentUser.id}>User ID: {currentUser.id}</p>
                </>
              )}
            </section>
          </div>

          <div className="border-t border-gray-100 bg-gray-50/70 p-2.5">
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={passwordResetState === 'sending' || passwordResetState === 'sent'}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" /> {passwordResetState === 'sending' ? 'Sending reset email…' : passwordResetState === 'sent' ? 'Reset email sent' : 'Change password'}
            </button>
            {passwordResetState === 'sent' && (
              <p className="px-2 pt-2 text-center text-[10px] leading-4 text-emerald-700">Secure reset link sent to {currentUser.email}.</p>
            )}
            {passwordResetError && <p className="px-2 pt-2 text-center text-[10px] leading-4 text-red-600">{passwordResetError}</p>}
            {logoutError && <p className="px-2 pb-2 text-[10px] text-red-600">{logoutError}</p>}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isSigningOut}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" /> {isSigningOut ? 'Signing out…' : 'Sign out securely'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
