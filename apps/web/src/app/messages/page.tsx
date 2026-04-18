import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Messages — Citizens Wear',
};

interface SearchParams {
  readonly searchParams?: Promise<{ readonly tab?: string }>;
}

export default async function MessagesIndexPage({ searchParams }: SearchParams) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const resolved = (await searchParams) ?? {};
  const tab: 'inbox' | 'requests' = resolved.tab === 'requests' ? 'requests' : 'inbox';

  const store = getWearStore();
  const client = getConnectClient();

  const summaries = await store.conversations.listForUser(session.user.id, {
    requestState: tab === 'requests' ? 'requested' : 'accepted',
  });

  const enriched = await Promise.all(
    summaries.map(async (s) => {
      const others = s.members.filter((m) => m.userId !== session.user.id);
      const otherUsers = await Promise.all(others.map((m) => client.users.getById(m.userId)));
      return { summary: s, otherUsers: otherUsers.filter((u): u is NonNullable<typeof u> => !!u) };
    }),
  );

  const requestCount = (
    await store.conversations.listForUser(session.user.id, { requestState: 'requested' })
  ).length;

  return (
    <PageShell session={session}>
      <section className="my-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Messages</h1>
          <Link
            href="/messages/new"
            className="rounded-md bg-ink px-3 py-1 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            New message
          </Link>
        </div>

        <nav aria-label="Messages tabs" className="mt-4 flex gap-2 text-sm">
          <Link
            href="/messages"
            aria-current={tab === 'inbox' ? 'page' : undefined}
            className={
              tab === 'inbox'
                ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
            }
          >
            Inbox
          </Link>
          <Link
            href={{ pathname: '/messages', query: { tab: 'requests' } }}
            aria-current={tab === 'requests' ? 'page' : undefined}
            className={
              tab === 'requests'
                ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
            }
          >
            Requests {requestCount > 0 ? `(${requestCount})` : ''}
          </Link>
        </nav>

        {enriched.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">
            {tab === 'requests'
              ? 'No message requests right now.'
              : 'No conversations yet — start a new one.'}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {enriched.map(({ summary, otherUsers }) => {
              const title =
                summary.conversation.kind === 'group'
                  ? (summary.conversation.name ?? otherUsers.map((u) => `@${u.handle}`).join(', '))
                  : (otherUsers[0]?.displayName ?? otherUsers[0]?.handle ?? 'Direct message');
              const subtitle =
                summary.conversation.kind === 'group'
                  ? `${otherUsers.length + 1} members`
                  : `@${otherUsers[0]?.handle ?? 'unknown'}`;
              const preview = summary.lastMessage?.deletedAt
                ? '(message deleted)'
                : (summary.lastMessage?.body.slice(0, 80) ?? 'No messages yet.');
              return (
                <li key={summary.conversation.id}>
                  <Link
                    href={{ pathname: '/messages/[id]', query: { id: summary.conversation.id } }}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-paper p-3 hover:border-gold"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{title}</span>
                      <span className="block truncate text-xs text-ink-soft">{subtitle}</span>
                      <span className="mt-1 block truncate text-xs text-ink-soft">{preview}</span>
                    </span>
                    {summary.unreadCount > 0 ? (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-ink">
                        {summary.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
