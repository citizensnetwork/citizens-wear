import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';
import type { WearUser } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

const MAX_COMMENT_BODY = 500;

/** GET /api/posts/:id/comments — the post's comment thread, author-hydrated. */
export const GET = handler(async (_req, ctx, params) => {
  const comments = await ctx.store.comments.listForPost(params.id!);
  const authors = new Map<string, WearUser>();
  await Promise.all(
    [...new Set(comments.map((c) => c.authorId))].map(async (id) => {
      const u = await ctx.store.users.getById(id);
      if (u) authors.set(id, u);
    }),
  );
  return json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentCommentId: c.parentCommentId,
      author: authors.has(c.authorId) ? toUserDto(authors.get(c.authorId)!) : null,
    })),
  });
});

/** POST /api/posts/:id/comments — add a comment (or threaded reply). */
export const POST = handler(async (req, ctx, params) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const text = bodyString(body, 'body').slice(0, MAX_COMMENT_BODY);
  if (!text) throw new ApiError(422, 'empty_comment', 'Comment body must not be empty.');
  const parent = bodyString(body, 'parentCommentId') || null;
  const comment = await ctx.store.comments.create({
    postId: params.id!,
    authorId: userId,
    body: text,
    parentCommentId: parent,
  });
  return json(comment, 201);
});
