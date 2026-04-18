import type { WearStore } from '@citizens-wear/db';
import { MemoryWearStore } from '@citizens-wear/db';

/**
 * Single app-wide `WearStore` instance.
 *
 * Phase 2 uses an in-memory store seeded with one follow edge so the landing
 * page and profile pages have something to render. Phase 3 swaps this for a
 * Prisma-backed store — the interface is identical.
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
      ],
    });
  }
  return _store;
}
