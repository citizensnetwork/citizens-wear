import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireSupabaseEnv } from './env';

/**
 * Request-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions.
 *
 * It reads the caller's auth cookies, so every query runs **as the signed-in
 * user** — Row Level Security is enforced automatically (SHARED_DB_CONTRACT
 * R3: RLS is the only isolation wall). Never memoise this across requests: the
 * cookie jar (and therefore the identity) differs per request.
 */
export async function createServerSupabaseClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where the cookie store is
          // read-only. The middleware (updateSession) refreshes the auth
          // token on navigation, so ignoring this is safe.
        }
      },
    },
  });
}
