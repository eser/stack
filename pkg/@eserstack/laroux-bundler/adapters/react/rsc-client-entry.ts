// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Create Client Entry Point
 * Generates a temporary entry file that includes:
 * 1. All client components (so they're in the bundle)
 * 2. The bootstrap code from @eserstack/laroux-react/client/bootstrap
 * 3. A global module registry for RSC client
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type { ClientComponent } from "./rsc-analyze.ts";

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
 * location so that bare imports such as react resolve from the app, and the
 * bootstrap and the app's client components share one React instance. The
 * app therefore needs the packages these files import by bare specifier:
 * react, react-dom and @eserstack/laroux (@eserstack/logging is replaced by
 * its browser shim).
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
 * Locate the laroux-react package root, which node_modules holds for the
 * bundler as one of its dependencies.
 *
 * @returns Absolute path of the package root
 */
function getPackageRoot(): string {
  const resolved = import.meta.resolve(BOOTSTRAP_EXPORT);
  if (!resolved.startsWith("file://")) {
    throw new Error(
      `locate the laroux-react package root: ${BOOTSTRAP_EXPORT} resolved to ${resolved}, which is not a file in node_modules`,
    );
  }

  const bootstrapPath = fileUrlToPath(resolved).replaceAll("\\", "/");
  const packageRoot = bootstrapPath.replace(BOOTSTRAP_EXPORT_SUFFIX, "");
  if (packageRoot === bootstrapPath) {
    throw new Error(
      `locate the laroux-react package root: ${BOOTSTRAP_EXPORT} resolved to ${resolved}, which does not end in /client/bootstrap/index.ts`,
    );
  }

  return packageRoot;
}

/**
 * Copy the bootstrap files into copyDir, keeping their package layout.
 * The file list is fixed and small, so the copies run concurrently.
 */
async function copyBootstrapFiles(copyDir: string): Promise<void> {
  const packageRoot = getPackageRoot();

  await Promise.all(
    BOOTSTRAP_SOURCE_FILES.map(async (relativePath) => {
      const destPath = runtime.path.resolve(copyDir, relativePath);
      await runtime.fs.ensureDir(runtime.path.dirname(destPath));
      await runtime.fs.copyFile(
        runtime.path.resolve(packageRoot, relativePath),
        destPath,
      );
    }),
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
  const componentImports = clientComponents
    .map((component, index) => {
      // Use the absolute path to the component file
      return `import * as __component_${index} from "${component.filePath}";`;
    })
    .join("\n");

  // Generate registry assignments for all client components
  const componentRegistry = clientComponents
    .map((component, index) => {
      // Register using the relative path as the key (matching module map)
      // Use ./ prefix to match the module IDs sent by the server
      const moduleId = `./${component.relativePath}`;
      return `  __RUNTIME_MODULES__["${moduleId}"] = __component_${index};`;
    })
    .join("\n");

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
