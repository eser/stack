// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Stylesheet Loader for Tailwind CSS
 * Handles @import and @reference directives with npm module resolution
 */

import { current } from "@eser/standards/runtime";

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
    const resolvedPath = current.path.resolve(base, id);
    const content = await current.fs.readTextFile(resolvedPath);
    return {
      path: resolvedPath,
      content,
      base: current.path.dirname(resolvedPath),
    };
  }

  // Handle npm module imports (e.g., "tailwindcss", "tailwindcss/theme.css")
  // Walk up directory tree to find node_modules
  let searchBase = base;
  while (searchBase !== "/" && searchBase !== "") {
    const nodeModulesPath = current.path.resolve(
      searchBase,
      "node_modules",
      id,
    );
    try {
      const content = await current.fs.readTextFile(nodeModulesPath);
      return {
        path: nodeModulesPath,
        content,
        base: current.path.dirname(nodeModulesPath),
      };
    } catch {
      // Try with .css extension if not already present
      if (!id.endsWith(".css")) {
        const cssPath = `${nodeModulesPath}.css`;
        try {
          const content = await current.fs.readTextFile(cssPath);
          return {
            path: cssPath,
            content,
            base: current.path.dirname(cssPath),
          };
        } catch {
          // Continue to next fallback
        }
      }

      // Try resolving as package entry point (index.css or similar)
      const pkgPath = current.path.resolve(
        searchBase,
        "node_modules",
        id,
        "index.css",
      );
      try {
        const content = await current.fs.readTextFile(pkgPath);
        return {
          path: pkgPath,
          content,
          base: current.path.dirname(pkgPath),
        };
      } catch {
        // Move up one directory
        searchBase = current.path.dirname(searchBase);
      }
    }
  }

  // Fallback to treating as a relative path
  const resolvedPath = current.path.resolve(base, id);
  const content = await current.fs.readTextFile(resolvedPath);
  return {
    path: resolvedPath,
    content,
    base: current.path.dirname(resolvedPath),
  };
}
