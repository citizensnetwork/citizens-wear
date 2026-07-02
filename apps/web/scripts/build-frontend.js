#!/usr/bin/env node
/**
 * Pre-build: copy src/frontend/* → public/ (or mobile-dist/ with --mobile),
 * precompile the app/*.jsx screens + auth-client.js into hashed, minified
 * bundles (no runtime Babel-standalone JIT), and generate config.js from env
 * vars.
 *
 * The pipeline itself lives in @citizens/frontend-build (ecosystem Step 4,
 * packages/frontend-build — canonical source, see its README). This file only
 * supplies Wear's configuration: screen load order, env-var mapping, and the
 * mobile API base. esbuild is passed in from HERE so the output is built with
 * this app's own pinned esbuild version.
 *
 * Run automatically before `next build` via the package.json build script.
 * The generated config.js is gitignored — it is re-generated on every build
 * from the environment so credentials never touch version control.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_API_BASE_URL     (optional, defaults to '' = same origin)
 */
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const esbuild = require('esbuild');
const { buildFrontend } = require('@citizens/frontend-build');

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),

  // Every screen module, in the exact dependency order the old
  // <script type="text/babel"> tags loaded them (later files reference
  // `window.X` set by earlier ones).
  appFileOrder: [
    'icons.jsx', 'api.jsx', 'store.jsx', 'ui.jsx', 'auth.jsx',
    'home.jsx', 'discover.jsx', 'create.jsx', 'inbox.jsx',
    'post.jsx', 'brand.jsx', 'profile.jsx', 'settings.jsx',
    'shell.jsx', 'app.jsx',
  ],

  extraSpecialFiles: ['config.example.js'],
  envGlobalName: '__CW_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    {
      // Web: '' = same origin (standard Vercel topology). Mobile: FORCED
      // absolute production URL — a store build must never point at a
      // localhost fallback.
      key: 'API_BASE_URL',
      env: 'NEXT_PUBLIC_API_BASE_URL',
      mobileEnv: 'MOBILE_API_BASE_URL',
      mobileDefault: 'https://citizens-wear.vercel.app',
    },
  ],
  mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  mobileMissingLabel: 'Supabase',
});
