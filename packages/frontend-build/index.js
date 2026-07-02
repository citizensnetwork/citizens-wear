'use strict';
/**
 * @citizens/frontend-build — the shared static-frontend build pipeline for the
 * Citizens ecosystem (Connect · Wear · Vision).
 *
 * Extracted (ecosystem Step 4) from the near-identical
 *   citizens-connect/scripts/build-frontend.js
 *   citizens-wear/apps/web/scripts/build-frontend.js
 * so the pipeline exists ONCE. Each app keeps a thin, config-only
 * scripts/build-frontend.js wrapper supplying its screen load order, env-var
 * mapping, env global name, and mobile API base.
 *
 * What it does per app:
 *   1. copy src/frontend/* → public/ (or mobile-dist/ when `mobile`)
 *   2. precompile the app/*.jsx screens (window.*-wired IIFEs, no modules)
 *      into ONE minified, content-hashed bundle — no runtime Babel JIT
 *   3. minify + hash auth-client.js; bundle + hash capacitor-bridge.js
 *      (the one real-ESM file — it imports @capacitor/* packages)
 *   4. rewrite index.html onto the hashed outputs (Babel CDN tag dropped,
 *      Capacitor bridge loaded BEFORE auth-client so window.Cap* exists)
 *   5. generate config.js from env vars (credentials never enter git)
 *
 * DESIGN CONSTRAINT — the host injects its own esbuild instance
 * (`options.esbuild`). Connect pins esbuild 0.28.x, Wear 0.25.x; injection
 * keeps each app's output byte-identical to what its own toolchain produced
 * before the extraction, and keeps this package dependency-free.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Files the pipeline compiles/generates itself — excluded from the generic copy. */
const DEFAULT_SPECIAL_FILES = Object.freeze([
  'app',
  'config.js',
  'auth-client.js',
  'index.html',
  'capacitor-bridge.js',
]);

const HASHED_SINGLE_RE = /^(auth-client|capacitor-bridge)\.[0-9a-f]{10}\.js$/;
const HASHED_BUNDLE_RE = /^bundle\.[0-9a-f]{10}\.js$/;
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** First 10 hex chars of the content's SHA-256 — the content-hash used in filenames. */
function hashOf(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

/**
 * Execute the gitignored dev config (trusted local file, plain JS with
 * comments) against a stub window to extract the env global (e.g. __CC_ENV).
 * Returns {} when the file is absent or unreadable.
 */
function readLocalConfig(srcDir, envGlobalName) {
  try {
    const raw = fs.readFileSync(path.join(srcDir, 'config.js'), 'utf8');
    const win = {};
    new Function('window', raw)(win);
    return win[envGlobalName] || {};
  } catch {
    return {};
  }
}

/** Remove stale content-hashed outputs from a previous build (filenames change per build). */
function cleanHashedOutputs(dest) {
  if (!fs.existsSync(dest)) return;
  for (const name of fs.readdirSync(dest)) {
    if (HASHED_SINGLE_RE.test(name)) {
      fs.unlinkSync(path.join(dest, name));
    }
  }
  const appDir = path.join(dest, 'app');
  if (fs.existsSync(appDir)) {
    for (const name of fs.readdirSync(appDir)) {
      if (HASHED_BUNDLE_RE.test(name)) {
        fs.unlinkSync(path.join(appDir, name));
      }
    }
  }
}

/** Recursive copy; `skip` (a Set of names) applies to the top level only. */
function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d, new Set());
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Precompile the app/*.jsx screens into ONE minified, content-hashed bundle.
 * Each file is its own IIFE that only communicates via `window.*` — esbuild
 * strips JSX per file (React 18 classic runtime, matching the old
 * Babel-standalone pragma) and the results are concatenated in load order, so
 * cross-file `window.X` wiring is untouched. React/ReactDOM and friends stay
 * on CDN UMD <script> tags — the host app's index.html owns that decision.
 */
function buildAppBundle({ esbuild, srcDir, dest, appFileOrder, warn }) {
  const appSrc = path.join(srcDir, 'app');
  const parts = appFileOrder.map((name) => {
    const src = fs.readFileSync(path.join(appSrc, name), 'utf8');
    const { code, warnings } = esbuild.transformSync(src, {
      loader: 'jsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2019',
      sourcefile: `app/${name}`,
    });
    for (const w of warnings) warn(`[build-frontend] ${name}: ${w.text}`);
    return `// ── ${name} ──\n${code}`;
  });

  const concatenated = parts.join('\n');
  const { code: minified } = esbuild.transformSync(concatenated, {
    loader: 'js',
    minify: true,
    target: 'es2019',
  });

  const hash = hashOf(minified);
  const filename = `bundle.${hash}.js`;
  fs.mkdirSync(path.join(dest, 'app'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'app', filename), minified);
  return filename;
}

/**
 * capacitor-bridge.js is real ESM (imports @capacitor/* npm packages) — the
 * one file that needs a true bundle:true esbuild pass, not just a JSX strip.
 * Runs with the host's cwd/node_modules, so the host's @capacitor/* resolve.
 */
function buildCapacitorBridge({ esbuild, srcDir, dest }) {
  const result = esbuild.buildSync({
    entryPoints: [path.join(srcDir, 'capacitor-bridge.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    minify: true,
    write: false,
  });
  const code = result.outputFiles[0].text;
  const hash = hashOf(code);
  const filename = `capacitor-bridge.${hash}.js`;
  fs.writeFileSync(path.join(dest, filename), code);
  return filename;
}

/** auth-client.js is plain JS (no JSX) — just minify + content-hash it. */
function buildAuthClient({ esbuild, srcDir, dest }) {
  const src = fs.readFileSync(path.join(srcDir, 'auth-client.js'), 'utf8');
  const { code: minified } = esbuild.transformSync(src, {
    loader: 'js',
    minify: true,
    target: 'es2019',
  });
  const hash = hashOf(minified);
  const filename = `auth-client.${hash}.js`;
  fs.writeFileSync(path.join(dest, filename), minified);
  return filename;
}

/**
 * Rewrite index.html (pure): drop the Babel-standalone CDN script + the
 * `type="text/babel" ... ?v=` tags + the `?v=`-suffixed auth-client tag,
 * replace with plain hashed <script> tags (bridge first — window.Cap* must
 * exist before auth-client.js runs).
 */
function rewriteIndexHtml(html, { bundleFile, authClientFile, capacitorBridgeFile }) {
  html = html.replace(/^\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^\n]*\n/m, '');

  html = html.replace(
    /<script src="auth-client\.js\?v=[^"]*"><\/script>/,
    `<script src="${capacitorBridgeFile}"></script>\n<script src="${authClientFile}"></script>`,
  );

  const babelTagRe = /^\s*<script type="text\/babel" src="app\/[^"]+"><\/script>\n?/gm;
  let replaced = false;
  html = html.replace(babelTagRe, () => {
    if (replaced) return '';
    replaced = true;
    return `<script src="app/${bundleFile}"></script>\n`;
  });

  return html;
}

/**
 * Resolve the config.js values (pure). Per var:
 *  - mobile build + `mobileEnv` set → env[mobileEnv] || mobileDefault — the
 *    mobile API base is FORCED absolute; a store build must never point at a
 *    localhost/local-config fallback.
 *  - otherwise → env[env] || local[key] || defaultValue || ''.
 * Key order in the result follows `configVars` order (JSON.stringify keeps it).
 */
function resolveConfigValues({ mobile, configVars, env, local }) {
  const cfg = {};
  for (const v of configVars) {
    if (mobile && v.mobileEnv !== undefined) {
      cfg[v.key] = env[v.mobileEnv] || v.mobileDefault || '';
    } else {
      cfg[v.key] = env[v.env] || local[v.key] || v.defaultValue || '';
    }
  }
  return cfg;
}

/** Render the generated config.js source (pure). */
function renderConfigJs(envGlobalName, cfg) {
  return (
    '// AUTO-GENERATED — do not edit; set env vars and rebuild.\nwindow.' +
    envGlobalName +
    ' = ' +
    JSON.stringify(cfg, null, 2) +
    ';\n'
  );
}

function assertOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('[frontend-build] options object is required');
  }
  const { esbuild, rootDir, appFileOrder, envGlobalName, configVars } = options;
  if (!esbuild || typeof esbuild.transformSync !== 'function' || typeof esbuild.buildSync !== 'function') {
    throw new TypeError(
      '[frontend-build] options.esbuild is required — pass the host app\'s own esbuild instance (require("esbuild")) so output stays byte-identical to the host toolchain',
    );
  }
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new TypeError('[frontend-build] options.rootDir (absolute app root) is required');
  }
  if (!Array.isArray(appFileOrder) || appFileOrder.length === 0) {
    throw new TypeError('[frontend-build] options.appFileOrder must be a non-empty array of app/*.jsx filenames in load order');
  }
  if (typeof envGlobalName !== 'string' || !IDENTIFIER_RE.test(envGlobalName)) {
    throw new TypeError('[frontend-build] options.envGlobalName must be a valid JS identifier (e.g. "__CC_ENV")');
  }
  if (!Array.isArray(configVars) || configVars.length === 0) {
    throw new TypeError('[frontend-build] options.configVars must be a non-empty array');
  }
}

/**
 * Run the full pipeline. Returns { dest, bundleFile, authClientFile,
 * capacitorBridgeFile, config } for logging/assertions.
 */
function buildFrontend(options) {
  assertOptions(options);
  const {
    esbuild,
    rootDir,
    appFileOrder,
    envGlobalName,
    configVars,
    mobile = false,
    srcDir = path.join(rootDir, 'src', 'frontend'),
    publicDir = path.join(rootDir, 'public'),
    mobileDir = path.join(rootDir, 'mobile-dist'),
    extraSpecialFiles = [],
    mobileRequiredKeys = [],
    mobileMissingLabel = 'required',
    env = process.env,
    log = console.log,
    warn = console.warn,
  } = options;

  const dest = mobile ? mobileDir : publicDir;
  const special = new Set([...DEFAULT_SPECIAL_FILES, ...extraSpecialFiles]);
  const srcLabel = path.relative(rootDir, srcDir).split(path.sep).join('/');

  cleanHashedOutputs(dest);
  copyDir(srcDir, dest, special);
  const bundleFile = buildAppBundle({ esbuild, srcDir, dest, appFileOrder, warn });
  const authClientFile = buildAuthClient({ esbuild, srcDir, dest });
  const capacitorBridgeFile = buildCapacitorBridge({ esbuild, srcDir, dest });

  const html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  fs.writeFileSync(
    path.join(dest, 'index.html'),
    rewriteIndexHtml(html, { bundleFile, authClientFile, capacitorBridgeFile }),
  );

  log(`[build-frontend] Copied ${srcLabel}/ → ${path.basename(dest)}/`);
  log(`[build-frontend] Compiled ${appFileOrder.length} screens → app/${bundleFile}`);
  log(`[build-frontend] Compiled auth-client.js → ${authClientFile}`);
  log(`[build-frontend] Bundled Capacitor plugins → ${capacitorBridgeFile}`);

  // config.js. Web: API_BASE_URL is empty when the frontend is served from the
  // same domain as the API (the standard Vercel deployment topology). Mobile:
  // absolute production API base, env-first with local-config fallback for the
  // non-forced values (mobile bundles are built locally, not on Vercel).
  const local = mobile ? readLocalConfig(srcDir, envGlobalName) : {};
  const config = resolveConfigValues({ mobile, configVars, env, local });
  if (mobile && mobileRequiredKeys.some((k) => !config[k])) {
    warn(
      `[build-frontend] WARNING: mobile config is missing ${mobileMissingLabel} values — set NEXT_PUBLIC_* env vars or fill src/frontend/config.js before shipping.`,
    );
  }
  fs.writeFileSync(path.join(dest, 'config.js'), renderConfigJs(envGlobalName, config));
  log(
    `[build-frontend] Generated ${path.basename(dest)}/config.js (API_BASE_URL=${config.API_BASE_URL || "'' (same-origin)"})`,
  );

  return { dest, bundleFile, authClientFile, capacitorBridgeFile, config };
}

module.exports = {
  DEFAULT_SPECIAL_FILES,
  buildFrontend,
  hashOf,
  renderConfigJs,
  resolveConfigValues,
  rewriteIndexHtml,
};
