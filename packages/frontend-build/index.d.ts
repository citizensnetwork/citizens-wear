/**
 * Type declarations for @citizens/frontend-build (the implementation is plain
 * CommonJS in index.js so `node scripts/build-frontend.js` can require it
 * directly, with no transpile step).
 */

/**
 * Structural stand-in for the host-injected esbuild module. Kept minimal on
 * purpose: this package has NO dependency on esbuild — each host app passes
 * its own instance so build output stays byte-identical to its toolchain.
 */
export interface EsbuildLike {
  transformSync(
    input: string,
    options?: Record<string, unknown>,
  ): { code: string; warnings: Array<{ text: string }> };
  buildSync(options: Record<string, unknown>): {
    outputFiles?: Array<{ text: string }>;
  };
}

/** One generated-config entry; result key order follows array order. */
export interface ConfigVar {
  /** Key in the generated `window.<envGlobalName>` object, e.g. "SUPABASE_URL". */
  key: string;
  /** Env var consulted on web builds (and mobile, unless mobileEnv is set), e.g. "NEXT_PUBLIC_SUPABASE_URL". */
  env: string;
  /** Fallback when neither env nor local config provides a value. Defaults to "". */
  defaultValue?: string;
  /**
   * When set, mobile builds resolve as env[mobileEnv] || mobileDefault and
   * IGNORE the local-config fallback — used to force an absolute production
   * API base into store builds.
   */
  mobileEnv?: string;
  /** Mobile-build fallback for `mobileEnv`, e.g. the app's production origin. */
  mobileDefault?: string;
}

export interface BuildFrontendOptions {
  /** The HOST app's own esbuild instance: `require("esbuild")`. */
  esbuild: EsbuildLike;
  /** Absolute app root (the directory holding src/frontend, public/, mobile-dist/). */
  rootDir: string;
  /** app/*.jsx filenames in exact load order (later files read earlier files' window.*). */
  appFileOrder: string[];
  /** Name of the injected config global, e.g. "__CC_ENV" / "__CW_ENV". */
  envGlobalName: string;
  /** Generated-config entries, in output order. */
  configVars: ConfigVar[];
  /** Build the Capacitor webDir (mobile-dist/) instead of public/. Default false. */
  mobile?: boolean;
  /** Default: rootDir/src/frontend */
  srcDir?: string;
  /** Default: rootDir/public */
  publicDir?: string;
  /** Default: rootDir/mobile-dist */
  mobileDir?: string;
  /** Extra top-level names to exclude from the generic copy (e.g. "config.example.js"). */
  extraSpecialFiles?: string[];
  /** Config keys that must be non-empty in a mobile build, else a warning is printed. */
  mobileRequiredKeys?: string[];
  /** Human label for the mobile warning, e.g. "Supabase/MapTiler". */
  mobileMissingLabel?: string;
  /** Env source. Default: process.env. */
  env?: Record<string, string | undefined>;
  /** Default: console.log */
  log?: (message: string) => void;
  /** Default: console.warn */
  warn?: (message: string) => void;
}

export interface BuildFrontendResult {
  /** Absolute output directory that was built (public/ or mobile-dist/). */
  dest: string;
  /** Content-hashed bundle filename, e.g. "bundle.f9a5ddcbaa.js" (lives in dest/app/). */
  bundleFile: string;
  /** Content-hashed auth client filename (lives in dest/). */
  authClientFile: string;
  /** Content-hashed Capacitor bridge filename (lives in dest/). */
  capacitorBridgeFile: string;
  /** The resolved config object written to dest/config.js. */
  config: Record<string, string>;
}

/** Files the pipeline compiles/generates itself — excluded from the generic copy. */
export declare const DEFAULT_SPECIAL_FILES: readonly string[];

/** Run the full pipeline (copy → compile → hash → index.html rewrite → config.js). */
export declare function buildFrontend(options: BuildFrontendOptions): BuildFrontendResult;

/** First 10 hex chars of the content's SHA-256 — the content-hash used in filenames. */
export declare function hashOf(content: string): string;

/** Render the generated config.js source (pure). */
export declare function renderConfigJs(envGlobalName: string, cfg: Record<string, string>): string;

/** Resolve the config.js values (pure) — see ConfigVar for precedence rules. */
export declare function resolveConfigValues(args: {
  mobile: boolean;
  configVars: ConfigVar[];
  env: Record<string, string | undefined>;
  local: Record<string, string | undefined>;
}): Record<string, string>;

/** Rewrite index.html onto the hashed outputs (pure). */
export declare function rewriteIndexHtml(
  html: string,
  files: { bundleFile: string; authClientFile: string; capacitorBridgeFile: string },
): string;
