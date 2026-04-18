import Link from 'next/link';
import type { ConnectUser } from '@citizens-wear/connect-client';
import type { StoryTrayEntry } from '@citizens-wear/db';

/**
 * Compact horizontal "tray" of citizens with active stories — server-rendered
 * so it appears on the feed without a client bundle. Unseen authors are
 * outlined in gold; the viewer's own avatar always sits leftmost so they can
 * post a new story or browse their own.
 */
export interface StoryTrayProps {
  readonly viewerSignedIn: boolean;
  readonly entries: readonly { tray: StoryTrayEntry; author: ConnectUser | null }[];
  readonly viewerHandle: string | null;
  readonly viewerId: string | null;
}

export function StoryTray({ entries, viewerSignedIn, viewerHandle, viewerId }: StoryTrayProps) {
  if (entries.length === 0 && !viewerSignedIn) return null;
  return (
    <section aria-label="Stories" className="mb-6">
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {viewerSignedIn ? (
          <li className="shrink-0">
            <Link
              href="/compose/story"
              className="flex w-20 flex-col items-center gap-1 text-xs text-ink-soft hover:text-ink"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border bg-paper-soft text-xl text-ink-soft">
                +
              </span>
              <span>Your story</span>
            </Link>
          </li>
        ) : null}
        {entries.map(({ tray, author }) => {
          const initials = (author?.displayName ?? author?.handle ?? '?')
            .split(/\s+/u)
            .map((s) => s[0]?.toUpperCase() ?? '')
            .slice(0, 2)
            .join('');
          const isSelf = viewerId !== null && tray.authorId === viewerId;
          const ringClass = tray.hasUnseen
            ? 'ring-2 ring-gold'
            : isSelf
              ? 'ring-1 ring-border'
              : 'ring-1 ring-border';
          return (
            <li key={tray.authorId} className="shrink-0">
              <Link
                href={{ pathname: '/stories/[id]', query: { id: tray.latestStoryId } }}
                className="flex w-20 flex-col items-center gap-1 text-xs text-ink-soft hover:text-ink"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full bg-paper-soft text-sm font-semibold text-ink ${ringClass}`}
                  aria-label={`${author?.displayName ?? author?.handle ?? 'Citizen'} stories`}
                >
                  {initials || '·'}
                </span>
                <span className="max-w-[5rem] truncate">
                  {isSelf
                    ? viewerHandle
                      ? `@${viewerHandle}`
                      : 'You'
                    : `@${author?.handle ?? 'unknown'}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
