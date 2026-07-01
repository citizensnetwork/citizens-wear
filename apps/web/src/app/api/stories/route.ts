import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { toUserDto } from '@/lib/api/serializers';
import { bodyString, readJsonBody } from '@/lib/api/params';
import { safeUrl } from '@/lib/validators';
import type { StoryAudience, StoryMediaKind, WearUser } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

const MAX_STORY_CAPTION = 280;

/** GET /api/stories — the signed-in user's active story tray, author-hydrated. */
export const GET = handler(async (_req, ctx) => {
  const userId = requireUserId(ctx);
  const tray = await ctx.store.stories.trayForViewer(userId);
  const authors = new Map<string, WearUser>();
  await Promise.all(
    tray.map(async (t) => {
      const u = await ctx.store.users.getById(t.authorId);
      if (u) authors.set(t.authorId, u);
    }),
  );
  return json({
    tray: tray.map((t) => ({
      author: authors.has(t.authorId) ? toUserDto(authors.get(t.authorId)!) : null,
      latestStoryId: t.latestStoryId,
      latestCreatedAt: t.latestCreatedAt,
      storyCount: t.storyCount,
      hasUnseen: t.hasUnseen,
    })),
  });
});

/** POST /api/stories — create a 24h story (optionally as an owned brand). */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const mediaKindRaw = bodyString(body, 'mediaKind');
  const mediaKind: StoryMediaKind =
    mediaKindRaw === 'video' || mediaKindRaw === 'text' ? mediaKindRaw : 'image';
  const mediaUrl = safeUrl(bodyString(body, 'mediaUrl'));
  const caption = bodyString(body, 'caption').slice(0, MAX_STORY_CAPTION);
  const audience: StoryAudience = bodyString(body, 'audience') === 'followers' ? 'followers' : 'public';

  if (mediaKind === 'text' && !caption) {
    throw new ApiError(422, 'empty_story', 'Text stories must have a caption.');
  }
  if (mediaKind !== 'text' && !mediaUrl) {
    throw new ApiError(422, 'empty_story', 'Image/video stories must have a media url.');
  }

  const brandSlug = bodyString(body, 'brandSlug');
  let brandId: string | null = null;
  if (brandSlug) {
    const brand = await ctx.store.brands.getBySlug(brandSlug);
    if (brand && brand.ownerUserId === userId) brandId = brand.id;
  }

  const story = await ctx.store.stories.create({
    authorId: userId,
    brandId,
    mediaUrl,
    mediaKind,
    caption: caption || null,
    audience,
  });
  return json(story, 201);
});
