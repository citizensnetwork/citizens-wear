import Link from 'next/link';
import type { Metadata } from 'next';
import type {
  ConnectBrand,
  ConnectProduct,
  ConnectUser,
  Page as ConnectPage,
} from '@citizens-wear/connect-client';
import type { FeedPage } from '@citizens-wear/db';
import { normaliseHashtag } from '@citizens-wear/db';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search — Citizens Wear',
  description: 'Search citizens, brands, hashtags, and drops on Citizens Wear.',
};

const KINDS = ['top', 'citizens', 'brands', 'hashtags', 'posts', 'drops'] as const;
type Kind = (typeof KINDS)[number];
const PER_KIND_LIMIT = 12;
const MAX_QUERY_LENGTH = 100;

interface SearchParams {
  readonly searchParams?: Promise<{ readonly q?: string; readonly kind?: string }>;
}

function isKind(value: string | undefined): value is Kind {
  return !!value && (KINDS as readonly string[]).includes(value);
}

interface SearchResults {
  readonly users: ConnectPage<ConnectUser>;
  readonly brands: ConnectPage<ConnectBrand>;
  readonly products: ConnectPage<ConnectProduct>;
  readonly posts: FeedPage;
  readonly hashtag: FeedPage | null;
}

async function runSearch(query: string): Promise<SearchResults> {
  const client = getConnectClient();
  const store = getWearStore();
  const tag = normaliseHashtag(query);

  const [users, brands, products, posts, hashtag] = await Promise.all([
    client.users.search(query, { limit: PER_KIND_LIMIT }),
    client.brands.search(query, { limit: PER_KIND_LIMIT }),
    client.products.search(query, { limit: PER_KIND_LIMIT }),
    store.posts.searchByText(query, { limit: PER_KIND_LIMIT }),
    tag
      ? store.posts.listByHashtag(tag, { limit: PER_KIND_LIMIT })
      : Promise.resolve<FeedPage | null>(null),
  ]);

  return { users, brands, products, posts, hashtag };
}

export default async function SearchPage({ searchParams }: SearchParams) {
  const resolved = (await searchParams) ?? {};
  const session = await getSession();

  // Trim and clamp the query — never trust the URL for length or whitespace.
  const rawQuery = String(resolved.q ?? '');
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  const kind: Kind = isKind(resolved.kind) ? resolved.kind : 'top';

  const results = query ? await runSearch(query) : null;

  return (
    <PageShell session={session}>
      <section className="my-10">
        <h1 className="font-display text-4xl">Search</h1>

        <form
          role="search"
          action="/search"
          method="get"
          className="mt-6 flex max-w-xl items-center gap-2"
        >
          <label htmlFor="search-q" className="sr-only">
            Search Citizens Wear
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            maxLength={MAX_QUERY_LENGTH}
            defaultValue={query}
            placeholder="Search citizens, brands, hashtags, drops…"
            className="flex-1 rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Go
          </button>
        </form>

        {query ? (
          <nav aria-label="Search filters" className="mt-6 flex flex-wrap gap-2 text-sm">
            {KINDS.map((k) => (
              <Link
                key={k}
                href={{ pathname: '/search', query: { q: query, kind: k } }}
                aria-current={k === kind ? 'page' : undefined}
                className={
                  k === kind
                    ? 'rounded-md bg-ink px-3 py-1 font-medium text-paper'
                    : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
                }
              >
                {kindLabel(k)}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="mt-6 text-sm text-ink-soft">
            Enter a query to search across citizens, brands, hashtags, posts, and drops.
          </p>
        )}

        {query && results ? (
          <SearchSections kind={kind} query={query} results={results} signedIn={!!session} />
        ) : null}
      </section>
    </PageShell>
  );
}

function kindLabel(k: Kind): string {
  switch (k) {
    case 'top':
      return 'Top';
    case 'citizens':
      return 'Citizens';
    case 'brands':
      return 'Brands';
    case 'hashtags':
      return 'Hashtags';
    case 'posts':
      return 'Posts';
    case 'drops':
      return 'Drops';
  }
}

interface SectionsProps {
  readonly kind: Kind;
  readonly query: string;
  readonly results: SearchResults;
  readonly signedIn: boolean;
}

function SearchSections({ kind, query, results, signedIn }: SectionsProps) {
  const totals = {
    citizens: results.users.items.length,
    brands: results.brands.items.length,
    hashtags: results.hashtag?.items.length ?? 0,
    posts: results.posts.items.length,
    drops: results.products.items.length,
  };
  const totalAll = totals.citizens + totals.brands + totals.hashtags + totals.posts + totals.drops;
  const tag = normaliseHashtag(query);

  if (totalAll === 0) {
    return (
      <p className="mt-8 text-sm text-ink-soft">
        No results for <span className="text-ink">“{query}”</span>.
      </p>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-10">
      {(kind === 'top' || kind === 'citizens') && totals.citizens > 0 ? (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">
            Citizens · {totals.citizens}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {results.users.items.map((u) => (
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
        </section>
      ) : null}

      {(kind === 'top' || kind === 'brands') && totals.brands > 0 ? (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">
            Brands · {totals.brands}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {results.brands.items.map((b) => (
              <li key={b.id}>
                <Link
                  href={{ pathname: '/b/[slug]', query: { slug: b.slug } }}
                  className="flex items-center gap-2 rounded-md border border-border bg-paper-soft px-4 py-3 text-sm hover:border-gold"
                >
                  <span className="font-medium text-ink">{b.name}</span>
                  {b.verified ? (
                    <span
                      aria-label="Verified brand"
                      title="Verified brand"
                      className="text-xs text-gold-deep"
                    >
                      ✓
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-ink-soft">@{b.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(kind === 'top' || kind === 'hashtags') && totals.hashtags > 0 && tag ? (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">
            Hashtag · #{tag} · {totals.hashtags}
          </h2>
          <p className="mt-3 text-sm">
            <Link
              href={{ pathname: '/h/[tag]', query: { tag } }}
              className="underline decoration-gold underline-offset-2 hover:text-ink"
            >
              View all #{tag} posts →
            </Link>
          </p>
        </section>
      ) : null}

      {(kind === 'top' || kind === 'posts') && totals.posts > 0 ? (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">Posts · {totals.posts}</h2>
          <PostHits entries={results.posts} signedIn={signedIn} />
        </section>
      ) : null}

      {(kind === 'top' || kind === 'drops') && totals.drops > 0 ? (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">Drops · {totals.drops}</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {results.products.items.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-border bg-paper-soft px-4 py-3 text-sm"
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
                <p className="mt-1 text-xs text-ink-soft">{p.stockState.replace('_', ' ')}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function PostHits({ entries, signedIn }: { entries: FeedPage; signedIn: boolean }) {
  const session = await getSession();
  const client = getConnectClient();
  const store = getWearStore();
  const viewerId = session?.user.id;

  const enriched = await Promise.all(
    entries.items.map(async (entry) => {
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
            viewerSignedIn={signedIn}
          />
        </li>
      ))}
    </ul>
  );
}
