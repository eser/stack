// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Import Map Loader
 *
 * Handles loading and merging import maps from deno.json and package.json.
 * Provides a unified interface for bundler configuration across all runtimes.
 *
 * Supports three scenarios:
 * 1. deno.json only - Deno projects with import maps
 * 2. package.json only - Node/Bun projects with dependencies
 * 3. deno.json + package.json - Hybrid projects
 *
 * @module
 */

import { runtime } from "@eser/standards/runtime";
import * as logging from "@eser/logging";

const importMapLogger = logging.logger.getLogger([
  "laroux-bundler",
  "import-map",
]);

/** Known protocol prefixes for external packages */
const EXTERNAL_PROTOCOLS = new Set(["npm:", "jsr:", "node:"]);

/** Known protocol prefixes for all package types */
const KNOWN_PROTOCOLS = new Set([
  "npm:",
  "jsr:",
  "node:",
  "http:",
  "https:",
  "file:",
  "data:",
]);

/**
 * Maximum length of a protocol prefix (e.g., "workspace:" is 10 chars).
 * Used to avoid false positives when checking for protocols in paths.
 */
const MAX_PROTOCOL_LENGTH = 12;

/**
 * Extract protocol from a specifier if present.
 * Works for both standard URLs (http, https, file) and
 * custom protocols (npm:, jsr:, node:).
 *
 * @param specifier - The specifier to extract protocol from
 * @returns The protocol with trailing colon (e.g., "npm:") or null
 */
export function getProtocol(specifier: string): string | null {
  // For standard URLs, use URL API
  if (URL.canParse(specifier)) {
    return new URL(specifier).protocol;
  }
  // For non-standard protocols (npm:, jsr:, node:), extract manually
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
  return specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/");
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
 * Import map entry with metadata about its source.
 */
export type ImportMapEntry = {
  /** The bare specifier (e.g., "react", "lucide-react") */
  specifier: string;
  /** The resolved target (e.g., "npm:react@^19.0.0", "./src/utils.ts") */
  target: string;
  /** Source of this entry */
  source: "deno.json" | "package.json";
  /** Whether this is an npm package */
  isNpmPackage: boolean;
  /** Whether this is a JSR package */
  isJsrPackage: boolean;
  /** Whether this is a local path */
  isLocalPath: boolean;
};

/**
 * Unified import map combining deno.json and package.json.
 */
export type ImportMap = {
  /** All import entries, keyed by specifier */
  entries: Map<string, ImportMapEntry>;
  /** List of external package specifiers (npm/jsr packages) */
  externals: string[];
  /** Project root directory */
  projectRoot: string;
  /** Whether deno.json was found */
  hasDenoJson: boolean;
  /** Whether package.json was found */
  hasPackageJson: boolean;
};

/**
 * deno.json structure (partial)
 */
type DenoJsonConfig = {
  imports?: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
  nodeModulesDir?: "auto" | "manual" | boolean;
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
 * Check if a target is an npm package specifier.
 * npm packages are either explicit (npm:react) or bare specifiers without known protocols.
 */
function isNpmSpecifier(target: string): boolean {
  const protocol = getProtocol(target);
  // Explicit npm: prefix
  if (protocol === "npm:") return true;
  // Bare specifier (no protocol, not a path)
  if (protocol === null && !isPathSpecifier(target)) return true;
  return false;
}

/**
 * Check if a target is a JSR package specifier.
 */
function isJsrSpecifier(target: string): boolean {
  return getProtocol(target) === "jsr:";
}

/**
 * Check if a target is a local path.
 */
function isLocalPath(target: string): boolean {
  return isPathSpecifier(target) || getProtocol(target) === "file:";
}

/**
 * Parse deno.json imports into ImportMapEntry array.
 */
function parseDenoJsonImports(
  imports: Record<string, string>,
): ImportMapEntry[] {
  const entries: ImportMapEntry[] = [];

  for (const [specifier, target] of Object.entries(imports)) {
    entries.push({
      specifier,
      target,
      source: "deno.json",
      isNpmPackage: isNpmSpecifier(target),
      isJsrPackage: isJsrSpecifier(target),
      isLocalPath: isLocalPath(target),
    });
  }

  return entries;
}

/**
 * Parse package.json dependencies into ImportMapEntry array.
 * Converts package versions to npm: specifiers.
 */
function parsePackageJsonDependencies(
  deps: Record<string, string>,
): ImportMapEntry[] {
  const entries: ImportMapEntry[] = [];

  for (const [name, version] of Object.entries(deps)) {
    // Skip workspace references and file: references
    const protocol = getProtocol(version);
    if (protocol === "workspace:" || protocol === "file:") {
      continue;
    }

    entries.push({
      specifier: name,
      target: `npm:${name}@${version}`,
      source: "package.json",
      isNpmPackage: true,
      isJsrPackage: false,
      isLocalPath: false,
    });
  }

  return entries;
}

/**
 * Load deno.json from a directory.
 */
async function loadDenoJson(
  projectRoot: string,
): Promise<DenoJsonConfig | null> {
  const denoJsonPath = runtime.path.join(projectRoot, "deno.json");

  try {
    const exists = await runtime.fs.exists(denoJsonPath);
    if (!exists) {
      // Try deno.jsonc
      const denoJsoncPath = runtime.path.join(projectRoot, "deno.jsonc");
      const existsJsonc = await runtime.fs.exists(denoJsoncPath);
      if (!existsJsonc) {
        return null;
      }
      const content = await runtime.fs.readTextFile(denoJsoncPath);
      // Note: JSONC parsing would need a proper parser for comments
      // For now, assume valid JSON
      return JSON.parse(content) as DenoJsonConfig;
    }

    const content = await runtime.fs.readTextFile(denoJsonPath);
    return JSON.parse(content) as DenoJsonConfig;
  } catch (error) {
    importMapLogger.debug(
      `Failed to load deno.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
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
    importMapLogger.debug(
      `Failed to load package.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * Load and merge import maps from deno.json and package.json.
 *
 * Priority:
 * 1. deno.json imports (highest priority - user's explicit mappings)
 * 2. package.json dependencies (lower priority - npm packages)
 *
 * @param projectRoot - Project root directory
 * @returns Unified import map
 */
export async function loadImportMap(projectRoot: string): Promise<ImportMap> {
  const entries = new Map<string, ImportMapEntry>();
  const externals: string[] = [];

  // Load deno.json
  const denoJson = await loadDenoJson(projectRoot);

  // Load package.json
  const packageJson = await loadPackageJson(projectRoot);

  // Process package.json dependencies first (lower priority)
  if (packageJson !== null) {
    const allDeps = {
      ...packageJson.peerDependencies,
      ...packageJson.devDependencies,
      ...packageJson.dependencies, // dependencies override dev/peer
    };

    for (const entry of parsePackageJsonDependencies(allDeps)) {
      entries.set(entry.specifier, entry);
      if (entry.isNpmPackage || entry.isJsrPackage) {
        externals.push(entry.specifier);
      }
    }
  }

  // Process deno.json imports (higher priority - overwrites package.json)
  if (denoJson?.imports !== undefined) {
    for (const entry of parseDenoJsonImports(denoJson.imports)) {
      entries.set(entry.specifier, entry);
      if (entry.isNpmPackage || entry.isJsrPackage) {
        // Add to externals if not already present
        if (!externals.includes(entry.specifier)) {
          externals.push(entry.specifier);
        }
      }
    }
  }

  importMapLogger.debug(
    `Loaded import map: ${entries.size} entries, ${externals.length} externals`,
  );

  return {
    entries,
    externals,
    projectRoot,
    hasDenoJson: denoJson !== null,
    hasPackageJson: packageJson !== null,
  };
}

/**
 * Resolve a bare specifier using the import map.
 *
 * @param specifier - Bare specifier to resolve (e.g., "react", "lucide-react")
 * @param importMap - Import map to use for resolution
 * @returns Resolved target or null if not found
 */
export function resolveSpecifier(
  specifier: string,
  importMap: ImportMap,
): string | null {
  // Exact match
  const entry = importMap.entries.get(specifier);
  if (entry !== undefined) {
    return entry.target;
  }

  // Try prefix match for subpath imports (e.g., "react-dom/client")
  for (const [key, value] of importMap.entries) {
    // Handle trailing slash patterns (e.g., "@/": "./src/")
    if (key.endsWith("/") && specifier.startsWith(key)) {
      const subpath = specifier.slice(key.length);
      return value.target.endsWith("/")
        ? `${value.target}${subpath}`
        : `${value.target}/${subpath}`;
    }

    // Handle subpath of package (e.g., "react-dom/client")
    if (specifier.startsWith(`${key}/`)) {
      const subpath = specifier.slice(key.length);
      return `${value.target}${subpath}`;
    }
  }

  return null;
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
 * Check if a specifier should be treated as external.
 *
 * @param specifier - Specifier to check
 * @param importMap - Import map to check against
 * @returns True if the specifier should be external
 */
export function isExternal(specifier: string, importMap: ImportMap): boolean {
  // Already has an external protocol
  const protocol = getProtocol(specifier);
  if (protocol !== null && EXTERNAL_PROTOCOLS.has(protocol)) {
    return true;
  }

  // Check exact match
  const entry = importMap.entries.get(specifier);
  if (entry !== undefined) {
    return entry.isNpmPackage || entry.isJsrPackage;
  }

  // Check prefix match
  for (const [key, value] of importMap.entries) {
    if (specifier.startsWith(`${key}/`)) {
      return value.isNpmPackage || value.isJsrPackage;
    }
  }

  return false;
}
