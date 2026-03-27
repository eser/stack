// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry fetcher — loads and validates registry manifests from local
 * paths or remote URLs. Supports file, folder, and standalone recipe fetching.
 *
 * This is part of the eser recipe registry system for distributing code
 * recipes. Not to be confused with `@eser/standards/collections`.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as registrySchema from "./registry-schema.ts";

// =============================================================================
// Constants
// =============================================================================

const FETCH_TIMEOUT_MS = 30_000;

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/eser/stack/main/etc/registry/eser-registry.json";

const LOCAL_REGISTRY_PATH = "etc/registry/eser-registry.json";

// =============================================================================
// Shared fetch utility
// =============================================================================

/**
 * Fetch a URL with a 30-second timeout. Shared by registry manifest
 * fetching and recipe file downloading.
 */
const registryFetch = async (url: string): Promise<Response> => {
  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return response;
};

// =============================================================================
// Local registry detection
// =============================================================================

/**
 * Detect if CWD is inside the eserstack repo by looking for the local
 * registry manifest file. Walks up the directory tree.
 */
const detectLocalRegistry = async (): Promise<string | undefined> => {
  let dir = runtime.process.cwd();

  for (let i = 0; i < 10; i++) {
    const candidate = `${dir}/${LOCAL_REGISTRY_PATH}`;
    try {
      await runtime.fs.stat(candidate);
      return candidate;
    } catch {
      // Not found — go up
      const parent = dir.replace(/\/[^/]+$/, "");
      if (parent === dir) break;
      dir = parent;
    }
  }

  return undefined;
};

// =============================================================================
// Registry fetcher
// =============================================================================

interface FetchRegistryOptions {
  readonly verbose?: boolean;
  readonly local?: boolean;
}

/**
 * Fetch and validate a registry manifest from a local path or remote URL.
 *
 * - If `options.local` is true, auto-detect the local registry file.
 * - If `source` starts with `http://` or `https://`, fetches remotely.
 * - Otherwise, treats it as a local file path and reads via fs.
 * - Validates the JSON against the registry schema.
 */
const fetchRegistry = async (
  source?: string,
  options?: FetchRegistryOptions,
): Promise<registrySchema.RegistryManifest> => {
  let registrySource = source ?? DEFAULT_REGISTRY_URL;

  // Auto-detect local registry if requested
  if (options?.local === true && source === undefined) {
    const localPath = await detectLocalRegistry();
    if (localPath !== undefined) {
      registrySource = localPath;
      if (options?.verbose === true) {
        // deno-lint-ignore no-console
        console.log(`Using local registry: ${localPath}`);
      }
    }
  }

  const isRemote = registrySource.startsWith("http://") ||
    registrySource.startsWith("https://");

  if (options?.verbose === true) {
    // deno-lint-ignore no-console
    console.log(`Fetching registry from: ${registrySource}`);
  }

  let rawJson: string;

  if (isRemote) {
    const response = await registryFetch(registrySource);

    if (!response.ok) {
      throw new Error(
        `Could not reach registry at ${registrySource}. HTTP ${response.status}`,
      );
    }

    rawJson = await response.text();
  } else {
    // Local file — use runtime abstraction
    try {
      rawJson = await runtime.fs.readTextFile(registrySource);
    } catch {
      throw new Error(
        `Could not read registry file at ${registrySource}`,
      );
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch {
    throw new Error(
      `Registry at ${registrySource} is not valid JSON`,
    );
  }

  return registrySchema.validateRegistryManifest(data);
};

// =============================================================================
// File fetcher
// =============================================================================

/**
 * Fetch a single file's content from a registry.
 * Used by the recipe applier to download individual recipe files.
 */
const fetchRecipeFile = async (
  registryUrl: string,
  sourcePath: string,
): Promise<string> => {
  const fileUrl = registrySchema.resolveRegistryUrl(registryUrl, sourcePath);

  const response = await registryFetch(fileUrl);

  if (!response.ok) {
    throw new Error(
      `Could not fetch recipe file at ${fileUrl}. HTTP ${response.status}`,
    );
  }

  return await response.text();
};

// =============================================================================
// Folder fetcher (fetch-all-then-write pattern)
// =============================================================================

/** A fetched file entry with its content held in memory */
interface FetchedFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Parse a GitHub raw content URL into owner/repo/ref/path components.
 * Supports: https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
 */
const parseGitHubRawUrl = (
  url: string,
):
  | { owner: string; repo: string; ref: string; basePath: string }
  | undefined => {
  const match = url.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/,
  );

  if (match === null) return undefined;

  return {
    owner: match[1]!,
    repo: match[2]!,
    ref: match[3]!,
    basePath: match[4] ?? "",
  };
};

/**
 * Fetch all files in a folder from a GitHub repository.
 * Uses the GitHub Contents API to list directory contents, then fetches each file.
 *
 * Returns all files in memory (fetch-all-then-write pattern).
 * Throws if any file fails to fetch — caller gets all or nothing.
 */
const fetchRecipeFolder = async (
  registryUrl: string,
  sourcePath: string,
): Promise<readonly FetchedFile[]> => {
  const parsed = parseGitHubRawUrl(registryUrl);

  if (parsed === undefined) {
    throw new Error(
      `Cannot fetch folder: registry URL '${registryUrl}' is not a GitHub raw URL`,
    );
  }

  const folderPath = parsed.basePath
    ? `${parsed.basePath}/${sourcePath}`.replace(/\/+/g, "/")
    : sourcePath;

  // Use GitHub Contents API to list the directory
  const apiUrl =
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${folderPath}?ref=${parsed.ref}`;

  const response = await registryFetch(apiUrl);

  if (!response.ok) {
    throw new Error(
      `Could not list folder '${folderPath}' from ${parsed.owner}/${parsed.repo}. HTTP ${response.status}`,
    );
  }

  const entries = await response.json() as Array<{
    type: string;
    path: string;
    download_url: string | null;
  }>;

  if (!Array.isArray(entries)) {
    throw new Error(
      `Expected directory listing for '${folderPath}', got a file instead`,
    );
  }

  // Fetch all files in parallel — all or nothing
  const fileEntries = entries.filter((e) => e.type === "file");

  const fetchPromises = fileEntries.map(async (entry): Promise<FetchedFile> => {
    if (entry.download_url === null) {
      throw new Error(
        `File '${entry.path}' has no download URL (may be too large)`,
      );
    }

    const fileResponse = await registryFetch(entry.download_url);

    if (!fileResponse.ok) {
      throw new Error(
        `Could not fetch file '${entry.path}'. HTTP ${fileResponse.status}`,
      );
    }

    // Strip the base folder path to get relative path within the folder
    const relativePath = entry.path.startsWith(folderPath)
      ? entry.path.slice(folderPath.length).replace(/^\//, "")
      : entry.path;

    return {
      path: relativePath,
      content: await fileResponse.text(),
    };
  });

  return await Promise.all(fetchPromises);
};

// =============================================================================
// Standalone recipe fetcher (for clone command)
// =============================================================================

/**
 * Fetch a standalone recipe.json from a GitHub repository.
 * Used by `eser kit clone` for non-registered recipes.
 *
 * @param owner - GitHub repo owner
 * @param repo - GitHub repo name
 * @param ref - Branch, tag, or commit (default: "main")
 * @param recipePath - Path to recipe.json in the repo (default: "recipe.json")
 */
const fetchRecipeFromRepo = async (
  owner: string,
  repo: string,
  ref = "main",
  recipePath = "recipe.json",
): Promise<registrySchema.Recipe> => {
  const url =
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${recipePath}`;

  const response = await registryFetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not fetch recipe from ${owner}/${repo}@${ref}/${recipePath}. HTTP ${response.status}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error(
      `Recipe file at ${owner}/${repo}@${ref}/${recipePath} is not valid JSON`,
    );
  }

  return registrySchema.validateRecipe(data);
};

export {
  DEFAULT_REGISTRY_URL,
  detectLocalRegistry,
  FETCH_TIMEOUT_MS,
  fetchRecipeFile,
  fetchRecipeFolder,
  fetchRecipeFromRepo,
  fetchRegistry,
  LOCAL_REGISTRY_PATH,
  parseGitHubRawUrl,
  registryFetch,
};

export type { FetchedFile, FetchRegistryOptions };
