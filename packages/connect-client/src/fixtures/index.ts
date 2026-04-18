import type { ConnectBrand, ConnectProduct, ConnectSession, ConnectUser } from '../contract';

/**
 * Development/test fixtures for the Citizens Connect contract.
 *
 * These are intentionally small, hand-written, and stable so that tests and
 * the local dev environment stay deterministic.
 */

export const fixtureUsers: readonly ConnectUser[] = [
  {
    id: 'usr_001',
    handle: 'hannah',
    displayName: 'Hannah K.',
    email: 'hannah@example.test',
    avatarUrl: null,
    createdAt: '2026-01-10T12:00:00.000Z',
  },
  {
    id: 'usr_002',
    handle: 'samuel',
    displayName: 'Samuel O.',
    email: 'samuel@example.test',
    avatarUrl: null,
    createdAt: '2026-02-02T09:30:00.000Z',
  },
];

export const fixtureBrands: readonly ConnectBrand[] = [
  {
    id: 'brd_001',
    slug: 'salt-and-light',
    name: 'Salt & Light Apparel',
    tagline: 'Wear the Kingdom.',
    websiteUrl: 'https://example.test/salt-and-light',
    logoUrl: null,
    verified: true,
    ownerUserId: 'usr_001',
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
  },
];

export const fixtureProducts: readonly ConnectProduct[] = [
  {
    id: 'prd_001',
    brandId: 'brd_001',
    title: 'Salt Tee — Ivory',
    description: 'Heavyweight organic cotton tee.',
    priceCents: 4500,
    currency: 'USD',
    imageUrls: [],
    stockState: 'in_stock',
    updatedAt: '2026-04-01T10:00:00.000Z',
  },
  {
    id: 'prd_002',
    brandId: 'brd_001',
    title: 'Light Hoodie — Gold',
    description: 'Midweight fleece hoodie.',
    priceCents: 8900,
    currency: 'USD',
    imageUrls: [],
    stockState: 'low',
    updatedAt: '2026-04-05T10:00:00.000Z',
  },
  {
    id: 'prd_003',
    brandId: 'brd_002',
    title: 'Cornerstone Cap — Black',
    description: 'Structured 6-panel cap.',
    priceCents: 3200,
    currency: 'USD',
    imageUrls: [],
    stockState: 'sold_out',
    updatedAt: '2026-03-20T10:00:00.000Z',
  },
];

export const fixtureSession: ConnectSession = {
  userId: 'usr_001',
  issuedAt: '2026-04-10T12:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scopes: ['profile', 'brands.read', 'products.read'],
};

/** The token the `MockConnectClient` will accept in `verifyToken`. */
export const FIXTURE_VALID_TOKEN = 'mock-valid-token';
