/**
 * Citizens Wear design tokens.
 *
 * Palette ratio target: 50% white / 20% black / 30% gold.
 *   - `paper` (near-white) is the dominant surface.
 *   - `ink` (near-black) carries text, borders, and strong accents.
 *   - `gold` is the Citizens Wear signature accent — used for links, active
 *     state, brand marks, and the wordmark. Keep it deliberate; it loses
 *     meaning when over-applied.
 *
 * These tokens are the single source of truth: Tailwind consumes them via
 * the preset exported from `./tailwind-preset.cjs`, and any non-Tailwind
 * surface (emails, images, etc.) should read from here too.
 */

export const colors = {
  /** Near-white paper. Primary surface. */
  paper: '#FBFAF7',
  /** Softer paper for cards and hovered surfaces. */
  paperSoft: '#F3F1EC',
  /** Near-black ink. Primary text. */
  ink: '#0B0B0B',
  /** Muted ink for secondary text. */
  inkSoft: '#4A4A4A',
  /** Citizens Wear signature gold. */
  gold: '#C9A24A',
  /** Hover/active gold — slightly richer. */
  goldDeep: '#A88535',
  /** Subtle gold background for highlights. */
  goldMuted: '#F2E7C9',
  /** Hairline border. */
  border: '#E5E2DA',
} as const;

export type ColorToken = keyof typeof colors;

export const typography = {
  fontFamilyDisplay: '"Cormorant Garamond", "Playfair Display", ui-serif, Georgia, serif',
  fontFamilyBody:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", monospace',
} as const;

/** Spacing scale in rem. Tight, IG-adjacent. */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.5rem',
  6: '2rem',
  7: '3rem',
  8: '4rem',
  9: '6rem',
} as const;

export const radii = {
  none: '0',
  sm: '0.125rem',
  md: '0.25rem',
  lg: '0.5rem',
  full: '9999px',
} as const;

/** Iconography direction (documented; icon set ships in Phase 2+): */
export const iconography = {
  style: 'line',
  strokeWidth: 1.5,
  corner: 'rounded',
  filledStates: ['active', 'selected'],
} as const;
