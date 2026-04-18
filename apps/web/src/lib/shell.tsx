import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import type { WearSession } from './session';

/**
 * Shared page chrome (logo, nav, footer). Kept here so profile/settings pages
 * and the landing page stay visually aligned without extracting a client
 * component — everything here is server-rendered.
 */
export function PageShell({
  session,
  children,
}: {
  session: WearSession | null;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <CrownMark className="h-7 w-9 text-gold" />
          <span className="cw-wordmark text-xl">
            Citizens <span className="cw-wordmark-accent">Wear</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-ink-soft">
          <Link href="/feed" className="hover:text-ink">
            Feed
          </Link>
          <Link
            href="/api/connect/status"
            className="underline decoration-gold decoration-1 underline-offset-4 hover:text-ink"
          >
            Connect status
          </Link>
          {session ? (
            <>
              <Link
                href={{ pathname: '/u/[handle]', query: { handle: session.user.handle } }}
                className="hover:text-ink"
              >
                @{session.user.handle}
              </Link>
              <Link href="/settings" className="hover:text-ink">
                Settings
              </Link>
            </>
          ) : (
            <Link href="/sign-in" className="hover:text-ink">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border pt-6 text-xs text-ink-soft">
        © {new Date().getFullYear()} Citizens Network · Citizens Wear is built on the Citizens
        Connect contract.
      </footer>
    </main>
  );
}
