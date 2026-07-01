import { handler, json, requireUserId } from '@/lib/api/route-context';
import { hydratePost, type PostDto } from '@/lib/api/serializers';

export const dynamic = 'force-dynamic';

/** Bound the tile fan-out so one huge collection can't inflate the payload. */
const MAX_POSTS_PER_COLLECTION = 24;

/**
 * GET /api/me/saves — the caller's save collections ("boards"), each with its
 * saved posts hydrated for the profile boards grid.
 */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const collections = await ctx.store.saves.listForOwner(userId);
  const hydrated = await Promise.all(
    collections.map(async (c) => {
      const entries = await Promise.all(
        c.postIds.slice(0, MAX_POSTS_PER_COLLECTION).map((id) => ctx.store.posts.getById(id)),
      );
      const posts: PostDto[] = [];
      for (const entry of entries) {
        if (entry) posts.push(await hydratePost(ctx.store, entry));
      }
      return {
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        postCount: c.postIds.length,
        posts,
      };
    }),
  );
  return json({ collections: hydrated });
});
