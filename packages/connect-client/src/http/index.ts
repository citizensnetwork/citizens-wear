import type {
  AuthProvider,
  BrandDirectory,
  ConnectBrand,
  ConnectClient,
  ConnectEventHandler,
  ConnectProduct,
  ConnectSession,
  ConnectStatus,
  ConnectUser,
  EventBus,
  Page,
  ProductCatalog,
  UserDirectory,
} from '../contract';
import { ConnectError } from '../contract';

/**
 * HTTP/OIDC-style implementation of the Citizens Connect contract.
 *
 * Phase 3 introduces this client so Wear can consume the real Citizens
 * Connect service when it comes online. Until a live Connect deployment
 * exists, callers should continue to use `MockConnectClient`; the factory
 * in `createConnectClient` selects between the two based on env.
 *
 * Design:
 *   - Calls target `{baseUrl}/v1/...` and authenticate with a service
 *     API key if provided. User session tokens are passed through to
 *     endpoints that verify them (never parsed here).
 *   - All non-2xx responses become `ConnectError` with the upstream status.
 *   - The `EventBus` is local: webhook deliveries are dispatched by the
 *     Wear webhook receiver (`apps/web/src/app/api/connect/webhook`) into
 *     `events.publish`, which fans out to in-process subscribers.
 */

export interface HttpConnectClientOptions {
  /** Base URL of the live Connect service, e.g. `https://connect.example`. */
  readonly baseUrl: string;
  /** Service-to-service API key (optional; omitted in dev/staging). */
  readonly apiKey?: string;
  /** Override `fetch` (tests and edge runtimes). */
  readonly fetch?: typeof fetch;
  /** Override `Date.now` (tests). */
  readonly now?: () => Date;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly token?: string;
  readonly body?: unknown;
  readonly query?: Record<string, string | number | undefined>;
}

export class HttpConnectClient implements ConnectClient {
  public readonly auth: AuthProvider;
  public readonly users: UserDirectory;
  public readonly brands: BrandDirectory;
  public readonly products: ProductCatalog;
  public readonly events: EventBus;

  private readonly _baseUrl: string;
  private readonly _apiKey: string | undefined;
  private readonly _fetch: typeof fetch;
  private readonly _now: () => Date;
  private readonly _handlers = new Set<ConnectEventHandler>();

  public constructor(options: HttpConnectClientOptions) {
    if (!options.baseUrl) {
      throw new ConnectError('invalid_config', 'HttpConnectClient requires a baseUrl.');
    }
    this._baseUrl = options.baseUrl.replace(/\/+$/, '');
    this._apiKey = options.apiKey;
    this._fetch = options.fetch ?? fetch;
    this._now = options.now ?? (() => new Date());

    this.auth = {
      verifyToken: async (token) => {
        return this._request<ConnectSession>('/v1/auth/verify', { method: 'POST', token });
      },
      getCurrentUser: async (session) => {
        return this._requestNullable<ConnectUser>('/v1/auth/me', {
          method: 'POST',
          body: { userId: session.userId },
        });
      },
    };

    this.users = {
      getById: async (id) =>
        this._requestNullable<ConnectUser>(`/v1/users/${encodeURIComponent(id)}`),
      getByHandle: async (handle) =>
        this._requestNullable<ConnectUser>(
          `/v1/users/by-handle/${encodeURIComponent(handle.toLowerCase())}`,
        ),
      search: async (query, params) =>
        this._request<Page<ConnectUser>>('/v1/users/search', {
          query: { q: query, cursor: params?.cursor, limit: params?.limit },
        }),
    };

    this.brands = {
      getById: async (id) =>
        this._requestNullable<ConnectBrand>(`/v1/brands/${encodeURIComponent(id)}`),
      getBySlug: async (slug) =>
        this._requestNullable<ConnectBrand>(
          `/v1/brands/by-slug/${encodeURIComponent(slug.toLowerCase())}`,
        ),
      listAll: async (params) =>
        this._request<Page<ConnectBrand>>('/v1/brands', {
          query: { cursor: params?.cursor, limit: params?.limit },
        }),
      listForOwner: async (userId) =>
        this._request<readonly ConnectBrand[]>(`/v1/users/${encodeURIComponent(userId)}/brands`),
    };

    this.products = {
      getById: async (id) =>
        this._requestNullable<ConnectProduct>(`/v1/products/${encodeURIComponent(id)}`),
      listForBrand: async (brandId, params) =>
        this._request<Page<ConnectProduct>>(`/v1/brands/${encodeURIComponent(brandId)}/products`, {
          query: { cursor: params?.cursor, limit: params?.limit },
        }),
    };

    this.events = {
      subscribe: (handler) => {
        this._handlers.add(handler);
        return () => {
          this._handlers.delete(handler);
        };
      },
      publish: async (event) => {
        for (const handler of this._handlers) {
          await handler(event);
        }
      },
    };
  }

  public async healthCheck(): Promise<ConnectStatus> {
    try {
      const res = await this._request<{ ok?: boolean; message?: string }>('/v1/health');
      return {
        ok: res?.ok !== false,
        mode: 'live',
        checkedAt: this._now().toISOString(),
        message: res?.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        mode: 'live',
        checkedAt: this._now().toISOString(),
        message,
      };
    }
  }

  private async _requestNullable<T>(path: string, opts: RequestOptions = {}): Promise<T | null> {
    try {
      return await this._request<T>(path, opts);
    } catch (error) {
      if (error instanceof ConnectError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async _request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this._baseUrl + path);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
    };
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (this._apiKey) {
      headers['x-connect-api-key'] = this._apiKey;
    }
    if (opts.token) {
      headers['authorization'] = `Bearer ${opts.token}`;
    }

    let response: Response;
    try {
      response = await this._fetch(url.toString(), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      throw new ConnectError('network_error', `Failed to reach Connect: ${message}`);
    }

    if (!response.ok) {
      let code = 'http_error';
      let message = `Connect responded with ${response.status}`;
      try {
        const body = (await response.json()) as { code?: string; message?: string };
        if (body?.code) code = body.code;
        if (body?.message) message = body.message;
      } catch {
        // ignore body parse errors; status is enough.
      }
      throw new ConnectError(code, message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
