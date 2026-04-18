import type { Metadata } from 'next';
import Link from 'next/link';
import type { FeedPage } from '@citizens-wear/db';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { featureFlags } from '@/lib/flags';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';
import { StoryTray } from '@/lib/story-tray';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feed — Citizens Wear',
};

type FeedMode = 'chronological' | 'for-you';

interface SearchParams {
  readonly searchParams?: Promise<{ readonly mode?: string }>;
}

export default async function FeedPage({ searchParams }: SearchParams) {
  const resolved = (await searchParams) ?? {};
  const forYouEnabled = featureFlags.forYouRanker();
  const mode: FeedMode = resolved.mode === 'for-you' && forYouEnabled ? 'for-you' : 'chronological';

  const session = await getSession();
  const store = getWearStore();
  const client = getConnectClient();

  let feed: FeedPage;
  if (session) {
    feed =
      mode === 'for-you'
        ? await store.posts.feedForYou(session.user.id, { limit: 20 })
        : await store.posts.feedChronological(session.user.id, { limit: 20 });
  } else {
    // Anonymous viewers see a read-only chronological preview of the
    // fixture authors so the feed isn't empty before sign-in.
    feed = await store.posts.feedChronological('usr_001', { limit: 20 });
  }

  const enriched = await Promise.all(
    feed.items.map(async (entry) => {
      const [author, brand, likeCount, commentCount, isLiked, isSaved] = await Promise.all([
        client.users.getById(entry.post.authorId),
        entry.post.brandId ? client.brands.getById(entry.post.brandId) : Promise.resolve(null),
        store.likes.postLikeCount(entry.post.id),
        store.comments.commentsForPostCount(entry.post.id),
        session ? store.likes.isPostLiked(entry.post.id, session.user.id) : Promise.resolve(false),
        session ? store.saves.isSaved(session.user.id, entry.post.id) : Promise.resolve(false),
      ]);
      return { entry, author, brand, likeCount, commentCount, isLiked, isSaved };
    }),
  );

  // Stories tray — uses the viewer's id when signed in, otherwise the
  // public seed identity, mirroring the feed fallback above.
  const trayViewerId = session?.user.id ?? 'usr_001';
  const tray = await store.stories.trayForViewer(trayViewerId);
  const trayEntries = await Promise.all(
    tray.map(async (entry) => ({
      tray: entry,
      author: await client.users.getById(entry.authorId),
    })),
  );

  return (
    <PageShell session={session}>
      <section className="my-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Feed</h1>
          {session ? (
            <Link
              href="/compose"
              className="rounded-md bg-ink px-3 py-1 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              New post
            </Link>
          ) : null}
        </div>

        {forYouEnabled ? (
          <nav aria-label="Feed mode" className="mt-4 flex gap-2 text-sm">
            <Link
              href="/feed"
              aria-current={mode === 'chronological' ? 'page' : undefined}
              className={
                mode === 'chronological'
                  ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                  : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
              }
            >
              Chronological
            </Link>
            <Link
              href={{ pathname: '/feed', query: { mode: 'for-you' } }}
              aria-current={mode === 'for-you' ? 'page' : undefined}
              className={
                mode === 'for-you'
                  ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                  : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
              }
            >
              For You
            </Link>
          </nav>
        ) : null}

        <div className="mt-6">
          <StoryTray
            entries={trayEntries}
            viewerSignedIn={!!session}
            viewerHandle={session?.user.handle ?? null}
            viewerId={session?.user.id ?? null}
          />
        </div>

        {enriched.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">
            No posts yet. Follow a citizen or brand to see their posts here.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {enriched.map(({ entry, author, brand, likeCount, commentCount, isLiked, isSaved }) => (
              <li key={entry.post.id}>
                <PostCard
                  entry={entry}
                  author={author}
                  brand={brand}
                  likeCount={likeCount}
                  commentCount={commentCount}
                  isLiked={isLiked}
                  isSaved={isSaved}
                  viewerSignedIn={!!session}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
