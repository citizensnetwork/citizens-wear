import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';

export const dynamic = 'force-dynamic';

const TABS = ['drops', 'posts'] as const;
type Tab = (typeof TABS)[number];

interface Params {
  readonly params: { readonly slug: string };
  readonly searchParams?: Promise<{ readonly tab?: string }>;
}

function isTab(value: string | undefined): value is Tab {
  return !!value && (TABS as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const client = getConnectClient();
  const brand = await client.brands.getBySlug(params.slug);
  if (!brand) return { title: 'Not found — Citizens Wear' };
  return {
    title: `${brand.name} — Citizens Wear`,
    description: brand.tagline ?? `Citizens Wear brand page for ${brand.name}.`,
  };
}

export default async function BrandProfilePage({ params, searchParams }: Params) {
  const client = getConnectClient();
  const session = await getSession();
  const store = getWearStore();

  const brand = await client.brands.getBySlug(params.slug);
  if (!brand) notFound();

  const resolved = (await searchParams) ?? {};
  const tab: Tab = isTab(resolved.tab) ? resolved.tab : 'drops';

  const [owner, products, postsPage] = await Promise.all([
    client.users.getById(brand.ownerUserId),
    client.products.listForBrand(brand.id, { limit: 12 }),
    store.posts.listByBrand(brand.id, { limit: 12 }),
  ]);

  const viewerId = session?.user.id;
  const enrichedPosts =
    tab === 'posts'
      ? await Promise.all(
          postsPage.items.map(async (entry) => {
            const [author, likeCount, commentCount, isLiked, isSaved] = await Promise.all([
              client.users.getById(entry.post.authorId),
              store.likes.postLikeCount(entry.post.id),
              store.comments.commentsForPostCount(entry.post.id),
              viewerId ? store.likes.isPostLiked(entry.post.id, viewerId) : Promise.resolve(false),
              viewerId ? store.saves.isSaved(viewerId, entry.post.id) : Promise.resolve(false),
            ]);
            return { entry, author, likeCount, commentCount, isLiked, isSaved };
          }),
        )
      : [];

  return (
    <PageShell session={session}>
      <section className="my-10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-4xl">{brand.name}</h1>
            {brand.verified ? (
              <span
                aria-label="Verified brand"
                title="Verified brand"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-muted text-xs font-semibold text-gold-deep"
              >
                ✓
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-ink-soft">@{brand.slug}</p>
          {brand.tagline ? (
            <p className="mt-4 max-w-xl text-base text-ink">{brand.tagline}</p>
          ) : null}
          {owner ? (
            <p className="mt-2 text-sm text-ink-soft">
              Owned by{' '}
              <Link
                href={{ pathname: '/u/[handle]', query: { handle: owner.handle } }}
                className="underline decoration-gold underline-offset-2 hover:text-ink"
              >
                @{owner.handle}
              </Link>
            </p>
          ) : null}
        </div>

        <nav aria-label="Brand sections" className="mt-8 flex gap-2 text-sm">
          {TABS.map((t) => (
            <Link
              key={t}
              href={
                t === 'drops'
                  ? { pathname: '/b/[slug]', query: { slug: brand.slug } }
                  : { pathname: '/b/[slug]', query: { slug: brand.slug, tab: t } }
              }
              aria-current={t === tab ? 'page' : undefined}
              className={
                t === tab
                  ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                  : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
              }
            >
              {t === 'drops' ? 'Drops' : 'Posts'}
            </Link>
          ))}
        </nav>

        {tab === 'drops' ? (
          <section className="mt-6">
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">Shop</h2>
            {products.items.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No products yet.</p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {products.items.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-border bg-paper-soft px-3 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">{p.title}</span>
                      <span className="text-ink-soft">
                        {(p.priceCents / 100).toLocaleString(undefined, {
                          style: 'currency',
                          currency: p.currency,
                        })}
                      </span>
                    </div>
                    {p.description ? (
                      <p className="mt-1 text-xs text-ink-soft">{p.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-soft">{p.stockState.replace('_', ' ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="mt-6">
            <h2 className="text-xs uppercase tracking-wide text-ink-soft">Posts</h2>
            {enrichedPosts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">{brand.name} hasn’t posted yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-4">
                {enrichedPosts.map(
                  ({ entry, author, likeCount, commentCount, isLiked, isSaved }) => (
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
                  ),
                )}
              </ul>
            )}
          </section>
        )}
      </section>
    </PageShell>
  );
}
