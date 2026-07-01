import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

async function resolveTarget(
  ctx: { store: import('@citizens-wear/db').WearStore },
  handle: string,
): Promise<string> {
  const target = await ctx.store.users.getByHandle(handle);
  if (!target) throw new ApiError(404, 'user_not_found', `Unknown user @${handle}.`);
  return target.id;
}

/** POST /api/follows { handle } — follow a user by handle. */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const handle = bodyString(await readJsonBody(req), 'handle');
  if (!handle) throw new ApiError(400, 'missing_handle', 'A handle is required.');
  const targetId = await resolveTarget(ctx, handle);
  if (targetId === userId) throw new ApiError(400, 'self_follow', 'Cannot follow yourself.');
  await ctx.store.follows.follow(userId, targetId);
  return json({ following: true });
});

/** DELETE /api/follows { handle } — unfollow a user by handle. */
export const DELETE = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const handle = bodyString(await readJsonBody(req), 'handle');
  if (!handle) throw new ApiError(400, 'missing_handle', 'A handle is required.');
  const targetId = await resolveTarget(ctx, handle);
  await ctx.store.follows.unfollow(userId, targetId);
  return json({ following: false });
});
