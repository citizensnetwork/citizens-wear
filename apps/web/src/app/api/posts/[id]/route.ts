import { ApiError, handler, json } from '@/lib/api/route-context';
import { hydratePost, toUserDto } from '@/lib/api/serializers';
import type { WearUser } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/posts/:id — a post with its author, brand, engagement counts, and
 * hydrated comment thread. `liked`/`saved` reflect the signed-in caller.
 */
export const GET = handler(async (_req, ctx, params) => {
  const entry = await ctx.store.posts.getById(params.id!);
  if (!entry) throw new ApiError(404, 'post_not_found', `Unknown post ${params.id}.`);

  const [post, comments, likeCount, viewerLiked, viewerSaved] = await Promise.all([
    hydratePost(ctx.store, entry),
    ctx.store.comments.listForPost(entry.post.id),
    ctx.store.likes.postLikeCount(entry.post.id),
    ctx.userId ? ctx.store.likes.isPostLiked(entry.post.id, ctx.userId) : Promise.resolve(false),
    ctx.userId ? ctx.store.saves.isSaved(ctx.userId, entry.post.id) : Promise.resolve(false),
  ]);

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const authors = new Map<string, WearUser>();
  await Promise.all(
    authorIds.map(async (id) => {
      const u = await ctx.store.users.getById(id);
      if (u) authors.set(id, u);
    }),
  );

  return json({
    post,
    likeCount,
    viewerLiked,
    viewerSaved,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentCommentId: c.parentCommentId,
      author: authors.has(c.authorId) ? toUserDto(authors.get(c.authorId)!) : null,
    })),
  });
});
