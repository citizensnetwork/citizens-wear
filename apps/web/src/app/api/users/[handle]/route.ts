import { ApiError, handler, json } from '@/lib/api/route-context';
import { toBrandDto, toUserDto } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/:handle — a user's public profile: mirror row, Wear profile,
 * follow counts, owned brands, and whether the signed-in caller follows them.
 */
export const GET = handler(async (_req, ctx, params) => {
  const user = await ctx.store.users.getByHandle(params.handle!);
  if (!user) throw new ApiError(404, 'user_not_found', `Unknown user @${params.handle}.`);

  const [profile, counts, brands, viewerFollows] = await Promise.all([
    ctx.store.profiles.get(user.id),
    ctx.store.follows.counts(user.id),
    ctx.store.brands.listForOwner(user.id),
    ctx.userId ? ctx.store.follows.isFollowing(ctx.userId, user.id) : Promise.resolve(false),
  ]);

  return json({
    user: toUserDto(user),
    profile,
    counts,
    brands: brands.map(toBrandDto),
    viewerFollows,
  });
});
