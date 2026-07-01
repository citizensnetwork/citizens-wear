import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Keeps the Supabase auth session fresh on every request. See
 * `lib/supabase/middleware.ts`. The matcher skips Next.js internals and static
 * assets so we only refresh on real navigations / data requests.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
