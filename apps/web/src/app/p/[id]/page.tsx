import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Comment } from '@citizens-wear/db';
import { getConnectClient } from '@/lib/connect';
import { getWearStore } from '@/lib/store';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';
import { PostCard } from '@/lib/post-card';
import { addComment, likeComment } from '@/lib/actions';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: Promise<{ readonly id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const entry = await getWearStore().posts.getById(id);
  if (!entry) return { title: 'Post not found — Citizens Wear' };
  return {
    title: `Post — Citizens Wear`,
    description: entry.post.body.slice(0, 140),
  };
}

interface CommentNode {
  readonly comment: Comment;
  readonly replies: CommentNode[];
}

function buildThreads(comments: readonly Comment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of comments) byId.set(c.id, { comment: c, replies: [] });
  for (const node of byId.values()) {
    if (node.comment.parentCommentId && byId.has(node.comment.parentCommentId)) {
      byId.get(node.comment.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default async function PostDetailPage({ params }: Params) {
  const { id } = await params;
  const store = getWearStore();
  const client = getConnectClient();
  const session = await getSession();

  const entry = await store.posts.getById(id);
  if (!entry) notFound();

  const [author, brand, likeCount, commentCount, isLiked, isSaved, comments] = await Promise.all([
    client.users.getById(entry.post.authorId),
    entry.post.brandId ? client.brands.getById(entry.post.brandId) : Promise.resolve(null),
    store.likes.postLikeCount(entry.post.id),
    store.comments.commentsForPostCount(entry.post.id),
    session ? store.likes.isPostLiked(entry.post.id, session.user.id) : Promise.resolve(false),
    session ? store.saves.isSaved(session.user.id, entry.post.id) : Promise.resolve(false),
    store.comments.listForPost(entry.post.id),
  ]);

  // Resolve comment authors + like counts once per unique author/comment.
  const commentAuthors = new Map<string, Awaited<ReturnType<typeof client.users.getById>>>();
  for (const c of comments) {
    if (!commentAuthors.has(c.authorId)) {
      commentAuthors.set(c.authorId, await client.users.getById(c.authorId));
    }
  }
  const commentLikes = new Map<string, number>();
  for (const c of comments) {
    commentLikes.set(c.id, await store.likes.commentLikeCount(c.id));
  }

  const threads = buildThreads(comments);

  return (
    <PageShell session={session}>
      <section className="my-10">
        <PostCard
          entry={entry}
          author={author}
          brand={brand}
          likeCount={likeCount}
          commentCount={commentCount}
          isLiked={isLiked}
          isSaved={isSaved}
          viewerSignedIn={!!session}
        />

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">
            Comments · {commentCount}
          </h2>

          {session ? (
            <form action={addComment} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="postId" value={entry.post.id} />
              <label htmlFor="body" className="sr-only">
                Add a comment
              </label>
              <textarea
                id="body"
                name="body"
                rows={2}
                maxLength={500}
                placeholder="Add a comment…"
                className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none"
                required
              />
              <button
                type="submit"
                className="self-start rounded-md bg-ink px-3 py-1 text-sm font-medium text-paper hover:bg-ink-soft"
              >
                Post comment
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              <Link href="/sign-in" className="underline decoration-gold underline-offset-2">
                Sign in
              </Link>{' '}
              to join the conversation.
            </p>
          )}

          <ul className="mt-6 flex flex-col gap-4">
            {threads.map((node) => (
              <li key={node.comment.id}>
                <CommentView
                  node={node}
                  postId={entry.post.id}
                  authors={commentAuthors}
                  likes={commentLikes}
                  viewerSignedIn={!!session}
                />
              </li>
            ))}
          </ul>
        </section>
      </section>
    </PageShell>
  );
}

function CommentView({
  node,
  postId,
  authors,
  likes,
  viewerSignedIn,
  depth = 0,
}: {
  node: CommentNode;
  postId: string;
  authors: Map<
    string,
    Awaited<ReturnType<ReturnType<typeof getConnectClient>['users']['getById']>>
  >;
  likes: Map<string, number>;
  viewerSignedIn: boolean;
  depth?: number;
}) {
  const author = authors.get(node.comment.authorId);
  return (
    <div className={depth > 0 ? 'ml-6 border-l border-border pl-4' : ''}>
      <p className="text-xs text-ink-soft">
        <Link
          href={{ pathname: '/u/[handle]', query: { handle: author?.handle ?? 'unknown' } }}
          className="font-medium text-ink hover:underline"
        >
          @{author?.handle ?? 'unknown'}
        </Link>
        <span className="ml-2">{new Date(node.comment.createdAt).toLocaleString()}</span>
      </p>
      <p className="mt-1 text-sm text-ink">{node.comment.body}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
        {viewerSignedIn ? (
          <form action={likeComment}>
            <input type="hidden" name="commentId" value={node.comment.id} />
            <input type="hidden" name="postId" value={postId} />
            <button
              type="submit"
              className="rounded-md border border-border bg-paper px-2 py-0.5 hover:border-gold"
            >
              ♡ Like · {likes.get(node.comment.id) ?? 0}
            </button>
          </form>
        ) : (
          <span>{likes.get(node.comment.id) ?? 0} likes</span>
        )}
      </div>

      {node.replies.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {node.replies.map((child) => (
            <li key={child.comment.id}>
              <CommentView
                node={child}
                postId={postId}
                authors={authors}
                likes={likes}
                viewerSignedIn={viewerSignedIn}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
