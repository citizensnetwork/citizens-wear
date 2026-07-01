import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Route-handler tests for the `/api/*` surface, driven against the seeded
 * in-memory store (no Supabase env → getRouteContext falls back to memory).
 * `getSession` is mocked so we can exercise both anonymous and authed paths.
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { GET as meGET } from './me/route';
import { GET as usersGET } from './users/route';
import { GET as userGET } from './users/[handle]/route';
import { GET as brandsGET, POST as brandsPOST } from './brands/route';
import { GET as brandGET } from './brands/[slug]/route';
import { POST as postsPOST } from './posts/route';
import { GET as feedGET } from './feed/route';
import { POST as followsPOST } from './follows/route';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const jsonBody = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: 'seed', displayName: 'Seed', email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}
function anonymous(): void {
  mockSession.mockResolvedValue(null);
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  mockSession.mockReset();
});

describe('GET /api/me', () => {
  it('401s an anonymous caller', async () => {
    anonymous();
    const res = await meGET(req('/api/me'), route());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns the mirror row, profile and counts for a signed-in user', async () => {
    asUser('usr_001');
    const res = await meGET(req('/api/me'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.handle).toBe('hannah');
    expect(data.counts.followers).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/users', () => {
  it('searches the identity mirror', async () => {
    anonymous();
    const res = await usersGET(req('/api/users?q=han'), route());
    const data = await res.json();
    expect(data.items.map((u: { id: string }) => u.id)).toContain('usr_001');
  });

  it('returns a user profile with owned brands', async () => {
    anonymous();
    const res = await userGET(req('/api/users/hannah'), route({ handle: 'hannah' }));
    const data = await res.json();
    expect(data.user.handle).toBe('hannah');
    expect(data.brands.map((b: { slug: string }) => b.slug)).toContain('salt-and-light');
  });

  it('404s an unknown handle', async () => {
    anonymous();
    const res = await userGET(req('/api/users/nobody'), route({ handle: 'nobody' }));
    expect(res.status).toBe(404);
  });
});

describe('brands', () => {
  it('lists seeded brands', async () => {
    anonymous();
    const res = await brandsGET(req('/api/brands'), route());
    expect((await res.json()).items).toHaveLength(2);
  });

  it('returns a brand with owner and posts', async () => {
    anonymous();
    const res = await brandGET(req('/api/brands/salt-and-light'), route({ slug: 'salt-and-light' }));
    const data = await res.json();
    expect(data.brand.slug).toBe('salt-and-light');
    expect(data.owner.handle).toBe('hannah');
  });

  it('creates a brand for the signed-in owner', async () => {
    asUser('usr_002');
    const res = await brandsPOST(
      req('/api/brands', jsonBody({ slug: 'kingdom-threads', name: 'Kingdom Threads' })),
      route(),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).ownerUserId).toBe('usr_002');
  });

  it('422s a brand create with no name', async () => {
    asUser('usr_002');
    const res = await brandsPOST(req('/api/brands', jsonBody({ slug: 'x' })), route());
    expect(res.status).toBe(422);
  });
});

describe('posts + feed', () => {
  it('creates a post and hydrates its author', async () => {
    asUser('usr_001');
    const res = await postsPOST(req('/api/posts', jsonBody({ body: 'Wear the Kingdom' })), route());
    expect(res.status).toBe(201);
    expect((await res.json()).author.handle).toBe('hannah');
  });

  it('422s an empty post', async () => {
    asUser('usr_001');
    const res = await postsPOST(req('/api/posts', jsonBody({ body: '   ' })), route());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('empty_post');
  });

  it('returns the signed-in user home feed', async () => {
    asUser('usr_001');
    const res = await feedGET(req('/api/feed?mode=chronological'), route());
    const data = await res.json();
    expect(data.mode).toBe('chronological');
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('follows', () => {
  it('follows a user by handle', async () => {
    asUser('usr_001');
    // usr_001 unfollows then re-follows samuel to assert the toggle.
    const res = await followsPOST(req('/api/follows', jsonBody({ handle: 'samuel' })), route());
    expect(res.status).toBe(200);
    expect((await res.json()).following).toBe(true);
  });

  it('401s an anonymous follow', async () => {
    anonymous();
    const res = await followsPOST(req('/api/follows', jsonBody({ handle: 'samuel' })), route());
    expect(res.status).toBe(401);
  });
});
