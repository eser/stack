// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Modules Handler
 * Re-exports @eserstack/bundler/css CSS modules utilities with laroux-specific caching.
 * Uses adapters/tailwindcss for @reference injection and @apply expansion.
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import {
  type CssModuleResult as EserCssModuleResult,
  generateTypeScriptDefinition,
  processCssModule as eserProcessCssModule,
} from "@eserstack/bundler/css";
import { createTailwindPlugin } from "./adapters/tailwindcss/mod.ts";
import type { CssPlugin } from "./domain/css-plugin.ts";
import type { BuildCache } from "./domain/build-cache.ts";

const cssModulesLogger = logging.logger.getLogger([
  "laroux-bundler",
  "css-modules",
]);

// Re-export types for backward compatibility
export type CSSModuleResult = EserCssModuleResult;

export type ProcessCSSModuleOptions = {
  /** Whether to generate TypeScript .d.ts file */
  generateDTS?: boolean;
  /** Project root directory */
  projectRoot?: string;
  /** Whether to minify */
  minify?: boolean;
  /** CSS plugin for preprocessing (optional, will create default if not provided) */
  plugin?: CssPlugin;
  /** Path to global CSS file relative to project root */
  globalCssPath?: string;
};

/**
 * Process a single CSS module file
 * Uses plugin for @reference injection and @apply expansion
 */
export async function processCSSModule(
  cssPath: string,
  options: ProcessCSSModuleOptions = {},
): Promise<CSSModuleResult> {
  const {
    generateDTS = false,
    projectRoot,
    minify = true,
    plugin,
    globalCssPath = "src/app/styles/global.css",
  } = options;

  cssModulesLogger.debug(`Processing CSS module: ${cssPath}`);

  // Read CSS content
  const cssContent = await runtime.fs.readTextFile(cssPath);

  // Create context for plugin
  const context = {
    projectRoot: projectRoot ?? runtime.process.cwd(),
    cssPath,
    isModule: true,
  };

  // Use provided plugin or create default tailwind plugin
  const cssPlugin = plugin ?? createTailwindPlugin({ globalCssPath });

  // Preprocess with plugin if it should handle this file
  let processedContent = cssContent;
  if (cssPlugin.shouldProcess?.(cssContent, context) ?? true) {
    const preprocessed = cssPlugin.preprocess?.(cssContent, context);
    if (preprocessed !== undefined) {
      processedContent = await Promise.resolve(preprocessed);
    }
  }

  // Write preprocessed content to temp file for eserProcessCssModule
  const tempPath = cssPath.replace(/\.module\.css$/, ".temp.module.css");
  await runtime.fs.writeTextFile(tempPath, processedContent);

  try {
    // Use @eserstack/bundler's processCssModule (no Tailwind root needed - plugin handled @apply)
    const result = await eserProcessCssModule(tempPath, {
      generateDts: generateDTS,
      minify,
      // No tailwind option - plugin's preprocess already expanded @apply
    });

    const filename = runtime.path.basename(cssPath);
    cssModulesLogger.debug(
      `Processed ${
        Object.keys(result.exports).length
      } class(es) in ${filename}`,
    );

    return result;
  } finally {
    // Clean up temp file
    await runtime.fs.remove(tempPath).catch(() => {});
  }
}

export type ProcessCSSModulesOptions = ProcessCSSModuleOptions & {
  /** Build cache for incremental builds */
  cache?: BuildCache;
};

/**
 * Process multiple CSS modules in parallel
 * Creates a shared plugin for better performance
 */
export async function processCSSModules(
  cssPaths: string[],
  options: ProcessCSSModulesOptions = {},
): Promise<Map<string, CSSModuleResult>> {
  const {
    cache,
    projectRoot,
    minify = true,
    globalCssPath = "src/app/styles/global.css",
    ...moduleOptions
  } = options;

  cssModulesLogger.debug(`Processing ${cssPaths.length} CSS module(s)`);

  // Create a shared plugin for all modules
  const plugin = createTailwindPlugin({ globalCssPath });

  let cacheHits = 0;
  let cacheMisses = 0;

  try {
    const results = await Promise.all(
      cssPaths.map(async (cssPath) => {
        // Check cache first if available
        if (cache !== undefined) {
          try {
            const fileStat = await runtime.fs.stat(cssPath);
            const fileMtime = fileStat.mtime?.getTime() ?? 0;
            const cached = cache.getCssModuleResult(cssPath, fileMtime);

            if (cached !== undefined && cached !== null) {
              cacheHits++;
              return [cssPath, {
                code: cached.code,
                exports: cached.exports,
              }] as [string, CSSModuleResult];
            }
          } catch {
            // File might have been deleted, continue with processing
          }
        }

        // Cache miss - process the CSS module
        cacheMisses++;
        const result = await processCSSModule(cssPath, {
          ...moduleOptions,
          projectRoot,
          minify,
          plugin,
          globalCssPath,
        });

        // Cache the result
        if (cache !== undefined) {
          try {
            const fileStat = await runtime.fs.stat(cssPath);
            const fileMtime = fileStat.mtime?.getTime() ?? 0;
            cache.setCssModuleResult(
              cssPath,
              result.code,
              result.exports,
              fileMtime,
            );
          } catch {
            // Ignore caching errors
          }
        }

        return [cssPath, result] as [string, CSSModuleResult];
      }),
    );

    if (cache !== undefined && (cacheHits > 0 || cacheMisses > 0)) {
      cssModulesLogger.debug(
        `CSS modules: ${cacheHits} cache hits, ${cacheMisses} processed`,
      );
    }

    return new Map(results);
  } finally {
    // No disposal needed for plugin
  }
}

/**
 * Save CSS module outputs to disk
 */
export async function saveCSSModuleOutputs(
  cssPath: string,
  result: CSSModuleResult,
  outputDir: string,
  options?: { skipCss?: boolean; projectRoot?: string },
): Promise<void> {
  const basename = runtime.path.basename(cssPath, ".module.css");

  // Determine the correct base directory for relative path calculation
  // If cssPath is under outputDir, use outputDir as base (virtual source case)
  // Otherwise, use projectRoot (real source case)
  const baseDir = cssPath.startsWith(outputDir)
    ? outputDir
    : (options?.projectRoot ?? runtime.process.cwd());

  const relativePath = runtime.path.relative(baseDir, cssPath);
  const relativeDir = runtime.path.dirname(relativePath);

  // Create output directory structure mirroring source
  const moduleOutputDir = runtime.path.resolve(outputDir, relativeDir);
  await runtime.fs.mkdir(moduleOutputDir, { recursive: true });

  // Save processed CSS (skip if only JSON is needed)
  if (options?.skipCss !== true) {
    const cssOutputPath = runtime.path.resolve(
      moduleOutputDir,
      `${basename}.module.css`,
    );
    await runtime.fs.writeTextFile(cssOutputPath, result.code);
  }

  // Save exports JSON
  const jsonOutputPath = runtime.path.resolve(
    moduleOutputDir,
    `${basename}.module.css.json`,
  );
  await runtime.fs.writeTextFile(
    jsonOutputPath,
    JSON.stringify(result.exports, null, 2),
  );

  // Save .d.ts if generated
  if (result.dts !== undefined) {
    const dtsOutputPath = runtime.path.resolve(
      moduleOutputDir,
      `${basename}.module.css.d.ts`,
    );
    await runtime.fs.writeTextFile(dtsOutputPath, result.dts);
  }

  cssModulesLogger.debug(`Saved CSS module outputs to ${moduleOutputDir}`);
}

// Re-export utility for external use
export { generateTypeScriptDefinition };
