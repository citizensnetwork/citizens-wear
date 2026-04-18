import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: Promise<{ readonly handle: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle} — activity — Citizens Wear` };
}

export default async function ActivityPage({ params }: Params) {
  const { handle } = await params;
  const client = getConnectClient();
  const store = getWearStore();
  const session = await getSession();

  const user = await client.users.getByHandle(handle);
  if (!user) notFound();

  const [posts, likes, commentList, collections] = await Promise.all([
    store.posts.listByAuthor(user.id, { limit: 20 }),
    store.likes.postsLikedBy(user.id),
    store.comments.authoredBy(user.id),
    store.saves.listForOwner(user.id),
  ]);

  return (
    <PageShell session={session}>
      <section className="my-10">
        <h1 className="font-display text-3xl">
          Activity for{' '}
          <Link
            href={{ pathname: '/u/[handle]', query: { handle: user.handle } }}
            className="underline decoration-gold underline-offset-2 hover:text-ink-soft"
          >
            @{user.handle}
          </Link>
        </h1>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">
              Posts · {posts.items.length}
            </h2>
            {posts.items.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No posts yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {posts.items.map(({ post }) => (
                  <li key={post.id}>
                    <Link
                      href={{ pathname: '/p/[id]', query: { id: post.id } }}
                      className="rounded-md border border-border bg-paper-soft px-3 py-2 block hover:border-gold"
                    >
                      <span className="line-clamp-2 text-ink">{post.body}</span>
                      <time dateTime={post.createdAt} className="mt-1 block text-xs text-ink-soft">
                        {new Date(post.createdAt).toLocaleDateString()}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">
              Likes · {likes.length}
            </h2>
            {likes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No liked posts yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {likes.slice(0, 20).map((l) => (
                  <li key={`${l.postId}:${l.userId}`}>
                    <Link
                      href={{ pathname: '/p/[id]', query: { id: l.postId } }}
                      className="rounded-md border border-border bg-paper-soft px-3 py-2 block hover:border-gold"
                    >
                      <span className="text-ink-soft">liked</span>{' '}
                      <span className="font-medium text-ink">{l.postId}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">
              Comments · {commentList.length}
            </h2>
            {commentList.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No comments yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {commentList.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={{ pathname: '/p/[id]', query: { id: c.postId } }}
                      className="rounded-md border border-border bg-paper-soft px-3 py-2 block hover:border-gold"
                    >
                      <span className="line-clamp-2 text-ink">{c.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">
              Saves · {collections.reduce((n, c) => n + c.postIds.length, 0)}
            </h2>
            {collections.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No saved posts yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {collections.flatMap((c) =>
                  c.postIds.map((pid) => (
                    <li key={`${c.id}:${pid}`}>
                      <Link
                        href={{ pathname: '/p/[id]', query: { id: pid } }}
                        className="rounded-md border border-border bg-paper-soft px-3 py-2 block hover:border-gold"
                      >
                        <span className="text-ink-soft">saved in {c.name} ·</span>{' '}
                        <span className="font-medium text-ink">{pid}</span>
                      </Link>
                    </li>
                  )),
                )}
              </ul>
            )}
          </section>
        </div>
      </section>
    </PageShell>
  );
}
