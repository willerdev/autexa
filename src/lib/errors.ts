export function getErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  const e = error as { name?: string; message?: string; error_description?: string };
  if (e.name === 'AbortError') {
    return 'The request took too long and was cancelled. Try again with a shorter message.';
  }
  if (e.message) return e.message;
  if (typeof e.error_description === 'string') return e.error_description;
  return 'Something went wrong. Please try again.';
}

/** Maps Supabase / fetch failures to short, user-safe copy (no stack traces). */
export function getAuthActionErrorMessage(error: unknown, fallback: string): string {
  const raw = getErrorMessage(error).toLowerCase();
  if (raw.includes('network request failed') || raw.includes('failed to fetch') || raw.includes('network error')) {
    return 'No internet connection or the server could not be reached. Check your network and try again.';
  }
  if (raw.includes('invalid login credentials') || raw.includes('invalid_credentials')) {
    return 'Email or password is incorrect.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  const msg = getErrorMessage(error);
  if (msg && msg !== 'Something went wrong.' && msg !== 'Something went wrong. Please try again.') {
    return msg;
  }
  return fallback;
}
