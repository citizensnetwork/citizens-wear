import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { hydratePost } from '@/lib/api/serializers';
import { bodyString, bodyStringArray, readJsonBody } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const MAX_POST_BODY = 2000;

/**
 * POST /api/posts — create a post as the signed-in user, optionally *as* a
 * brand they own. `taggedProductIds` is an opaque passthrough (Wear has no
 * first-class product catalog yet — STEP3 §3.4).
 */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const text = bodyString(body, 'body').slice(0, MAX_POST_BODY);
  if (!text) throw new ApiError(422, 'empty_post', 'Post body must not be empty.');

  const brandSlug = bodyString(body, 'brandSlug');
  let brandId: string | null = null;
  if (brandSlug) {
    const brand = await ctx.store.brands.getBySlug(brandSlug);
    // Only the brand owner may publish as their brand; otherwise post as self.
    if (brand && brand.ownerUserId === userId) brandId = brand.id;
  }

  const entry = await ctx.store.posts.create({
    authorId: userId,
    brandId,
    body: text,
    taggedProductIds: bodyStringArray(body, 'taggedProductIds'),
  });
  return json(await hydratePost(ctx.store, entry), 201);
});
