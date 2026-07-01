import { handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandDto, toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const MAX_BIO = 500;
const MAX_DISPLAY_NAME = 80;

/**
 * GET /api/me — the signed-in user's mirror row, profile, settings, counts,
 * and owned brands (so the composer can offer "post as brand" in one call).
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const [user, profile, settings, counts, brands] = await Promise.all([
    ctx.store.users.getById(userId),
    ctx.store.profiles.getOrCreate(userId),
    ctx.store.settings.get(userId),
    ctx.store.follows.counts(userId),
    ctx.store.brands.listForOwner(userId),
  ]);
  return json({
    user: user ? toUserDto(user) : null,
    profile,
    settings,
    counts,
    brands: brands.map(toBrandDto),
  });
});

/**
 * PATCH /api/me — update the caller's own profile/settings:
 * `{ bio?, visibility?, displayNameOverride? }`. Only provided fields change.
 */
export const PATCH = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const has = (key: string): boolean =>
    !!body && typeof body === 'object' && key in (body as Record<string, unknown>);

  const visibilityRaw = bodyString(body, 'visibility');
  const visibility =
    visibilityRaw === 'public' || visibilityRaw === 'private' ? visibilityRaw : undefined;

  // First-time callers may not have a profile row yet — updating a missing
  // row is undefined across store implementations.
  await ctx.store.profiles.getOrCreate(userId);
  const profile = await ctx.store.profiles.update(userId, {
    ...(has('bio') ? { bio: bodyString(body, 'bio').slice(0, MAX_BIO) || null } : {}),
    ...(visibility ? { visibility } : {}),
  });
  const settings = await ctx.store.settings.update(userId, {
    ...(has('displayNameOverride')
      ? {
          displayNameOverride:
            bodyString(body, 'displayNameOverride').slice(0, MAX_DISPLAY_NAME) || null,
        }
      : {}),
    ...(visibility ? { profileVisibility: visibility } : {}),
  });
  return json({ profile, settings });
});
