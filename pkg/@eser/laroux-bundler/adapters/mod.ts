// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Adapters Layer
 *
 * All adapter implementations that implement domain interfaces.
 * Users import adapters explicitly and pass them to bundle function.
 */

// LightningCSS adapter
export {
  type CssProcessOptions,
  postProcessWithLightningCSS,
  processCss,
} from "./lightningcss/mod.ts";

// Sharp image optimizer adapter
export {
  generateSrcset,
  getBestVariant,
  type ImageManifest,
  type ImageOptimizationConfig,
  type ImageVariant,
  type OptimizedImage,
  optimizeImage,
  optimizeImages,
  scanImages,
} from "./sharp/mod.ts";

// Fonts adapter
export {
  type FontDefinition,
  type FontDisplay,
  type FontFile,
  type FontOptimizationResult,
  type FontStyle,
  type FontWeight,
  generateFontVariables,
  generateGoogleFontsUrl,
  getFontFamilies,
  getFontUrls,
  optimizeGoogleFonts,
  optimizeMultipleGoogleFonts,
} from "./fonts/mod.ts";

// Runtime bundler adapter
export {
  createRuntimeCache,
  type RuntimeBundle,
  RuntimeBundler,
  type RuntimeBundlerConfig,
} from "./runtime-bundler/mod.ts";

// Prebuilt bundler adapter
export {
  PrebuiltBundler,
  type PrebuiltBundlerConfig,
} from "./prebuilt-bundler/mod.ts";

// React adapter
export {
  analyzeClientComponents,
  type ClientComponent,
  createBundlerConfig,
  createClientComponentMap,
  createClientEntry,
  createClientManifest,
  createCSSModuleMap,
  createImportMapping,
  type DirectiveAnalysisOptions,
  type DirectiveMatch,
  generateModuleMap,
  generateTransformManifest,
  getAllComponents,
  type ImportRewriteResult,
  loadModuleMap,
  type ModuleMap as ReactModuleMap,
  type ModuleMapEntry as ReactModuleMapEntry,
  reactPlugin,
  rewriteAllClientComponentCSSImports,
  rewriteAllServerComponents,
  rewriteAllSrcCSSModuleImports,
  rewriteServerComponentImports,
  saveModuleMap,
  transformAllClientComponents,
  transformClientComponent,
  type TransformResult,
} from "./react/mod.ts";

// Tailwind CSS adapter
export {
  ABOVE_FOLD_PATTERNS,
  compileTailwind,
  createTailwindPlugin,
  CRITICAL_LAYERS,
  CRITICAL_PROPERTY_PATTERNS,
  type CriticalCssConfig,
  type CriticalPageCssOptions,
  type CriticalPageCssResult,
  type CriticalUniversalCssResult,
  DEFAULT_CRITICAL_UNIVERSAL_CSS,
  expandApplyDirectives,
  extractCriticalPageCss,
  extractCriticalUniversalCss,
  extractThemeLayer,
  generateAsyncCssLoader,
  generateCriticalUniversalCss,
  getDefaultCriticalCssConfig,
  loadStylesheet,
  type StylesheetLoadResult,
  type TailwindCompileOptions,
  type TailwindPluginOptions,
} from "./tailwindcss/mod.ts";
