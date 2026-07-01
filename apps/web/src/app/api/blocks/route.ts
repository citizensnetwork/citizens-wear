import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/** POST /api/blocks { handle } — block a user (also unfollows both ways). */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const handle = bodyString(await readJsonBody(req), 'handle');
  if (!handle) throw new ApiError(400, 'missing_handle', 'A handle is required.');
  const target = await ctx.store.users.getByHandle(handle);
  if (!target) throw new ApiError(404, 'user_not_found', `Unknown user @${handle}.`);
  if (target.id === userId) throw new ApiError(400, 'self_block', 'Cannot block yourself.');
  await ctx.store.blocks.block(userId, target.id);
  return json({ blocked: true });
});

/** DELETE /api/blocks { handle } — unblock a user. */
export const DELETE = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const handle = bodyString(await readJsonBody(req), 'handle');
  if (!handle) throw new ApiError(400, 'missing_handle', 'A handle is required.');
  const target = await ctx.store.users.getByHandle(handle);
  if (!target) throw new ApiError(404, 'user_not_found', `Unknown user @${handle}.`);
  await ctx.store.blocks.unblock(userId, target.id);
  return json({ blocked: false });
});
