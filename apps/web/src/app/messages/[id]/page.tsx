import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import {
  acceptMessageRequest,
  declineMessageRequest,
  deleteOwnMessage,
  markConversationRead,
  sendMessage,
} from '@/lib/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conversation — Citizens Wear',
};

interface Params {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function ConversationPage({ params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const store = getWearStore();
  const client = getConnectClient();
  const conv = await store.conversations.getById(id, session.user.id);
  if (!conv) notFound();
  const me = await store.conversations.membership(id, session.user.id);
  if (!me) notFound();

  const members = await store.conversations.listMembers(id);
  const otherMembers = members.filter((m) => m.userId !== session.user.id);
  const otherUsers = (
    await Promise.all(otherMembers.map((m) => client.users.getById(m.userId)))
  ).filter((u): u is NonNullable<typeof u> => !!u);
  const messages = await store.messages.list(id, session.user.id, { limit: 100 });

  // Mark messages read on first paint. We do it server-side by calling the
  // store directly; the realtime fan-out happens via the form action when
  // the user later interacts (this avoids publishing on every refresh).
  await store.conversations.markRead(id, session.user.id);

  const isPending = me.requestState === 'requested';

  return (
    <PageShell session={session}>
      <section className="my-10">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">
              {conv.kind === 'group'
                ? (conv.name ?? otherUsers.map((u) => `@${u.handle}`).join(', '))
                : (otherUsers[0]?.displayName ?? 'Direct message')}
            </h1>
            <p className="text-xs text-ink-soft">
              {conv.kind === 'group'
                ? `${members.length} members`
                : `with @${otherUsers[0]?.handle ?? 'unknown'}`}
            </p>
          </div>
          <Link
            href="/messages"
            className="text-xs text-ink-soft underline decoration-gold underline-offset-2 hover:text-ink"
          >
            ← Inbox
          </Link>
        </header>

        {isPending ? (
          <div className="mt-6 rounded-md border border-border bg-paper-soft p-3 text-sm text-ink">
            <p>
              This is a message request from{' '}
              <span className="font-medium">@{otherUsers[0]?.handle ?? 'unknown'}</span>.
            </p>
            <div className="mt-3 flex gap-2">
              <form action={acceptMessageRequest}>
                <input type="hidden" name="conversationId" value={id} />
                <button
                  type="submit"
                  className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-paper hover:bg-ink-soft"
                >
                  Accept
                </button>
              </form>
              <form action={declineMessageRequest}>
                <input type="hidden" name="conversationId" value={id} />
                <button
                  type="submit"
                  className="rounded-md border border-border bg-paper px-3 py-1 text-xs text-ink hover:border-gold"
                >
                  Decline
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <ol className="mt-6 flex flex-col gap-3" aria-live="polite">
          {messages.items.length === 0 ? (
            <li className="text-sm text-ink-soft">No messages yet — say hello.</li>
          ) : null}
          {messages.items.map((m) => {
            const isMe = m.authorId === session.user.id;
            const author = otherUsers.find((u) => u.id === m.authorId);
            return (
              <li key={m.id} className={isMe ? 'self-end text-right' : 'self-start text-left'}>
                <div
                  className={
                    isMe
                      ? 'inline-block max-w-md rounded-md bg-ink px-3 py-2 text-sm text-paper'
                      : 'inline-block max-w-md rounded-md border border-border bg-paper-soft px-3 py-2 text-sm text-ink'
                  }
                >
                  {!isMe && conv.kind === 'group' ? (
                    <p className="text-xs text-ink-soft">@{author?.handle ?? m.authorId}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap">
                    {m.deletedAt ? <em className="text-ink-soft">(message deleted)</em> : m.body}
                  </p>
                </div>
                <div
                  className={`mt-1 flex gap-2 text-[10px] text-ink-soft ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString()}</time>
                  {isMe && !m.deletedAt ? (
                    <form action={deleteOwnMessage}>
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="conversationId" value={id} />
                      <button type="submit" className="hover:text-ink">
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {!isPending ? (
          <>
            <form action={sendMessage} className="mt-6 flex flex-col gap-2">
              <input type="hidden" name="conversationId" value={id} />
              <label htmlFor="msg-body" className="sr-only">
                Message
              </label>
              <textarea
                id="msg-body"
                name="body"
                rows={2}
                required
                maxLength={4000}
                placeholder="Write a message…"
                className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
              />
              <button
                type="submit"
                className="self-start rounded-md bg-ink px-3 py-1 text-sm font-medium text-paper hover:bg-ink-soft"
              >
                Send
              </button>
            </form>
            <form action={markConversationRead} className="mt-2">
              <input type="hidden" name="conversationId" value={id} />
              <button
                type="submit"
                className="rounded-md border border-border bg-paper px-3 py-1 text-xs text-ink hover:border-gold"
              >
                Mark read
              </button>
            </form>
          </>
        ) : null}
      </section>
    </PageShell>
  );
}
