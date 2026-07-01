import { ConnectError, type ConnectContributorKind } from '@citizens-wear/connect-client';
import { handler, json } from '@/lib/api/route-context';
import { getConnectClient } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ecosystem/contributors?q=&kind=&cursor=&limit= — the wider Kingdom:
 * Connect's public contributor directory, proxied through `connect-client`
 * (mock in dev, real `/api/v1` when `CONNECT_MODE=live`). Powers the Discover
 * "From the wider Kingdom" rail — mutual discovery across the ecosystem.
 */
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get('kind');
  const kind: ConnectContributorKind | undefined =
    kindRaw === 'ministry' || kindRaw === 'organization' || kindRaw === 'business'
      ? kindRaw
      : undefined;
  const query = url.searchParams.get('q')?.trim() || undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 12;

  try {
    const page = await getConnectClient().contributors.list({ kind, query, cursor, limit });
    return json({
      items: page.items.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        kind: c.kind,
        bio: c.bio,
        logoUrl: c.logoUrl,
        avatarUrl: c.avatarUrl,
        websiteUrl: c.websiteUrl,
      })),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    if (error instanceof ConnectError && error.code === 'invalid_cursor') {
      return json({ error: 'invalid_cursor', message: error.message }, 400);
    }
    // Upstream Connect unreachable/erroring — degrade explicitly, not with a 500.
    const message = error instanceof Error ? error.message : 'Connect unavailable';
    return json({ error: 'upstream_unavailable', message }, 502);
  }
});
