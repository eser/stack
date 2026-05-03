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
    /** Optional subpath within the repo (e.g., "packages/foo" from gh:owner/repo/packages/foo) */
    readonly subpath?: string;
  };

/**
 * Parse a specifier string into a resolved specifier.
 *
 * Formats:
 *   "fp-pipe"                     → name lookup, no ref
 *   "fp-pipe#dev"                 → name lookup, ref=dev
 *   "deneme/ajan"                 → repo github.com/deneme/ajan, ref=main
 *   "deneme/ajan#v2"              → repo github.com/deneme/ajan, ref=v2
 *   "gh:deneme/ajan"              → same (gh: prefix stripped)
 *   "gh:deneme/ajan/packages/foo" → repo ajan, subpath=packages/foo, ref=main
 *   "gh:deneme/ajan/sub#feature/x"→ repo ajan, subpath=sub, ref=feature/x
 *
 * Disambiguation rule: segments BEFORE the first `#` form the path hierarchy
 * (owner / repo / subpath…); everything AFTER `#` is the ref verbatim.
 * To use a slash-bearing branch as ref of the repo root, write `gh:owner/repo#feature/x`.
 */
const resolveSpecifier = (specifier: string): ResolvedSpecifier => {
  const cleaned = specifier.replace(/^(gh:|github:)/, "");
  const hashIndex = cleaned.indexOf("#");
  const pathPart = hashIndex === -1 ? cleaned : cleaned.slice(0, hashIndex);
  const ref = hashIndex === -1 ? undefined : cleaned.slice(hashIndex + 1);

  if (pathPart.includes("/")) {
    const parts = pathPart.split("/");
    const owner = parts[0] ?? "";
    const repo = parts[1] ?? "";

    if (owner === "" || repo === "") {
      return { kind: "name", name: pathPart, ref };
    }

    const subpath = parts.length > 2 ? parts.slice(2).join("/") : undefined;

    return {
      kind: "repo",
      owner,
      repo,
      ref: ref ?? DEFAULT_REF,
      subpath: subpath !== "" ? subpath : undefined,
    };
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

/**
 * Thrown by `fetchRecipeFromRepo` when the recipe.json file itself is not
 * found (HTTP 404). Carries the failing `path` so callers can distinguish
 * "recipe.json absent" (→ whole-repo fallback) from "repo/ref not found"
 * (→ surface error to user).
 */
class RecipeFileNotFoundError extends Error {
  public readonly path: string;
  public readonly owner: string;
  public readonly repo: string;
  public readonly ref: string;

  constructor(path: string, owner: string, repo: string, ref: string) {
    super(
      `Recipe file '${path}' not found in ${owner}/${repo}@${ref}. ` +
      `Repository and ref exist — recipe.json is simply absent (whole-repo mode applies).`,
    );
    this.name = "RecipeFileNotFoundError";
    this.path = path;
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
  }
}

/**
 * Fetch a standalone recipe.json from a specific GitHub repo.
 *
 * When `subpath` is provided, reads `${subpath}/recipe.json` relative to
 * the repo root. RecipeFile.source paths in the returned Recipe are also
 * expected to be relative to that subpath.
 *
 * @throws {RecipeFileNotFoundError} when recipe.json is absent (HTTP 404) — caller
 *   should synthesize an empty recipe and fall back to whole-repo mode.
 * @throws {Error} for repo/ref not found or other HTTP errors — surface to user.
 */
const fetchRecipeFromRepo = async (
  owner: string,
  repo: string,
  ref = "main",
  recipePath = "recipe.json",
  subpath?: string,
): Promise<registrySchema.Recipe> => {
  const effectivePath = subpath !== undefined && subpath !== ""
    ? `${subpath}/${recipePath}`
    : recipePath;

  const url =
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${effectivePath}`;

  const response = await registryFetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      // Distinguish recipe.json-missing from repo/ref-missing:
      // A HEAD request to the repo root or a well-known file would be needed for
      // certainty, but in practice a 404 on recipe.json is almost always the file
      // being absent, not the repo. Throw RecipeFileNotFoundError with path so
      // clone-recipe.ts can catch it and synthesize an empty recipe.
      throw new RecipeFileNotFoundError(
        effectivePath,
        owner,
        repo,
        ref,
      );
    }
    throw new Error(
      `Could not fetch recipe from ${owner}/${repo}@${ref}/${effectivePath}. ` +
      `HTTP ${response.status}. ` +
      `Check that the repository exists: https://github.com/${owner}/${repo}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error(
      `Recipe file at ${owner}/${repo}@${ref}/${effectivePath} is not valid JSON`,
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
  RecipeFileNotFoundError,
  RECIPES_FILENAME,
  registryFetch,
  resolveSpecifier,
};

export type { FetchedFile, FetchRegistryOptions, ResolvedSpecifier };
