import { handler, json, requireUserId } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

/** POST /api/posts/:id/save — toggle the caller's save of the post. */
export const POST = handler(async (_req, ctx, params) => {
  const userId = requireUserId(ctx);
  const isSaved = await ctx.store.saves.isSaved(userId, params.id!);
  if (isSaved) {
    await ctx.store.saves.unsavePost(userId, params.id!);
  } else {
    await ctx.store.saves.savePost(userId, params.id!);
  }
  return json({ saved: !isSaved });
});
