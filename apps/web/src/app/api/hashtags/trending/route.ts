import { handler, json } from '@/lib/api/route-context';

export const dynamic = 'force-dynamic';

const MAX_TAGS = 20;

/** GET /api/hashtags/trending?limit= — trending hashtags for discover/asides. */
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_TAGS) : 10;
  const tags = await ctx.store.posts.trendingHashtags({ limit });
  return json({ tags });
});
