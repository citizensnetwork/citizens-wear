import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toBrandDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody, readPageParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/** GET /api/brands?q=&cursor=&limit= — list or search Wear-owned brands. */
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q');
  const params = readPageParams(url);
  const page = query
    ? await ctx.store.brands.search(query, params)
    : await ctx.store.brands.listAll(params);
  return json({ items: page.items.map(toBrandDto), nextCursor: page.nextCursor });
});

/**
 * POST /api/brands — create a brand owned by the signed-in user. An optional
 * `connectContributorId` link is set by the caller only after the ownership-
 * verified link flow (see /api/brands/:slug/link, STEP3 §5 Q4).
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const slug = bodyString(body, 'slug');
  const name = bodyString(body, 'name');
  if (!slug) throw new ApiError(422, 'invalid_slug', 'A brand slug is required.');
  if (!name) throw new ApiError(422, 'invalid_name', 'A brand name is required.');
  const brand = await ctx.store.brands.create({
    ownerId: userId,
    slug,
    name,
    tagline: bodyString(body, 'tagline') || null,
    websiteUrl: bodyString(body, 'websiteUrl') || null,
    logoUrl: bodyString(body, 'logoUrl') || null,
  });
  return json(toBrandDto(brand), 201);
});
