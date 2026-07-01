import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/me/hydrate — upsert the caller's `wear.users` mirror row from
 * their session identity (Google OAuth metadata). The HTML app calls this once
 * after every sign-in: on first sign-in it creates the mirror (assigning a
 * globally-unique handle), afterwards it refreshes displayName/avatarUrl while
 * keeping the established handle (STEP3 scope §5 Q1 mirror hydration).
 *
 * The written fields come from the server-validated session — never from the
 * request body — so a caller cannot hydrate an arbitrary identity.
 */
export const POST = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  if (!ctx.identity) {
    throw new ApiError(422, 'no_identity', 'Session carries no display identity.');
  }
  const user = await ctx.store.users.upsertFromSession({
    id: userId,
    handle: ctx.identity.handle,
    displayName: ctx.identity.displayName,
    avatarUrl: ctx.identity.avatarUrl,
  });
  return json({ user: toUserDto(user) });
});
