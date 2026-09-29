import { supabase } from '@/lib/supabase';
import { isAuthRateLimitError, isDuplicateEmailError } from '@/utils/auth-errors';
import { isValidEmail } from '@/utils/password';
import type { UserRole } from '@/types';
import type { OfficerLevel } from '@/context/auth-context';

export type IdentifierKind = 'officer' | 'manager';

export interface EmailOtpResult {
  sent: boolean;
  message: string;
}

export interface IdentifierCheckResult {
  available: boolean;
  /**
   * True when the register lookup could not run, for example because the
   * supporting database migration has not been applied yet. The applicant can
   * still continue; the identifier is re-checked during administrator review.
   */
  pending: boolean;
  message: string;
}

/** Everything captured during the registration wizard. */
export interface RegistrationDetails {
  fullName: string;
  requestedRole: UserRole;
  officerId?: string;
  managerId?: string;
  stateCode?: string;
  district?: string;
  profession?: string;
  officerLevel?: OfficerLevel;
  assignedProjectId?: string;
}

function friendlyEmailError(error: unknown): string {
  if (isAuthRateLimitError(error)) {
    return 'Too many verification emails were requested. Wait a few minutes and try again.';
  }
  return error instanceof Error ? error.message : 'Could not send the verification email.';
}

/**
 * Starts email verification for a new applicant.
 *
 * `shouldCreateUser: true` provisions the Supabase auth user so the emailed
 * code has something to verify against. The account still receives read-only
 * Viewer access: the signup trigger in the database migration always writes
 * `role = 'VIEWER'`, and an administrator promotes the profile later.
 */
export async function startEmailVerification(
  email: string,
  details: RegistrationDetails,
): Promise<EmailOtpResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    return { sent: false, message: 'Please enter a valid email address.' };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}/login`,
      data: {
        full_name: details.fullName.trim(),
        department: details.district?.trim() || 'Land Acquisition Department',
        designation: details.profession?.trim() || null,
        // Recorded as a request only. The signup trigger ignores user metadata
        // for role assignment, so the profile still starts as VIEWER.
        requested_role: details.requestedRole,
        requested_role_id: details.officerId?.trim() || details.managerId?.trim() || null,
        officer_id: details.officerId?.trim() || null,
        manager_id: details.managerId?.trim() || null,
        state_code: details.stateCode || null,
        district: details.district?.trim() || null,
        profession: details.profession?.trim() || null,
        officer_level: details.officerLevel || null,
        assigned_project_id: details.assignedProjectId || null,
      },
    },
  });

  if (error) {
    if (isDuplicateEmailError(error) || /already registered|already been registered/i.test(error.message)) {
      return {
        sent: false,
        message: 'An account already exists for this email address. Use Existing Account to sign in.',
      };
    }
    // Supabase refuses to send to a domain that is not on the project's
    // allow list. Spell that out instead of showing the raw driver message.
    if (/is invalid|invalid email|Email address .* is not valid/i.test(error.message)) {
      return {
        sent: false,
        message: 'Supabase cannot send to this email domain yet. Use your official government or organisation address, or ask an administrator to allow the domain in Authentication → Sign in / Providers.',
      };
    }
    return { sent: false, message: friendlyEmailError(error) };
  }

  return {
    sent: true,
    message: `A 6-digit code was sent to ${cleanEmail}. Enter it below to continue.`,
  };
}

/** Confirms the emailed code. Only a matching code advances the flow. */
export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ verified: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();

  if (!/^\d{6}$/.test(cleanToken)) {
    return { verified: false, message: 'Enter the 6-digit code from your email.' };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'email',
  });

  if (error) {
    if (isAuthRateLimitError(error)) {
      return { verified: false, message: friendlyEmailError(error) };
    }
    return { verified: false, message: 'That code did not match. Check the email and try again.' };
  }

  return { verified: true, message: 'Email address verified.' };
}

/**
 * Sets the password on the account that was created during email
 * verification. The verified session is what authorises this change, so no
 * second signup call is needed.
 */
export async function finalizeRegistration(password: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (isAuthRateLimitError(error)) {
      return { ok: false, message: 'Too many attempts. Wait a moment and try again.' };
    }
    return { ok: false, message: 'Could not set the password. Please try again.' };
  }

  if (!data.user) {
    return { ok: false, message: 'Could not set the password. Please try again.' };
  }

  return { ok: true, message: 'Password set.' };
}

/**
 * Checks whether an officer or manager identifier is already recorded in
 * Supabase. A plain PostgREST lookup is not possible because profile rows are
 * protected by row-level security, so the database exposes a dedicated
 * security-definer helper (see the staged-registration migration).
 */
export async function checkIdentifierAvailability(
  kind: IdentifierKind,
  identifier: string,
): Promise<IdentifierCheckResult> {
  const clean = identifier.trim();
  if (!clean) {
    return { available: false, pending: false, message: 'Enter an identifier to verify.' };
  }

  const { data, error } = await supabase.rpc('check_landguard_identifier', {
    p_kind: kind,
    p_identifier: clean,
  });

  const label = kind === 'officer' ? 'Officer ID' : 'Manager ID';

  if (error) {
    // The register-lookup helper ships in a database migration. Until it is
    // applied the check cannot run, so the request is allowed through and the
    // identifier is validated during administrator review instead.
    const isMissingHelper =
      error.code === 'PGRST202' || /function .* does not exist|schema cache/i.test(error.message);

    return {
      available: !isMissingHelper,
      pending: isMissingHelper,
      message: isMissingHelper
        ? `${label} lookup is not available yet, so this will be confirmed when an administrator reviews your request.`
        : 'Could not verify the identifier right now. Please try again.',
    };
  }

  const taken = data === true;

  return taken
    ? { available: false, pending: false, message: `${label} is already registered. Use a different identifier.` }
    : { available: true, pending: false, message: `${label} is not registered yet, so you can create the account.` };
}
