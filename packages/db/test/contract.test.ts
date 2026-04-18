import { describe, expect, it } from 'vitest';
import { MemoryWearStore, WearStoreError } from '../src/index';
import type { WearStore } from '../src/index';

/**
 * Contract tests for `WearStore`. Written against the interface — the Prisma
 * implementation that lands in Phase 3 must satisfy exactly the same cases.
 */

function makeStore(): WearStore {
  return new MemoryWearStore({ now: () => new Date('2026-04-18T00:00:00.000Z') });
}

describe('ProfileRepo', () => {
  it('creates a public profile on first read', async () => {
    const store = makeStore();
    expect(await store.profiles.get('usr_001')).toBeNull();
    const profile = await store.profiles.getOrCreate('usr_001');
    expect(profile.visibility).toBe('public');
    expect(profile.verified).toBe(false);
    expect(profile.bio).toBeNull();
    expect(await store.profiles.get('usr_001')).toEqual(profile);
  });

  it('updates bio, visibility, and verified', async () => {
    const store = makeStore();
    await store.profiles.getOrCreate('usr_001');
    const updated = await store.profiles.update('usr_001', {
      bio: 'Saved by grace.',
      visibility: 'private',
      verified: true,
    });
    expect(updated.bio).toBe('Saved by grace.');
    expect(updated.visibility).toBe('private');
    expect(updated.verified).toBe(true);
  });

  it('update creates the profile if it does not yet exist', async () => {
    const store = makeStore();
    const profile = await store.profiles.update('usr_002', { bio: 'hi' });
    expect(profile.bio).toBe('hi');
    expect(profile.visibility).toBe('public');
  });
});

describe('FollowRepo', () => {
  it('follows, reports counts, and unfollows', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    expect(await store.follows.isFollowing('usr_001', 'usr_002')).toBe(true);
    expect(await store.follows.counts('usr_002')).toEqual({ followers: 1, following: 0 });
    expect(await store.follows.counts('usr_001')).toEqual({ followers: 0, following: 1 });

    await store.follows.unfollow('usr_001', 'usr_002');
    expect(await store.follows.isFollowing('usr_001', 'usr_002')).toBe(false);
    expect(await store.follows.counts('usr_002')).toEqual({ followers: 0, following: 0 });
  });

  it('following the same target twice is idempotent', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    await store.follows.follow('usr_001', 'usr_002');
    expect((await store.follows.followers('usr_002')).length).toBe(1);
  });

  it('unfollowing a non-existent edge is a no-op', async () => {
    const store = makeStore();
    await expect(store.follows.unfollow('usr_001', 'usr_002')).resolves.toBeUndefined();
  });

  it('rejects self-follow', async () => {
    const store = makeStore();
    await expect(store.follows.follow('usr_001', 'usr_001')).rejects.toBeInstanceOf(WearStoreError);
  });

  it('lists followers and following edges', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    await store.follows.follow('usr_003', 'usr_002');
    const followers = await store.follows.followers('usr_002');
    expect(followers.map((e) => e.actorId).sort()).toEqual(['usr_001', 'usr_003']);
    const following = await store.follows.following('usr_001');
    expect(following.map((e) => e.targetId)).toEqual(['usr_002']);
  });
});

describe('SettingsRepo', () => {
  it('returns defaults for unknown users', async () => {
    const store = makeStore();
    const s = await store.settings.get('usr_001');
    expect(s.profileVisibility).toBe('public');
    expect(s.displayNameOverride).toBeNull();
  });

  it('persists updates', async () => {
    const store = makeStore();
    const updated = await store.settings.update('usr_001', {
      displayNameOverride: 'Hannah K',
      profileVisibility: 'private',
    });
    expect(updated.displayNameOverride).toBe('Hannah K');
    expect(updated.profileVisibility).toBe('private');
    const reread = await store.settings.get('usr_001');
    expect(reread).toEqual(updated);
  });
});

describe('seeding', () => {
  it('honours seeded profiles, follows, and settings', async () => {
    const store = new MemoryWearStore({
      seedProfiles: [
        {
          userId: 'usr_001',
          bio: 'seed',
          visibility: 'private',
          verified: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      seedFollows: [
        {
          actorId: 'usr_002',
          targetId: 'usr_001',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      seedSettings: [
        {
          userId: 'usr_001',
          displayNameOverride: 'Seed',
          profileVisibility: 'private',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect((await store.profiles.get('usr_001'))?.bio).toBe('seed');
    expect(await store.follows.isFollowing('usr_002', 'usr_001')).toBe(true);
    expect((await store.settings.get('usr_001')).displayNameOverride).toBe('Seed');
  });
});
