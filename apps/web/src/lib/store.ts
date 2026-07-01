import type { WearStore } from '@citizens-wear/db';
import { MemoryWearStore } from '@citizens-wear/db';
import { getSupabaseEnv } from './supabase/env';
import { createWearServerClient } from './supabase/server';
import { createSupabaseWearStore } from './supabase-wear-store';

/**
 * Single app-wide `WearStore` instance.
 *
 * Phase 2 uses an in-memory store seeded with one follow edge so the landing
 * page and profile pages have something to render. Phase 3 swaps this for a
 * Prisma-backed store — the interface is identical. Phase 4 extends the
 * seed with a couple of posts so the feed, post detail, and activity tab
 * render without first requiring the composer. Phase 6 seeds an active
 * story for one of the fixture brands plus a mutually-followed DM thread
 * so the stories tray and `/messages` inbox are non-empty out of the box.
 */
let _store: WearStore | undefined;

/**
 * The fixture stories use a far-future expiry so they never age out of the
 * seed. Real stories created via the composer get the standard 24h TTL.
 */
const FAR_FUTURE = '2099-12-31T23:59:59.000Z';

export function getWearStore(): WearStore {
  if (!_store) {
    _store = new MemoryWearStore({
      seedUsers: [
        {
          id: 'usr_001',
          handle: 'hannah',
          displayName: 'Hannah K.',
          avatarUrl: null,
          createdAt: '2026-01-10T12:00:00.000Z',
          updatedAt: '2026-01-10T12:00:00.000Z',
        },
        {
          id: 'usr_002',
          handle: 'samuel',
          displayName: 'Samuel O.',
          avatarUrl: null,
          createdAt: '2026-02-02T09:30:00.000Z',
          updatedAt: '2026-02-02T09:30:00.000Z',
        },
      ],
      seedBrands: [
        {
          id: 'brd_001',
          slug: 'salt-and-light',
          name: 'Salt & Light Apparel',
          tagline: 'Wear the Kingdom.',
          websiteUrl: 'https://example.test/salt-and-light',
          logoUrl: null,
          verified: true,
          ownerUserId: 'usr_001',
          connectContributorId: null,
          createdAt: '2026-01-10T12:00:00.000Z',
          updatedAt: '2026-01-10T12:00:00.000Z',
        },
        {
          id: 'brd_002',
          slug: 'cornerstone-co',
          name: 'Cornerstone Co.',
          tagline: 'Built on the Rock.',
          websiteUrl: null,
          logoUrl: null,
          verified: false,
          ownerUserId: 'usr_002',
          connectContributorId: null,
          createdAt: '2026-02-02T09:30:00.000Z',
          updatedAt: '2026-02-02T09:30:00.000Z',
        },
      ],
      seedProfiles: [
        {
          userId: 'usr_001',
          bio: 'Building Salt & Light Apparel. Wear the Kingdom.',
          visibility: 'public',
          verified: true,
          createdAt: '2026-01-10T12:00:00.000Z',
          updatedAt: '2026-01-10T12:00:00.000Z',
        },
        {
          userId: 'usr_002',
          bio: 'Founder, Cornerstone Co. Built on the Rock.',
          visibility: 'public',
          verified: false,
          createdAt: '2026-02-02T09:30:00.000Z',
          updatedAt: '2026-02-02T09:30:00.000Z',
        },
      ],
      seedFollows: [
        {
          actorId: 'usr_002',
          targetId: 'usr_001',
          createdAt: '2026-02-10T09:00:00.000Z',
        },
        {
          actorId: 'usr_001',
          targetId: 'usr_002',
          createdAt: '2026-02-10T09:05:00.000Z',
        },
      ],
      seedPosts: [
        {
          post: {
            id: 'pst_seed_001',
            authorId: 'usr_001',
            brandId: 'brd_001',
            body: 'New drop — the Salt Tee lands Friday. #Kingdom #SaltAndLight',
            createdAt: '2026-04-15T12:00:00.000Z',
            updatedAt: '2026-04-15T12:00:00.000Z',
            taggedProductIds: ['prd_001'],
          },
          media: [],
        },
        {
          post: {
            id: 'pst_seed_002',
            authorId: 'usr_002',
            brandId: null,
            body: 'Grateful for the community picking up Cornerstone caps this week. #Cornerstone #Kingdom',
            createdAt: '2026-04-16T09:30:00.000Z',
            updatedAt: '2026-04-16T09:30:00.000Z',
            taggedProductIds: [],
          },
          media: [],
        },
      ],
      seedStories: [
        {
          id: 'sty_seed_001',
          authorId: 'usr_001',
          brandId: 'brd_001',
          mediaUrl: null,
          mediaKind: 'text',
          caption: 'Friday drop loading. Set a reminder. ✝️',
          audience: 'public',
          createdAt: '2026-04-18T10:00:00.000Z',
          expiresAt: FAR_FUTURE,
        },
        {
          id: 'sty_seed_002',
          authorId: 'usr_002',
          brandId: null,
          mediaUrl: null,
          mediaKind: 'text',
          caption: 'Caps re-stocked. First come, first served.',
          audience: 'public',
          createdAt: '2026-04-18T11:30:00.000Z',
          expiresAt: FAR_FUTURE,
        },
      ],
      seedConversations: [
        {
          conversation: {
            id: 'cnv_seed_001',
            kind: 'direct',
            name: null,
            createdById: 'usr_001',
            createdAt: '2026-04-17T08:00:00.000Z',
            updatedAt: '2026-04-17T08:05:00.000Z',
          },
          members: [
            {
              conversationId: 'cnv_seed_001',
              userId: 'usr_001',
              joinedAt: '2026-04-17T08:00:00.000Z',
              lastReadAt: '2026-04-17T08:05:00.000Z',
              mutedUntil: null,
              requestState: 'accepted',
              role: 'owner',
            },
            {
              conversationId: 'cnv_seed_001',
              userId: 'usr_002',
              joinedAt: '2026-04-17T08:00:00.000Z',
              lastReadAt: '2026-04-17T08:00:00.000Z',
              mutedUntil: null,
              requestState: 'accepted',
              role: 'member',
            },
          ],
          messages: [
            {
              id: 'msg_seed_001',
              conversationId: 'cnv_seed_001',
              authorId: 'usr_001',
              body: 'Hey Samuel — want to swap a Salt Tee for one of your caps?',
              createdAt: '2026-04-17T08:00:30.000Z',
              deletedAt: null,
            },
            {
              id: 'msg_seed_002',
              conversationId: 'cnv_seed_001',
              authorId: 'usr_002',
              body: 'Always. I’ll bring two on Sunday.',
              createdAt: '2026-04-17T08:05:00.000Z',
              deletedAt: null,
            },
          ],
        },
      ],
    });
  }
  return _store;
}

/** Test-only: reset the singleton so tests can seed a fresh store. */
export function __resetWearStoreForTests(): void {
  _store = undefined;
}

/**
 * Request-scoped `WearStore` accessor — the canonical way route handlers and
 * server actions obtain the store.
 *
 * When the shared Supabase project is configured, this builds a fresh
 * `SupabaseWearStore` **per request** from a `wear`-scoped server client that
 * carries the caller's auth cookies, so every query is RLS-enforced as the
 * signed-in user (never a process singleton — the identity differs per
 * request). Without Supabase env (local dev / tests / preview) it returns the
 * seeded in-memory singleton, so the app still renders public content.
 */
export async function getRequestWearStore(): Promise<WearStore> {
  if (!getSupabaseEnv()) return getWearStore();
  const client = await createWearServerClient();
  return createSupabaseWearStore(client);
}
