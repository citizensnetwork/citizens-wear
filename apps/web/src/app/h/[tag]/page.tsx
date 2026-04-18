import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normaliseHashtag } from '@citizens-wear/db';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: { readonly tag: string };
}

const PAGE_LIMIT = 20;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tag = normaliseHashtag(decodeURIComponent(params.tag));
  if (!tag) return { title: 'Hashtag — Citizens Wear' };
  return {
    title: `#${tag} — Citizens Wear`,
    description: `Citizens Wear posts tagged with #${tag}.`,
  };
}

export default async function HashtagPage({ params }: Params) {
  const tag = normaliseHashtag(decodeURIComponent(params.tag));
  if (!tag) notFound();

  const session = await getSession();
  const client = getConnectClient();
  const store = getWearStore();
  const viewerId = session?.user.id;

  const feed = await store.posts.listByHashtag(tag, { limit: PAGE_LIMIT });

  const enriched = await Promise.all(
    feed.items.map(async (entry) => {
      const [author, brand, likeCount, commentCount, isLiked, isSaved] = await Promise.all([
        client.users.getById(entry.post.authorId),
        entry.post.brandId ? client.brands.getById(entry.post.brandId) : Promise.resolve(null),
        store.likes.postLikeCount(entry.post.id),
        store.comments.commentsForPostCount(entry.post.id),
        viewerId ? store.likes.isPostLiked(entry.post.id, viewerId) : Promise.resolve(false),
        viewerId ? store.saves.isSaved(viewerId, entry.post.id) : Promise.resolve(false),
      ]);
      return { entry, author, brand, likeCount, commentCount, isLiked, isSaved };
    }),
  );

  return (
    <PageShell session={session}>
      <section className="my-10">
        <h1 className="font-display text-4xl">
          <span className="text-gold">#</span>
          {tag}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Posts tagged with #{tag}.{' '}
          <Link
            href={{ pathname: '/search', query: { q: `#${tag}`, kind: 'top' } }}
            className="underline decoration-gold underline-offset-2 hover:text-ink"
          >
            See related results →
          </Link>
        </p>

        {enriched.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">No posts yet for #{tag}.</p>
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
