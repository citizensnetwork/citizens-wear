import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/** POST /api/posts/:id/like — like the post as the caller. */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.likes.likePost(params.id!, userId);
  return json({ liked: true, likeCount: await ctx.store.likes.postLikeCount(params.id!) });
});

/** DELETE /api/posts/:id/like — remove the caller's like. */
export const DELETE = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  await ctx.store.likes.unlikePost(params.id!, userId);
  return json({ liked: false, likeCount: await ctx.store.likes.postLikeCount(params.id!) });
});
