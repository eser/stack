// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Processing with Lightning CSS
 * Uses plugin hooks for framework-specific processing (Tailwind, etc.)
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as logging from "@eser/logging";
import { buildErrors } from "../../types.ts";
import { transform } from "lightningcss";
import type { CssPlugin } from "../../domain/css-plugin.ts";

const cssLogger = logging.logger.getLogger(["laroux-bundler", "css"]);

export type CssProcessOptions = {
  /** Input CSS file path */
  input: string;
  /** Output CSS file path */
  output: string;
  /** Whether to minify the output */
  minify?: boolean;
  /** Project root directory */
  projectRoot: string;
  /** CSS plugin for framework-specific processing */
  plugin?: CssPlugin;
};

/**
 * Process CSS file
 * Uses plugin hooks for framework-specific compilation
 * @param options - Processing options
 * @returns Promise resolving when processing completes
 */
export async function processCss(options: CssProcessOptions): Promise<void> {
  const { input, output, minify = false, projectRoot, plugin } = options;

  // Check if input file exists
  if (!(await runtime.fs.exists(input))) {
    cssLogger.warn(`CSS input file not found: ${input}`);
    return;
  }

  // Ensure output directory exists
  const outputDir = runtime.path.resolve(output, "..");
  await runtime.fs.ensureDir(outputDir);

  // Read input CSS
  let cssContent = await runtime.fs.readTextFile(input);

  cssLogger.debug(`Processing CSS: ${input} → ${output}`);

  const context = {
    projectRoot,
    cssPath: input,
    isModule: false,
  };

  try {
    // Check if plugin should process this file
    const shouldUsePlugin = plugin?.shouldProcess?.(cssContent, context) ??
      !!plugin;

    if (shouldUsePlugin && plugin?.compile) {
      // Plugin handles compilation (e.g., Tailwind CLI does scanning + compilation + minification)
      cssContent = await plugin.compile(cssContent, context);
    } else {
      // Fallback: Lightning CSS only (no framework-specific processing)
      cssContent = await postProcessWithLightningCSS(cssContent, minify);
    }

    // Write output
    await runtime.fs.writeTextFile(output, cssContent);

    cssLogger.debug(`✓ CSS processed successfully: ${output}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cssLogger.error(`CSS processing failed: ${message}`);
    throw buildErrors.cssError(message);
  }
}

/**
 * Post-process CSS with Lightning CSS
 * Applies advanced optimizations, nesting support, and unused symbol removal
 * @param cssContent - CSS content to process
 * @param minify - Whether to minify
 * @returns Processed CSS string
 */
export function postProcessWithLightningCSS(
  cssContent: string,
  minify: boolean,
): string {
  try {
    // Process with Lightning CSS
    const result = transform({
      filename: "styles.css",
      code: new TextEncoder().encode(cssContent),
      minify,
      targets: {
        chrome: 90 << 16, // Chrome 90+
        firefox: 88 << 16, // Firefox 88+
        safari: 14 << 16, // Safari 14+
      },
      unusedSymbols: [], // Remove unused custom properties and keyframes
    });

    return new TextDecoder().decode(result.code);
  } catch (error) {
    cssLogger.warn(
      `Lightning CSS post-processing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    // Return original on error
    return cssContent;
  }
}
