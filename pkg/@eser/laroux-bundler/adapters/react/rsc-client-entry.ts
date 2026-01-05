// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Create Client Entry Point
 * Generates a temporary entry file that includes:
 * 1. All client components (so they're in the bundle)
 * 2. The bootstrap code from @eser/laroux-react/client/bootstrap
 * 3. A global module registry for RSC client
 */

import { runtime } from "@eser/standards/runtime";
import { copy } from "@std/fs"; // copy not available in runtime
import type { ClientComponent } from "./rsc-analyze.ts";

/**
 * Bootstrap files that need to be copied to the dist directory.
 * These are the client-side files from @eser/laroux-react/client/bootstrap/
 */
const BOOTSTRAP_FILES = [
  "entry.tsx",
  "error-boundary.tsx",
  "error-overlay.tsx",
  "globals.d.ts",
  "hmr-client.tsx",
  "index.ts",
  "lazy-loader.ts",
  "smart-refresh.tsx",
] as const;

/**
 * Check if a URL string represents a remote source (HTTP/HTTPS/JSR).
 * Uses URL.canParse() for standard protocols, falls back to prefix check for JSR.
 */
function isRemoteSource(urlString: string): boolean {
  // JSR specifiers are not valid URLs but are remote sources
  if (urlString.startsWith("jsr:")) {
    return true;
  }

  // Use URL API to check if it's a valid HTTP/HTTPS URL
  if (URL.canParse(urlString)) {
    const url = new URL(urlString);
    return url.protocol === "https:" || url.protocol === "http:";
  }

  return false;
}

/**
 * Convert a file:// URL to a filesystem path using URL API.
 * Returns the pathname from the URL, properly decoded.
 */
function fileUrlToPath(urlString: string): string {
  // Use URL API to parse file:// URLs
  if (URL.canParse(urlString) && urlString.startsWith("file://")) {
    const url = new URL(urlString);
    // pathname is already decoded by URL API
    return url.pathname;
  }
  // Return as-is if not a file:// URL
  return urlString;
}

/**
 * Convert a JSR specifier to an HTTPS URL.
 * JSR specifiers are not standard URLs, so we parse them manually.
 * e.g., "jsr:@eser/laroux-react@^4.0.24/client/bootstrap"
 *    -> "https://jsr.io/@eser/laroux-react/4.0.24/client/bootstrap"
 */
function jsrSpecifierToUrl(specifier: string): string {
  // Parse: jsr:@scope/package@version/path
  const match = specifier.match(
    /^jsr:@([^/]+)\/([^@]+)@[\^~]?([^/]+)(.*)$/,
  );
  if (match) {
    const [, scope, pkg, version, subpath] = match;
    // Construct URL using URL API for proper encoding
    const baseUrl = new URL(`https://jsr.io/@${scope}/${pkg}/${version}`);
    return `${baseUrl.href}${subpath}`;
  }

  // Try simpler format: jsr:@scope/package/path (no version)
  const simpleMatch = specifier.match(/^jsr:@([^/]+)\/([^/]+)(.*)$/);
  if (simpleMatch) {
    const [, scope, pkg, subpath] = simpleMatch;
    const baseUrl = new URL(`https://jsr.io/@${scope}/${pkg}`);
    return `${baseUrl.href}${subpath}`;
  }

  throw new Error(`Cannot parse JSR specifier: ${specifier}`);
}

/**
 * Get the bootstrap directory URL/path using import.meta.resolve.
 * Works with both local workspace and installed packages (JSR/npm).
 */
function getBootstrapDir(): { isRemote: boolean; baseUrl: string } {
  // Use import.meta.resolve to get the proper path to the bootstrap index
  // This works regardless of whether we're running from workspace or installed packages
  const resolved = import.meta.resolve("@eser/laroux-react/client/bootstrap");

  // Get the directory by removing the trailing filename if present
  // The resolve gives us the path to index.ts, we need the directory
  let baseUrl = resolved.replace(/\/index\.ts$/, "");

  // Check if it's a JSR specifier and convert to HTTPS URL
  if (baseUrl.startsWith("jsr:")) {
    baseUrl = jsrSpecifierToUrl(baseUrl);
  }

  return {
    isRemote: isRemoteSource(baseUrl),
    baseUrl,
  };
}

/**
 * Copy bootstrap files from source to destination.
 * Handles both local filesystem and remote (JSR/HTTP) sources.
 */
async function copyBootstrapFiles(distDir: string): Promise<void> {
  const { isRemote, baseUrl } = getBootstrapDir();

  for (const filename of BOOTSTRAP_FILES) {
    const destPath = runtime.path.resolve(distDir, filename);
    const sourceUrl = `${baseUrl}/${filename}`;

    if (isRemote) {
      // Fetch from remote URL (JSR, etc.)
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const content = await response.text();
        await runtime.fs.writeTextFile(destPath, content);
      } catch (err) {
        throw new Error(
          `Failed to fetch bootstrap file ${filename} from ${sourceUrl}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      // Copy from local filesystem (file:// URL or path)
      const sourcePath = fileUrlToPath(sourceUrl);
      await copy(sourcePath, destPath, { overwrite: true });
    }
  }
}

export async function createClientEntry(
  clientComponents: ClientComponent[],
  _projectRoot: string,
  distDir: string,
): Promise<string> {
  const entryPath = runtime.path.resolve(distDir, "_client-entry.tsx");

  await runtime.fs.ensureDir(distDir);

  // Copy all client bootstrap files to dist
  await copyBootstrapFiles(distDir);

  // Generate import statements for all client components
  const componentImports = clientComponents.map((component, index) => {
    // Use the absolute path to the component file
    return `import * as __component_${index} from "${component.filePath}";`;
  }).join("\n");

  // Generate registry assignments for all client components
  const componentRegistry = clientComponents.map((component, index) => {
    // Register using the relative path as the key (matching module map)
    // Use ./ prefix to match the module IDs sent by the server
    const moduleId = `./${component.relativePath}`;
    return `  __RUNTIME_MODULES__["${moduleId}"] = __component_${index};`;
  }).join("\n");

  // Create the entry file content that imports components and bootstrap code
  const content = `/**
 * Auto-generated Client Entry Point - Runtime Bundle
 * This file contains the bootstrap code and all client components
 */

${componentImports}

// Create global module registry for runtime components
if (typeof globalThis !== "undefined") {
  globalThis.__RUNTIME_MODULES__ = globalThis.__RUNTIME_MODULES__ ?? {};
}
const __RUNTIME_MODULES__ = typeof globalThis !== "undefined"
  ? globalThis.__RUNTIME_MODULES__
  : {};

// Register all client components
${componentRegistry}

// Import and run the bootstrap code (copied to dist/)
import "./entry.tsx";
`;

  await runtime.fs.writeTextFile(entryPath, content);

  return entryPath;
}
