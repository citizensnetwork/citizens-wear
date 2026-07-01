import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody, readPageParams } from '@/lib/api/params';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_BODY = 4000;

/** GET /api/conversations/:id/messages — paged messages (member-only). */
export const GET = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const page = await ctx.store.messages.list(params.id!, userId, readPageParams(new URL(req.url)));
  await ctx.store.conversations.markRead(params.id!, userId);
  return json(page);
});

/** POST /api/conversations/:id/messages { body } — send a message. */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const text = bodyString(await readJsonBody(req), 'body').slice(0, MAX_MESSAGE_BODY);
  if (!text) throw new ApiError(422, 'empty_message', 'Message body must not be empty.');
  const message = await ctx.store.messages.send({
    conversationId: params.id!,
    authorId: userId,
    body: text,
  });
  return json(message, 201);
});
