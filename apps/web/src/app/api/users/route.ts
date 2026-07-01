import { handler, json } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';
import { readPageParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

/** GET /api/users?q=&cursor=&limit= — search the identity mirror. */
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q') ?? '';
  const page = await ctx.store.users.search(query, readPageParams(url));
  return json({ items: page.items.map(toUserDto), nextCursor: page.nextCursor });
});
