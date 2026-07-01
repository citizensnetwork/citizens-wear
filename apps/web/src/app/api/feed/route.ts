import { handler, json, requireUserId } from '@/lib/api/route-context';
import { hydrateFeed } from '@/lib/api/serializers';
import { readPageParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feed?mode=for-you|chronological&cursor=&limit= — the signed-in
 * user's home feed, fully hydrated with post authors and brands.
 */
export const GET = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const url = new URL(req.url);
  const params = readPageParams(url);
  const mode = url.searchParams.get('mode') === 'chronological' ? 'chronological' : 'for-you';
  const page =
    mode === 'chronological'
      ? await ctx.store.posts.feedChronological(userId, params)
      : await ctx.store.posts.feedForYou(userId, params);
  return json({ mode, ...(await hydrateFeed(ctx.store, page)) });
});
