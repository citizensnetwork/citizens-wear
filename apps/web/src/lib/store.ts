import type { WearStore } from '@citizens-wear/db';
import { MemoryWearStore } from '@citizens-wear/db';

/**
 * Single app-wide `WearStore` instance.
 *
 * Phase 2 uses an in-memory store seeded with one follow edge so the landing
 * page and profile pages have something to render. Phase 3 swaps this for a
 * Prisma-backed store — the interface is identical. Phase 4 extends the
 * seed with a couple of posts so the feed, post detail, and activity tab
 * render without first requiring the composer.
 */
let _store: WearStore | undefined;

export function getWearStore(): WearStore {
  if (!_store) {
    _store = new MemoryWearStore({
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
    });
  }
  return _store;
}

/** Test-only: reset the singleton so tests can seed a fresh store. */
export function __resetWearStoreForTests(): void {
  _store = undefined;
}
