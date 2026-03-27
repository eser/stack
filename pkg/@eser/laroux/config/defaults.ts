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

// =============================================================================
// Default Values - Single source of truth
// =============================================================================

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
  "@eser/laroux",
  "@eser/laroux-server",
];

export const DEFAULT_BUILD: ResolvedBuildConfig = {
  minify: true,
  sourcemap: true,
  target: ["es2022"],
  external: [],
  serverExternals: DEFAULT_SERVER_EXTERNALS,
};

export const DEFAULT_SSR: ResolvedSSRConfig = {
  mode: "always",
  streamMode: "streaming-optimal",
};

export const DEFAULT_IMAGE_QUALITY: ResolvedImageQuality = {
  webp: 80,
  avif: 75,
  jpeg: 85,
  png: 90,
};

export const DEFAULT_IMAGES: ResolvedImageConfig = {
  formats: ["webp", "original"],
  widths: [640, 768, 1024, 1280, 1920],
  quality: DEFAULT_IMAGE_QUALITY,
  placeholder: "blur",
};

export const DEFAULT_CRITICAL_CSS_VIEWPORT: ResolvedCriticalCssViewport = {
  width: 1300,
  height: 900,
};

export const DEFAULT_CRITICAL_CSS: ResolvedCriticalCssConfig = {
  enabled: true,
  viewport: DEFAULT_CRITICAL_CSS_VIEWPORT,
  forceInclude: [],
  forceExclude: [],
};

export const DEFAULT_INTERNAL: ResolvedInternalConfig = {
  runtimeBundleEndpoint: "/__runtime_bundle.js",
  runtimeModuleMapEndpoint: "/__runtime_module_map.json",
  staticAssetsPrefix: "/dist",
};

export const DEFAULT_MODE: ResolvedModeConfig = {
  isDev: false,
  isBuild: false,
  isServe: false,
  isWatch: false,
};

export const DEFAULT_BROWSER_SHIMS: ResolvedBrowserShimsConfig = {
  jsr: {
    "@eser/logging": `
// Browser shim for @eser/logging
const noop = () => {};
const noopLogger = { debug: noop, info: noop, warn: noop, error: noop };
export const logger = {
  getLogger: () => noopLogger,
};
export default { logger };
`,
    "@eser/standards/cross-runtime/browser": `
// Browser shim for @eser/standards/cross-runtime/browser
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
