import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
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
export async function createServerSupabaseClient(options?: { readonly schema?: string }) {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    ...(options?.schema ? { db: { schema: options.schema } } : {}),
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

/**
 * Request-scoped client bound to the **`wear`** Postgres schema — the client
 * the `SupabaseWearStore` runs every query through. It still carries the
 * caller's auth cookies, so RLS is enforced as the signed-in user
 * (SHARED_DB_CONTRACT R3). `db.schema='wear'` requires `wear` to be in the
 * project's PostgREST "Exposed schemas" (founder gate — done 2026-07-01).
 */
export async function createWearServerClient(): Promise<SupabaseClient> {
  // Cast the schema-typed client back to the bare `SupabaseClient` (as Vision
  // does for `vision`) — with no generated DB types every query is untyped
  // `any` anyway, and this keeps the store's schema-agnostic plumbing simple.
  const client = await createServerSupabaseClient({ schema: 'wear' });
  return client as unknown as SupabaseClient;
}
