import { NextResponse } from 'next/server';
import { getConnectClient } from '@/lib/connect';
import { writeSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SSO callback entrypoint for Citizens Connect.
 *
 * Shape matches the Auth.js / NextAuth OIDC callback URL
 * (`/api/auth/callback/<provider>`) so that swapping the in-app sign-in
 * flow for a full Auth.js provider later is a drop-in change.
 *
 * Today it accepts a Connect-issued session token in either the `token`
 * query param (GET — the redirect flow from Connect) or a `token` form
 * field (POST — useful for service-to-service rotation). Upon successful
 * verification we set the `cw_session` cookie and redirect the caller to
 * `/` (or the sanitised `next` param).
 *
 * Security:
 *   - Tokens are never logged or echoed back in responses.
 *   - `verifyToken` is the only parser — Wear does not introspect the token.
 *   - `next` is path-only; it must start with a single `/` to prevent open
 *     redirects to third-party hosts.
 */

function sanitizeNext(next: string | null): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

async function completeSignIn(requestUrl: URL, token: string, next: string): Promise<Response> {
  if (!token) {
    return NextResponse.json({ ok: false, code: 'missing_token' }, { status: 400 });
  }
  const client = getConnectClient();
  try {
    const session = await client.auth.verifyToken(token);
    const user = await client.auth.getCurrentUser(session);
    if (!user) {
      return NextResponse.json({ ok: false, code: 'session_revoked' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_token' }, { status: 401 });
  }
  await writeSessionCookie(token);
  return NextResponse.redirect(new URL(next, requestUrl));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const next = sanitizeNext(url.searchParams.get('next'));
  return completeSignIn(url, token, next);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const token = String(form?.get('token') ?? '').trim();
  const next = sanitizeNext(String(form?.get('next') ?? url.searchParams.get('next') ?? ''));
  return completeSignIn(url, token, next);
}
