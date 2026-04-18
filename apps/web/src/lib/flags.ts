/**
 * Feature flags for Citizens Wear. Flags default to `off` so production
 * deployments behave conservatively; enable by setting the matching env
 * var to a truthy string (`"1"`, `"true"`, `"on"`).
 */

function flag(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export const featureFlags = {
  /** Phase 4: render a "For You" tab alongside the chronological feed. */
  forYouRanker: (): boolean => flag('CW_FOR_YOU_RANKER'),
};
