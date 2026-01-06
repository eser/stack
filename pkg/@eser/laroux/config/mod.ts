// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Configuration module for @eser/laroux
// Framework-agnostic configuration types and defaults

// Export all types
export type {
  AppConfig,
  BrowserShimsConfig,
  CriticalCssConfig,
  FontDefinition,
  FontDisplay,
  FontProvider,
  FontStyle,
  FontWeight,
  ImageConfig,
  ImageFormat,
  ImageOutputFormat,
  ImagePlaceholder,
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
  SSRConfig,
  SSRMode,
  SSRStreamMode,
  UserConfig,
} from "./types.ts";

// Export defaults
export {
  DEFAULT_BROWSER_SHIMS,
  DEFAULT_BUILD,
  DEFAULT_CONFIG,
  DEFAULT_CRITICAL_CSS,
  DEFAULT_CRITICAL_CSS_VIEWPORT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGES,
  DEFAULT_INTERNAL,
  DEFAULT_MODE,
  DEFAULT_SERVER,
  DEFAULT_SERVER_EXTERNALS,
  DEFAULT_SSR,
  type DefaultConfigShape,
} from "./defaults.ts";
