// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const JS_TEST_FILE_PATTERN = /\.test\.(?:[cm]?[jt]sx?)$/;
export const JS_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
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
