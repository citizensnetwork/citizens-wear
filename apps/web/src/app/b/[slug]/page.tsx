import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: { readonly slug: string };
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

export default async function BrandProfilePage({ params }: Params) {
  const client = getConnectClient();
  const session = await getSession();

  const brand = await client.brands.getBySlug(params.slug);
  if (!brand) notFound();

  const [owner, products] = await Promise.all([
    client.users.getById(brand.ownerUserId),
    client.products.listForBrand(brand.id, { limit: 12 }),
  ]);

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

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">Drops</h2>
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
                  <p className="mt-1 text-xs text-ink-soft">{p.stockState.replace('_', ' ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </PageShell>
  );
}
