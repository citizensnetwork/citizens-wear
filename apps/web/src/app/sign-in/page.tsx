import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import {
  MOCK_SIGN_IN_TOKEN,
  clearSessionCookie,
  getSession,
  writeSessionCookie,
} from '@/lib/session';
import { getConnectClient } from '@/lib/connect';

export const metadata: Metadata = {
  title: 'Sign in — Citizens Wear',
};

async function signInAction(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token') ?? '').trim();
  if (!token) return;
  const client = getConnectClient();
  try {
    const session = await client.auth.verifyToken(token);
    const user = await client.auth.getCurrentUser(session);
    if (!user) return;
  } catch {
    return;
  }
  await writeSessionCookie(token);
  redirect('/');
}

async function signOutAction(): Promise<void> {
  'use server';
  await clearSessionCookie();
  redirect('/sign-in');
}

export default async function SignInPage() {
  const current = await getSession();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 flex items-center gap-3">
        <CrownMark className="h-7 w-9 text-gold" />
        <span className="cw-wordmark text-xl">
          Citizens <span className="cw-wordmark-accent">Wear</span>
        </span>
      </header>
      <h1 className="font-display text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Phase 2 uses a mock Citizens Connect token. Paste the fixture token below, or use the
        pre-filled value, to sign in as <span className="font-medium text-ink">@hannah</span>.
      </p>

      {current ? (
        <section className="mt-8 rounded-md border border-border bg-paper-soft p-4">
          <p className="text-sm">
            Signed in as <span className="font-medium text-ink">@{current.user.handle}</span>.
          </p>
          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-border bg-paper px-3 py-1 text-sm hover:bg-paper-soft"
            >
              Sign out
            </button>
          </form>
          <p className="mt-3 text-xs text-ink-soft">
            <Link href="/" className="underline decoration-gold underline-offset-2">
              Back to home
            </Link>
          </p>
        </section>
      ) : (
        <form action={signInAction} className="mt-8 flex flex-col gap-3">
          <label htmlFor="token" className="text-sm font-medium text-ink">
            Connect token
          </label>
          <input
            id="token"
            name="token"
            type="text"
            defaultValue={MOCK_SIGN_IN_TOKEN}
            className="rounded-md border border-border bg-paper px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
            aria-describedby="token-help"
          />
          <p id="token-help" className="text-xs text-ink-soft">
            In Phase 3 this form is replaced by a Connect OIDC redirect.
          </p>
          <button
            type="submit"
            className="mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Sign in
          </button>
        </form>
      )}
    </main>
  );
}
