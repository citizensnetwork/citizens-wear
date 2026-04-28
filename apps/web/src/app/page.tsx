import Link from 'next/link';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSession();
  const client = getConnectClient();
  const brands = await client.brands.listAll({ limit: 6 });

  return (
    <PageShell session={session}>
      <section className="my-16">
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          By the Kingdom.
          <br />
          With the Kingdom.
          <br />
          <span className="text-gold">For the Kingdom.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-ink-soft md:text-lg">
          Citizens Wear is a social platform for Christian clothing brands, citizens, and
          communities. It extends <span className="font-medium text-ink">Citizens Connect</span>,
          bringing the Kingdom to where brands and their followers meet.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/explore"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Explore Citizens Wear →
          </Link>
          <span className="inline-flex items-center rounded-md border border-border bg-paper-soft px-3 py-1 text-xs uppercase tracking-wide text-ink-soft">
            Phase 5 · Discovery, search, brand catalog
          </span>
          <span className="inline-flex items-center rounded-md bg-gold-muted px-3 py-1 text-xs uppercase tracking-wide text-gold-deep">
            Mock Connect
          </span>
        </div>
      </section>

      <section className="my-12">
        <h2 className="text-xs uppercase tracking-wide text-ink-soft">Featured brands</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {brands.items.map((brand) => (
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
      </section>
    </PageShell>
  );
}
