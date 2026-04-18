/**
 * Citizens Connect integration contract.
 *
 * Citizens Wear consumes Citizens Connect as an upstream identity and catalog
 * service. This file defines the *contract* — the set of capabilities Wear
 * expects from Connect — as TypeScript interfaces. A mock implementation lives
 * under `./mock` and is used for development, tests, and for running Wear
 * standalone until the real Connect HTTP/OIDC client lands in Phase 3.
 *
 * Design notes:
 *   - All identifiers are opaque strings (Connect-owned). Wear never invents
 *     a user/brand/product id; it mirrors Connect's.
 *   - All methods are async and may throw `ConnectError`.
 *   - Results are read-only snapshots; mutation happens in Connect, not Wear.
 */

/** Opaque identifier issued by Citizens Connect. */
export type ConnectId = string;

export type IsoDateTime = string;

/** A Kingdom citizen (human user). */
export interface ConnectUser {
  readonly id: ConnectId;
  readonly handle: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly createdAt: IsoDateTime;
}

/** A Christian clothing brand (organization account). */
export interface ConnectBrand {
  readonly id: ConnectId;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly websiteUrl: string | null;
  readonly logoUrl: string | null;
  readonly verified: boolean;
  readonly ownerUserId: ConnectId;
}

export type ProductStockState = 'in_stock' | 'low' | 'sold_out' | 'preorder';

export interface ConnectProduct {
  readonly id: ConnectId;
  readonly brandId: ConnectId;
  readonly title: string;
  readonly description: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly imageUrls: readonly string[];
  readonly stockState: ProductStockState;
  readonly updatedAt: IsoDateTime;
}

/** A verified session issued by Connect. */
export interface ConnectSession {
  readonly userId: ConnectId;
  readonly issuedAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
  readonly scopes: readonly string[];
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

/** Authentication against Citizens Connect. */
export interface AuthProvider {
  /** Verify a Connect-issued token and return the associated session. */
  verifyToken(token: string): Promise<ConnectSession>;

  /** Resolve the current user for a session. Returns `null` if revoked. */
  getCurrentUser(session: ConnectSession): Promise<ConnectUser | null>;
}

/** Read-through directory of Kingdom citizens. */
export interface UserDirectory {
  getById(id: ConnectId): Promise<ConnectUser | null>;
  getByHandle(handle: string): Promise<ConnectUser | null>;
  search(query: string, params?: PageParams): Promise<Page<ConnectUser>>;
}

/** Read-through directory of Christian clothing brands. */
export interface BrandDirectory {
  getById(id: ConnectId): Promise<ConnectBrand | null>;
  getBySlug(slug: string): Promise<ConnectBrand | null>;
  listAll(params?: PageParams): Promise<Page<ConnectBrand>>;
  listForOwner(userId: ConnectId): Promise<readonly ConnectBrand[]>;
}

/** Read-through catalog of brand products (stock, pricing, imagery). */
export interface ProductCatalog {
  getById(id: ConnectId): Promise<ConnectProduct | null>;
  listForBrand(brandId: ConnectId, params?: PageParams): Promise<Page<ConnectProduct>>;
}

/** Domain events Connect may emit into Wear (Phase 3 wires this to webhooks). */
export type ConnectEvent =
  | { readonly type: 'user.updated'; readonly user: ConnectUser }
  | { readonly type: 'brand.updated'; readonly brand: ConnectBrand }
  | { readonly type: 'product.updated'; readonly product: ConnectProduct }
  | {
      readonly type: 'product.stock_changed';
      readonly productId: ConnectId;
      readonly stockState: ProductStockState;
    };

export type ConnectEventHandler = (event: ConnectEvent) => void | Promise<void>;

/** A minimal pub/sub surface for Connect -> Wear domain events. */
export interface EventBus {
  subscribe(handler: ConnectEventHandler): () => void;
  /**
   * Publish an event. In production this is invoked by the webhook receiver;
   * in tests/mock it can be invoked directly to simulate upstream changes.
   */
  publish(event: ConnectEvent): Promise<void>;
}

/** The full capability surface Wear expects from Connect. */
export interface ConnectClient {
  readonly auth: AuthProvider;
  readonly users: UserDirectory;
  readonly brands: BrandDirectory;
  readonly products: ProductCatalog;
  readonly events: EventBus;
  /** Lightweight probe used by `/api/connect/status`. */
  healthCheck(): Promise<ConnectStatus>;
}

export interface ConnectStatus {
  readonly ok: boolean;
  readonly mode: 'mock' | 'live';
  readonly checkedAt: IsoDateTime;
  readonly message?: string;
}

/** All errors thrown by a `ConnectClient` should be `ConnectError` instances. */
export class ConnectError extends Error {
  public readonly code: string;
  public readonly status: number | undefined;

  public constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ConnectError';
    this.code = code;
    this.status = status;
  }
}
