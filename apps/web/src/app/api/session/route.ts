import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Lightweight session probe. Mirrors what a NextAuth `/api/auth/session`
 * endpoint would return once Phase 3 wires the real OIDC flow.
 */
export async function GET() {
  const wear = await getSession();
  if (!wear) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: wear.user.id,
      handle: wear.user.handle,
      displayName: wear.user.displayName,
    },
    session: {
      issuedAt: wear.session.issuedAt,
      expiresAt: wear.session.expiresAt,
      scopes: wear.session.scopes,
    },
  });
}
