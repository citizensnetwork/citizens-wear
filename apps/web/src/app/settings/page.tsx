import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { getConnectClient } from '@/lib/connect';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings — Citizens Wear',
};

async function updateSettingsAction(formData: FormData): Promise<void> {
  'use server';
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const bio = String(formData.get('bio') ?? '')
    .trim()
    .slice(0, 280);
  const visibility = String(formData.get('visibility') ?? 'public');
  const displayNameOverride = String(formData.get('displayName') ?? '').trim();

  const visibilityValue = visibility === 'private' ? 'private' : 'public';

  const store = getWearStore();
  await store.profiles.update(session.user.id, {
    bio: bio.length > 0 ? bio : null,
    visibility: visibilityValue,
  });
  await store.settings.update(session.user.id, {
    displayNameOverride: displayNameOverride.length > 0 ? displayNameOverride : null,
    profileVisibility: visibilityValue,
  });

  revalidatePath('/settings');
  revalidatePath(`/u/${session.user.handle}`);
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const store = getWearStore();
  const [profile, settings, ownedBrands] = await Promise.all([
    store.profiles.getOrCreate(session.user.id),
    store.settings.get(session.user.id),
    getConnectClient().brands.listForOwner(session.user.id),
  ]);

  const accountKind: 'user' | 'brand' = ownedBrands.length > 0 ? 'brand' : 'user';

  return (
    <PageShell session={session}>
      <section className="my-10 max-w-xl">
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Phase 2 ships the skeleton: profile visibility, display-name override, and the visible
          account kind. Notifications, saved collections, and privacy-depth settings land with Phase
          7.
        </p>

        <form action={updateSettingsAction} className="mt-8 flex flex-col gap-5">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-ink">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              defaultValue={settings.displayNameOverride ?? session.user.displayName}
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
              aria-describedby="displayName-help"
              maxLength={60}
            />
            <p id="displayName-help" className="mt-1 text-xs text-ink-soft">
              Overrides your Citizens Connect display name inside Wear.
            </p>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-ink">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              defaultValue={profile.bio ?? ''}
              maxLength={280}
              className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Profile visibility</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  defaultChecked={profile.visibility === 'public'}
                />
                <span>
                  <span className="font-medium text-ink">Public</span>
                  <span className="text-ink-soft"> — anyone can see your profile.</span>
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  defaultChecked={profile.visibility === 'private'}
                />
                <span>
                  <span className="font-medium text-ink">Private</span>
                  <span className="text-ink-soft"> — only approved followers see it.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div>
            <p className="text-sm font-medium text-ink">Account kind</p>
            <p className="mt-1 text-sm text-ink-soft">
              {accountKind === 'brand' ? (
                <>
                  Brand account ·{' '}
                  {ownedBrands.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 ? ', ' : ''}
                      <Link
                        href={{ pathname: '/b/[slug]', query: { slug: b.slug } }}
                        className="underline decoration-gold underline-offset-2"
                      >
                        {b.name}
                      </Link>
                    </span>
                  ))}
                </>
              ) : (
                'Citizen account.'
              )}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Brand ownership is managed inside Citizens Connect.
            </p>
          </div>

          <div className="mt-2">
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              Save changes
            </button>
          </div>
        </form>
      </section>
    </PageShell>
  );
}
