import { handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/** GET /api/me — the signed-in user's mirror row, profile, settings, counts. */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const [user, profile, settings, counts] = await Promise.all([
    ctx.store.users.getById(userId),
    ctx.store.profiles.getOrCreate(userId),
    ctx.store.settings.get(userId),
    ctx.store.follows.counts(userId),
  ]);
  return json({
    user: user ? toUserDto(user) : null,
    profile,
    settings,
    counts,
  });
});
