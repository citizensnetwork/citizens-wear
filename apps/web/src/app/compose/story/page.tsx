import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { createStory } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'New story — Citizens Wear',
};

export default async function ComposeStoryPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const ownedBrands = await getConnectClient().brands.listForOwner(session.user.id);

  return (
    <PageShell session={session}>
      <section className="my-10 max-w-xl">
        <h1 className="font-display text-3xl">New story</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Stories disappear after 24 hours. Pin the ones worth keeping into a highlight from your
          profile.
        </p>

        <form action={createStory} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="mediaKind" className="block text-sm font-medium text-ink">
              Story kind
            </label>
            <select
              id="mediaKind"
              name="mediaKind"
              defaultValue="text"
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            >
              <option value="text">Text</option>
              <option value="image">Image (paste a URL)</option>
              <option value="video">Video (paste a URL)</option>
            </select>
          </div>

          <div>
            <label htmlFor="mediaUrl" className="block text-sm font-medium text-ink">
              Media URL
            </label>
            <input
              id="mediaUrl"
              name="mediaUrl"
              type="url"
              maxLength={2000}
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink-soft">
              Required for image/video stories. Phase 9 lands a real upload pipeline; for now, link
              to a hosted asset.
            </p>
          </div>

          <div>
            <label htmlFor="caption" className="block text-sm font-medium text-ink">
              Caption
            </label>
            <textarea
              id="caption"
              name="caption"
              rows={3}
              maxLength={280}
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="audience" className="block text-sm font-medium text-ink">
              Audience
            </label>
            <select
              id="audience"
              name="audience"
              defaultValue="public"
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            >
              <option value="public">Public</option>
              <option value="followers">Followers only</option>
            </select>
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

          <div>
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              Post story
            </button>
          </div>
        </form>
      </section>
    </PageShell>
  );
}
