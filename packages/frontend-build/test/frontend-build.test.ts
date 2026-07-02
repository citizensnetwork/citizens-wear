import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SPECIAL_FILES,
  buildFrontend,
  hashOf,
  renderConfigJs,
  resolveConfigValues,
  rewriteIndexHtml,
} from '../index.js';
import type { BuildFrontendOptions, ConfigVar } from '../index.js';

const INDEX_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
  <script src="https://cdn.example.com/react.js"></script>
</head>
<body>
  <div id="root"></div>
  <script src="config.js"></script>
  <script src="auth-client.js?v=42"></script>
  <script type="text/babel" src="app/one.jsx"></script>
  <script type="text/babel" src="app/two.jsx"></script>
</body>
</html>
`;

/** Build a minimal-but-real src/frontend fixture tree. */
function writeFixture(rootDir: string): void {
  const src = path.join(rootDir, 'src', 'frontend');
  fs.mkdirSync(path.join(src, 'app'), { recursive: true });
  fs.mkdirSync(path.join(src, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(src, 'index.html'), INDEX_HTML);
  fs.writeFileSync(
    path.join(src, 'app', 'one.jsx'),
    '(() => { window.FIXTURE_ONE = () => <div id="one">one</div>; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'app', 'two.jsx'),
    '(() => { window.FIXTURE_TWO = () => <span>{window.FIXTURE_ONE ? "two" : "no"}</span>; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'auth-client.js'),
    '(() => { /* stripped comment */ window.FIXTURE_AUTH = true; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'capacitor-bridge.js'),
    'const bridge = { native: false };\nwindow.FIXTURE_CAP = bridge;\n',
  );
  fs.writeFileSync(path.join(src, 'styles.css'), 'body { color: rebeccapurple; }\n');
  fs.writeFileSync(path.join(src, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  fs.writeFileSync(path.join(src, 'config.example.js'), 'window.__T_ENV = { EXAMPLE: true };\n');
}

const CONFIG_VARS: ConfigVar[] = [
  { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
  { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
  {
    key: 'API_BASE_URL',
    env: 'NEXT_PUBLIC_API_BASE_URL',
    mobileEnv: 'MOBILE_API_BASE_URL',
    mobileDefault: 'https://app.example.org',
  },
  { key: 'STYLE', env: 'NEXT_PUBLIC_STYLE', defaultValue: 'streets-v2' },
];

function makeOptions(rootDir: string, overrides: Partial<BuildFrontendOptions> = {}): BuildFrontendOptions {
  return {
    esbuild,
    rootDir,
    appFileOrder: ['one.jsx', 'two.jsx'],
    envGlobalName: '__T_ENV',
    configVars: CONFIG_VARS,
    extraSpecialFiles: ['config.example.js'],
    mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    mobileMissingLabel: 'Supabase',
    env: {},
    log: vi.fn(),
    warn: vi.fn(),
    ...overrides,
  };
}

let rootDir: string;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-build-'));
  writeFixture(rootDir);
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('buildFrontend (end-to-end, web)', () => {
  it('produces hashed outputs, rewrites index.html, and copies static files', () => {
    const result = buildFrontend(makeOptions(rootDir, { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://sb.example' } }));

    expect(result.dest).toBe(path.join(rootDir, 'public'));
    expect(result.bundleFile).toMatch(/^bundle\.[0-9a-f]{10}\.js$/);
    expect(result.authClientFile).toMatch(/^auth-client\.[0-9a-f]{10}\.js$/);
    expect(result.capacitorBridgeFile).toMatch(/^capacitor-bridge\.[0-9a-f]{10}\.js$/);

    // Hashed artifacts exist.
    expect(fs.existsSync(path.join(result.dest, 'app', result.bundleFile))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, result.authClientFile))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, result.capacitorBridgeFile))).toBe(true);

    // Static files copied; special files NOT copied raw.
    expect(fs.existsSync(path.join(result.dest, 'styles.css'))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, 'assets', 'logo.svg'))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, 'auth-client.js'))).toBe(false);
    expect(fs.existsSync(path.join(result.dest, 'capacitor-bridge.js'))).toBe(false);
    expect(fs.existsSync(path.join(result.dest, 'config.example.js'))).toBe(false);

    const html = fs.readFileSync(path.join(result.dest, 'index.html'), 'utf8');
    expect(html).not.toContain('@babel/standalone');
    expect(html).not.toContain('text/babel');
    // Exactly one bundle tag; bridge precedes auth-client (window.Cap* must exist first).
    expect(html.match(new RegExp(`app/${result.bundleFile}`, 'g'))).toHaveLength(1);
    expect(html.indexOf(result.capacitorBridgeFile)).toBeGreaterThan(-1);
    expect(html.indexOf(result.capacitorBridgeFile)).toBeLessThan(html.indexOf(result.authClientFile));
    // Untouched scripts survive.
    expect(html).toContain('https://cdn.example.com/react.js');

    // config.js: env value used, default applied, web API base = '' (same origin).
    const configJs = fs.readFileSync(path.join(result.dest, 'config.js'), 'utf8');
    expect(configJs).toBe(
      renderConfigJs('__T_ENV', {
        SUPABASE_URL: 'https://sb.example',
        SUPABASE_ANON_KEY: '',
        API_BASE_URL: '',
        STYLE: 'streets-v2',
      }),
    );
  });

  it('keeps screen load order in the concatenated bundle', () => {
    const result = buildFrontend(makeOptions(rootDir));
    const bundle = fs.readFileSync(path.join(result.dest, 'app', result.bundleFile), 'utf8');
    expect(bundle.indexOf('FIXTURE_ONE')).toBeGreaterThan(-1);
    expect(bundle.indexOf('FIXTURE_ONE')).toBeLessThan(bundle.indexOf('FIXTURE_TWO'));
    // JSX was compiled to the classic runtime, not shipped raw.
    expect(bundle).toContain('React.createElement');
    expect(bundle).not.toContain('<div id="one">');
  });

  it('removes stale hashed outputs from previous builds', () => {
    const dest = path.join(rootDir, 'public');
    fs.mkdirSync(path.join(dest, 'app'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'auth-client.aaaaaaaaaa.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'capacitor-bridge.bbbbbbbbbb.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'app', 'bundle.cccccccccc.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'keep.me.js'), 'kept');

    const result = buildFrontend(makeOptions(rootDir));

    expect(fs.existsSync(path.join(dest, 'auth-client.aaaaaaaaaa.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'capacitor-bridge.bbbbbbbbbb.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'app', 'bundle.cccccccccc.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'keep.me.js'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'app', result.bundleFile))).toBe(true);
  });

  it('is deterministic — same input, same hashes', () => {
    const a = buildFrontend(makeOptions(rootDir));
    const b = buildFrontend(makeOptions(rootDir));
    expect(a.bundleFile).toBe(b.bundleFile);
    expect(a.authClientFile).toBe(b.authClientFile);
    expect(a.capacitorBridgeFile).toBe(b.capacitorBridgeFile);
  });
});

describe('buildFrontend (mobile)', () => {
  it('targets mobile-dist/, forces the absolute API base, and falls back to local config', () => {
    fs.writeFileSync(
      path.join(rootDir, 'src', 'frontend', 'config.js'),
      '// local dev config\nwindow.__T_ENV = { SUPABASE_URL: "https://local.example", SUPABASE_ANON_KEY: "local-anon", API_BASE_URL: "http://localhost:3000" };\n',
    );
    const warn = vi.fn();
    const result = buildFrontend(makeOptions(rootDir, { mobile: true, warn }));

    expect(result.dest).toBe(path.join(rootDir, 'mobile-dist'));
    // Local fallback for normal keys; API base FORCED to mobileDefault (localhost ignored).
    expect(result.config.SUPABASE_URL).toBe('https://local.example');
    expect(result.config.SUPABASE_ANON_KEY).toBe('local-anon');
    expect(result.config.API_BASE_URL).toBe('https://app.example.org');
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers MOBILE_API_BASE_URL env over the mobile default', () => {
    const result = buildFrontend(
      makeOptions(rootDir, { mobile: true, env: { MOBILE_API_BASE_URL: 'https://staging.example.org' } }),
    );
    expect(result.config.API_BASE_URL).toBe('https://staging.example.org');
  });

  it('warns when required mobile values are missing (no local config.js)', () => {
    const warn = vi.fn();
    buildFrontend(makeOptions(rootDir, { mobile: true, warn }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mobile config is missing Supabase values'));
  });
});

describe('option validation', () => {
  it.each([
    ['missing esbuild', { esbuild: undefined }, /options\.esbuild is required/],
    ['missing rootDir', { rootDir: '' }, /options\.rootDir/],
    ['empty appFileOrder', { appFileOrder: [] }, /appFileOrder/],
    ['invalid envGlobalName', { envGlobalName: 'window.__X__; alert(1)' }, /envGlobalName/],
    ['empty configVars', { configVars: [] }, /configVars/],
  ] as const)('rejects %s', (_label, override, message) => {
    expect(() => buildFrontend({ ...makeOptions(rootDir), ...(override as object) } as BuildFrontendOptions)).toThrow(
      message,
    );
  });

  it('rejects a missing options object', () => {
    expect(() => (buildFrontend as unknown as () => void)()).toThrow(/options object is required/);
  });
});

describe('pure helpers', () => {
  it('hashOf returns the first 10 hex chars of sha256', () => {
    expect(hashOf('hello')).toMatch(/^[0-9a-f]{10}$/);
    expect(hashOf('hello')).toBe(hashOf('hello'));
    expect(hashOf('hello')).not.toBe(hashOf('goodbye'));
  });

  it('renderConfigJs emits the exact generated shape', () => {
    expect(renderConfigJs('__CC_ENV', { A: '1' })).toBe(
      '// AUTO-GENERATED — do not edit; set env vars and rebuild.\nwindow.__CC_ENV = {\n  "A": "1"\n};\n',
    );
  });

  it('resolveConfigValues: env beats local beats default; key order preserved', () => {
    const cfg = resolveConfigValues({
      mobile: true,
      configVars: CONFIG_VARS,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'from-env' },
      local: { SUPABASE_URL: 'from-local', SUPABASE_ANON_KEY: 'local-anon' },
    });
    expect(cfg).toEqual({
      SUPABASE_URL: 'from-env',
      SUPABASE_ANON_KEY: 'local-anon',
      API_BASE_URL: 'https://app.example.org',
      STYLE: 'streets-v2',
    });
    expect(Object.keys(cfg)).toEqual(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_BASE_URL', 'STYLE']);
  });

  it('resolveConfigValues: web build uses env/local/default for mobileEnv vars too', () => {
    const cfg = resolveConfigValues({ mobile: false, configVars: CONFIG_VARS, env: {}, local: {} });
    expect(cfg.API_BASE_URL).toBe('');
  });

  it('rewriteIndexHtml collapses all babel tags into one bundle tag', () => {
    const html = rewriteIndexHtml(INDEX_HTML, {
      bundleFile: 'bundle.0123456789.js',
      authClientFile: 'auth-client.0123456789.js',
      capacitorBridgeFile: 'capacitor-bridge.0123456789.js',
    });
    expect(html.match(/bundle\.0123456789\.js/g)).toHaveLength(1);
    expect(html).not.toContain('text/babel');
    expect(html).not.toContain('@babel/standalone');
    expect(html).not.toContain('auth-client.js?v=');
  });

  it('DEFAULT_SPECIAL_FILES matches the historical set', () => {
    expect([...DEFAULT_SPECIAL_FILES]).toEqual([
      'app',
      'config.js',
      'auth-client.js',
      'index.html',
      'capacitor-bridge.js',
    ]);
  });
});
