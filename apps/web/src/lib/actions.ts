'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { getConnectClient } from './connect';
import { getWearStore } from './store';

/**
 * Server actions for the follow graph. Exposed as `'use server'` so they can
 * be bound directly to `<form action={...}>` on profile pages without a
 * client bundle.
 *
 * Each action re-authenticates via `getSession()` and validates the target
 * against Citizens Connect before touching the store — the store itself only
 * trusts Connect ids it is given.
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
