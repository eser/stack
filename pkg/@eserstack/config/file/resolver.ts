// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Resolves `filepath` against `baseUrl`. An absolute path, or any path when
 * `baseUrl` is `null`, is returned as is; a `file:` result is returned as a
 * plain path and any other URL in full.
 *
 * @param filepath - The path to resolve
 * @param baseUrl - A directory path or URL to resolve against
 * @returns The resolved path or URL
 */
export const resolvePath = (
  filepath: string,
  baseUrl: string | null = null,
): string => {
  if (baseUrl === null || filepath[0] === "/") {
    return filepath;
  }

  const base = baseUrl[0] === "/" ? `file://${baseUrl}/` : baseUrl;
  const url = new URL(filepath, base);

  if (url.protocol === "file:") {
    return url.href.substring(7);
  }

  return url.href;
};
