import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import { getSession, signOut } from '@/lib/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSupabaseEnv } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Sign in — Citizens Wear',
};

async function resolveOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const hdrs = await headers();
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

async function signInWithGoogle(): Promise<void> {
  'use server';
  const supabase = await createServerSupabaseClient();
  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) {
    redirect('/sign-in?error=oauth');
  }
  redirect(data.url);
}

async function signOutAction(): Promise<void> {
  'use server';
  await signOut();
  redirect('/sign-in');
}

export default async function SignInPage() {
  const current = await getSession();
  const configured = getSupabaseEnv() !== null;

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
        Citizens Wear uses your Citizens account — one Kingdom identity across Connect, Vision, and
        Wear. Sign in with Google to continue.
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
      ) : configured ? (
        <form action={signInWithGoogle} className="mt-8 flex flex-col gap-3">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Continue with Google
          </button>
          <p className="text-xs text-ink-soft">
            You’ll be redirected to Google, then back to Citizens Wear.
          </p>
        </form>
      ) : (
        <section className="mt-8 rounded-md border border-border bg-paper-soft p-4">
          <p className="text-sm text-ink-soft">
            Sign-in is temporarily unavailable — the Supabase environment is not configured on this
            deployment.
          </p>
        </section>
      )}
    </main>
  );
}
