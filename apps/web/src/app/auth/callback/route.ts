import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * OAuth code-exchange callback for the shared Supabase Auth (ADR-0007).
 *
 * Google redirects here with a `?code=`; we exchange it for a session (which
 * sets the auth cookies) and redirect on. The Supabase Auth URL allow-list must
 * include this route's origin (deploy gate — STEP3 scope §5 Q3).
 *
 * Security:
 *   - `next` is path-only; it must start with a single `/` to block open
 *     redirects to third-party hosts.
 *   - The code and any resulting tokens are never logged or echoed.
 */
function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = sanitizeNext(url.searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url));
    }
  }

  return NextResponse.redirect(new URL('/sign-in?error=auth', url));
}
