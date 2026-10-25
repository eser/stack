// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Stylesheet Loader for Tailwind CSS
 * Handles @import and @reference directives with npm module resolution
 */

import { runtime } from "@eserstack/standards/cross-runtime";

export type StylesheetLoadResult = {
  path: string;
  content: string;
  base: string;
};

/**
 * Load a stylesheet for Tailwind's compile() API
 * Handles @import and @reference directives
 * Supports both relative paths and npm module imports
 */
export async function loadStylesheet(
  id: string,
  base: string,
): Promise<StylesheetLoadResult> {
  // Check if it's a relative or absolute path
  if (id.startsWith(".") || id.startsWith("/")) {
    const resolvedPath = runtime.path.resolve(base, id);
    const content = await runtime.fs.readTextFile(resolvedPath);
    return {
      path: resolvedPath,
      content,
      base: runtime.path.dirname(resolvedPath),
    };
  }

  // Handle npm module imports (e.g., "tailwindcss", "tailwindcss/theme.css")
  // Walk up directory tree to find node_modules
  let searchBase = base;
  while (searchBase !== "/" && searchBase !== "") {
    for (const candidate of nodeModulesCandidates(searchBase, id)) {
      // Candidates are tried in resolution order and the walk stops at the
      // first readable one, so later candidates are never read.
      // oxlint-disable-next-line no-await-in-loop
      const loaded = await tryLoadStylesheet(candidate);
      if (loaded !== null) {
        return loaded;
      }
    }

    // Move up one directory; dirname of a Windows drive root returns it
    // unchanged, which ends the walk there
    const parent = runtime.path.dirname(searchBase);
    if (parent === searchBase) {
      break;
    }
    searchBase = parent;
  }

  // Fallback to treating as a relative path
  const resolvedPath = runtime.path.resolve(base, id);
  const content = await runtime.fs.readTextFile(resolvedPath);
  return {
    path: resolvedPath,
    content,
    base: runtime.path.dirname(resolvedPath),
  };
}

/**
 * Paths to try under one node_modules directory, in resolution order:
 * the id itself, the id with a .css extension, then the package's index.css
 */
function nodeModulesCandidates(searchBase: string, id: string): string[] {
  const nodeModulesPath = runtime.path.resolve(searchBase, "node_modules", id);
  const candidates = [nodeModulesPath];
  if (!id.endsWith(".css")) {
    candidates.push(`${nodeModulesPath}.css`);
  }
  candidates.push(runtime.path.resolve(nodeModulesPath, "index.css"));
  return candidates;
}

/**
 * Read a stylesheet, or return null when the path cannot be read. A bare
 * package id usually names a directory, so a failed read here is expected
 * and means "try the next candidate".
 */
async function tryLoadStylesheet(
  filePath: string,
): Promise<StylesheetLoadResult | null> {
  try {
    const content = await runtime.fs.readTextFile(filePath);
    return {
      path: filePath,
      content,
      base: runtime.path.dirname(filePath),
    };
  } catch {
    return null;
  }
}
