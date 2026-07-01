/**
 * Shared Supabase environment resolution.
 *
 * Citizens Wear authenticates against the **shared** Citizens Supabase project
 * (`xyiajtrvhlxaeplsiajj`) — the same `auth.users` as Connect and Vision
 * (ADR-0007). These are the only two values the client needs; the anon
 * (publishable) key is safe to expose to the browser (RLS is the wall).
 */
export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Resolve the Supabase URL + anon key, or `null` when they are not configured
 * (local dev/test/preview without credentials, or a CI build). Callers that
 * must degrade gracefully to "anonymous" use this and treat `null` as
 * unauthenticated; callers that genuinely require a client use
 * {@link requireSupabaseEnv}.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Like {@link getSupabaseEnv} but throws a clear error when unconfigured. */
export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        '(shared project xyiajtrvhlxaeplsiajj).',
    );
  }
  return env;
}
