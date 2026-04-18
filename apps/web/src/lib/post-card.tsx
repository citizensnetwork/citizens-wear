import Link from 'next/link';
import type { ConnectBrand, ConnectUser } from '@citizens-wear/connect-client';
import type { PostWithMedia } from '@citizens-wear/db';
import { likePost, savePost, unlikePost } from './actions';

/**
 * Compact post card used by the feed, profile pages, and post detail's
 * "related" strip. Server-rendered; interactive bits are plain HTML forms
 * bound to the Phase 4 server actions.
 */
export interface PostCardProps {
  readonly entry: PostWithMedia;
  readonly author: ConnectUser | null;
  readonly brand?: ConnectBrand | null;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly isLiked: boolean;
  readonly isSaved: boolean;
  readonly viewerSignedIn: boolean;
}

export function PostCard({
  entry,
  author,
  brand,
  likeCount,
  commentCount,
  isLiked,
  isSaved,
  viewerSignedIn,
}: PostCardProps) {
  const { post, media } = entry;
  const authorName = author?.displayName ?? 'Unknown citizen';
  const authorHandle = author?.handle ?? 'unknown';

  return (
    <article className="rounded-md border border-border bg-paper-soft p-4">
      <header className="flex items-center gap-2 text-sm">
        <Link
          href={{ pathname: '/u/[handle]', query: { handle: authorHandle } }}
          className="font-medium text-ink hover:underline"
        >
          {authorName}
        </Link>
        <span className="text-ink-soft">@{authorHandle}</span>
        {brand ? (
          <>
            <span className="text-ink-soft">· posting as</span>
            <Link
              href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
              className="font-medium text-ink hover:underline"
            >
              {brand.name}
            </Link>
            {brand.verified ? (
              <span aria-label="Verified brand" title="Verified brand" className="text-gold-deep">
                ✓
              </span>
            ) : null}
          </>
        ) : null}
        <time dateTime={post.createdAt} className="ml-auto text-xs text-ink-soft">
          {new Date(post.createdAt).toLocaleDateString()}
        </time>
      </header>

      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        <Link
          href={{ pathname: '/p/[id]', query: { id: post.id } }}
          className="hover:text-ink-soft"
        >
          {post.body}
        </Link>
      </div>

      {media.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {media.map((m) => (
            <li key={m.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.altText ?? ''}
                className="h-40 w-full rounded-md object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {post.taggedProductIds.length > 0 ? (
        <p className="mt-3 text-xs text-ink-soft">
          Tagged drops:{' '}
          {post.taggedProductIds.map((pid, i) => (
            <span key={pid} className="text-ink">
              {i > 0 ? ', ' : ''}
              {pid}
            </span>
          ))}
        </p>
      ) : null}

      <footer className="mt-4 flex items-center gap-3 text-xs">
        {viewerSignedIn ? (
          <>
            <form action={isLiked ? unlikePost : likePost}>
              <input type="hidden" name="postId" value={post.id} />
              <button
                type="submit"
                aria-pressed={isLiked}
                className={
                  isLiked
                    ? 'rounded-md bg-gold-muted px-3 py-1 font-medium text-gold-deep'
                    : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
                }
              >
                {isLiked ? '♥ Liked' : '♡ Like'} · {likeCount}
              </button>
            </form>
            <form action={savePost}>
              <input type="hidden" name="postId" value={post.id} />
              <button
                type="submit"
                aria-pressed={isSaved}
                className={
                  isSaved
                    ? 'rounded-md bg-gold-muted px-3 py-1 font-medium text-gold-deep'
                    : 'rounded-md border border-border bg-paper px-3 py-1 text-ink hover:border-gold'
                }
              >
                {isSaved ? '★ Saved' : '☆ Save'}
              </button>
            </form>
          </>
        ) : (
          <span className="text-ink-soft">{likeCount} likes</span>
        )}
        <Link
          href={{ pathname: '/p/[id]', query: { id: post.id } }}
          className="text-ink-soft hover:text-ink"
        >
          {commentCount} comments
        </Link>
      </footer>
    </article>
  );
}
