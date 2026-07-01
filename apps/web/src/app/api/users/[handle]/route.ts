import { ApiError, handler, json } from '@/lib/api/route-context';
import { hydrateFeed, toBrandDto, toUserDto } from '@/lib/api/serializers';
import { readPageParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/:handle — a user's public profile: mirror row, Wear profile,
 * follow counts, owned brands, their recent posts (the profile grid), and
 * whether the signed-in caller follows them.
 */
export const GET = handler(async (req, ctx, params) => {
  const user = await ctx.store.users.getByHandle(params.handle!);
  if (!user) throw new ApiError(404, 'user_not_found', `Unknown user @${params.handle}.`);

  const [profile, counts, brands, viewerFollows, postsPage] = await Promise.all([
    ctx.store.profiles.get(user.id),
    ctx.store.follows.counts(user.id),
    ctx.store.brands.listForOwner(user.id),
    ctx.userId ? ctx.store.follows.isFollowing(ctx.userId, user.id) : Promise.resolve(false),
    ctx.store.posts.listByAuthor(user.id, readPageParams(new URL(req.url))),
  ]);

  return json({
    user: toUserDto(user),
    profile,
    counts,
    brands: brands.map(toBrandDto),
    viewerFollows,
    posts: await hydrateFeed(ctx.store, postsPage),
  });
});
