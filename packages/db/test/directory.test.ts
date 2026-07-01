import { describe, expect, it } from 'vitest';
import { MemoryWearStore, WearStoreError } from '../src/index';
import type { WearBrand, WearStore, WearUser } from '../src/index';

/**
 * Contract tests for the Phase-3 identity mirror (`UserRepo`) and Wear-owned
 * brands (`BrandRepo`). The `SupabaseWearStore` that backs production must
 * satisfy exactly these cases against `wear.users` / `wear.brands` under RLS.
 */

const T = '2026-04-18T00:00:00.000Z';

function makeStore(): WearStore {
  return new MemoryWearStore({ now: () => new Date(T) });
}

const seedUser = (over: Partial<WearUser> & Pick<WearUser, 'id' | 'handle'>): WearUser => ({
  displayName: over.handle,
  avatarUrl: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

const seedBrand = (
  over: Partial<WearBrand> & Pick<WearBrand, 'id' | 'slug' | 'ownerUserId'>,
): WearBrand => ({
  name: over.slug,
  tagline: null,
  websiteUrl: null,
  logoUrl: null,
  verified: false,
  connectContributorId: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

describe('UserRepo', () => {
  it('reads the mirror by id and handle (case-insensitive)', async () => {
    const store = new MemoryWearStore({
      seedUsers: [seedUser({ id: 'u1', handle: 'hannah', displayName: 'Hannah K.' })],
    });
    expect((await store.users.getById('u1'))?.handle).toBe('hannah');
    expect((await store.users.getByHandle('HANNAH'))?.id).toBe('u1');
    expect(await store.users.getById('nope')).toBeNull();
    expect(await store.users.getByHandle('nope')).toBeNull();
  });

  it('searches by handle and display name, and paginates', async () => {
    const store = new MemoryWearStore({
      seedUsers: [
        seedUser({ id: 'u1', handle: 'hannah', displayName: 'Hannah K.' }),
        seedUser({ id: 'u2', handle: 'samuel', displayName: 'Samuel O.' }),
        seedUser({ id: 'u3', handle: 'hank', displayName: 'Hank H.' }),
      ],
    });
    const byHandle = await store.users.search('han');
    expect(byHandle.items.map((u) => u.id).sort()).toEqual(['u1', 'u3']);
    const byName = await store.users.search('samuel');
    expect(byName.items.map((u) => u.id)).toEqual(['u2']);
    const firstPage = await store.users.search('', { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBe('2');
    const secondPage = await store.users.search('', { limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('hydrates a new mirror row from a session', async () => {
    const store = makeStore();
    const created = await store.users.upsertFromSession({
      id: 'u1',
      handle: 'hannah',
      displayName: 'Hannah K.',
      avatarUrl: 'https://cdn.test/a.png',
    });
    expect(created).toMatchObject({ id: 'u1', handle: 'hannah', displayName: 'Hannah K.' });
    expect(await store.users.getById('u1')).toEqual(created);
  });

  it('refreshes display fields but keeps the handle on re-upsert', async () => {
    const store = makeStore();
    await store.users.upsertFromSession({ id: 'u1', handle: 'hannah', displayName: 'Hannah' });
    const updated = await store.users.upsertFromSession({
      id: 'u1',
      handle: 'ignored-new-handle',
      displayName: 'Hannah Kay',
      avatarUrl: 'https://cdn.test/new.png',
    });
    expect(updated.handle).toBe('hannah');
    expect(updated.displayName).toBe('Hannah Kay');
    expect(updated.avatarUrl).toBe('https://cdn.test/new.png');
  });

  it('suffixes a colliding handle to keep it unique', async () => {
    const store = new MemoryWearStore({
      seedUsers: [seedUser({ id: 'u1', handle: 'grace' })],
    });
    const second = await store.users.upsertFromSession({
      id: 'u2',
      handle: 'grace',
      displayName: 'Grace Two',
    });
    expect(second.handle).toBe('grace-2');
    const third = await store.users.upsertFromSession({
      id: 'u3',
      handle: 'grace',
      displayName: 'Grace Three',
    });
    expect(third.handle).toBe('grace-3');
  });

  it('falls back to a deterministic handle when none is supplied', async () => {
    const store = makeStore();
    const u = await store.users.upsertFromSession({
      id: 'abcdef12-0000',
      handle: '',
      displayName: 'Anon',
    });
    expect(u.handle).toBe('user_abcdef12');
  });
});

describe('BrandRepo', () => {
  it('reads by id and slug, lists all, and lists for an owner', async () => {
    const store = new MemoryWearStore({
      seedBrands: [
        seedBrand({ id: 'b1', slug: 'salt-and-light', ownerUserId: 'u1' }),
        seedBrand({ id: 'b2', slug: 'cornerstone', ownerUserId: 'u2' }),
      ],
    });
    expect((await store.brands.getById('b1'))?.slug).toBe('salt-and-light');
    expect((await store.brands.getBySlug('CORNERSTONE'))?.id).toBe('b2');
    expect((await store.brands.listAll()).items).toHaveLength(2);
    expect((await store.brands.listForOwner('u1')).map((b) => b.id)).toEqual(['b1']);
  });

  it('searches by name, slug, and tagline', async () => {
    const store = new MemoryWearStore({
      seedBrands: [
        seedBrand({
          id: 'b1',
          slug: 'salt',
          name: 'Salt & Light',
          tagline: 'Wear the Kingdom',
          ownerUserId: 'u1',
        }),
        seedBrand({
          id: 'b2',
          slug: 'rock',
          name: 'Cornerstone',
          tagline: 'Built on the Rock',
          ownerUserId: 'u2',
        }),
      ],
    });
    expect((await store.brands.search('kingdom')).items.map((b) => b.id)).toEqual(['b1']);
    expect((await store.brands.search('rock')).items.map((b) => b.id)).toEqual(['b2']);
  });

  it('creates an owner-scoped brand and rejects a duplicate slug', async () => {
    const store = makeStore();
    const brand = await store.brands.create({
      ownerId: 'u1',
      slug: 'New-Brand',
      name: 'New Brand',
      connectContributorId: 'contrib-1',
    });
    expect(brand.slug).toBe('new-brand'); // normalised
    expect(brand.ownerUserId).toBe('u1');
    expect(brand.verified).toBe(false);
    expect(brand.connectContributorId).toBe('contrib-1');
    await expect(
      store.brands.create({ ownerId: 'u2', slug: 'new-brand', name: 'Dup' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('rejects an empty slug', async () => {
    const store = makeStore();
    await expect(
      store.brands.create({ ownerId: 'u1', slug: '   ', name: 'X' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('updates only the owner’s brand and applies a partial patch', async () => {
    const store = new MemoryWearStore({
      seedBrands: [seedBrand({ id: 'b1', slug: 'salt', name: 'Salt', ownerUserId: 'u1' })],
      now: () => new Date(T),
    });
    const updated = await store.brands.update('b1', 'u1', {
      tagline: 'New tagline',
      connectContributorId: 'contrib-9',
    });
    expect(updated.name).toBe('Salt'); // untouched
    expect(updated.tagline).toBe('New tagline');
    expect(updated.connectContributorId).toBe('contrib-9');
  });

  it('forbids a non-owner from editing a brand', async () => {
    const store = new MemoryWearStore({
      seedBrands: [seedBrand({ id: 'b1', slug: 'salt', ownerUserId: 'u1' })],
    });
    await expect(store.brands.update('b1', 'someone-else', { name: 'Hijack' })).rejects.toThrow(
      /owner/i,
    );
  });

  it('throws when updating an unknown brand', async () => {
    const store = makeStore();
    await expect(store.brands.update('missing', 'u1', { name: 'X' })).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });

  it('can null out the Connect link via an explicit patch', async () => {
    const store = new MemoryWearStore({
      seedBrands: [
        seedBrand({ id: 'b1', slug: 'salt', ownerUserId: 'u1', connectContributorId: 'c1' }),
      ],
    });
    const updated = await store.brands.update('b1', 'u1', { connectContributorId: null });
    expect(updated.connectContributorId).toBeNull();
  });
});
