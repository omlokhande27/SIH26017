import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/types';
import type { User } from '@/types';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { AuthContext } from './auth-context';
import type { AccessMode, LoginCredentials, ProfileUpdate, RegisterCredentials, RegistrationResult } from './auth-context';
import { isValidEmail, passwordMeetsRequirements } from '@/utils/password';
import { getAuthErrorMessage } from '@/utils/auth-errors';
import { getProjectEditScope } from '@/utils/permissions';

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function parseUserRole(...values: unknown[]): UserRole | undefined {
  const aliases: Record<string, UserRole> = {
    officer: UserRole.GOVERNMENT_OFFICER,
    government_officer: UserRole.GOVERNMENT_OFFICER,
    admin: UserRole.GOVERNMENT_OFFICER,
    analyst: UserRole.VIEWER,
    manager: UserRole.PROJECT_MANAGER,
    project_manager: UserRole.PROJECT_MANAGER,
    worker: UserRole.WORKER,
    field_worker: UserRole.WORKER,
    viewer: UserRole.VIEWER,
    auditor: UserRole.VIEWER,
  };

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const role = Object.values(UserRole).find((candidate) => candidate === normalized) ?? aliases[normalized.toLowerCase()];
    if (role) return role;
  }

  return undefined;
}

function convertSupabaseUser(supabaseUser: SupabaseUser): User {
  const metadata = supabaseUser.user_metadata ?? {};

  return {
    id: supabaseUser.id,
    name: firstString(metadata.name, metadata.full_name, supabaseUser.email?.split('@')[0]) ?? 'User',
    email: supabaseUser.email ?? '',
    // DEMO OVERRIDE: Force everyone to be OFFICER so the prototype UI is fully unlocked
    role: UserRole.GOVERNMENT_OFFICER,
    department: firstString(metadata.department) ?? 'Land Acquisition Department',
    designation: firstString(metadata.designation) ?? 'Officer',
  };
}

async function enrichUserFromProfile(user: User): Promise<User> {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error || !data) return user;

    const profile = data as Record<string, unknown>;
    return {
      ...user,
      name: firstString(profile.full_name, profile.name, user.name) ?? user.name,
      role: parseUserRole(profile.role, profile.user_role) ?? user.role,
      department: firstString(profile.department, user.department) ?? user.department,
      designation: firstString(profile.designation, user.designation) ?? user.designation,
      assignedProjectId: firstString(profile.assigned_project_id) ?? null,
    };
  } catch {
    return user;
  }
}

async function verifyGovernmentId(supabaseUser: SupabaseUser, governmentId: string) {
  const normalizedInput = governmentId.trim().replace(/\s+/g, '').toUpperCase();
  if (normalizedInput.length < 4) {
    throw new Error('Enter a valid government ID to verify officer access.');
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', supabaseUser.id).maybeSingle();
  if (error) {
    throw new Error('Government ID verification is temporarily unavailable. Please try again.');
  }

  const profile = (data ?? {}) as Record<string, unknown>;
  const storedId = firstString(
    profile.government_id,
    profile.employee_id,
    profile.gov_id,
    profile.governmentId,
    supabaseUser.app_metadata?.government_id,
    supabaseUser.app_metadata?.employee_id,
  );

  if (!storedId || storedId.replace(/\s+/g, '').toUpperCase() !== normalizedInput) {
    throw new Error('The government ID did not match the officer profile.');
  }

  const explicitlyNotOfficer = [profile.is_government_officer, profile.isGovernmentOfficer]
    .some((value) => value === false || value === 'false' || value === 0 || value === '0');
  if (explicitlyNotOfficer) {
    throw new Error('This profile is not approved for government officer access.');
  }
}

const ACCESS_MODE_KEY = 'landguard-access-mode';

function readAccessMode(): AccessMode {
  try {
    return sessionStorage.getItem(ACCESS_MODE_KEY) === 'OFFICER' ? 'OFFICER' : 'VIEWER';
  } catch {
    return 'VIEWER';
  }
}

function persistAccessMode(mode: AccessMode) {
  try {
    sessionStorage.setItem(ACCESS_MODE_KEY, mode);
  } catch {
    // The selected mode still applies for the current page when storage is unavailable.
  }
}

function isManagerRole(role: UserRole | null | undefined): boolean {
  return role === UserRole.GOVERNMENT_OFFICER || role === UserRole.PROJECT_MANAGER;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessMode, setAccessModeState] = useState<AccessMode>(readAccessMode);
  const [loading, setLoading] = useState(true);
  const sessionVersion = useRef(0);

  const accountCanManage = isManagerRole(currentUser?.role);
  const accessRole: UserRole | null = currentUser
    ? accessMode === 'OFFICER' && accountCanManage
      ? currentUser.role
      : UserRole.VIEWER
    : null;
  const canManage = isManagerRole(accessRole);

  const setAccessMode = (mode: AccessMode, accountUser: User | null = currentUser) => {
    const nextMode: AccessMode = mode === 'OFFICER' && isManagerRole(accountUser?.role) ? 'OFFICER' : 'VIEWER';
    setAccessModeState(nextMode);
    persistAccessMode(nextMode);
    return nextMode === mode;
  };

  useEffect(() => {
    let mounted = true;

    function setAuthenticatedUser(supabaseUser: SupabaseUser) {
      const version = ++sessionVersion.current;
      const user = convertSupabaseUser(supabaseUser);
      setCurrentUser(user);
      setLoading(false);

      void enrichUserFromProfile(user).then((profileUser) => {
        if (mounted && version === sessionVersion.current) setCurrentUser(profileUser);
      });
    }

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error loading session:', error);
      }

      if (!mounted) return;

      if (data.session?.user) {
        setAuthenticatedUser(data.session.user);
      } else {
        sessionVersion.current += 1;
        setCurrentUser(null);
        setLoading(false);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthenticatedUser(session.user);
      } else {
        sessionVersion.current += 1;
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sessionVersion.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const login = async ({
    email,
    password,
    governmentId,
  }: LoginCredentials): Promise<User> => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      throw new Error('Please enter your email and password.');
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

    if (error) {
      throw new Error(getAuthErrorMessage(error, 'signin'));
    }

    if (!data.user) {
      throw new Error('Login failed. No user was returned.');
    }

    const cleanGovernmentId = governmentId?.trim();
    const user = await enrichUserFromProfile(convertSupabaseUser(data.user));

    try {
      if (cleanGovernmentId) {
        await verifyGovernmentId(data.user, cleanGovernmentId);
        if (!isManagerRole(user.role)) {
          throw new Error('This government ID is not linked to an officer account.');
        }
      }
    } catch (verificationError) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setAccessModeState('VIEWER');
      persistAccessMode('VIEWER');
      throw verificationError;
    }

    setCurrentUser(user);
    setAccessModeState('VIEWER');
    persistAccessMode('VIEWER');

    return user;
  };

  const register = async ({
    fullName,
    email,
    password,
    department,
    designation,
    requestedRole,
    roleIdentifier,
    officerId,
    managerId,
    stateCode,
    district,
    profession,
    officerLevel,
    assignedProjectId,
  }: RegisterCredentials): Promise<RegistrationResult> => {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanRoleId = roleIdentifier?.trim();
    const cleanOfficerId = officerId?.trim();
    const cleanManagerId = managerId?.trim();

    if (!cleanName) throw new Error('Please enter your full name.');
    if (!cleanEmail || !password) throw new Error('Please enter your email and password.');
    if (!passwordMeetsRequirements(password)) throw new Error('Password does not meet all security requirements.');
    if (requestedRole === UserRole.GOVERNMENT_OFFICER && !cleanOfficerId) {
      throw new Error('A verified officer ID is required to create a government officer account.');
    }
    if (requestedRole === UserRole.PROJECT_MANAGER && !cleanManagerId) {
      throw new Error('A verified manager ID is required to create a project manager account.');
    }
    if (requestedRole && requestedRole !== UserRole.VIEWER && !stateCode) {
      throw new Error('Select a state to create this account type.');
    }
    if (requestedRole && requestedRole !== UserRole.VIEWER && !district) {
      throw new Error('Select a district to create this account type.');
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          department: district?.trim() || department?.trim() || 'Land Acquisition Department',
          designation: designation?.trim() || profession?.trim() || null,
          // Recorded as a request only. The signup trigger ignores user
          // metadata for role assignment, so the profile still starts VIEWER
          // until an administrator verifies the identifier and promotes it.
          requested_role: requestedRole ?? UserRole.VIEWER,
          requested_role_id: cleanOfficerId || cleanManagerId || cleanRoleId || null,
          officer_id: cleanOfficerId || null,
          manager_id: cleanManagerId || null,
          state_code: stateCode || null,
          district: district?.trim() || null,
          profession: profession?.trim() || null,
          officer_level: officerLevel || null,
          assigned_project_id: assignedProjectId || null,
        },
      },
    });

    if (error) throw new Error(getAuthErrorMessage(error, 'signup'));
    if (!data.user) throw new Error('Account creation failed. No user was returned.');

    const baseUser = convertSupabaseUser(data.user);
    if (!data.session) {
      return { user: baseUser, requiresEmailConfirmation: true };
    }

    const user = await enrichUserFromProfile(baseUser);
    setCurrentUser(user);
    setAccessModeState('VIEWER');
    persistAccessMode('VIEWER');

    return { user, requiresEmailConfirmation: false };
  };

  const updateProfile = async ({ fullName, department, designation }: ProfileUpdate): Promise<User> => {
    if (!currentUser) throw new Error('Sign in before updating your profile.');

    const cleanFullName = fullName.trim();
    const cleanDepartment = department.trim();
    const cleanDesignation = designation.trim();

    if (!cleanFullName) throw new Error('Your name cannot be empty.');

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: cleanFullName,
        department: cleanDepartment || 'Land Acquisition Department',
        designation: cleanDesignation || 'User',
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id);

    if (profileError) {
      throw new Error('Profile details could not be saved. Ask an administrator to apply the profile-update migration.');
    }

    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        full_name: cleanFullName,
        department: cleanDepartment || 'Land Acquisition Department',
        designation: cleanDesignation || 'User',
      },
    });

    if (metadataError) {
      console.warn('Profile metadata could not be synchronized:', metadataError);
    }

    const updatedUser: User = {
      ...currentUser,
      name: cleanFullName,
      department: cleanDepartment || 'Land Acquisition Department',
      designation: cleanDesignation || 'User',
    };
    setCurrentUser(updatedUser);
    return updatedUser;
  };

  const requestPasswordReset = async (email: string) => {
    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) throw new Error('Enter a valid email address first.');

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(getAuthErrorMessage(error, 'password-reset'));
  };

  const updatePassword = async (password: string) => {
    if (!passwordMeetsRequirements(password)) {
      throw new Error('Choose a password that meets all security requirements.');
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(getAuthErrorMessage(error, 'password-reset'));
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      throw error;
    }

    sessionVersion.current += 1;
    setCurrentUser(null);
    setAccessModeState('VIEWER');
    persistAccessMode('VIEWER');
  };

  const hasPermission = (requiredRoles: UserRole[]) => {
    if (!accessRole) return false;

    return requiredRoles.includes(accessRole);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        user: currentUser,
        accessMode,
        accessRole,
        canManage,
        setAccessMode,
        login,
        register,
        updateProfile,
        requestPasswordReset,
        updatePassword,
        logout,
        isAuthenticated: !!currentUser,
        hasPermission,
        isOfficer: currentUser?.role === UserRole.GOVERNMENT_OFFICER,
        editScopeFor: (project) => getProjectEditScope(currentUser, project),
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}