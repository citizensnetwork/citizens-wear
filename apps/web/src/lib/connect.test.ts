import { describe, expect, it } from 'vitest';
import { __resetConnectClientForTests, getConnectClient } from './connect';

describe('getConnectClient', () => {
  it('returns a singleton ConnectClient that health-checks OK in mock mode', async () => {
    const a = getConnectClient();
    const b = getConnectClient();
    expect(a).toBe(b);

    const status = await a.healthCheck();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe('mock');
  });

  it('rebuilds the singleton after a test reset', () => {
    const before = getConnectClient();
    __resetConnectClientForTests();
    expect(getConnectClient()).not.toBe(before);
  });
});
