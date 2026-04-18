import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { createPost } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'New post — Citizens Wear',
};

export default async function ComposePage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const client = getConnectClient();
  const ownedBrands = await client.brands.listForOwner(session.user.id);

  // Best-effort product catalog for the first owned brand, used to offer
  // a drop-tag picker. Phase 5 replaces this with proper search.
  const firstBrand = ownedBrands[0];
  const products = firstBrand
    ? (await client.products.listForBrand(firstBrand.id, { limit: 20 })).items
    : [];

  return (
    <PageShell session={session}>
      <section className="my-10 max-w-xl">
        <h1 className="font-display text-3xl">New post</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Share a message with the Kingdom. Brand owners can post <em>as</em> one of their brands
          and tag drops from that brand&apos;s catalog.
        </p>

        <form action={createPost} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="body" className="block text-sm font-medium text-ink">
              What&apos;s on your heart?
            </label>
            <textarea
              id="body"
              name="body"
              rows={4}
              maxLength={2000}
              required
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>

          {ownedBrands.length > 0 ? (
            <div>
              <label htmlFor="brandSlug" className="block text-sm font-medium text-ink">
                Publish as
              </label>
              <select
                id="brandSlug"
                name="brandSlug"
                defaultValue=""
                className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
              >
                <option value="">Myself (@{session.user.handle})</option>
                {ownedBrands.map((b) => (
                  <option key={b.id} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {products.length > 0 ? (
            <fieldset className="border border-border rounded-md p-3">
              <legend className="px-1 text-sm font-medium text-ink">Tag drops</legend>
              <p className="text-xs text-ink-soft">
                Only drops from the brand you publish as are kept on save.
              </p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input type="checkbox" name="taggedProductIds" value={p.id} />
                    <span>
                      <span className="font-medium text-ink">{p.title}</span>{' '}
                      <span className="text-ink-soft">· {p.stockState.replace('_', ' ')}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div>
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              Publish
            </button>
          </div>
        </form>
      </section>
    </PageShell>
  );
}
