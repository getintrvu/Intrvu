const env = import.meta.env;

export const API_BASE_URL: string = (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? '';

export const MAX_PDF_MB = 4;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
export const MIN_JOB_DESCRIPTION_CHARS = 100;

export const TERMS_URL = 'https://bhavik2209.github.io/Intrvu/';
export const SUPPORT_EMAIL = 'getintrvu@gmail.com';
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScPbR00X61FeowQmDIkfuU4AKMcoGm335DI2UOGHwdYVX2_sA/viewform';

/** Names the settings the build is missing, so a misconfigured build fails loudly in the UI. */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!API_BASE_URL) missing.push('VITE_API_BASE_URL');
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
}
