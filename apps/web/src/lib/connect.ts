import type { ConnectClient } from '@citizens-wear/connect-client';
import { MockConnectClient } from '@citizens-wear/connect-client';

/**
 * Single app-wide `ConnectClient` instance.
 *
 * In Phase 1 this is always the `MockConnectClient`. Phase 3 will branch on
 * `process.env.CONNECT_MODE` to construct a live HTTP/OIDC client.
 */
let _client: ConnectClient | undefined;

export function getConnectClient(): ConnectClient {
  if (!_client) {
    _client = new MockConnectClient();
  }
  return _client;
}
