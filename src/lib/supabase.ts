import { createClient } from '@supabase/supabase-js';

/** Trim quotes/whitespace that creep in when values are pasted into a dashboard. */
function readEnv(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
  return trimmed || null;
}

const rawUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const rawAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * A Supabase project URL must be an https origin ("https://<ref>.supabase.co")
 * with no path, query or hash. http://localhost is allowed for `supabase start`.
 */
function parseProjectUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(isLoopback && parsed.protocol === 'http:')) return null;
    if (parsed.search || parsed.hash) return null;
    if (parsed.pathname && parsed.pathname !== '/') return null;
    if (!isLoopback && !parsed.hostname.includes('.')) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export const supabaseUrl = parseProjectUrl(rawUrl) ?? undefined;
export const supabaseAnonKey = rawAnonKey ?? undefined;

/**
 * Human-readable setup problem, or null when the environment is usable.
 * Rendered by the screens instead of a blank page or a raw "Invalid URL" throw.
 */
export const supabaseConfigError: string | null = !rawUrl || !rawAnonKey
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the app.'
  : !supabaseUrl
    ? 'VITE_SUPABASE_URL is not a valid project URL. Use the https origin from Supabase → Project Settings → API, for example https://abcdefghijklmnop.supabase.co (no path, slash, quotes or spaces).'
    : null;

/** True when both public Supabase values are present and valid. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Fall back to placeholders so the app still renders a setup message instead of
// crashing when the environment is missing or malformed. No data request can
// succeed with these values, and requests fail with supabaseConfigError below.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);
