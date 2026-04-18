import type {
  AuthProvider,
  BrandDirectory,
  ConnectBrand,
  ConnectClient,
  ConnectEvent,
  ConnectEventHandler,
  ConnectId,
  ConnectProduct,
  ConnectSession,
  ConnectStatus,
  ConnectUser,
  EventBus,
  Page,
  PageParams,
  ProductCatalog,
  UserDirectory,
} from '../contract';
import { ConnectError } from '../contract';
import {
  FIXTURE_VALID_TOKEN,
  fixtureBrands,
  fixtureProducts,
  fixtureSession,
  fixtureUsers,
} from '../fixtures/index';

/**
 * In-memory implementation of the Citizens Connect contract.
 *
 * Used by local dev, unit/integration tests, and Wear deployments running
 * without a live Connect backend. Phase 3 replaces this with an HTTP/OIDC
 * client against the real service; nothing in Wear above this layer should
 * need to change.
 */

const DEFAULT_LIMIT = 20;

function paginate<T>(items: readonly T[], params?: PageParams): Page<T> {
  const limit = Math.max(1, Math.min(100, params?.limit ?? DEFAULT_LIMIT));
  const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new ConnectError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
  }
  const slice = items.slice(start, start + limit);
  const nextIndex = start + slice.length;
  return {
    items: slice,
    nextCursor: nextIndex < items.length ? String(nextIndex) : null,
  };
}

export interface MockConnectClientOptions {
  readonly users?: readonly ConnectUser[];
  readonly brands?: readonly ConnectBrand[];
  readonly products?: readonly ConnectProduct[];
  readonly validToken?: string;
  readonly session?: ConnectSession;
  /** Override `Date.now` (useful for deterministic tests). */
  readonly now?: () => Date;
}

export class MockConnectClient implements ConnectClient {
  public readonly auth: AuthProvider;
  public readonly users: UserDirectory;
  public readonly brands: BrandDirectory;
  public readonly products: ProductCatalog;
  public readonly events: EventBus;

  private readonly _users: ConnectUser[];
  private readonly _brands: ConnectBrand[];
  private readonly _products: ConnectProduct[];
  private readonly _validToken: string;
  private readonly _session: ConnectSession;
  private readonly _now: () => Date;
  private readonly _handlers = new Set<ConnectEventHandler>();

  public constructor(options: MockConnectClientOptions = {}) {
    this._users = [...(options.users ?? fixtureUsers)];
    this._brands = [...(options.brands ?? fixtureBrands)];
    this._products = [...(options.products ?? fixtureProducts)];
    this._validToken = options.validToken ?? FIXTURE_VALID_TOKEN;
    this._session = options.session ?? fixtureSession;
    this._now = options.now ?? (() => new Date());

    this.auth = {
      verifyToken: async (token) => {
        if (token !== this._validToken) {
          throw new ConnectError('invalid_token', 'Token was not issued by Connect.', 401);
        }
        return this._session;
      },
      getCurrentUser: async (session) => {
        return this._users.find((u) => u.id === session.userId) ?? null;
      },
    };

    this.users = {
      getById: async (id) => this._users.find((u) => u.id === id) ?? null,
      getByHandle: async (handle) =>
        this._users.find((u) => u.handle.toLowerCase() === handle.toLowerCase()) ?? null,
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const matches = q
          ? this._users.filter(
              (u) => u.handle.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
            )
          : this._users;
        return paginate(matches, params);
      },
    };

    this.brands = {
      getById: async (id) => this._brands.find((b) => b.id === id) ?? null,
      getBySlug: async (slug) =>
        this._brands.find((b) => b.slug.toLowerCase() === slug.toLowerCase()) ?? null,
      listAll: async (params) => paginate(this._brands, params),
      listForOwner: async (userId) => this._brands.filter((b) => b.ownerUserId === userId),
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const matches = q
          ? this._brands.filter(
              (b) =>
                b.name.toLowerCase().includes(q) ||
                b.slug.toLowerCase().includes(q) ||
                (b.tagline ?? '').toLowerCase().includes(q),
            )
          : this._brands;
        return paginate(matches, params);
      },
    };

    this.products = {
      getById: async (id) => this._products.find((p) => p.id === id) ?? null,
      listForBrand: async (brandId, params) =>
        paginate(
          this._products.filter((p) => p.brandId === brandId),
          params,
        ),
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const matches = q
          ? this._products.filter(
              (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
            )
          : this._products;
        return paginate(matches, params);
      },
    };

    this.events = {
      subscribe: (handler) => {
        this._handlers.add(handler);
        return () => {
          this._handlers.delete(handler);
        };
      },
      publish: async (event) => {
        this._applyEvent(event);
        for (const handler of this._handlers) {
          await handler(event);
        }
      },
    };
  }

  public async healthCheck(): Promise<ConnectStatus> {
    return {
      ok: true,
      mode: 'mock',
      checkedAt: this._now().toISOString(),
      message: 'MockConnectClient ready.',
    };
  }

  private _applyEvent(event: ConnectEvent): void {
    switch (event.type) {
      case 'user.updated':
        this._upsert(this._users, event.user);
        return;
      case 'brand.updated':
        this._upsert(this._brands, event.brand);
        return;
      case 'product.updated':
        this._upsert(this._products, event.product);
        return;
      case 'product.stock_changed': {
        const idx = this._products.findIndex((p) => p.id === event.productId);
        if (idx !== -1) {
          // The second `if (existing)` is required by `noUncheckedIndexedAccess`
          // in our tsconfig; array index access is typed as `T | undefined`.
          const existing = this._products[idx];
          if (existing) {
            this._products[idx] = {
              ...existing,
              stockState: event.stockState,
              updatedAt: this._now().toISOString(),
            };
          }
        }
        return;
      }
    }
  }

  private _upsert<T extends { readonly id: ConnectId }>(collection: T[], item: T): void {
    const idx = collection.findIndex((x) => x.id === item.id);
    if (idx === -1) {
      collection.push(item);
    } else {
      collection[idx] = item;
    }
  }
}
