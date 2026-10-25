// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Verbose registry lines are kit's CLI output for the person running the command.
// deno-lint-ignore-file no-console

/**
 * Registry fetcher — loads and validates recipe manifests from local
 * `.eser/recipes.json` or remote GitHub repos. Unified specifier resolution
 * for all kit commands (add, clone, new, list).
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as registrySchema from "./registry-schema.ts";

// =============================================================================
// Constants
// =============================================================================

/** How long one registry request may take, in milliseconds, before it is aborted. */
export const FETCH_TIMEOUT_MS = 30_000;

/** GitHub owner of the default registry. */
export const DEFAULT_OWNER = "eser";
/** GitHub repository of the default registry. */
export const DEFAULT_REPO = "stack";
/** Git ref that a repository specifier without `#ref` resolves to. */
export const DEFAULT_REF = "main";
/** Path of the registry manifest inside a repository or project. */
export const RECIPES_FILENAME = ".eser/recipes.json";

/**
 * The registry that {@link fetchRegistry} loads when it is given no source:
 * `.eser/recipes.json` on the main branch of eser/stack.
 */
export const DEFAULT_REGISTRY_URL: string = `https://raw.githubusercontent.com/${DEFAULT_OWNER}/${DEFAULT_REPO}/${DEFAULT_REF}/.eser/recipes.json`;

/** The same path as {@link RECIPES_FILENAME}, kept for code that imports this name. */
export const LOCAL_REGISTRY_PATH: string = RECIPES_FILENAME;

// =============================================================================
// Errors
// =============================================================================

const describeStatus = (status: number | null): string => {
  if (status === null) {
    return "no response; check the network connection and the URL";
  }
  if (status === 404) {
    return "HTTP 404; check that the path exists at this ref";
  }
  if (status === 403 || status === 429) {
    return `HTTP ${status}; the host refused or rate-limited the request, so retry later`;
  }
  if (status >= 500) {
    return `HTTP ${status}; the host had an error, so retry later`;
  }

  return `HTTP ${status}`;
};

/**
 * Thrown when a request to a registry host gets no response (the network
 * error is the `cause`) or a status outside 200-299.
 */
export class RegistryRequestError extends Error {
  /** The URL that was requested. */
  readonly url: string;
  /** The HTTP status, or null when no response arrived. */
  readonly status: number | null;

  /**
   * Creates the error for a request to `url`.
   *
   * @param url - The URL that was requested
   * @param status - The HTTP status, or null when no response arrived
   * @param options - `cause`: the network error, when there was one
   */
  constructor(url: string, status: number | null, options?: ErrorOptions) {
    super(`GET ${url}: ${describeStatus(status)}`, options);
    this.name = "RegistryRequestError";
    this.url = url;
    this.status = status;
  }
}

/**
 * Thrown by {@link fetchRegistry} when a registry manifest cannot be loaded:
 * the file or URL cannot be read, the content is not JSON, or the manifest
 * does not match registry/v1. The error of the failing step is the `cause`.
 */
export class RegistryLoadError extends Error {
  /** The path or URL the manifest was loaded from. */
  readonly source: string;

  /**
   * Creates the error for the manifest at `source`.
   *
   * @param source - The path or URL the manifest was loaded from
   * @param step - The step that failed, or what is wrong with the manifest
   * @param options - `cause`: the error of the failing step
   */
  constructor(source: string, step: string, options?: ErrorOptions) {
    super(`load registry ${source}: ${step}`, options);
    this.name = "RegistryLoadError";
    this.source = source;
  }
}

/**
 * Thrown when a recipe.json or a recipe folder cannot be loaded from a
 * repository. `location` names the file or folder as owner/repo@ref/path;
 * the error of the failing step is the `cause`.
 */
export class RecipeLoadError extends Error {
  /** The recipe file or folder, as owner/repo@ref/path. */
  readonly location: string;

  /**
   * Creates the error for the recipe file or folder at `location`.
   *
   * @param location - The recipe file or folder, as owner/repo@ref/path
   * @param step - The step that failed, or what is wrong with the recipe
   * @param options - `cause`: the error of the failing step
   */
  constructor(location: string, step: string, options?: ErrorOptions) {
    super(`load recipe ${location}: ${step}`, options);
    this.name = "RecipeLoadError";
    this.location = location;
  }
}

// =============================================================================
// Specifier Resolution
// =============================================================================

/**
 * A resolved specifier — either a recipe name lookup or a repo reference.
 *
 * - `kind: "name"` — look up by name in local, then default repo
 * - `kind: "repo"` — fetch .eser/recipes.json from that specific repo
 */
export type ResolvedSpecifier =
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
 *   "acme/widget"                 → repo github.com/acme/widget, ref=main
 *   "acme/widget#v2"              → repo github.com/acme/widget, ref=v2
 *   "gh:acme/widget"              → same (gh: prefix stripped)
 *   "gh:acme/widget/packages/foo" → repo widget, subpath=packages/foo, ref=main
 *   "gh:acme/widget/sub#feature/x"→ repo widget, subpath=sub, ref=feature/x
 *
 * Disambiguation rule: segments BEFORE the first `#` form the path hierarchy
 * (owner / repo / subpath…); everything AFTER `#` is the ref verbatim.
 * To use a slash-bearing branch as ref of the repo root, write `gh:owner/repo#feature/x`.
 */
export const resolveSpecifier = (specifier: string): ResolvedSpecifier => {
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

/**
 * Sends a GET request to `url` that aborts after {@link FETCH_TIMEOUT_MS}, and
 * returns the response whatever its status. Rejects when no response arrives.
 */
export const registryFetch = async (url: string): Promise<Response> => {
  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return response;
};

/**
 * Requests `url` and returns the response when its status is 2xx. Throws a
 * {@link RegistryRequestError} for a network error (as its `cause`) or any
 * other status, after releasing the unread body.
 */
const requestOk = async (url: string): Promise<Response> => {
  let response: Response;
  try {
    response = await registryFetch(url);
  } catch (error) {
    throw new RegistryRequestError(url, null, { cause: error });
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new RegistryRequestError(url, response.status);
  }

  return response;
};

// =============================================================================
// Local registry detection
// =============================================================================

/**
 * Detect local `.eser/recipes.json` by walking up the directory tree.
 *
 * @param startDir - Where the walk starts; defaults to the working directory
 * @throws {RegistryLoadError} When a candidate path cannot be checked, for
 *   example because a parent directory is not readable.
 */
export const detectLocalRegistry = async (
  startDir?: string,
): Promise<string | undefined> => {
  let dir = startDir ?? crossRuntime.runtime.process.cwd();

  for (let i = 0; i < 10; i++) {
    const candidate = `${dir}/${RECIPES_FILENAME}`;
    let found: boolean;
    try {
      // The nearest ancestor wins, so each level is checked before its parent
      // and the walk stops at the first registry it finds.
      // deno-lint-ignore no-await-in-loop
      found = await crossRuntime.runtime.fs.exists(candidate);
    } catch (error) {
      throw new RegistryLoadError(candidate, "check whether the file exists", {
        cause: error,
      });
    }

    if (found) {
      return candidate;
    }

    const parent = dir.replace(/\/[^/]+$/, "");
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
};

// =============================================================================
// Registry fetcher (unified)
// =============================================================================

/** Options for {@link fetchRegistry} and {@link fetchRegistryFromRepo}. */
export interface FetchRegistryOptions {
  /** Print which registry is loaded, on stdout. */
  readonly verbose?: boolean;
  /**
   * When no source is given, use the nearest `.eser/recipes.json` in the
   * working directory or one of its parents, before the default registry.
   */
  readonly local?: boolean;
  /**
   * Where the `local` search starts, such as `kit add --cwd`; defaults to the
   * working directory.
   */
  readonly cwd?: string;
}

/**
 * Fetch and validate a registry manifest.
 *
 * Resolution chain:
 * 1. If `source` is provided (URL or path), use it directly
 * 2. If `options.local`, auto-detect local `.eser/recipes.json`
 * 3. Fall back to eser/stack's `.eser/recipes.json` on GitHub
 *
 * @throws {RegistryLoadError} When the manifest cannot be downloaded or read,
 *   is not JSON, or does not match registry/v1; the step's error is the
 *   `cause`.
 */
export const fetchRegistry = async (
  source?: string,
  options?: FetchRegistryOptions,
): Promise<registrySchema.RegistryManifest> => {
  let registrySource = source ?? DEFAULT_REGISTRY_URL;

  if (options?.local === true && source === undefined) {
    const localPath = await detectLocalRegistry(options.cwd);
    if (localPath !== undefined) {
      registrySource = localPath;
      if (options?.verbose === true) {
        console.log(`Using local registry: ${localPath}`);
      }
    }
  }

  const isRemote =
    registrySource.startsWith("http://") ||
    registrySource.startsWith("https://");

  if (options?.verbose === true) {
    console.log(`Fetching registry from: ${registrySource}`);
  }

  let rawJson: string;

  if (isRemote) {
    try {
      const response = await requestOk(registrySource);
      rawJson = await response.text();
    } catch (error) {
      throw new RegistryLoadError(registrySource, "download the manifest", {
        cause: error,
      });
    }
  } else {
    try {
      rawJson = await crossRuntime.runtime.fs.readTextFile(registrySource);
    } catch (error) {
      const step =
        error instanceof crossRuntime.NotFoundError
          ? "the file does not exist; pass --registry with the path or URL of a recipes.json"
          : "read the file";
      throw new RegistryLoadError(registrySource, step, { cause: error });
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    throw new RegistryLoadError(
      registrySource,
      "the manifest is not valid JSON",
      { cause: error },
    );
  }

  try {
    return registrySchema.validateRegistryManifest(data);
  } catch (error) {
    throw new RegistryLoadError(
      registrySource,
      "the manifest does not match the registry/v1 schema",
      { cause: error },
    );
  }
};

/**
 * Fetch a registry manifest from a specific GitHub repo's `.eser/recipes.json`.
 */
export const fetchRegistryFromRepo = async (
  owner: string,
  repo: string,
  ref: string,
  options?: FetchRegistryOptions,
): Promise<registrySchema.RegistryManifest> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${RECIPES_FILENAME}`;

  return await fetchRegistry(url, options);
};

// =============================================================================
// File fetcher
// =============================================================================

/**
 * Fetch one recipe file, `sourcePath` relative to the registry URL.
 *
 * @throws {RegistryRequestError} When the request gets no response or a
 *   status outside 200-299.
 */
export const fetchRecipeFile = async (
  registryUrl: string,
  sourcePath: string,
): Promise<string> => {
  const fileUrl = registrySchema.resolveRegistryUrl(registryUrl, sourcePath);
  const response = await requestOk(fileUrl);

  return await response.text();
};

// =============================================================================
// Folder fetcher
// =============================================================================

/** One file of a recipe folder, as {@link fetchRecipeFolder} returns it. */
export interface FetchedFile {
  /** The file's path relative to the folder. */
  readonly path: string;
  /** The file's text. */
  readonly content: string;
}

/**
 * Splits a `https://raw.githubusercontent.com/owner/repo/ref/path` URL into
 * its owner, repo, ref and the path after the ref (`basePath`, empty when
 * there is none). Returns undefined for any other URL.
 */
export const parseGitHubRawUrl = (
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
 * The base a recipe file's source resolves against: the registry URL, or,
 * for `provider: "github"`, the root of the repository the registry URL
 * names (a `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/...` URL or
 * a `gh:owner/repo#ref` specifier), so a registry kept in a subfolder can
 * point at files anywhere in its repository.
 *
 * @throws {RecipeLoadError} For a github-provider source when the registry
 *   URL names no GitHub repository
 */
export const sourceBaseFor = (
  file: registrySchema.RecipeFile,
  registryUrl: string,
): string => {
  if (file.provider !== "github") {
    return registryUrl;
  }

  const raw = parseGitHubRawUrl(registryUrl);
  if (raw !== undefined) {
    return `https://raw.githubusercontent.com/${raw.owner}/${raw.repo}/${raw.ref}`;
  }

  if (/^(gh:|github:)/.test(registryUrl)) {
    const spec = resolveSpecifier(registryUrl);
    if (spec.kind === "repo") {
      return `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${spec.ref}`;
    }
  }

  throw new RecipeLoadError(
    `${registryUrl}/${file.source}`,
    `provider "github" needs a registryUrl on GitHub (https://raw.githubusercontent.com/<owner>/<repo>/<ref> or gh:owner/repo), not ${registryUrl}`,
  );
};

/**
 * Fetch every file of a recipe folder through the GitHub contents API.
 * The registry URL must be a raw.githubusercontent.com URL.
 *
 * @throws {RecipeLoadError} When the registry is not on GitHub, the listing
 *   cannot be fetched or is not a folder, or a file cannot be downloaded;
 *   the step's error is the `cause`.
 */
export const fetchRecipeFolder = async (
  registryUrl: string,
  sourcePath: string,
): Promise<readonly FetchedFile[]> => {
  const parsed = parseGitHubRawUrl(registryUrl);

  if (parsed === undefined) {
    throw new RecipeLoadError(
      `${registryUrl}/${sourcePath}`,
      "folder recipes need a registryUrl on https://raw.githubusercontent.com/, so the folder can be listed through the GitHub API",
    );
  }

  const folderPath =
    parsed.basePath !== ""
      ? `${parsed.basePath}/${sourcePath}`.replace(/\/+/g, "/")
      : sourcePath;
  const location = `${parsed.owner}/${parsed.repo}@${parsed.ref}/${folderPath}`;

  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${folderPath}?ref=${parsed.ref}`;

  // Field names follow the GitHub contents API, which uses snake_case.
  type ContentsEntry = {
    readonly type: string;
    readonly path: string;
    readonly download_url: string | null;
  };

  let entries: unknown;
  try {
    const response = await requestOk(apiUrl);
    entries = await response.json();
  } catch (error) {
    throw new RecipeLoadError(location, "list the folder", { cause: error });
  }

  if (!Array.isArray(entries)) {
    throw new RecipeLoadError(
      location,
      'the path is a file, not a folder; use kind "file" for it in the registry',
    );
  }

  const fileEntries = (entries as readonly ContentsEntry[]).filter(
    (e) => e.type === "file",
  );

  const fetchPromises = fileEntries.map(async (entry): Promise<FetchedFile> => {
    if (entry.download_url === null) {
      throw new RecipeLoadError(
        location,
        `file ${entry.path} has no download URL in the GitHub listing; list it as its own file entry in the registry`,
      );
    }

    let content: string;
    try {
      const fileResponse = await requestOk(entry.download_url);
      content = await fileResponse.text();
    } catch (error) {
      throw new RecipeLoadError(location, `download ${entry.path}`, {
        cause: error,
      });
    }

    const relativePath = entry.path.startsWith(folderPath)
      ? entry.path.slice(folderPath.length).replace(/^\//, "")
      : entry.path;

    return { path: relativePath, content };
  });

  return await Promise.all(fetchPromises);
};

// =============================================================================
// Standalone recipe fetcher (for clone command)
// =============================================================================

/**
 * Thrown by `fetchRecipeFromRepo` when the recipe.json file itself is not
 * found (HTTP 404). Carries the failing `path` so callers can tell
 * "recipe.json absent" (kit clone falls back to whole-repo mode) from other
 * failures, which surface as {@link RecipeLoadError}.
 */
export class RecipeFileNotFoundError extends Error {
  /** The recipe file's path in the repository, subpath included. */
  public readonly path: string;
  /** The repository owner. */
  public readonly owner: string;
  /** The repository name. */
  public readonly repo: string;
  /** The git ref that was read. */
  public readonly ref: string;

  /**
   * Creates the error for a recipe file that the repository does not have.
   *
   * @param path - The recipe file's path in the repository
   * @param owner - The repository owner
   * @param repo - The repository name
   * @param ref - The git ref that was read
   * @param options - `cause`: the RegistryRequestError of the 404 response
   */
  constructor(
    path: string,
    owner: string,
    repo: string,
    ref: string,
    options?: ErrorOptions,
  ) {
    super(
      `load recipe ${owner}/${repo}@${ref}/${path}: no file at this path (HTTP 404)`,
      options,
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
 * the repo root. The RecipeFile.source paths of that recipe still resolve
 * against the repository root, not the subpath (clone-recipe.ts builds the
 * registry URL from owner, repo and ref only).
 *
 * @throws {RecipeFileNotFoundError} When recipe.json is absent (HTTP 404); the
 *   caller decides whether that means whole-repo mode.
 * @throws {RecipeLoadError} When the file cannot be downloaded for another
 *   reason, is not JSON, or is not a valid recipe; the step's error is the
 *   `cause`.
 */
export const fetchRecipeFromRepo = async (
  owner: string,
  repo: string,
  // fetchRecipeFromRepo is public API (./recipes/fetcher); putting the
  // defaults last would change its positional signature for every caller.
  // deno-lint-ignore default-param-last
  ref = "main",
  // deno-lint-ignore default-param-last
  recipePath = "recipe.json",
  subpath?: string,
): Promise<registrySchema.Recipe> => {
  const effectivePath =
    subpath !== undefined && subpath !== ""
      ? `${subpath}/${recipePath}`
      : recipePath;
  const location = `${owner}/${repo}@${ref}/${effectivePath}`;

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${effectivePath}`;

  let rawJson: string;
  try {
    const response = await requestOk(url);
    rawJson = await response.text();
  } catch (error) {
    if (error instanceof RegistryRequestError && error.status === 404) {
      // raw.githubusercontent.com answers 404 for a missing repository or ref
      // too, so this is a best guess: in practice the 404 is almost always the
      // recipe file being absent. clone-recipe.ts catches it and falls back to
      // whole-repo mode, whose tarball download reports a missing repository.
      throw new RecipeFileNotFoundError(effectivePath, owner, repo, ref, {
        cause: error,
      });
    }

    throw new RecipeLoadError(
      location,
      `download it; check that the repository exists: https://github.com/${owner}/${repo}`,
      { cause: error },
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    throw new RecipeLoadError(location, "the file is not valid JSON", {
      cause: error,
    });
  }

  try {
    return registrySchema.validateRecipe(data);
  } catch (error) {
    throw new RecipeLoadError(location, "the file is not a valid recipe", {
      cause: error,
    });
  }
};
