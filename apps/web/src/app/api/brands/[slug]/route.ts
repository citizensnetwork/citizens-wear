import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydrateFeed, toBrandDto, toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody, readPageParams } from '@/lib/api/params';
import type { UpdateBrandInput } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

/** GET /api/brands/:slug — a brand, its owner, and its recent posts. */
export const GET = handler(async (req, ctx, params) => {
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  const [owner, posts] = await Promise.all([
    ctx.store.users.getById(brand.ownerUserId),
    ctx.store.posts.listByBrand(brand.id, readPageParams(new URL(req.url))),
  ]);
  return json({
    brand: toBrandDto(brand),
    owner: owner ? toUserDto(owner) : null,
    posts: await hydrateFeed(ctx.store, posts),
  });
});

/** PATCH /api/brands/:slug — owner-only update of brand fields. */
export const PATCH = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const brand = await ctx.store.brands.getBySlug(params.slug!);
  if (!brand) throw new ApiError(404, 'brand_not_found', `Unknown brand ${params.slug}.`);
  const body = await readJsonBody(req);
  const has = (key: string): boolean =>
    !!body && typeof body === 'object' && typeof (body as Record<string, unknown>)[key] === 'string';
  const patch: UpdateBrandInput = {
    ...(has('name') ? { name: bodyString(body, 'name') } : {}),
    ...(has('tagline') ? { tagline: bodyString(body, 'tagline') || null } : {}),
    ...(has('websiteUrl') ? { websiteUrl: bodyString(body, 'websiteUrl') || null } : {}),
    ...(has('logoUrl') ? { logoUrl: bodyString(body, 'logoUrl') || null } : {}),
  };
  const updated = await ctx.store.brands.update(brand.id, userId, patch);
  return json(toBrandDto(updated));
});
