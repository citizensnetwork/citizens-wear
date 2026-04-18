import { cookies } from 'next/headers';
import type { ConnectSession, ConnectUser } from '@citizens-wear/connect-client';
import { FIXTURE_VALID_TOKEN } from '@citizens-wear/connect-client';
import { getConnectClient } from './connect';

/**
 * Phase 2 authentication — cookie-backed session bridged to Citizens Connect.
 *
 * Design:
 *   - The browser holds a single `cw_session` cookie whose value is an opaque
 *     Connect-issued token. Wear never looks at the token — it hands it to
 *     the `AuthProvider` (currently `MockConnectClient.auth`) to verify.
 *   - The same shape will accept an Auth.js/NextAuth-managed token in Phase
 *     3 once the real OIDC flow is wired. Server code should only ever call
 *     `getSession()` / `getCurrentUser()` from this module.
 *
 * Security notes:
 *   - Cookie is HttpOnly, SameSite=Lax, Secure in production.
 *   - The cookie is never read on the client; all session reads go through
 *     server components / route handlers.
 *   - An invalid or expired token resolves to `null` — callers must handle
 *     unauthenticated access explicitly.
 */

export const SESSION_COOKIE = 'cw_session';

export interface WearSession {
  readonly session: ConnectSession;
  readonly user: ConnectUser;
}

/** Resolve the current session, or `null` if the caller is anonymous. */
export async function getSession(): Promise<WearSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const client = getConnectClient();
  try {
    const session = await client.auth.verifyToken(token);
    const user = await client.auth.getCurrentUser(session);
    if (!user) return null;
    return { session, user };
  } catch {
    return null;
  }
}

/** Set the session cookie. Called from the `/sign-in` action. */
export async function writeSessionCookie(token: string): Promise<void> {
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Mirrors the mock session lifetime; in Phase 3 we read `expiresAt` from
    // the verified session.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The token the mock Connect client accepts. Only used by the Phase 2
 * sign-in flow; Phase 3 replaces this with an OIDC redirect.
 */
export const MOCK_SIGN_IN_TOKEN = FIXTURE_VALID_TOKEN;
