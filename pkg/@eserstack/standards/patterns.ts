// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * File name patterns and extensions for JavaScript and TypeScript sources.
 *
 * @module
 */

/** Matches a JavaScript or TypeScript test file name, such as `app.test.ts`. */
export const JS_TEST_FILE_PATTERN = /\.test\.(?:[cm]?[jt]sx?)$/;
/** Matches the extension of a JavaScript or TypeScript file. */
export const JS_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
/** JavaScript and TypeScript file extensions, without the leading dot. */
export const JS_FILE_EXTENSIONS = [
  "tsx",
  "jsx",
  "ts",
  "js",
  "mts",
  "mjs",
  "cts",
  "cjs",
];

/**
 * Replace any JavaScript/TypeScript extension with a target extension.
 * Handles: .ts, .tsx, .js, .jsx, .mts, .mjs, .cts, .cjs
 *
 * @example
 * replaceJsExtension("app/counter.tsx", ".js") // "app/counter.js"
 * replaceJsExtension("lib/utils.mts", ".js") // "lib/utils.js"
 * replaceJsExtension("app/page.tsx", "") // "app/page"
 */
export function replaceJsExtension(
  filePath: string,
  targetExtension: string,
): string {
  return filePath.replace(JS_FILE_PATTERN, targetExtension);
}

/** Check if a path ends with one of the given bare extensions */
export const hasExtension = (
  path: string,
  extensions: readonly string[],
): boolean => extensions.some((ext) => path.endsWith(`.${ext}`));
