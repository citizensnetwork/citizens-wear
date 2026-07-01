import { afterEach, describe, expect, it } from 'vitest';
import { __resetWearStoreForTests, getRequestWearStore, getWearStore } from './store';

describe('getWearStore', () => {
  it('returns a singleton WearStore seeded for Phase 2 fixtures', async () => {
    const a = getWearStore();
    const b = getWearStore();
    expect(a).toBe(b);

    const profile = await a.profiles.get('usr_001');
    expect(profile).not.toBeNull();
    expect(profile?.verified).toBe(true);

    const counts = await a.follows.counts('usr_001');
    expect(counts.followers).toBeGreaterThanOrEqual(1);
  });

  it('seeds the identity mirror and brands', async () => {
    const store = getWearStore();
    expect((await store.users.getByHandle('hannah'))?.id).toBe('usr_001');
    expect((await store.brands.getBySlug('salt-and-light'))?.ownerUserId).toBe('usr_001');
    expect((await store.brands.listForOwner('usr_002')).map((b) => b.slug)).toEqual([
      'cornerstone-co',
    ]);
  });
});

describe('getRequestWearStore', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  afterEach(() => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  });

  it('falls back to the in-memory singleton when Supabase is unconfigured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const store = await getRequestWearStore();
    // Same seeded singleton the public/dev path uses.
    expect(store).toBe(getWearStore());
    expect((await store.users.getByHandle('samuel'))?.id).toBe('usr_002');
  });

  it('takes the Supabase path when configured (request-scoped, not the singleton)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    // With env present, getRequestWearStore builds a wear-scoped server client
    // (never the in-memory singleton). Outside a request there is no cookie
    // store, so client construction rejects — which still proves the Supabase
    // branch is taken rather than the memory fallback.
    await expect(getRequestWearStore()).rejects.toBeDefined();
  });

  it('exposes a test reset hook', () => {
    expect(() => __resetWearStoreForTests()).not.toThrow();
  });
});
