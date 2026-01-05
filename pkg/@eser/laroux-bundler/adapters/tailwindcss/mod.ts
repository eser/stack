// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tailwind CSS Adapter
 * Tailwind CSS v4 support for Laroux bundler
 */

export { createTailwindPlugin, type TailwindPluginOptions } from "./plugin.ts";

export {
  compileTailwind,
  expandApplyDirectives,
  type TailwindCompileOptions,
} from "./compile.ts";

export {
  loadStylesheet,
  type StylesheetLoadResult,
} from "./stylesheet-loader.ts";

export {
  ABOVE_FOLD_PATTERNS,
  CRITICAL_LAYERS,
  CRITICAL_PROPERTY_PATTERNS,
  type CriticalCssConfig,
  getDefaultCriticalCssConfig,
} from "./critical-css-config.ts";

export {
  type CriticalPageCssOptions,
  type CriticalPageCssResult,
  extractCriticalPageCss,
  generateAsyncCssLoader,
} from "./critical-page-css.ts";

export {
  type CriticalUniversalCssResult,
  DEFAULT_CRITICAL_UNIVERSAL_CSS,
  extractCriticalUniversalCss,
  extractThemeLayer,
  generateCriticalUniversalCss,
} from "./critical-universal-css.ts";
