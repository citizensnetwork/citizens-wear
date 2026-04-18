import { describe, expect, it, vi } from 'vitest';
import { ConnectError, HttpConnectClient, createConnectClient, fixtureUsers } from '../src/index';

function makeFetch(
  handlers: Array<(url: string, init: RequestInit) => Response | Promise<Response>>,
): typeof fetch {
  let call = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const handler = handlers[call++];
    if (!handler) throw new Error(`Unexpected extra call to ${url}`);
    return handler(url, init ?? {});
  }) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpConnectClient', () => {
  it('verifies tokens via POST /v1/auth/verify with the bearer header', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer tkn');
      expect(headers['x-connect-api-key']).toBe('svc-key');
      return jsonResponse(200, {
        userId: 'usr_001',
        issuedAt: '2026-04-18T00:00:00.000Z',
        expiresAt: '2026-05-18T00:00:00.000Z',
        scopes: ['profile'],
      });
    }) as unknown as typeof fetch;

    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example/',
      apiKey: 'svc-key',
      fetch: fetchSpy,
    });
    const session = await client.auth.verifyToken('tkn');
    expect(session.userId).toBe('usr_001');
    expect(session.scopes).toEqual(['profile']);
  });

  it('maps 404 responses to null for *_Nullable lookups', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(404, { code: 'not_found', message: 'no' })]),
    });
    expect(await client.users.getById('missing')).toBeNull();
  });

  it('encodes handles and slugs safely', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          expect(url).toBe('https://connect.example/v1/users/by-handle/hannah');
          return jsonResponse(200, fixtureUsers[0]);
        },
      ]),
    });
    const user = await client.users.getByHandle('HANNAH');
    expect(user?.id).toBe('usr_001');
  });

  it('raises ConnectError with upstream code/message on non-2xx', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(418, { code: 'teapot', message: 'short and stout' })]),
    });
    await expect(client.brands.listAll()).rejects.toMatchObject({
      name: 'ConnectError',
      code: 'teapot',
      status: 418,
    });
  });

  it('wraps network errors as ConnectError', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: (async () => {
        throw new Error('boom');
      }) as unknown as typeof fetch,
    });
    await expect(client.products.getById('p1')).rejects.toBeInstanceOf(ConnectError);
  });

  it('reports live mode in healthCheck and degrades gracefully on failure', async () => {
    const now = new Date('2026-04-18T00:00:00.000Z');
    const ok = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      now: () => now,
      fetch: makeFetch([() => jsonResponse(200, { ok: true, message: 'up' })]),
    });
    const okStatus = await ok.healthCheck();
    expect(okStatus).toMatchObject({ ok: true, mode: 'live', checkedAt: now.toISOString() });

    const bad = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      now: () => now,
      fetch: (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    });
    const badStatus = await bad.healthCheck();
    expect(badStatus.ok).toBe(false);
    expect(badStatus.mode).toBe('live');
  });

  it('fans subscribed handlers out when events.publish is invoked', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([]),
    });
    const handler = vi.fn();
    client.events.subscribe(handler);
    await client.events.publish({
      type: 'product.stock_changed',
      productId: 'prd_001',
      stockState: 'low',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('createConnectClient', () => {
  it('returns a MockConnectClient by default', async () => {
    const client = createConnectClient();
    const status = await client.healthCheck();
    expect(status.mode).toBe('mock');
  });

  it('returns an HttpConnectClient when mode=live and a baseUrl is provided', async () => {
    const client = createConnectClient({
      mode: 'live',
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(200, { ok: true })]),
      now: () => new Date('2026-04-18T00:00:00.000Z'),
    });
    const status = await client.healthCheck();
    expect(status.mode).toBe('live');
    expect(status.ok).toBe(true);
  });

  it('falls back to mock when mode=live but no baseUrl is configured', async () => {
    const client = createConnectClient({ mode: 'live' });
    expect((await client.healthCheck()).mode).toBe('mock');
  });
});
