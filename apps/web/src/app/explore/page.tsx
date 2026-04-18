import Link from 'next/link';
import type { Metadata } from 'next';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Explore — Citizens Wear',
  description:
    'Discover Christian clothing brands, citizens, fresh drops, and trending Kingdom hashtags on Citizens Wear.',
};

const FRESH_POST_LIMIT = 6;
const FRESH_PRODUCT_LIMIT = 6;
const FEATURED_BRAND_LIMIT = 8;
const SUGGESTED_USER_LIMIT = 8;
const TRENDING_TAG_LIMIT = 8;

export default async function ExplorePage() {
  const session = await getSession();
  const client = getConnectClient();
  const store = getWearStore();

  const viewerId = session?.user.id;

  const [brandsPage, usersPage, freshFeed, trending] = await Promise.all([
    client.brands.listAll({ limit: FEATURED_BRAND_LIMIT }),
    client.users.search('', { limit: SUGGESTED_USER_LIMIT }),
    // Use the session viewer when present so logged-in citizens see the
    // chronological union of follows + self; fall back to a public seed
    // identity for anonymous viewers so the page is never empty.
    store.posts.feedChronological(viewerId ?? 'usr_001', { limit: FRESH_POST_LIMIT }),
    store.posts.trendingHashtags({ limit: TRENDING_TAG_LIMIT }),
  ]);

  // Fresh drops — pick a small parallel sample across brands so the strip
  // is interesting without an N+1 fan-out.
  const freshProducts = (
    await Promise.all(
      brandsPage.items.slice(0, 4).map(async (b) => {
        const page = await client.products.listForBrand(b.id, { limit: 3 });
        return page.items.map((p) => ({ brand: b, product: p }));
      }),
    )
  )
    .flat()
    .slice(0, FRESH_PRODUCT_LIMIT);

  const enriched = await Promise.all(
    freshFeed.items.slice(0, 3).map(async (entry) => {
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

  // Suggested citizens — exclude the viewer from their own suggestions.
  const suggested = usersPage.items.filter((u) => u.id !== viewerId).slice(0, 6);

  return (
    <PageShell session={session}>
      <section className="my-10">
        <h1 className="font-display text-4xl">Explore</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Discover brands, citizens, fresh drops, and what the Kingdom is talking about today.
        </p>

        <form
          role="search"
          action="/search"
          method="get"
          className="mt-6 flex max-w-xl items-center gap-2"
        >
          <label htmlFor="explore-q" className="sr-only">
            Search Citizens Wear
          </label>
          <input
            id="explore-q"
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            maxLength={100}
            placeholder="Search citizens, brands, hashtags, drops…"
            className="flex-1 rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Search
          </button>
        </form>
      </section>

      <section className="my-10">
        <h2 className="text-xs uppercase tracking-wide text-ink-soft">Trending hashtags</h2>
        {trending.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No hashtags yet — start one with #.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {trending.map((t) => (
              <li key={t.tag}>
                <Link
                  href={{ pathname: '/h/[tag]', query: { tag: t.tag } }}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-paper-soft px-3 py-1 text-sm text-ink hover:border-gold"
                >
                  <span className="font-medium">#{t.tag}</span>
                  <span className="text-xs text-ink-soft">{t.postCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="my-10">
        <h2 className="text-xs uppercase tracking-wide text-ink-soft">Featured brands</h2>
        {brandsPage.items.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No brands yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {brandsPage.items.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                  className="flex items-center gap-2 rounded-md border border-border bg-paper-soft px-4 py-3 text-sm hover:border-gold"
                >
                  <span className="font-medium text-ink">{brand.name}</span>
                  {brand.verified ? (
                    <span
                      aria-label="Verified brand"
                      title="Verified brand"
                      className="text-xs text-gold-deep"
                    >
                      ✓
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-ink-soft">@{brand.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="my-10">
        <h2 className="text-xs uppercase tracking-wide text-ink-soft">Suggested citizens</h2>
        {suggested.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No one to suggest yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {suggested.map((u) => (
              <li key={u.id}>
                <Link
                  href={{ pathname: '/u/[handle]', query: { handle: u.handle } }}
                  className="flex items-center gap-2 rounded-md border border-border bg-paper-soft px-4 py-3 text-sm hover:border-gold"
                >
                  <span className="font-medium text-ink">{u.displayName}</span>
                  <span className="ml-auto text-xs text-ink-soft">@{u.handle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="my-10">
        <h2 className="text-xs uppercase tracking-wide text-ink-soft">Fresh drops</h2>
        {freshProducts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No drops yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {freshProducts.map(({ brand, product }) => (
              <li
                key={product.id}
                className="rounded-md border border-border bg-paper-soft px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                    className="font-medium text-ink hover:underline"
                  >
                    {product.title}
                  </Link>
                  <span className="text-ink-soft">
                    {(product.priceCents / 100).toLocaleString(undefined, {
                      style: 'currency',
                      currency: product.currency,
                    })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  by{' '}
                  <Link
                    href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                    className="hover:text-ink"
                  >
                    {brand.name}
                  </Link>{' '}
                  · {product.stockState.replace('_', ' ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {enriched.length > 0 ? (
        <section className="my-10">
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">From the feed</h2>
          <ul className="mt-3 flex flex-col gap-4">
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
        </section>
      ) : null}
    </PageShell>
  );
}
