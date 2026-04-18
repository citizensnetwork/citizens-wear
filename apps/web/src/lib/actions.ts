'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ReportReason, ReportSubjectKind, StoryReactionKind } from '@citizens-wear/db';
import { getSession } from './session';
import { getConnectClient } from './connect';
import { getRealtimeBus } from './realtime';
import { getWearStore } from './store';

/**
 * Server actions for the follow graph, post composer, likes, comments, and
 * saves. Exposed as `'use server'` so they can be bound directly to
 * `<form action={...}>` without a client bundle.
 *
 * Each action re-authenticates via `getSession()` and validates Connect ids
 * before touching the store — the store itself only trusts Connect ids it
 * is given.
 */

export async function followUser(formData: FormData): Promise<void> {
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;

  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const client = getConnectClient();
  const target = await client.users.getByHandle(handle);
  if (!target) return;
  if (target.id === session.user.id) return;

  await getWearStore().follows.follow(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath(`/u/${session.user.handle}`);
}

export async function unfollowUser(formData: FormData): Promise<void> {
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;

  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const client = getConnectClient();
  const target = await client.users.getByHandle(handle);
  if (!target) return;

  await getWearStore().follows.unfollow(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath(`/u/${session.user.handle}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — posts, likes, comments, saves.
// ─────────────────────────────────────────────────────────────────────────

const MAX_POST_BODY = 2000;
const MAX_COMMENT_BODY = 500;

export async function createPost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, MAX_POST_BODY);
  if (!body) return;

  const brandSlug = String(formData.get('brandSlug') ?? '').trim();
  const tagged = formData
    .getAll('taggedProductIds')
    .map((v) => String(v).trim())
    .filter(Boolean);

  const client = getConnectClient();
  let brandId: string | null = null;
  if (brandSlug) {
    const brand = await client.brands.getBySlug(brandSlug);
    // Only brand owners may publish as their brand. Anyone else publishes
    // as themselves (brandId=null), silently ignoring the brandSlug field.
    if (brand && brand.ownerUserId === session.user.id) {
      brandId = brand.id;
    }
  }

  // Only keep tagged product ids that belong to the brand we're publishing
  // as (prevents tagging other brands' drops on our posts).
  const validTagged: string[] = [];
  if (brandId) {
    for (const pid of tagged) {
      const product = await client.products.getById(pid);
      if (product && product.brandId === brandId) validTagged.push(pid);
    }
  }

  const { post } = await getWearStore().posts.create({
    authorId: session.user.id,
    brandId,
    body,
    taggedProductIds: validTagged,
  });

  revalidatePath('/feed');
  revalidatePath(`/u/${session.user.handle}`);
  redirect(`/p/${post.id}`);
}

export async function likePost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const postId = String(formData.get('postId') ?? '').trim();
  if (!postId) return;
  await getWearStore().likes.likePost(postId, session.user.id);
  revalidatePath('/feed');
  revalidatePath(`/p/${postId}`);
}

export async function unlikePost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const postId = String(formData.get('postId') ?? '').trim();
  if (!postId) return;
  await getWearStore().likes.unlikePost(postId, session.user.id);
  revalidatePath('/feed');
  revalidatePath(`/p/${postId}`);
}

export async function addComment(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const postId = String(formData.get('postId') ?? '').trim();
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, MAX_COMMENT_BODY);
  const parent = String(formData.get('parentCommentId') ?? '').trim();
  if (!postId || !body) return;
  await getWearStore().comments.create({
    postId,
    authorId: session.user.id,
    body,
    parentCommentId: parent || null,
  });
  revalidatePath(`/p/${postId}`);
}

export async function likeComment(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const commentId = String(formData.get('commentId') ?? '').trim();
  const postId = String(formData.get('postId') ?? '').trim();
  if (!commentId) return;
  await getWearStore().likes.likeComment(commentId, session.user.id);
  if (postId) revalidatePath(`/p/${postId}`);
}

export async function savePost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const postId = String(formData.get('postId') ?? '').trim();
  if (!postId) return;
  const isSaved = await getWearStore().saves.isSaved(session.user.id, postId);
  if (isSaved) {
    await getWearStore().saves.unsavePost(session.user.id, postId);
  } else {
    await getWearStore().saves.savePost(session.user.id, postId);
  }
  revalidatePath('/feed');
  revalidatePath(`/p/${postId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 6 — stories, direct messages, blocks, reports.
// ─────────────────────────────────────────────────────────────────────────

const MAX_STORY_CAPTION = 280;
const MAX_MESSAGE_BODY = 4000;
const VALID_REACTIONS: readonly StoryReactionKind[] = [
  'amen',
  'love',
  'fire',
  'pray',
  'crown',
];
const VALID_REPORT_KINDS: readonly ReportSubjectKind[] = [
  'post',
  'comment',
  'message',
  'story',
  'user',
];
const VALID_REPORT_REASONS: readonly ReportReason[] = [
  'spam',
  'abuse',
  'sexual',
  'self_harm',
  'illegal',
  'other',
];

function safeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function createStory(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const mediaKindRaw = String(formData.get('mediaKind') ?? 'image').trim();
  const mediaKind = mediaKindRaw === 'video' || mediaKindRaw === 'text' ? mediaKindRaw : 'image';
  const mediaUrl = safeUrl(String(formData.get('mediaUrl') ?? '').trim());
  const caption = String(formData.get('caption') ?? '')
    .trim()
    .slice(0, MAX_STORY_CAPTION);
  const audienceRaw = String(formData.get('audience') ?? 'public').trim();
  const audience = audienceRaw === 'followers' ? 'followers' : 'public';

  if (mediaKind === 'text') {
    if (!caption) return;
  } else if (!mediaUrl) {
    return;
  }

  const brandSlug = String(formData.get('brandSlug') ?? '').trim();
  let brandId: string | null = null;
  if (brandSlug) {
    const brand = await getConnectClient().brands.getBySlug(brandSlug);
    if (brand && brand.ownerUserId === session.user.id) brandId = brand.id;
  }

  const story = await getWearStore().stories.create({
    authorId: session.user.id,
    brandId,
    mediaUrl,
    mediaKind,
    caption: caption || null,
    audience,
  });

  getRealtimeBus().publish(`user:${session.user.id}`, {
    kind: 'story.posted',
    storyId: story.id,
    authorId: session.user.id,
    at: story.createdAt,
  });

  revalidatePath('/feed');
  revalidatePath(`/u/${session.user.handle}`);
  redirect(`/stories/${story.id}`);
}

export async function recordStoryView(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const storyId = String(formData.get('storyId') ?? '').trim();
  if (!storyId) return;
  await getWearStore().stories.recordView(storyId, session.user.id);
  revalidatePath(`/stories/${storyId}`);
}

export async function reactToStory(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const storyId = String(formData.get('storyId') ?? '').trim();
  const kindRaw = String(formData.get('kind') ?? '').trim() as StoryReactionKind;
  if (!storyId || !VALID_REACTIONS.includes(kindRaw)) return;
  const reaction = await getWearStore().stories.addReaction({
    storyId,
    userId: session.user.id,
    kind: kindRaw,
  });
  getRealtimeBus().publish(`story:${storyId}`, {
    kind: 'story.reaction',
    storyId,
    userId: session.user.id,
    at: reaction.createdAt,
  });
  revalidatePath(`/stories/${storyId}`);
}

export async function deleteStory(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const storyId = String(formData.get('storyId') ?? '').trim();
  if (!storyId) return;
  await getWearStore().stories.delete(storyId, session.user.id);
  revalidatePath('/feed');
  revalidatePath(`/u/${session.user.handle}`);
  redirect('/feed');
}

export async function createHighlight(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const coverUrl = safeUrl(String(formData.get('coverUrl') ?? '').trim());
  await getWearStore().highlights.create({
    ownerId: session.user.id,
    name,
    coverUrl,
  });
  revalidatePath(`/u/${session.user.handle}`);
}

export async function addStoryToHighlight(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const highlightId = String(formData.get('highlightId') ?? '').trim();
  const storyId = String(formData.get('storyId') ?? '').trim();
  if (!highlightId || !storyId) return;
  await getWearStore().highlights.addStory(highlightId, storyId, session.user.id);
  revalidatePath(`/u/${session.user.handle}`);
}

export async function startDirectConversation(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;
  const target = await getConnectClient().users.getByHandle(handle);
  if (!target || target.id === session.user.id) return;
  const conv = await getWearStore().conversations.getOrCreateDirect(session.user.id, target.id);
  redirect(`/messages/${conv.id}`);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const conversationId = String(formData.get('conversationId') ?? '').trim();
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, MAX_MESSAGE_BODY);
  if (!conversationId || !body) return;
  const message = await getWearStore().messages.send({
    conversationId,
    authorId: session.user.id,
    body,
  });
  getRealtimeBus().publish(`conv:${conversationId}`, {
    kind: 'message.created',
    conversationId,
    messageId: message.id,
    authorId: session.user.id,
    at: message.createdAt,
  });
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages');
}

export async function markConversationRead(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const conversationId = String(formData.get('conversationId') ?? '').trim();
  if (!conversationId) return;
  await getWearStore().conversations.markRead(conversationId, session.user.id);
  getRealtimeBus().publish(`conv:${conversationId}`, {
    kind: 'conversation.read',
    conversationId,
    userId: session.user.id,
    at: new Date().toISOString(),
  });
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages');
}

export async function acceptMessageRequest(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const conversationId = String(formData.get('conversationId') ?? '').trim();
  if (!conversationId) return;
  await getWearStore().conversations.acceptRequest(conversationId, session.user.id);
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages');
}

export async function declineMessageRequest(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const conversationId = String(formData.get('conversationId') ?? '').trim();
  if (!conversationId) return;
  await getWearStore().conversations.declineRequest(conversationId, session.user.id);
  revalidatePath('/messages');
  redirect('/messages');
}

export async function deleteOwnMessage(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const messageId = String(formData.get('messageId') ?? '').trim();
  const conversationId = String(formData.get('conversationId') ?? '').trim();
  if (!messageId) return;
  await getWearStore().messages.deleteOwn(messageId, session.user.id);
  if (conversationId) {
    getRealtimeBus().publish(`conv:${conversationId}`, {
      kind: 'message.deleted',
      conversationId,
      messageId,
      at: new Date().toISOString(),
    });
    revalidatePath(`/messages/${conversationId}`);
  }
}

export async function blockUser(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;
  const target = await getConnectClient().users.getByHandle(handle);
  if (!target || target.id === session.user.id) return;
  await getWearStore().blocks.block(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath('/messages');
}

export async function unblockUser(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;
  const target = await getConnectClient().users.getByHandle(handle);
  if (!target) return;
  await getWearStore().blocks.unblock(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath('/settings');
}

export async function reportSubject(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const subjectKindRaw = String(formData.get('subjectKind') ?? '').trim() as ReportSubjectKind;
  const subjectId = String(formData.get('subjectId') ?? '').trim();
  const reasonRaw = String(formData.get('reason') ?? 'other').trim() as ReportReason;
  const note = String(formData.get('note') ?? '').trim();
  if (!subjectId) return;
  if (!VALID_REPORT_KINDS.includes(subjectKindRaw)) return;
  const reason = VALID_REPORT_REASONS.includes(reasonRaw) ? reasonRaw : 'other';
  await getWearStore().reports.create({
    reporterId: session.user.id,
    subjectKind: subjectKindRaw,
    subjectId,
    reason,
    note: note || null,
  });
}
