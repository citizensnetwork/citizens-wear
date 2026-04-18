import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { deleteStory, reactToStory, recordStoryView, reportSubject } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Story — Citizens Wear',
};

interface Params {
  readonly params: Promise<{ readonly id: string }>;
}

const REACTIONS: readonly { kind: 'amen' | 'love' | 'fire' | 'pray' | 'crown'; label: string }[] = [
  { kind: 'amen', label: 'Amen' },
  { kind: 'love', label: 'Love' },
  { kind: 'fire', label: 'Fire' },
  { kind: 'pray', label: 'Pray' },
  { kind: 'crown', label: 'Crown' },
];

export default async function StoryViewerPage({ params }: Params) {
  const { id } = await params;
  const session = await getSession();
  const store = getWearStore();
  const client = getConnectClient();

  const story = await store.stories.getById(id);
  if (!story) notFound();
  // Anonymous viewers may only see public stories.
  if (!session && story.audience !== 'public') notFound();
  // Followers-only audience is enforced for non-authors.
  if (
    session &&
    story.audience === 'followers' &&
    story.authorId !== session.user.id &&
    !(await store.follows.isFollowing(session.user.id, story.authorId))
  ) {
    notFound();
  }
  // Expired stories are only viewable by the author.
  const nowMs = Date.now();
  if (Date.parse(story.expiresAt) <= nowMs && story.authorId !== session?.user.id) {
    notFound();
  }
  // Block check.
  if (session && (await store.blocks.isBlockedEither(session.user.id, story.authorId))) {
    notFound();
  }

  const author = await client.users.getById(story.authorId);
  const brand = story.brandId ? await client.brands.getById(story.brandId) : null;

  // Determine sibling navigation among the author's currently active stories.
  const active = await store.stories.listActiveForViewer(session?.user.id ?? story.authorId);
  const sameAuthor = active.filter((s) => s.authorId === story.authorId);
  const ordered = [...sameAuthor].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const idx = ordered.findIndex((s) => s.id === story.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const isAuthor = session?.user.id === story.authorId;
  const reactions = await store.stories.listReactions(story.id);
  const viewerCount = isAuthor
    ? (await store.stories.listViewers(story.id, story.authorId)).length
    : 0;

  return (
    <PageShell session={session}>
      <article className="my-10">
        <header className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <Link
              href={{ pathname: '/u/[handle]', query: { handle: author?.handle ?? '' } }}
              className="font-medium text-ink hover:underline"
            >
              {author?.displayName ?? 'Citizen'}
            </Link>{' '}
            <span className="text-ink-soft">@{author?.handle ?? 'unknown'}</span>
            {brand ? (
              <>
                <span className="text-ink-soft"> · as </span>
                <Link
                  href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                  className="font-medium text-ink hover:underline"
                >
                  {brand.name}
                </Link>
              </>
            ) : null}
          </div>
          <time dateTime={story.createdAt} className="text-xs text-ink-soft">
            {new Date(story.createdAt).toLocaleString()}
          </time>
        </header>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-paper-soft">
          {story.mediaKind === 'image' && story.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.mediaUrl}
              alt={story.caption ?? ''}
              className="aspect-[9/16] w-full object-cover"
            />
          ) : story.mediaKind === 'video' && story.mediaUrl ? (
            <video
              src={story.mediaUrl}
              controls
              className="aspect-[9/16] w-full bg-ink"
              aria-label={story.caption ?? 'Story video'}
            />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center bg-ink p-6 text-center font-display text-2xl text-paper">
              {story.caption ?? '·'}
            </div>
          )}
          {story.mediaKind !== 'text' && story.caption ? (
            <p className="border-t border-border bg-paper p-3 text-sm text-ink">{story.caption}</p>
          ) : null}
        </div>

        <nav className="mt-4 flex items-center justify-between text-sm">
          {prev ? (
            <Link
              href={{ pathname: '/stories/[id]', query: { id: prev.id } }}
              className="rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-ink-soft">
            {idx + 1} of {ordered.length}
          </span>
          {next ? (
            <Link
              href={{ pathname: '/stories/[id]', query: { id: next.id } }}
              className="rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>

        {session && !isAuthor ? (
          <>
            {/* Tracking the view: a small auto-submitting form, kept as a
                progressive-enhancement no-op rather than a side-effect on
                read so unauthenticated/expired views never record. */}
            <form action={recordStoryView} className="hidden" aria-hidden="true">
              <input type="hidden" name="storyId" value={story.id} />
              <button type="submit">View</button>
            </form>
            <section aria-label="React" className="mt-6 flex flex-wrap gap-2">
              {REACTIONS.map((r) => (
                <form key={r.kind} action={reactToStory}>
                  <input type="hidden" name="storyId" value={story.id} />
                  <input type="hidden" name="kind" value={r.kind} />
                  <button
                    type="submit"
                    className="rounded-md border border-border bg-paper px-3 py-1 text-sm text-ink hover:border-gold"
                  >
                    {r.label}
                  </button>
                </form>
              ))}
            </section>
            <details className="mt-4 text-xs text-ink-soft">
              <summary className="cursor-pointer">Report this story</summary>
              <form action={reportSubject} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="subjectKind" value="story" />
                <input type="hidden" name="subjectId" value={story.id} />
                <select
                  name="reason"
                  defaultValue="abuse"
                  className="rounded-md border border-border bg-paper px-2 py-1 text-xs text-ink"
                >
                  <option value="abuse">Abuse</option>
                  <option value="spam">Spam</option>
                  <option value="sexual">Sexual content</option>
                  <option value="self_harm">Self-harm</option>
                  <option value="illegal">Illegal</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="submit"
                  className="rounded-md border border-border bg-paper px-2 py-1 text-xs text-ink hover:border-gold"
                >
                  Submit report
                </button>
              </form>
            </details>
          </>
        ) : null}

        {isAuthor ? (
          <section className="mt-6 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
            <span>{viewerCount} views</span>
            <span>·</span>
            <span>{reactions.length} reactions</span>
            <form action={deleteStory}>
              <input type="hidden" name="storyId" value={story.id} />
              <button
                type="submit"
                className="ml-auto rounded-md border border-border bg-paper px-2 py-1 text-xs text-ink hover:border-gold"
              >
                Delete story
              </button>
            </form>
          </section>
        ) : null}
      </article>
    </PageShell>
  );
}
