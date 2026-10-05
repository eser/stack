// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Configuration Defaults
 * Single source of truth for all default configuration values
 */

import type {
  FontDefinition,
  LogLevel,
  ResolvedBrowserShimsConfig,
  ResolvedBuildConfig,
  ResolvedCriticalCssConfig,
  ResolvedCriticalCssViewport,
  ResolvedImageConfig,
  ResolvedImageQuality,
  ResolvedInternalConfig,
  ResolvedModeConfig,
  ResolvedServerConfig,
  ResolvedSSRConfig,
} from "./types.ts";
import * as loggingBrowserShim from "./logging-browser-shim.ts";

// =============================================================================
// Default Values - Single source of truth
// =============================================================================

/** Server defaults: port 8000 on localhost, HMR on, no browser opened. */
export const DEFAULT_SERVER: ResolvedServerConfig = {
  port: 8000,
  host: "localhost",
  hmr: true,
  open: false,
};

/**
 * Default server externals - packages that should NOT be bundled into server components.
 * These resolve from the app's node_modules at runtime, ensuring shared module instances.
 */
export const DEFAULT_SERVER_EXTERNALS: string[] = [
  "@eserstack/laroux",
  "@eserstack/laroux-server",
];

/** Build defaults: minified ES2022 output with source maps. */
export const DEFAULT_BUILD: ResolvedBuildConfig = {
  minify: true,
  sourcemap: true,
  target: ["es2022"],
  external: [],
  serverExternals: DEFAULT_SERVER_EXTERNALS,
};

/** SSR defaults: render every page on the server and stream it. */
export const DEFAULT_SSR: ResolvedSSRConfig = {
  mode: "always",
  streamMode: "streaming-optimal",
};

/** Encoder quality per output image format, from 0 to 100. */
export const DEFAULT_IMAGE_QUALITY: ResolvedImageQuality = {
  webp: 80,
  avif: 75,
  jpeg: 85,
  png: 90,
};

/** Image optimization defaults: WebP plus the original, five widths, blur placeholders. */
export const DEFAULT_IMAGES: ResolvedImageConfig = {
  formats: ["webp", "original"],
  widths: [640, 768, 1024, 1280, 1920],
  quality: DEFAULT_IMAGE_QUALITY,
  placeholder: "blur",
};

/** The viewport critical CSS is extracted for. */
export const DEFAULT_CRITICAL_CSS_VIEWPORT: ResolvedCriticalCssViewport = {
  width: 1300,
  height: 900,
};

/** Critical CSS defaults: enabled, with no forced inclusions or exclusions. */
export const DEFAULT_CRITICAL_CSS: ResolvedCriticalCssConfig = {
  enabled: true,
  viewport: DEFAULT_CRITICAL_CSS_VIEWPORT,
  forceInclude: [],
  forceExclude: [],
};

/** Endpoints and path prefixes laroux uses internally. */
export const DEFAULT_INTERNAL: ResolvedInternalConfig = {
  runtimeBundleEndpoint: "/__runtime_bundle.js",
  runtimeModuleMapEndpoint: "/__runtime_module_map.json",
  staticAssetsPrefix: "/dist",
};

/** Mode flags with every mode off; the CLI command sets the one that runs. */
export const DEFAULT_MODE: ResolvedModeConfig = {
  isDev: false,
  isBuild: false,
  isServe: false,
  isWatch: false,
};

/**
 * Browser replacements for server-only modules in client bundles.
 * `@eserstack/logging` becomes a console logger with the package's API (see
 * logging-browser-shim.ts), and `node:process` a minimal `process.env`.
 */
export const DEFAULT_BROWSER_SHIMS: ResolvedBrowserShimsConfig = {
  jsr: {
    "@eserstack/logging": loggingBrowserShim.LOGGING_BROWSER_SHIM,
    "@eserstack/standards/cross-runtime/browser": `
// Browser shim for @eserstack/standards/cross-runtime/browser
export const isBrowser = () => true;
`,
  },
  nodeBuiltins: {
    "node:process": `
// Browser shim for node:process - provides minimal process.env for client code
const process = {
  env: {
    NODE_ENV: "production",
    DEBUG: "false",
  },
};
export default process;
`,
  },
};

/** Complete default configuration (excluding projectRoot which must be provided) */
export type DefaultConfigShape = {
  srcDir: string;
  distDir: string;
  publicDir: string;
  logLevel: LogLevel;
  server: ResolvedServerConfig;
  build: ResolvedBuildConfig;
  alias: Record<string, string>;
  env: Record<string, string>;
  fonts: FontDefinition[];
  images: ResolvedImageConfig;
  criticalCss: ResolvedCriticalCssConfig;
  ssr: ResolvedSSRConfig;
  internal: ResolvedInternalConfig;
  mode: ResolvedModeConfig;
  cssModuleTypes: boolean;
  noCssModuleAutoReference: boolean;
  browserShims: ResolvedBrowserShimsConfig;
};

/** The complete default configuration, without `projectRoot`. */
export const DEFAULT_CONFIG: DefaultConfigShape = {
  srcDir: "src",
  distDir: "dist",
  publicDir: "public",
  logLevel: "info",
  server: DEFAULT_SERVER,
  build: DEFAULT_BUILD,
  alias: {},
  env: {},
  fonts: [],
  images: DEFAULT_IMAGES,
  criticalCss: DEFAULT_CRITICAL_CSS,
  ssr: DEFAULT_SSR,
  internal: DEFAULT_INTERNAL,
  mode: DEFAULT_MODE,
  cssModuleTypes: false,
  noCssModuleAutoReference: false,
  browserShims: DEFAULT_BROWSER_SHIMS,
};
