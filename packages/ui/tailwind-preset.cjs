/**
 * Tailwind preset for Citizens Wear.
 *
 * Kept in CommonJS so Tailwind's Node-based config loader can require it
 * directly without a build step. Values must stay in sync with
 * `src/tokens.ts`; the tokens file is the human source of truth.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF7',
        'paper-soft': '#F3F1EC',
        ink: '#0B0B0B',
        'ink-soft': '#4A4A4A',
        gold: {
          DEFAULT: '#C9A24A',
          deep: '#A88535',
          muted: '#F2E7C9',
        },
        border: '#E5E2DA',
      },
      fontFamily: {
        display: [
          'Cormorant Garamond',
          'Playfair Display',
          'ui-serif',
          'Georgia',
          'serif',
        ],
        body: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.5rem',
      },
    },
  },
  plugins: [],
};
