// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Processor Port
 *
 * Transforms compiled CSS for the browser. The build runs it on the global
 * stylesheet when no CSS plugin compiles that stylesheet. The Lightning CSS
 * adapter (adapters/lightningcss) implements it.
 */

import type { CssPlugin, CssPluginContext } from "./css-plugin.ts";

/** Options for one {@link CssProcessor} call. */
export type CssProcessorOptions = {
  /** Path of the stylesheet the CSS came from, for error messages */
  readonly filename: string;
  /** Minify the output */
  readonly minify: boolean;
};

/**
 * Transforms compiled CSS for the target browsers, for example by lowering
 * nesting and minifying.
 */
export type CssProcessor = {
  /** Processor name for logs */
  readonly name: string;
  /**
   * Transform one stylesheet and return the result.
   *
   * @param css - The stylesheet source
   * @param options - The file name and whether to minify
   * @returns The transformed stylesheet
   */
  process: (
    css: string,
    options: CssProcessorOptions,
  ) => Promise<string> | string;
};

/**
 * CSS processor for builds that pass none: it returns the CSS unchanged, so
 * the stylesheet is neither lowered for older browsers nor minified.
 */
export const noopCssProcessor: CssProcessor = {
  name: "noop",
  process: (css) => css,
};

/** Inputs of {@link compileStylesheet}. */
export type CompileStylesheetOptions = {
  /** CSS plugin, such as Tailwind; null when the build has none */
  readonly plugin: CssPlugin | null;
  /** Processor for a stylesheet the plugin does not compile */
  readonly processor: CssProcessor;
  /** The stylesheet's path and project root, passed to the plugin */
  readonly context: CssPluginContext;
  /** Minify the output */
  readonly minify: boolean;
};

/**
 * Compile one stylesheet: the CSS plugin compiles it when the plugin claims
 * it (its shouldProcess hook, true when the hook is missing) and has a
 * compile hook; otherwise the CSS processor transforms it.
 *
 * @param css - The stylesheet source
 * @param options - The plugin, the processor and the stylesheet's context
 * @returns The compiled stylesheet
 */
export async function compileStylesheet(
  css: string,
  options: CompileStylesheetOptions,
): Promise<string> {
  const { plugin, processor, context, minify } = options;

  const pluginClaimsFile =
    plugin !== null && (plugin.shouldProcess?.(css, context) ?? true);

  if (pluginClaimsFile && plugin.compile !== undefined) {
    return await plugin.compile(css, context);
  }

  return await processor.process(css, { filename: context.cssPath, minify });
}
