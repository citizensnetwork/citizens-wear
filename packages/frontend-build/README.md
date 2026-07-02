# @citizens/frontend-build

The **shared static-frontend build pipeline** for Citizens ecosystem apps
(Connect · Wear · Vision). Extracted at ecosystem Step 4 from the
near-identical `citizens-connect/scripts/build-frontend.js` and
`citizens-wear/apps/web/scripts/build-frontend.js` so the pipeline exists
**once**; each app keeps a thin, config-only wrapper.

What one `buildFrontend()` call does for an app:

1. Copy `src/frontend/*` → `public/` (or `mobile-dist/` with `mobile: true`).
2. Precompile the `app/*.jsx` screens (window.\*-wired IIFEs, no modules) into
   **one minified, content-hashed bundle** — no runtime Babel-standalone JIT.
3. Minify + hash `auth-client.js`; bundle + hash `capacitor-bridge.js` (the
   one real-ESM file — it imports `@capacitor/*` packages from the host app).
4. Rewrite `index.html` onto the hashed outputs (Babel CDN tag dropped;
   Capacitor bridge loaded **before** auth-client so `window.Cap*` exists).
5. Generate `config.js` from env vars — credentials never enter git.

## Usage (a host app's `scripts/build-frontend.js`)

```js
'use strict';
const path = require('path');
const esbuild = require('esbuild'); // the HOST's esbuild — see below
const { buildFrontend } = require('@citizens/frontend-build');

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),
  appFileOrder: ['icons.jsx', 'store.jsx' /* …exact load order… */, 'app.jsx'],
  envGlobalName: '__CW_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    {
      key: 'API_BASE_URL',
      env: 'NEXT_PUBLIC_API_BASE_URL',
      mobileEnv: 'MOBILE_API_BASE_URL',
      mobileDefault: 'https://citizens-wear.vercel.app',
    },
  ],
  mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  mobileMissingLabel: 'Supabase',
});
```

## Design constraints (read before changing anything)

- **The host injects its own esbuild** (`options.esbuild`). Connect pins
  esbuild 0.28.x, Wear 0.25.x; injection keeps each app's output
  **byte-identical** to what its own toolchain produced before the extraction,
  and keeps this package dependency-free. Never `require('esbuild')` here.
- **Plain CommonJS, no build step.** Host apps run
  `node scripts/build-frontend.js` directly (locally and on Vercel).
- **Output byte-stability is a contract.** The transform options, hash scheme
  (SHA-256 → 10 hex), file ordering, `index.html` regexes, and `config.js`
  rendering are load-bearing; a change here changes every app's shipped
  bytes. Bump `version` and re-vendor consumers when you touch them.
- `config.js` values resolve as `env || local config || default` — except a
  mobile build's `mobileEnv` vars, which resolve `env || mobileDefault` and
  deliberately **ignore** the local fallback: a store build must never point
  at a localhost API base.

## Consumers & distribution (pre-monorepo)

| App | Wrapper | How it gets the package |
|---|---|---|
| **Wear** | `apps/web/scripts/build-frontend.js` | `workspace:*` (this repo) |
| **Connect** | `scripts/build-frontend.js` | **Vendored copy** at `vendor/citizens-frontend-build` (`file:` dep) — separate repo + Vercel builds can't reach this workspace. Sync with `npm run sync:frontend-build`; a vitest drift-test compares the copy against this canonical source whenever the sibling checkout exists. |
| **Vision** (Step 4c) | planned `scripts/build-frontend.js` | same vendoring pattern as Connect until the Step-5 monorepo |

**This directory is the canonical source.** Edit here, run the tests, then
re-sync vendored copies. At Step 5 (monorepo lift) the vendored copies are
deleted and every app flips to `workspace:*`.
