// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry fetcher — loads and validates recipe manifests from local
 * `.eser/recipes.json` or remote GitHub repos. Unified specifier resolution
 * for all kit commands (add, clone, new, list).
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as registrySchema from "./registry-schema.ts";

// =============================================================================
// Constants
// =============================================================================

const FETCH_TIMEOUT_MS = 30_000;

const DEFAULT_OWNER = "eser";
const DEFAULT_REPO = "stack";
const DEFAULT_REF = "main";
const RECIPES_FILENAME = ".eser/recipes.json";

// Legacy constants (kept for backwards compatibility in tests/external use)
const DEFAULT_REGISTRY_URL: string =
  `https://raw.githubusercontent.com/${DEFAULT_OWNER}/${DEFAULT_REPO}/${DEFAULT_REF}/.eser/recipes.json`;

const LOCAL_REGISTRY_PATH: string = RECIPES_FILENAME;

// =============================================================================
// Specifier Resolution
// =============================================================================

/**
 * A resolved specifier — either a recipe name lookup or a repo reference.
 *
 * - `kind: "name"` — look up by name in local, then default repo
 * - `kind: "repo"` — fetch .eser/recipes.json from that specific repo
 */
type ResolvedSpecifier =
  | { readonly kind: "name"; readonly name: string; readonly ref?: string }
  | {
    readonly kind: "repo";
    readonly owner: string;
    readonly repo: string;
    readonly ref: string;
  };

/**
 * Parse a specifier string into a resolved specifier.
 *
 * Formats:
 *   "fp-pipe"           → name lookup, no ref
 *   "fp-pipe#dev"       → name lookup, ref=dev
 *   "deneme/ajan"       → repo github.com/deneme/ajan, ref=main
 *   "deneme/ajan#v2"    → repo github.com/deneme/ajan, ref=v2
 *   "gh:deneme/ajan"    → same (gh: prefix stripped)
 */
const resolveSpecifier = (specifier: string): ResolvedSpecifier => {
  const cleaned = specifier.replace(/^gh:/, "");
  const hashIndex = cleaned.indexOf("#");
  const pathPart = hashIndex === -1 ? cleaned : cleaned.slice(0, hashIndex);
  const ref = hashIndex === -1 ? undefined : cleaned.slice(hashIndex + 1);

  if (pathPart.includes("/")) {
    const slashIndex = pathPart.indexOf("/");
    const owner = pathPart.slice(0, slashIndex);
    const repo = pathPart.slice(slashIndex + 1);

    if (owner === "" || repo === "") {
      return { kind: "name", name: pathPart, ref };
    }

    return { kind: "repo", owner, repo, ref: ref ?? DEFAULT_REF };
  }

  return { kind: "name", name: pathPart, ref };
};

// =============================================================================
// Shared fetch utility
// =============================================================================

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
 * Detect local `.eser/recipes.json` by walking up the directory tree.
 */
const detectLocalRegistry = async (): Promise<string | undefined> => {
  let dir = runtime.process.cwd();

  for (let i = 0; i < 10; i++) {
    const candidate = `${dir}/${RECIPES_FILENAME}`;
    try {
      await runtime.fs.stat(candidate);
      return candidate;
    } catch {
      const parent = dir.replace(/\/[^/]+$/, "");
      if (parent === dir) break;
      dir = parent;
    }
  }

  return undefined;
};

// =============================================================================
// Registry fetcher (unified)
// =============================================================================

interface FetchRegistryOptions {
  readonly verbose?: boolean;
  readonly local?: boolean;
}

/**
 * Fetch and validate a registry manifest.
 *
 * Resolution chain:
 * 1. If `source` is provided (URL or path), use it directly
 * 2. If `options.local`, auto-detect local `.eser/recipes.json`
 * 3. Fall back to eser/stack's `.eser/recipes.json` on GitHub
 */
const fetchRegistry = async (
  source?: string,
  options?: FetchRegistryOptions,
): Promise<registrySchema.RegistryManifest> => {
  let registrySource = source ?? DEFAULT_REGISTRY_URL;

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

/**
 * Fetch a registry manifest from a specific GitHub repo's `.eser/recipes.json`.
 */
const fetchRegistryFromRepo = async (
  owner: string,
  repo: string,
  ref: string,
  options?: FetchRegistryOptions,
): Promise<registrySchema.RegistryManifest> => {
  const url =
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${RECIPES_FILENAME}`;

  return await fetchRegistry(url, options);
};

// =============================================================================
// File fetcher
// =============================================================================

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
// Folder fetcher
// =============================================================================

interface FetchedFile {
  readonly path: string;
  readonly content: string;
}

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

  const fileEntries = entries.filter((e) => e.type === "file");

  const fetchPromises = fileEntries.map(
    async (entry): Promise<FetchedFile> => {
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

      const relativePath = entry.path.startsWith(folderPath)
        ? entry.path.slice(folderPath.length).replace(/^\//, "")
        : entry.path;

      return {
        path: relativePath,
        content: await fileResponse.text(),
      };
    },
  );

  return await Promise.all(fetchPromises);
};

// =============================================================================
// Standalone recipe fetcher (for clone command)
// =============================================================================

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
  DEFAULT_OWNER,
  DEFAULT_REF,
  DEFAULT_REGISTRY_URL,
  DEFAULT_REPO,
  detectLocalRegistry,
  FETCH_TIMEOUT_MS,
  fetchRecipeFile,
  fetchRecipeFolder,
  fetchRecipeFromRepo,
  fetchRegistry,
  fetchRegistryFromRepo,
  LOCAL_REGISTRY_PATH,
  parseGitHubRawUrl,
  RECIPES_FILENAME,
  registryFetch,
  resolveSpecifier,
};

export type { FetchedFile, FetchRegistryOptions, ResolvedSpecifier };
