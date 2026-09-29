export type AuthAction = 'signin' | 'signup' | 'password-reset';

interface AuthErrorDetails {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'email_rate_limit_exceeded',
]);

function getErrorDetails(error: unknown): AuthErrorDetails {
  if (!error || typeof error !== 'object') {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  const details = error as AuthErrorDetails;
  return {
    code: details.code,
    message: details.message,
    status: details.status,
  };
}

export function isAuthRateLimitError(error: unknown): boolean {
  const { code, message, status } = getErrorDetails(error);
  const normalizedCode = code?.trim().toLowerCase();
  const normalizedMessage = message?.trim().toLowerCase() ?? '';

  if (normalizedCode && RATE_LIMIT_CODES.has(normalizedCode)) return true;
  if (status === 429) return true;

  return (
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('rate-limited') ||
    normalizedMessage.includes('too many requests') ||
    normalizedMessage.includes('email limit')
  );
}

export function isDuplicateEmailError(error: unknown): boolean {
  const { code, message } = getErrorDetails(error);
  const normalizedCode = code?.trim().toLowerCase();
  const normalizedMessage = message?.trim().toLowerCase() ?? '';

  return (
    normalizedCode === 'user_already_exists' ||
    normalizedCode === 'email_exists' ||
    normalizedMessage.includes('already been registered') ||
    normalizedMessage.includes('already registered')
  );
}

export function getAuthErrorMessage(error: unknown, action: AuthAction): string {
  if (isAuthRateLimitError(error)) {
    if (action === 'signup') {
      return 'Email confirmation is temporarily rate-limited by Supabase. Wait for the limit to reset, then try Create Account again. If you already created an account, use Existing Account.';
    }
    if (action === 'password-reset') {
      return 'Too many password-reset emails were requested. Please wait a few minutes before trying again.';
    }
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }

  if (action === 'signup' && isDuplicateEmailError(error)) {
    return 'An account with this email already exists. Use Existing Account to sign in.';
  }

  const { message } = getErrorDetails(error);
  return message?.trim() || 'Something went wrong. Please try again.';
}
