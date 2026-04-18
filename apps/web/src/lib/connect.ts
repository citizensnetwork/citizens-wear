import type { ConnectClient } from '@citizens-wear/connect-client';
import { createConnectClient } from '@citizens-wear/connect-client';

/**
 * Single app-wide `ConnectClient` instance.
 *
 * Phase 3 lets deployments switch from the in-memory `MockConnectClient`
 * to the real HTTP-backed Connect service via env:
 *
 *   - `CONNECT_MODE=live` (default: `mock`)
 *   - `CONNECT_BASE_URL=https://connect.example`
 *   - `CONNECT_API_KEY=<service-to-service key, optional>`
 *
 * If `CONNECT_MODE=live` but `CONNECT_BASE_URL` is missing we fall back to
 * the mock client so a misconfigured deployment boots safely; the
 * `/api/connect/status` probe will still report mock mode, making the
 * misconfiguration visible.
 */
let _client: ConnectClient | undefined;

export function getConnectClient(): ConnectClient {
  if (!_client) {
    const mode = process.env.CONNECT_MODE === 'live' ? 'live' : 'mock';
    _client = createConnectClient({
      mode,
      baseUrl: process.env.CONNECT_BASE_URL,
      apiKey: process.env.CONNECT_API_KEY,
    });
  }
  return _client;
}

/** Test-only hook. Resets the singleton so env changes take effect. */
export function __resetConnectClientForTests(): void {
  _client = undefined;
}
