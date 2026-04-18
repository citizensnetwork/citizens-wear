import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import {
  blockUser,
  followUser,
  startDirectConversation,
  unblockUser,
  unfollowUser,
} from '@/lib/actions';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: { readonly handle: string };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const client = getConnectClient();
  const user = await client.users.getByHandle(params.handle);
  if (!user) return { title: 'Not found — Citizens Wear' };
  return {
    title: `${user.displayName} (@${user.handle}) — Citizens Wear`,
    description: `Citizens Wear profile for @${user.handle}.`,
  };
}

export default async function UserProfilePage({ params }: Params) {
  const client = getConnectClient();
  const store = getWearStore();
  const session = await getSession();

  const user = await client.users.getByHandle(params.handle);
  if (!user) notFound();

  const [profile, counts, ownedBrands, isFollowing, highlights, isBlocked] = await Promise.all([
    store.profiles.getOrCreate(user.id),
    store.follows.counts(user.id),
    client.brands.listForOwner(user.id),
    session ? store.follows.isFollowing(session.user.id, user.id) : Promise.resolve(false),
    store.highlights.listForOwner(user.id),
    session ? store.blocks.isBlockedEither(session.user.id, user.id) : Promise.resolve(false),
  ]);

  const viewingOwnProfile = session?.user.id === user.id;
  const isPrivate = profile.visibility === 'private';
  const hidden =
    (isPrivate && !viewingOwnProfile && !isFollowing) || (isBlocked && !viewingOwnProfile);

  return (
    <PageShell session={session}>
      <section className="my-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-4xl">{user.displayName}</h1>
              {profile.verified ? (
                <span
                  aria-label="Verified citizen"
                  title="Verified citizen"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-muted text-xs font-semibold text-gold-deep"
                >
                  ✓
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-ink-soft">@{user.handle}</p>
            <p className="mt-1 text-xs">
              <Link
                href={{ pathname: '/u/[handle]/activity', query: { handle: user.handle } }}
                className="underline decoration-gold underline-offset-2 hover:text-ink"
              >
                View activity
              </Link>
            </p>
          </div>
          {!viewingOwnProfile && session ? (
            <div className="flex flex-wrap items-center gap-2">
              <form action={isFollowing ? unfollowUser : followUser}>
                <input type="hidden" name="handle" value={user.handle} />
                <button
                  type="submit"
                  className={
                    isFollowing
                      ? 'rounded-md border border-border bg-paper px-4 py-1 text-sm hover:bg-paper-soft'
                      : 'rounded-md bg-ink px-4 py-1 text-sm font-medium text-paper hover:bg-ink-soft'
                  }
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </form>
              {!isBlocked ? (
                <form action={startDirectConversation}>
                  <input type="hidden" name="handle" value={user.handle} />
                  <button
                    type="submit"
                    className="rounded-md border border-border bg-paper px-4 py-1 text-sm hover:border-gold"
                  >
                    Message
                  </button>
                </form>
              ) : null}
              <form action={isBlocked ? unblockUser : blockUser}>
                <input type="hidden" name="handle" value={user.handle} />
                <button
                  type="submit"
                  className="rounded-md border border-border bg-paper px-3 py-1 text-xs text-ink-soft hover:border-gold hover:text-ink"
                >
                  {isBlocked ? 'Unblock' : 'Block'}
                </button>
              </form>
            </div>
          ) : null}
          {!session ? (
            <Link
              href="/sign-in"
              className="rounded-md border border-border bg-paper px-4 py-1 text-sm hover:bg-paper-soft"
            >
              Sign in to follow
            </Link>
          ) : null}
        </div>

        <dl className="mt-6 flex gap-6 text-sm">
          <div>
            <dt className="text-ink-soft">Followers</dt>
            <dd className="font-medium text-ink">{counts.followers}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Following</dt>
            <dd className="font-medium text-ink">{counts.following}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Visibility</dt>
            <dd className="font-medium text-ink">
              {profile.visibility === 'public' ? 'Public' : 'Private'}
            </dd>
          </div>
        </dl>

        {hidden ? (
          <p className="mt-8 rounded-md border border-border bg-paper-soft p-4 text-sm text-ink-soft">
            This profile is private. Follow @{user.handle} to see their posts and activity.
          </p>
        ) : (
          <>
            {profile.bio ? (
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink">{profile.bio}</p>
            ) : (
              <p className="mt-6 text-sm text-ink-soft">No bio yet.</p>
            )}

            {ownedBrands.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-xs uppercase tracking-wide text-ink-soft">Brands</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {ownedBrands.map((brand) => (
                    <li key={brand.id}>
                      <Link
                        href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                        className="flex items-center gap-2 rounded-md border border-border bg-paper-soft px-3 py-2 text-sm hover:border-gold"
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
            ) : null}

            {highlights.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-xs uppercase tracking-wide text-ink-soft">Highlights</h2>
                <ul className="mt-3 flex flex-wrap gap-3">
                  {highlights.map((h) => (
                    <li
                      key={h.id}
                      className="flex w-32 flex-col items-center gap-1 rounded-md border border-border bg-paper-soft p-2 text-center"
                    >
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink-soft">
                        {h.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-xs text-ink">{h.name}</span>
                      <span className="text-[10px] text-ink-soft">{h.storyIds.length} stories</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </section>
    </PageShell>
  );
}
