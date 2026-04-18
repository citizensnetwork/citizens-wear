import { describe, expect, it, vi } from 'vitest';
import {
  ConnectError,
  FIXTURE_VALID_TOKEN,
  MockConnectClient,
  fixtureBrands,
  fixtureProducts,
  fixtureUsers,
} from '../src/index';
import type { ConnectClient } from '../src/index';

/**
 * Contract tests. These are written against the `ConnectClient` interface,
 * not against `MockConnectClient` specifically. When the real HTTP client
 * lands in Phase 3 it must satisfy exactly the same expectations.
 */

function makeClient(): ConnectClient {
  return new MockConnectClient();
}

describe('AuthProvider', () => {
  it('verifies a valid token and resolves the current user', async () => {
    const client = makeClient();
    const session = await client.auth.verifyToken(FIXTURE_VALID_TOKEN);
    expect(session.userId).toBe('usr_001');
    const user = await client.auth.getCurrentUser(session);
    expect(user?.handle).toBe('hannah');
  });

  it('rejects an invalid token with ConnectError', async () => {
    const client = makeClient();
    await expect(client.auth.verifyToken('nope')).rejects.toBeInstanceOf(ConnectError);
  });
});

describe('UserDirectory', () => {
  it('looks up users by id and handle', async () => {
    const client = makeClient();
    expect((await client.users.getById('usr_001'))?.handle).toBe('hannah');
    expect((await client.users.getByHandle('SAMUEL'))?.id).toBe('usr_002');
    expect(await client.users.getById('missing')).toBeNull();
  });

  it('searches by display name and handle', async () => {
    const client = makeClient();
    const page = await client.users.search('han');
    expect(page.items.map((u) => u.id)).toEqual(['usr_001']);
  });

  it('paginates results', async () => {
    const client = makeClient();
    const page = await client.users.search('', { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('1');
    const next = await client.users.search('', { limit: 1, cursor: page.nextCursor! });
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
  });

  it('rejects invalid cursors', async () => {
    const client = makeClient();
    await expect(client.users.search('', { cursor: 'not-a-number' })).rejects.toBeInstanceOf(
      ConnectError,
    );
  });
});

describe('BrandDirectory', () => {
  it('resolves brands by id and slug and lists owner brands', async () => {
    const client = makeClient();
    expect((await client.brands.getById('brd_001'))?.slug).toBe('salt-and-light');
    expect((await client.brands.getBySlug('cornerstone-co'))?.id).toBe('brd_002');
    const owned = await client.brands.listForOwner('usr_001');
    expect(owned.map((b) => b.id)).toEqual(['brd_001']);
  });

  it('listAll includes all fixture brands', async () => {
    const client = makeClient();
    const page = await client.brands.listAll();
    expect(page.items).toHaveLength(fixtureBrands.length);
  });

  it('search matches name, slug, and tagline (case-insensitive)', async () => {
    const client = makeClient();
    expect((await client.brands.search('SALT')).items.map((b) => b.id)).toEqual(['brd_001']);
    expect((await client.brands.search('cornerstone-co')).items.map((b) => b.id)).toEqual([
      'brd_002',
    ]);
    expect((await client.brands.search('rock')).items.map((b) => b.id)).toEqual(['brd_002']);
    expect((await client.brands.search('')).items).toHaveLength(fixtureBrands.length);
  });
});

describe('ProductCatalog', () => {
  it('lists products for a brand', async () => {
    const client = makeClient();
    const page = await client.products.listForBrand('brd_001');
    expect(page.items.map((p) => p.id)).toEqual(['prd_001', 'prd_002']);
  });

  it('returns null for unknown products', async () => {
    const client = makeClient();
    expect(await client.products.getById('missing')).toBeNull();
  });

  it('search matches title and description (case-insensitive)', async () => {
    const client = makeClient();
    expect((await client.products.search('hoodie')).items.map((p) => p.id)).toEqual(['prd_002']);
    expect((await client.products.search('cap')).items.map((p) => p.id)).toEqual(['prd_003']);
    expect((await client.products.search('cotton')).items.map((p) => p.id)).toEqual(['prd_001']);
  });
});

describe('EventBus', () => {
  it('delivers published events to subscribers', async () => {
    const client = makeClient();
    const handler = vi.fn();
    const unsubscribe = client.events.subscribe(handler);

    await client.events.publish({
      type: 'product.stock_changed',
      productId: 'prd_001',
      stockState: 'sold_out',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const updated = await client.products.getById('prd_001');
    expect(updated?.stockState).toBe('sold_out');

    unsubscribe();
    await client.events.publish({
      type: 'product.stock_changed',
      productId: 'prd_001',
      stockState: 'in_stock',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('upserts products on product.updated', async () => {
    const client = makeClient();
    const newProduct = {
      ...fixtureProducts[0]!,
      id: 'prd_new',
      title: 'New Drop Tee',
    };
    await client.events.publish({ type: 'product.updated', product: newProduct });
    expect((await client.products.getById('prd_new'))?.title).toBe('New Drop Tee');
  });
});

describe('healthCheck', () => {
  it('returns ok/mock with a deterministic timestamp when `now` is overridden', async () => {
    const fixedNow = new Date('2026-04-18T00:00:00.000Z');
    const client = new MockConnectClient({ now: () => fixedNow });
    const status = await client.healthCheck();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe('mock');
    expect(status.checkedAt).toBe(fixedNow.toISOString());
  });
});

describe('fixtures', () => {
  it('exposes stable user, brand, and product fixtures', () => {
    expect(fixtureUsers).toHaveLength(2);
    expect(fixtureBrands).toHaveLength(2);
    expect(fixtureProducts).toHaveLength(3);
  });
});
