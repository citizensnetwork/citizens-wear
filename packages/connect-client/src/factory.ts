import type { ConnectClient } from './contract';
import { MockConnectClient } from './mock/index';
import { HttpConnectClient } from './http/index';

/**
 * Factory that selects between `MockConnectClient` and `HttpConnectClient`
 * based on environment. This is the one place the app layer (or any other
 * consumer) needs to touch when Citizens Connect goes live — everything
 * above this line programs against `ConnectClient`.
 *
 * Selection:
 *   - `mode: 'live'` + a `baseUrl`  → `HttpConnectClient`.
 *   - anything else                 → `MockConnectClient`.
 *
 * In Next.js the app-level wiring in `apps/web/src/lib/connect.ts` reads
 * `process.env.CONNECT_MODE`, `CONNECT_BASE_URL`, and `CONNECT_API_KEY` and
 * forwards them here.
 */
export interface ConnectFactoryOptions {
  readonly mode?: 'mock' | 'live';
  readonly baseUrl?: string;
  readonly apiKey?: string;
  /** Injected for testing; normally left undefined. */
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

export function createConnectClient(options: ConnectFactoryOptions = {}): ConnectClient {
  if (options.mode === 'live' && options.baseUrl) {
    return new HttpConnectClient({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      fetch: options.fetch,
      now: options.now,
    });
  }
  return new MockConnectClient(options.now ? { now: options.now } : undefined);
}
