// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Critical CSS Configuration for Tailwind CSS v4
 *
 * This configuration defines which CSS rules should be included in critical CSS
 * for optimal initial page render. Since this is Tailwind-specific, it's bundled
 * with the Tailwind plugin.
 *
 * Key concepts:
 * - @layer theme: Contains CSS variables (--spacing, --color-*, etc.)
 * - @layer base: Contains reset/preflight styles
 * - @layer utilities: Contains utility classes (split based on usage)
 * - @property: CSS Houdini properties (needed for gradients, transforms)
 */

/**
 * CSS layers that MUST always be in critical CSS
 * These contain foundational styles that all utilities depend on
 */
export const CRITICAL_LAYERS: readonly string[] = [
  "theme",
  "base",
  "properties",
];

/**
 * Heuristics for above-the-fold utility classes
 * These patterns match classes that are likely needed for initial render
 * to prevent Cumulative Layout Shift (CLS)
 */
export const ABOVE_FOLD_PATTERNS: RegExp[] = [
  // Layout utilities - critical for preventing CLS
  /^\.(flex|grid|block|inline|hidden)/,
  /^\.(items-|justify-|gap-|space-)/,
  /^\.(w-|h-|min-h-|max-w-)/,
  /^\.(p-|px-|py-|pt-|pb-|pl-|pr-)/,
  /^\.(m-|mx-|my-|mt-|mb-|ml-|mr-)/,

  // Typography
  /^\.(text-|font-|leading-)/,

  // Colors and backgrounds
  /^\.(bg-|border-)/,

  // Gradients (needed for gradient text which uses text-transparent)
  /^\.(from-|via-|to-)/,

  // Structural
  /^\.(container|wrapper)/,
  /^\.(rounded|shadow)/,
  /^\.(overflow-)/,

  // Responsive - sm/md/lg variants (critical for layout)
  /^\.(sm:|md:|lg:|xl:)/,
];

/**
 * CSS features that require @property declarations
 * These must be in critical CSS for the features to work on initial render
 */
export const CRITICAL_PROPERTY_PATTERNS = [
  // Gradients
  /--tw-gradient/,
  // Transforms
  /--tw-rotate/,
  /--tw-scale/,
  /--tw-skew/,
  /--tw-translate/,
  // Shadows
  /--tw-shadow/,
  /--tw-ring/,
  // Filters
  /--tw-blur/,
  /--tw-brightness/,
] as const;

/**
 * Configuration type for critical CSS extraction
 */
export type CriticalCssConfig = {
  /** Layers to always include in critical CSS */
  criticalLayers: readonly string[];
  /** Patterns for above-the-fold utilities */
  aboveFoldPatterns: RegExp[];
  /** Patterns to always include in critical CSS */
  forceInclude?: (string | RegExp)[];
  /** Patterns to always exclude from critical CSS */
  forceExclude?: (string | RegExp)[];
};

/**
 * Get the default critical CSS configuration for Tailwind v4
 */
export function getDefaultCriticalCssConfig(): CriticalCssConfig {
  return {
    criticalLayers: CRITICAL_LAYERS,
    aboveFoldPatterns: ABOVE_FOLD_PATTERNS,
    forceInclude: [],
    forceExclude: [],
  };
}
