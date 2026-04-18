import { describe, expect, it } from 'vitest';
import { getWearStore } from './store';

describe('getWearStore', () => {
  it('returns a singleton WearStore seeded for Phase 2 fixtures', async () => {
    const a = getWearStore();
    const b = getWearStore();
    expect(a).toBe(b);

    const profile = await a.profiles.get('usr_001');
    expect(profile).not.toBeNull();
    expect(profile?.verified).toBe(true);

    const counts = await a.follows.counts('usr_001');
    expect(counts.followers).toBeGreaterThanOrEqual(1);
  });
});
