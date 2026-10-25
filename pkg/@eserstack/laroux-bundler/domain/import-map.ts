// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Import Map Loader
 *
 * Reads the dependencies a project declares in its package.json. A declared
 * package is a bare specifier that resolves from the project's node_modules
 * (ADR 0004), so the map records which packages the project declares and
 * never rewrites a specifier.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";

const importMapLogger = logging.logger.getLogger([
  "laroux-bundler",
  "import-map",
]);

/** Protocol prefixes of specifiers that are never bundled. */
const EXTERNAL_PROTOCOLS = new Set(["node:"]);

/** Protocol prefixes of specifiers that are not bare package imports. */
const KNOWN_PROTOCOLS = new Set(["node:", "http:", "https:", "file:", "data:"]);

/** Version protocols of dependencies that are not registry packages. */
const LOCAL_VERSION_PROTOCOLS = new Set(["workspace:", "file:", "link:"]);

/**
 * Maximum length of a protocol prefix (e.g., "workspace:" is 10 chars).
 * Used to avoid false positives when checking for protocols in paths.
 */
const MAX_PROTOCOL_LENGTH = 12;

/**
 * Extract protocol from a specifier if present.
 * Works for both standard URLs (http, https, file) and other prefixes such
 * as node: or workspace:.
 *
 * @param specifier - The specifier to extract protocol from
 * @returns The protocol with trailing colon (e.g., "node:") or null
 */
export function getProtocol(specifier: string): string | null {
  // For standard URLs, use URL API
  if (URL.canParse(specifier)) {
    return new URL(specifier).protocol;
  }
  // For other prefixes, extract manually
  const colonIndex = specifier.indexOf(":");
  if (colonIndex > 0 && colonIndex < MAX_PROTOCOL_LENGTH) {
    return specifier.slice(0, colonIndex + 1);
  }
  return null;
}

/**
 * Check if specifier is a relative or absolute path.
 */
export function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  );
}

/**
 * Check if a specifier is a bare package import.
 * Bare imports have no protocol prefix and are not relative/absolute paths.
 *
 * @param specifier - The specifier to check
 * @returns true if the specifier is a bare import
 */
export function isBareSpecifier(specifier: string): boolean {
  const protocol = getProtocol(specifier);
  if (protocol !== null && KNOWN_PROTOCOLS.has(protocol)) {
    return false;
  }
  return !isPathSpecifier(specifier);
}

/**
 * A package the project declares in package.json.
 */
export type ImportMapEntry = {
  /** The bare specifier (e.g., "react", "lucide-react") */
  specifier: string;
  /** What the specifier resolves to: the same bare specifier (ADR 0004) */
  target: string;
  /** The version range package.json declares (e.g., "^19.0.0") */
  version: string;
};

/**
 * The packages a project declares in package.json.
 */
export type ImportMap = {
  /** All declared packages, keyed by specifier */
  entries: Map<string, ImportMapEntry>;
  /** The declared registry packages, which may stay external */
  externals: string[];
  /** Project root directory */
  projectRoot: string;
  /** Whether package.json was found */
  hasPackageJson: boolean;
};

/**
 * package.json structure (partial)
 */
type PackageJsonConfig = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Turn package.json dependencies into entries, skipping workspace, file and
 * link references, which are not registry packages.
 */
function parsePackageJsonDependencies(
  deps: Record<string, string>,
): ImportMapEntry[] {
  const entries: ImportMapEntry[] = [];

  for (const [name, version] of Object.entries(deps)) {
    const protocol = getProtocol(version);
    if (protocol !== null && LOCAL_VERSION_PROTOCOLS.has(protocol)) {
      continue;
    }

    entries.push({ specifier: name, target: name, version });
  }

  return entries;
}

/**
 * Load package.json from a directory.
 */
async function loadPackageJson(
  projectRoot: string,
): Promise<PackageJsonConfig | null> {
  const packageJsonPath = runtime.path.join(projectRoot, "package.json");

  try {
    const exists = await runtime.fs.exists(packageJsonPath);
    if (!exists) {
      return null;
    }

    const content = await runtime.fs.readTextFile(packageJsonPath);
    return JSON.parse(content) as PackageJsonConfig;
  } catch (error) {
    importMapLogger
      .with({ error })
      .debug(`load ${packageJsonPath}; resolving without its dependencies`);
    return null;
  }
}

/**
 * Load the packages a project declares in package.json: dependencies,
 * devDependencies and peerDependencies, where dependencies win.
 *
 * @param projectRoot - Project root directory
 * @returns The project's import map
 */
export async function loadImportMap(projectRoot: string): Promise<ImportMap> {
  const entries = new Map<string, ImportMapEntry>();

  const packageJson = await loadPackageJson(projectRoot);

  if (packageJson !== null) {
    const allDeps = {
      ...packageJson.peerDependencies,
      ...packageJson.devDependencies,
      ...packageJson.dependencies, // dependencies override dev/peer
    };

    for (const entry of parsePackageJsonDependencies(allDeps)) {
      entries.set(entry.specifier, entry);
    }
  }

  const externals = [...entries.keys()];

  importMapLogger.debug(
    `Loaded import map: ${entries.size} entries, ${externals.length} externals`,
  );

  return {
    entries,
    externals,
    projectRoot,
    hasPackageJson: packageJson !== null,
  };
}

/**
 * Find the declared package a specifier belongs to: the exact name, or the
 * package of a subpath import such as "react-dom/client".
 */
function findEntry(
  specifier: string,
  importMap: ImportMap,
): ImportMapEntry | null {
  const entry = importMap.entries.get(specifier);
  if (entry !== undefined) {
    return entry;
  }

  for (const [key, value] of importMap.entries) {
    if (specifier.startsWith(`${key}/`)) {
      return value;
    }
  }

  return null;
}

/**
 * Resolve a bare specifier against the declared packages. A declared package
 * resolves to the specifier itself, which the bundler and the runtime then
 * find in node_modules.
 *
 * @param specifier - Bare specifier to resolve (e.g., "react", "react-dom/client")
 * @param importMap - Import map to use for resolution
 * @returns The specifier, or null when no declared package provides it
 */
export function resolveSpecifier(
  specifier: string,
  importMap: ImportMap,
): string | null {
  return findEntry(specifier, importMap) === null ? null : specifier;
}

/**
 * Get all external package specifiers for bundler configuration.
 * These packages should be marked as external in the bundler.
 *
 * @param importMap - Import map to extract externals from
 * @returns Array of external specifier patterns
 */
export function getExternals(importMap: ImportMap): string[] {
  return importMap.externals;
}

/**
 * Check if a specifier should be treated as external: a node: built-in or a
 * declared registry package.
 *
 * @param specifier - Specifier to check
 * @param importMap - Import map to check against
 * @returns True if the specifier should be external
 */
export function isExternal(specifier: string, importMap: ImportMap): boolean {
  const protocol = getProtocol(specifier);
  if (protocol !== null && EXTERNAL_PROTOCOLS.has(protocol)) {
    return true;
  }

  return findEntry(specifier, importMap) !== null;
}
