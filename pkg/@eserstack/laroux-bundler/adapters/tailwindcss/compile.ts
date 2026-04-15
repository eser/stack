// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tailwind CSS Compile Wrapper
 * Wraps Tailwind's programmatic compile() API
 */

import { compile } from "tailwindcss";
import { loadStylesheet } from "./stylesheet-loader.ts";

export type TailwindCompileOptions = {
  /** Base directory for relative imports */
  base: string;
  /** Utility class candidates to include */
  candidates?: string[];
};

/**
 * Compile CSS with Tailwind
 * @param css - CSS content to compile
 * @param options - Compile options
 * @returns Compiled CSS
 */
export async function compileTailwind(
  css: string,
  options: TailwindCompileOptions,
): Promise<string> {
  const compiled = await compile(css, {
    base: options.base,
    loadStylesheet,
  });

  // Build with candidates (or empty array for just @apply expansion)
  const candidates = options.candidates ?? [];
  return compiled.build(candidates);
}

/**
 * Expand @apply directives in CSS
 * Compiles CSS with empty candidates to just expand @apply
 */
export function expandApplyDirectives(
  css: string,
  base: string,
): Promise<string> {
  return compileTailwind(css, { base, candidates: [] });
}
