import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

/**
 * Refresh the Supabase auth token on every navigation and propagate the
 * rotated cookies onto the response. Without this, a user's access token
 * expires (~1h) and Server Components see them as signed-out until they
 * re-authenticate.
 *
 * No-ops when Supabase env is absent (local/preview/CI without credentials) so
 * the app still serves public content.
 *
 * IMPORTANT: `getUser()` must run here (it revalidates the token with the auth
 * server) and the returned response object must be the one whose cookies were
 * mutated — do not construct a fresh response afterwards or the refresh is lost.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
