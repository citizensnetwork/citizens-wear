import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { startDirectConversation } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'New message — Citizens Wear',
};

export default async function NewMessagePage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  return (
    <PageShell session={session}>
      <section className="my-10 max-w-md">
        <h1 className="font-display text-3xl">New message</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Start a 1:1 conversation by handle. If the recipient doesn&apos;t already follow you, the
          message lands in their requests inbox until they accept.
        </p>

        <form action={startDirectConversation} className="mt-6 flex flex-col gap-3">
          <label htmlFor="dm-handle" className="text-sm font-medium text-ink">
            Recipient handle
          </label>
          <input
            id="dm-handle"
            name="handle"
            type="text"
            required
            maxLength={64}
            placeholder="hannah"
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Start conversation
          </button>
        </form>
      </section>
    </PageShell>
  );
}
