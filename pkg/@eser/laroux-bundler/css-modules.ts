// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Modules Handler
 * Re-exports @eser/bundler/css CSS modules utilities with laroux-specific caching.
 * Uses adapters/tailwindcss for @reference injection and @apply expansion.
 */

import { current } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import {
  type CssModuleResult as EserCssModuleResult,
  generateTypeScriptDefinition,
  processCssModule as eserProcessCssModule,
} from "@eser/bundler/css";
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
  const cssContent = await current.fs.readTextFile(cssPath);

  // Create context for plugin
  const context = {
    projectRoot: projectRoot ?? current.process.cwd(),
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
  await current.fs.writeTextFile(tempPath, processedContent);

  try {
    // Use @eser/bundler's processCssModule (no Tailwind root needed - plugin handled @apply)
    const result = await eserProcessCssModule(tempPath, {
      generateDts: generateDTS,
      minify,
      // No tailwind option - plugin's preprocess already expanded @apply
    });

    const filename = current.path.basename(cssPath);
    cssModulesLogger.debug(
      `Processed ${
        Object.keys(result.exports).length
      } class(es) in ${filename}`,
    );

    return result;
  } finally {
    // Clean up temp file
    await current.fs.remove(tempPath).catch(() => {});
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
            const fileStat = await current.fs.stat(cssPath);
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
            const fileStat = await current.fs.stat(cssPath);
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
  const basename = current.path.basename(cssPath, ".module.css");

  // Determine the correct base directory for relative path calculation
  // If cssPath is under outputDir, use outputDir as base (virtual source case)
  // Otherwise, use projectRoot (real source case)
  const baseDir = cssPath.startsWith(outputDir)
    ? outputDir
    : (options?.projectRoot ?? current.process.cwd());

  const relativePath = current.path.relative(baseDir, cssPath);
  const relativeDir = current.path.dirname(relativePath);

  // Create output directory structure mirroring source
  const moduleOutputDir = current.path.resolve(outputDir, relativeDir);
  await current.fs.mkdir(moduleOutputDir, { recursive: true });

  // Save processed CSS (skip if only JSON is needed)
  if (options?.skipCss !== true) {
    const cssOutputPath = current.path.resolve(
      moduleOutputDir,
      `${basename}.module.css`,
    );
    await current.fs.writeTextFile(cssOutputPath, result.code);
  }

  // Save exports JSON
  const jsonOutputPath = current.path.resolve(
    moduleOutputDir,
    `${basename}.module.css.json`,
  );
  await current.fs.writeTextFile(
    jsonOutputPath,
    JSON.stringify(result.exports, null, 2),
  );

  // Save .d.ts if generated
  if (result.dts !== undefined) {
    const dtsOutputPath = current.path.resolve(
      moduleOutputDir,
      `${basename}.module.css.d.ts`,
    );
    await current.fs.writeTextFile(dtsOutputPath, result.dts);
  }

  cssModulesLogger.debug(`Saved CSS module outputs to ${moduleOutputDir}`);
}

// Re-export utility for external use
export { generateTypeScriptDefinition };
