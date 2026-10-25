// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Create Client Entry Point
 * Generates a temporary entry file that includes:
 * 1. All client components (so they're in the bundle)
 * 2. The bootstrap code from @eserstack/laroux-react/client/bootstrap
 * 3. A global module registry for RSC client
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as fs from "@std/fs"; // copy not available in runtime
import type { ClientComponent } from "./rsc-analyze.ts";

/** Upper bound for fetching one bootstrap file from a remote source (JSR). */
const REMOTE_SOURCE_TIMEOUT_MS = 30_000;

/** The laroux-react export that locates the package root. */
const BOOTSTRAP_EXPORT = "@eserstack/laroux-react/client/bootstrap";

/** What BOOTSTRAP_EXPORT resolves to, below the package root. */
const BOOTSTRAP_EXPORT_SUFFIX = /\/client\/bootstrap(?:\/index\.ts)?$/;

/** Directory under distDir that holds the copied laroux-react files. */
export const BOOTSTRAP_COPY_DIR = "_laroux-react";

/** The bootstrap module the generated entry imports, inside the copy. */
const BOOTSTRAP_ENTRY_FILE = "client/bootstrap/entry.ts";

/**
 * laroux-react files the client entry bundles, relative to the package root.
 *
 * They are copied with this layout so the relative imports between them
 * (entry.ts imports ../../client.ts) resolve inside the copy. The copy sits
 * in the app's dist directory instead of being bundled from the package
 * location for two reasons: bare imports such as react then resolve from the
 * app, so the bootstrap and the app's client components share one React
 * instance; and a package fetched from JSR goes through the same path as a
 * local one. The app therefore needs the packages these files import by bare
 * specifier: react, react-dom and @eserstack/laroux (@eserstack/logging is
 * replaced by its browser shim).
 *
 * A file that joins this import graph must be listed here;
 * rsc-client-entry.test.ts bundles the entry and fails on a missing one.
 */
const BOOTSTRAP_SOURCE_FILES = [
  "client.ts",
  "protocol.ts",
  "runtime/image/fallback.ts",
  "runtime/navigation/link-navigation.ts",
  "client/bootstrap/entry.ts",
  "client/bootstrap/error-boundary.ts",
  "client/bootstrap/error-overlay.ts",
  "client/bootstrap/globals.d.ts",
  "client/bootstrap/hmr-client.ts",
  "client/bootstrap/index.ts",
  "client/bootstrap/lazy-loader.ts",
  "client/bootstrap/smart-refresh.ts",
] as const;

/** Where the laroux-react package files come from. */
type PackageSource = {
  /** True when the files are fetched over HTTP(S), as from JSR. */
  readonly isRemote: boolean;
  /** URL of the package root, without a trailing slash. */
  readonly baseUrl: string;
};

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

/** A file URL pathname of a Windows path, such as /C:/dir. */
const WINDOWS_DRIVE_PATHNAME = /^\/[A-Za-z]:\//;

/**
 * Convert a file:// URL to a filesystem path, decoding percent-escapes such
 * as %20, and return any other string unchanged.
 */
export function fileUrlToPath(urlString: string): string {
  if (!urlString.startsWith("file://")) {
    return urlString;
  }

  const pathname = decodeURIComponent(new URL(urlString).pathname);
  return WINDOWS_DRIVE_PATHNAME.test(pathname) ? pathname.slice(1) : pathname;
}

/**
 * Convert a JSR specifier to an HTTPS URL.
 * JSR specifiers are not standard URLs, so we parse them manually.
 * e.g., "jsr:@eserstack/laroux-react@^4.0.24/client/bootstrap"
 *    -> "https://jsr.io/@eserstack/laroux-react/4.0.24/client/bootstrap"
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
 * Transform JSR-published imports back to bare imports for bundling.
 * When files are fetched from JSR, they contain full specifiers like:
 * - "jsr:@eserstack/logging@^4.0.25" -> "@eserstack/logging"
 * - "npm:react@^19.2.3" -> "react"
 * - "npm:/react-dom@^19.2.3/client" -> "react-dom/client" (also fixes extra /)
 *
 * This is necessary because rolldown doesn't understand jsr:/npm: protocols.
 */
function transformJsrImports(content: string): string {
  return (
    content
      // Remove JSX import source pragmas that have npm: specifiers
      // e.g., /** @jsxImportSource npm:react@^19.2.3 */ -> /** @jsxImportSource react */
      .replace(
        /@jsxImportSource\s+npm:react@[^\s*]+/g,
        "@jsxImportSource react",
      )
      .replace(
        /@jsxImportSourceTypes\s+npm:react@[^\s*]+/g,
        "@jsxImportSourceTypes react",
      )
      // Transform jsr: imports to bare specifiers
      // "jsr:@eserstack/package@^X.Y.Z/path" -> "@eserstack/package/path"
      .replace(
        /from\s+["']jsr:(@[^@]+)@[^"'/]+([^"']*)["']/g,
        'from "$1$2"',
      )
      .replace(
        /import\s*\(\s*["']jsr:(@[^@]+)@[^"'/]+([^"']*)["']\s*\)/g,
        'import("$1$2")',
      )
      // Transform npm: imports to bare specifiers
      // "npm:react@^X.Y.Z" -> "react"
      // "npm:/react-dom@^X.Y.Z/client" -> "react-dom/client" (note: also handles extra /)
      .replace(
        /from\s+["']npm:\/?([^@]+)@[^"'/]+([^"']*)["']/g,
        'from "$1$2"',
      )
      .replace(
        /import\s*\(\s*["']npm:\/?([^@]+)@[^"'/]+([^"']*)["']\s*\)/g,
        'import("$1$2")',
      )
  );
}

/**
 * Locate the laroux-react package root through import.meta.resolve, so it
 * works from the workspace and from installed packages (JSR or npm).
 */
function getPackageSource(): PackageSource {
  const resolved = import.meta.resolve(BOOTSTRAP_EXPORT);
  const resolvedUrl = resolved.startsWith("jsr:")
    ? jsrSpecifierToUrl(resolved)
    : resolved;
  const baseUrl = resolvedUrl.replace(BOOTSTRAP_EXPORT_SUFFIX, "");

  if (baseUrl === resolvedUrl) {
    throw new Error(
      `locate the laroux-react package root: ${BOOTSTRAP_EXPORT} resolved to ${resolved}, which does not end in /client/bootstrap/index.ts`,
    );
  }

  return { isRemote: isRemoteSource(baseUrl), baseUrl };
}

/**
 * Copy one laroux-react file to the same relative path under copyDir.
 * Handles both local filesystem and remote (JSR/HTTP) sources.
 */
async function copyBootstrapFile(
  relativePath: string,
  source: PackageSource,
  copyDir: string,
): Promise<void> {
  const destPath = runtime.path.resolve(copyDir, relativePath);
  const sourceUrl = new URL(relativePath, `${source.baseUrl}/`).href;

  await runtime.fs.ensureDir(runtime.path.dirname(destPath));

  if (!source.isRemote) {
    // Copy from local filesystem (file:// URL or path)
    await fs.copy(fileUrlToPath(sourceUrl), destPath, { overwrite: true });
    return;
  }

  // Fetch from remote URL (JSR, etc.)
  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(REMOTE_SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Transform JSR-published imports back to bare imports for bundling
    // JSR rewrites imports like "@eserstack/logging" to "jsr:@eserstack/logging@^4.0.25"
    // We need to reverse this so rolldown can resolve them
    const content = transformJsrImports(await response.text());

    await runtime.fs.writeTextFile(destPath, content);
  } catch (error) {
    throw new Error(
      `fetch bootstrap file ${relativePath} from ${sourceUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Copy the bootstrap files into copyDir, keeping their package layout.
 * The file list is fixed and small, so the copies run concurrently.
 */
async function copyBootstrapFiles(copyDir: string): Promise<void> {
  const source = getPackageSource();

  await Promise.all(
    BOOTSTRAP_SOURCE_FILES.map((relativePath) =>
      copyBootstrapFile(relativePath, source, copyDir)
    ),
  );
}

/**
 * Write the client entry for a bundle: it imports every client component,
 * registers it in the global module registry and runs the laroux-react
 * bootstrap, whose files are copied to `<distDir>/_laroux-react/`.
 *
 * @param clientComponents - The app's "use client" components
 * @param _projectRoot - Unused; kept for the FrameworkPlugin signature
 * @param distDir - Directory that receives the entry and the bootstrap copy
 * @returns Absolute path of the generated entry file
 */
export async function createClientEntry(
  clientComponents: ClientComponent[],
  _projectRoot: string,
  distDir: string,
): Promise<string> {
  const entryPath = runtime.path.resolve(distDir, "_client-entry.tsx");

  await runtime.fs.ensureDir(distDir);

  // Copy the bootstrap files to dist, keeping their relative imports intact
  await copyBootstrapFiles(runtime.path.resolve(distDir, BOOTSTRAP_COPY_DIR));

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

// Import and run the bootstrap code (copied to dist/${BOOTSTRAP_COPY_DIR}/)
import "./${BOOTSTRAP_COPY_DIR}/${BOOTSTRAP_ENTRY_FILE}";
`;

  await runtime.fs.writeTextFile(entryPath, content);

  return entryPath;
}
