'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { getConnectClient } from './connect';
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
