// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Processing with Lightning CSS
 * Uses plugin hooks for framework-specific processing (Tailwind, etc.)
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import * as types from "../../types.ts";
import * as lightningcss from "lightningcss";
import type { CssPlugin } from "../../domain/css-plugin.ts";
import * as cssProcessor from "../../domain/css-processor.ts";
import type {
  CssProcessor,
  CssProcessorOptions,
} from "../../domain/css-processor.ts";

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
    // The plugin compiles the file when it claims it (Tailwind does scanning,
    // compilation and minification); otherwise Lightning CSS transforms it.
    cssContent = await cssProcessor.compileStylesheet(cssContent, {
      plugin: plugin ?? null,
      processor: lightningCssProcessor,
      context,
      minify,
    });

    // Write output
    await runtime.fs.writeTextFile(output, cssContent);

    cssLogger.debug(`✓ CSS processed successfully: ${output}`);
  } catch (error) {
    // Not logged here: the caller that handles the error logs it once.
    const message = error instanceof Error ? error.message : String(error);
    throw types.buildErrors.cssError(`${input}: ${message}`, { cause: error });
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
  return transformWithLightningCss(cssContent, {
    filename: "styles.css",
    minify,
  });
}

/**
 * Transform one stylesheet with Lightning CSS for Chrome 90, Firefox 88 and
 * Safari 14. When Lightning CSS cannot parse it, the warning names the file
 * and the stylesheet is returned unchanged.
 */
function transformWithLightningCss(
  cssContent: string,
  options: CssProcessorOptions,
): string {
  try {
    const result = lightningcss.transform({
      filename: options.filename,
      code: new TextEncoder().encode(cssContent),
      minify: options.minify,
      targets: {
        chrome: 90 << 16, // Chrome 90+
        firefox: 88 << 16, // Firefox 88+
        safari: 14 << 16, // Safari 14+
      },
      unusedSymbols: [], // Remove unused custom properties and keyframes
    });

    return new TextDecoder().decode(result.code);
  } catch (error) {
    cssLogger
      .with({ error })
      .warn(
        `Lightning CSS could not transform ${options.filename}, keeping it unchanged`,
      );
    return cssContent;
  }
}

/**
 * CSS processor that transforms stylesheets with Lightning CSS: nesting and
 * other modern syntax lowered for Chrome 90, Firefox 88 and Safari 14, and
 * minification when asked. Pass it to the build as `cssProcessor`.
 */
export const lightningCssProcessor: CssProcessor = {
  name: "lightningcss",
  process: (css: string, options: CssProcessorOptions): string =>
    transformWithLightningCss(css, options),
};
