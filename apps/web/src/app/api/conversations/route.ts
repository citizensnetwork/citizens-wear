import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';
import type { ConversationRequestState, WearUser } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations?state=accepted|requested — the caller's inbox,
 * newest-activity first, with the other members hydrated.
 */
export const GET = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const stateRaw = new URL(req.url).searchParams.get('state');
  const requestState: ConversationRequestState | undefined =
    stateRaw === 'accepted' || stateRaw === 'requested' ? stateRaw : undefined;
  const summaries = await ctx.store.conversations.listForUser(
    userId,
    requestState ? { requestState } : undefined,
  );

  const otherIds = new Set<string>();
  for (const s of summaries) for (const m of s.members) if (m.userId !== userId) otherIds.add(m.userId);
  const users = new Map<string, WearUser>();
  await Promise.all(
    [...otherIds].map(async (id) => {
      const u = await ctx.store.users.getById(id);
      if (u) users.set(id, u);
    }),
  );

  return json({
    conversations: summaries.map((s) => ({
      id: s.conversation.id,
      kind: s.conversation.kind,
      name: s.conversation.name,
      updatedAt: s.conversation.updatedAt,
      unreadCount: s.unreadCount,
      lastMessage: s.lastMessage,
      members: s.members
        .filter((m) => m.userId !== userId)
        .map((m) => (users.has(m.userId) ? toUserDto(users.get(m.userId)!) : { id: m.userId })),
    })),
  });
});

/** POST /api/conversations { handle } — get-or-create a 1:1 DM. */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const handle = bodyString(await readJsonBody(req), 'handle');
  if (!handle) throw new ApiError(400, 'missing_handle', 'A handle is required.');
  const target = await ctx.store.users.getByHandle(handle);
  if (!target) throw new ApiError(404, 'user_not_found', `Unknown user @${handle}.`);
  if (target.id === userId) throw new ApiError(400, 'self_dm', 'Cannot DM yourself.');
  const conv = await ctx.store.conversations.getOrCreateDirect(userId, target.id);
  return json({ id: conv.id }, 201);
});
