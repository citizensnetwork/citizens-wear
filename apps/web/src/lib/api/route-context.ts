import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { WearStore } from '@citizens-wear/db';
import { WearStoreError } from '@citizens-wear/db';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createWearServerClient } from '@/lib/supabase/server';
import { createSupabaseWearStore } from '@/lib/supabase-wear-store';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';

/**
 * Request context for the Wear `/api/*` surface — the contract the standalone
 * HTML frontend (and any cross-origin client) consumes.
 *
 * Auth is resolved from **either** an `Authorization: Bearer <access_token>`
 * header **or** the Supabase auth cookies, in that order. The Bearer path is
 * the one the static HTML app uses: it holds the session in `localStorage`
 * (cross-origin), so cookie middleware sees nothing and the token must travel
 * in the header (the lesson Connect learned — memory
 * `static-frontend-cross-origin-auth`). Either way the resulting `store` is a
 * `SupabaseWearStore` bound to a `wear`-scoped client **authenticated as that
 * user**, so RLS is the wall (SHARED_DB_CONTRACT R3).
 *
 * With no Supabase env (local dev / tests / preview) it degrades to the seeded
 * in-memory store, resolving the user from the cookie session if present.
 */
export interface RouteContext {
  readonly store: WearStore;
  /** The authenticated user's id, or `null` for an anonymous caller. */
  readonly userId: string | null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export async function getRouteContext(req: Request): Promise<RouteContext> {
  const env = getSupabaseEnv();
  if (!env) {
    // Dev/test/preview: seeded in-memory store; user (if any) via cookie.
    const session = await getSession();
    return { store: getWearStore(), userId: session?.user.id ?? null };
  }

  const token = bearerToken(req);
  if (token) {
    // Cross-origin HTML app: validate the token and run every query as its
    // owner. `persistSession/autoRefreshToken` off — this client is per-request.
    const client = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'wear' },
    });
    const {
      data: { user },
    } = await client.auth.getUser(token);
    return {
      store: createSupabaseWearStore(client as unknown as SupabaseClient),
      userId: user?.id ?? null,
    };
  }

  // Same-origin (cookies): the wear-scoped server client already carries them.
  const client = await createWearServerClient();
  const session = await getSession();
  return { store: createSupabaseWearStore(client), userId: session?.user.id ?? null };
}

/** Thrown by route handlers to short-circuit with a specific HTTP status. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Assert a signed-in caller, returning their id (or throw 401). */
export function requireUserId(ctx: RouteContext): string {
  if (!ctx.userId) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  return ctx.userId;
}

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  const responseInit = typeof init === 'number' ? { status: init } : init;
  return NextResponse.json(data as object, responseInit);
}

/** Map a thrown error to a JSON error response with a sensible status. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof WearStoreError) {
    const status = STORE_ERROR_STATUS[error.code] ?? 400;
    return json({ error: error.code, message: error.message }, status);
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  return json({ error: 'internal_error', message }, 500);
}

/**
 * Wrap an async route handler so thrown `ApiError`/`WearStoreError`/unknowns
 * become clean JSON responses. Keeps each handler focused on the happy path.
 */
export function handler(
  fn: (req: Request, ctx: RouteContext, params: RouteParams) => Promise<NextResponse>,
): (req: Request, route: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req, route) => {
    try {
      const ctx = await getRouteContext(req);
      const params = route?.params ? await route.params : {};
      return await fn(req, ctx, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export type RouteParams = Record<string, string>;

/** Map store error codes to HTTP statuses (default 400). */
const STORE_ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  self_dm: 400,
  self_follow: 400,
  self_block: 400,
  post_not_found: 404,
  comment_not_found: 404,
  story_not_found: 404,
  brand_not_found: 404,
  conversation_not_found: 404,
  collection_not_found: 404,
  highlight_not_found: 404,
  not_a_member: 403,
  request_pending: 409,
  slug_taken: 409,
  invalid_cursor: 400,
  empty_post: 422,
  empty_comment: 422,
  empty_message: 422,
  empty_story: 422,
  empty_group_name: 422,
  group_too_small: 422,
};
