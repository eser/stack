// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Lightning CSS wrapper for advanced CSS transformation.
 *
 * Provides utilities for:
 * - CSS transformation with browser targeting
 * - CSS Modules support
 * - Minification and optimization
 *
 * @module
 */

import { transform } from "lightningcss";
import { Buffer } from "node:buffer";
import { isNode } from "@eser/standards/runtime";
import type {
  BrowserTargets,
  CssModuleExportData,
  LightningCssOptions,
  LightningCssResult,
} from "./types.ts";

// Re-export default targets
export { DEFAULT_BROWSER_TARGETS } from "./types.ts";

/**
 * Lightning CSS targets type.
 */
interface LightningTargets {
  chrome?: number;
  firefox?: number;
  safari?: number;
  edge?: number;
}

/**
 * Convert browser targets to Lightning CSS format.
 *
 * @param targets - Browser targets
 * @returns Lightning CSS compatible targets
 */
function convertTargets(targets?: BrowserTargets): LightningTargets {
  if (targets === undefined) {
    return {
      chrome: 90 << 16,
      firefox: 88 << 16,
      safari: 14 << 16,
    };
  }

  const result: LightningTargets = {};

  if (targets.chrome !== undefined) {
    result.chrome = targets.chrome;
  }
  if (targets.firefox !== undefined) {
    result.firefox = targets.firefox;
  }
  if (targets.safari !== undefined) {
    result.safari = targets.safari;
  }
  if (targets.edge !== undefined) {
    result.edge = targets.edge;
  }

  return result;
}

/**
 * Safely decode buffer data to string.
 * - Uses Buffer.toString() for Node.js (idiomatic)
 * - Uses TextDecoder for Deno/Browser
 * - Validates input to prevent null/undefined errors
 *
 * @see https://github.com/denoland/deno/issues/7178 - TextDecoder throws on null/undefined
 */
function decodeBufferToString(data: unknown): string {
  // Validate input - this is the actual bug fix
  if (data === null || data === undefined) {
    throw new TypeError(
      `Expected Uint8Array from Lightning CSS, got ${
        data === null ? "null" : "undefined"
      }`,
    );
  }

  // Node.js Buffer (most idiomatic)
  if (isNode() && typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }

  // Uint8Array (works for both Buffer and Uint8Array)
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }

  // Fallback for string (defensive, shouldn't happen per official types)
  if (typeof data === "string") {
    return data;
  }

  throw new TypeError(
    `Expected Uint8Array from Lightning CSS, got ${typeof data}`,
  );
}

/**
 * Transform CSS with Lightning CSS.
 *
 * @param css - CSS content to transform
 * @param options - Transformation options
 * @returns Transformed CSS result
 *
 * @example
 * ```ts
 * const result = transformWithLightningCss(cssContent, {
 *   minify: true,
 *   targets: { chrome: 90 << 16 },
 * });
 * console.log(result.code);
 * ```
 */
export function transformWithLightningCss(
  css: string,
  options: LightningCssOptions = {},
): LightningCssResult {
  const {
    filename = "styles.css",
    minify = false,
    targets,
    cssModules = false,
    unusedSymbols = [],
  } = options;

  // Build transform options
  // Use 'as any' to avoid type parameter complexity with lightningcss
  const transformOptions = {
    filename,
    code: new TextEncoder().encode(css),
    minify,
    targets: convertTargets(targets),
    cssModules,
    unusedSymbols: [...unusedSymbols],
  } as Parameters<typeof transform>[0];

  const result = transform(transformOptions);

  // Build exports map if CSS Modules enabled
  let exports: Record<string, CssModuleExportData> | undefined;
  if (result.exports !== undefined) {
    exports = {};
    for (const [className, exportData] of Object.entries(result.exports)) {
      exports[className] = {
        name: exportData.name,
        composes: exportData.composes?.map((c) => ({
          name: c.name,
          from: "from" in c ? String(c.from) : undefined,
        })),
      };
    }
  }

  return {
    code: decodeBufferToString(result.code),
    map: result.map !== undefined
      ? decodeBufferToString(result.map)
      : undefined,
    exports,
  };
}

/**
 * Transform CSS file with Lightning CSS.
 *
 * @param inputPath - Input CSS file path
 * @param outputPath - Output CSS file path (optional, overwrites input if not provided)
 * @param options - Transformation options
 * @returns Transformed CSS result
 */
export async function transformCssFile(
  inputPath: string,
  outputPath?: string,
  options: LightningCssOptions = {},
): Promise<LightningCssResult> {
  const css = await Deno.readTextFile(inputPath);

  const result = transformWithLightningCss(css, {
    ...options,
    filename: options.filename ?? inputPath.split("/").pop(),
  });

  const output = outputPath ?? inputPath;
  await Deno.writeTextFile(output, result.code);

  return result;
}

/**
 * Minify CSS with Lightning CSS.
 *
 * @param css - CSS content to minify
 * @param targets - Optional browser targets
 * @returns Minified CSS
 */
export function minifyCss(css: string, targets?: BrowserTargets): string {
  const result = transformWithLightningCss(css, {
    minify: true,
    targets,
  });
  return result.code;
}

/**
 * Process CSS with CSS Modules transformation.
 *
 * @param css - CSS content
 * @param filename - Filename for scoped class generation
 * @param options - Additional options
 * @returns Transformed CSS with exports
 */
export function transformCssModules(
  css: string,
  filename: string,
  options: Omit<LightningCssOptions, "cssModules" | "filename"> = {},
): LightningCssResult {
  return transformWithLightningCss(css, {
    ...options,
    filename,
    cssModules: true,
  });
}

/**
 * Create browser version number for Lightning CSS targets.
 *
 * @param major - Major version number
 * @param minor - Minor version number (default: 0)
 * @param patch - Patch version number (default: 0)
 * @returns Version number in Lightning CSS format
 *
 * @example
 * ```ts
 * const targets = {
 *   chrome: browserVersion(90),      // Chrome 90
 *   safari: browserVersion(14, 1),   // Safari 14.1
 * };
 * ```
 */
export function browserVersion(
  major: number,
  minor: number = 0,
  patch: number = 0,
): number {
  return (major << 16) | (minor << 8) | patch;
}

/**
 * Common browser target presets.
 */
export const BrowserTargetPresets = {
  /**
   * Modern browsers (Chrome 90+, Firefox 88+, Safari 14+).
   */
  modern: (): BrowserTargets => ({
    chrome: browserVersion(90),
    firefox: browserVersion(88),
    safari: browserVersion(14),
  }),

  /**
   * Wide support (Chrome 80+, Firefox 75+, Safari 13+).
   */
  wide: (): BrowserTargets => ({
    chrome: browserVersion(80),
    firefox: browserVersion(75),
    safari: browserVersion(13),
  }),

  /**
   * Latest browsers only (Chrome 120+, Firefox 120+, Safari 17+).
   */
  latest: (): BrowserTargets => ({
    chrome: browserVersion(120),
    firefox: browserVersion(120),
    safari: browserVersion(17),
  }),
} as const;
