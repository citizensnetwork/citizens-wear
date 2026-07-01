import type { User } from '@supabase/supabase-js';
import type { ConnectSession, ConnectUser } from '@citizens-wear/connect-client';
import { createServerSupabaseClient } from './supabase/server';

/**
 * Phase 3 authentication — the shared Citizens Supabase Auth (ADR-0007).
 *
 * Identity is the shared `auth.users` row (Google OAuth), the same one Connect
 * and Vision use — one Kingdom identity across every channel. This replaces the
 * Phase-2 `cw_session` mock-token cookie verified via `connect-client.auth`.
 *
 * Server code should only ever call `getSession()` / `getCurrentUser()` from
 * this module. Both resolve the Supabase user (validated against the auth
 * server via `getUser()`), mapped to the `ConnectUser` shape the rest of the
 * app already programs against. An unauthenticated caller — including one where
 * Supabase env is unset — resolves to `null`; callers handle that explicitly.
 */

export interface WearSession {
  readonly session: ConnectSession;
  readonly user: ConnectUser;
}

const HANDLE_SANITISE = /[^a-z0-9_]/g;

/**
 * Derive a stable display handle from the auth user. Google OAuth has no
 * handle, so we use the email local-part (sanitised), then any provider
 * username, then a deterministic `user_<id-prefix>`. This is display-only in
 * this layer; the persisted, unique `wear.users.handle` is assigned when the
 * mirror is hydrated (store wiring).
 */
function deriveHandle(user: User): string {
  const meta = user.user_metadata ?? {};
  const candidate =
    (typeof meta.user_name === 'string' && meta.user_name) ||
    (typeof meta.preferred_username === 'string' && meta.preferred_username) ||
    (user.email ? user.email.split('@')[0] : '') ||
    '';
  const cleaned = candidate.toLowerCase().replace(HANDLE_SANITISE, '');
  return cleaned || `user_${user.id.slice(0, 8)}`;
}

/**
 * Display identity (handle preference + name + avatar) from a validated auth
 * user. Shared with the `/api/*` route context so `POST /api/me/hydrate` can
 * write the `wear.users` mirror from the same derivation the session uses.
 */
export function identityFromAuthUser(user: User): {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
} {
  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (user.email ? user.email.split('@')[0] : '') ||
    deriveHandle(user);
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return { handle: deriveHandle(user), displayName, avatarUrl };
}

function toConnectUser(user: User): ConnectUser {
  const identity = identityFromAuthUser(user);
  return {
    id: user.id,
    handle: identity.handle,
    displayName: identity.displayName,
    email: user.email ?? null,
    avatarUrl: identity.avatarUrl,
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

/** Resolve the current session, or `null` if the caller is anonymous. */
export async function getSession(): Promise<WearSession | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const nowIso = new Date().toISOString();
    const connectSession: ConnectSession = {
      userId: user.id,
      issuedAt: user.last_sign_in_at ?? user.created_at ?? nowIso,
      expiresAt: session?.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : nowIso,
      scopes: ['authenticated'],
    };

    return { session: connectSession, user: toConnectUser(user) };
  } catch {
    // Missing env or a transient auth error → treat as anonymous so public
    // pages still render.
    return null;
  }
}

/** Convenience accessor for the current user, or `null`. */
export async function getCurrentUser(): Promise<ConnectUser | null> {
  return (await getSession())?.user ?? null;
}

/** Sign the current user out of the shared Supabase Auth session. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Best-effort: if Supabase is unconfigured there is no session to clear.
  }
}
