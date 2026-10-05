// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry schema types and validation for the eser recipe registry.
 *
 * This module defines the registry manifest format (`.eser/recipes.json`,
 * schema registry/v1) and the type guards that validate it. It is a registry
 * for distributing code recipes, not to be confused with
 * `@eserstack/standards/collections`, which is a generic immutable data
 * structure.
 *
 * A recipe can also live standalone as `recipe.json` in any GitHub repo,
 * used via `eser kit clone <specifier>`.
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

/** Scale taxonomy for recipes */
export type RecipeScale = "project" | "structure" | "utility";

/** Kind of file entry — single file or entire folder */
export type RecipeFileKind = "file" | "folder";

/** Where to fetch the file from */
export type RecipeFileProvider = "local" | "github";

/** A single file mapping in a recipe */
export interface RecipeFile {
  /**
   * Path of the file or folder to copy, relative to the registry's
   * `registryUrl`, or to the repository (or subpath) root in a standalone
   * `recipe.json`.
   */
  readonly source: string;
  /**
   * Where the file or folder goes, relative to the project directory. A
   * target that leads outside the project directory stops the recipe.
   */
  readonly target: string;
  /**
   * `"file"` (the default) copies one file; `"folder"` copies every file in a
   * folder. The TypeScript applier lists a folder through the GitHub contents
   * API, so its registry has to be on raw.githubusercontent.com.
   */
  readonly kind?: RecipeFileKind;
  /**
   * Where `source` lives: `"local"` (the default) next to the registry
   * manifest, or `"github"` at the root of the repository that a
   * `gh:owner/repo` registry URL names. Only the Go implementation reads it;
   * the TypeScript applier resolves every source against `registryUrl`.
   */
  readonly provider?: RecipeFileProvider;
}

/** Dependencies grouped by ecosystem */
export interface RecipeDependencies {
  /** Go module paths, installed with `go get`. */
  readonly go?: readonly string[];
  /** JSR specifiers such as `jsr:@eserstack/fp@^4.1.0`, installed with `deno add`. */
  readonly jsr?: readonly string[];
  /** npm package names, installed with `npm install`. */
  readonly npm?: readonly string[];
}

/** A template variable definition for substitution */
export interface TemplateVariable {
  /** The name a template refers to as `{{.name}}`. */
  readonly name: string;
  /** Shown as the question when kit prompts for the value; the name is shown when it is absent. */
  readonly description?: string;
  /** The value used when the caller gives none. */
  readonly default?: string;
  /** Prompt text for the variable. Kit does not show it yet; it asks with `description`. */
  readonly prompt?: string;
  /** Regex pattern applied during interactive validation */
  readonly pattern?: string;
  /**
   * Whether a variable without a default must get a value (default: true).
   * Kit does not read it yet, so every variable without a default needs one.
   */
  readonly required?: boolean;
}

/**
 * A single recipe definition.
 *
 * All fields are optional for standalone `recipe.json` usage (clone path).
 * Registry entries have stricter requirements enforced by `isRegistryRecipe`.
 */
export interface Recipe {
  /** Accepted sentinel: "registry/v1". Used for the empty-fallback synthesis. */
  readonly schema?: string;
  /**
   * The name that `eser kit add`, `new` and `update` look the recipe up by;
   * unique within a registry. Required for registry entries.
   */
  readonly name?: string;
  /** One-line summary that `eser kit list` shows. Required for registry entries. */
  readonly description?: string;
  /**
   * Primary language, such as `"typescript"` or `"go"`. `eser kit add` warns
   * when it does not match the project. Required for registry entries.
   */
  readonly language?: string;
  /**
   * How much the recipe creates; `eser kit new` offers the `"project"`
   * recipes. Required for registry entries.
   */
  readonly scale?: RecipeScale;
  /** Labels that `eser kit list --tag` filters on. */
  readonly tags?: readonly string[];
  /** Names of recipes in the same registry to apply before this one. */
  readonly requires?: readonly string[];
  /** Variables that the recipe's files refer to as `{{.name}}`. */
  readonly variables?: readonly TemplateVariable[];
  /**
   * Commands to run in the project directory once the files are written, in
   * order. The first one that fails stops the rest.
   */
  readonly postInstall?: readonly string[];
  /** File list for recipe mode. Absent → whole-repo mode. */
  readonly files?: readonly RecipeFile[];
  /** Glob patterns for whole-repo mode file exclusion. */
  readonly ignore?: readonly string[];
  /** Packages the recipe's files import; kit prints or runs their install commands. */
  readonly dependencies?: RecipeDependencies;
  /** Reserved for file transforms; kit does not read it yet. */
  readonly transforms?: readonly unknown[];
}

/** The root registry manifest */
export interface RegistryManifest {
  /**
   * The schema the manifest follows, such as
   * `https://eser.live/registry/v1.json`. One that does not contain
   * `registry/v1` loads with a warning.
   */
  readonly $schema?: string;
  /** The registry's name, shown as the heading of `eser kit list`. */
  readonly name: string;
  /** One-line summary of the registry, shown next to its name. */
  readonly description: string;
  /** Who maintains the registry. */
  readonly author: string;
  /**
   * Base URL that recipe sources resolve against, such as
   * `https://raw.githubusercontent.com/eser/stack/main/.eser`.
   */
  readonly registryUrl: string;
  /** The recipes the registry offers. */
  readonly recipes: readonly Recipe[];
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Schema ids this version of kit reads. A manifest whose `$schema` contains
 * none of them still loads, with a warning on stderr.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ["registry/v1"];

const VALID_FILE_KINDS: readonly string[] = ["file", "folder"];
const VALID_FILE_PROVIDERS: readonly string[] = ["local", "github"];

const isValidScale = (value: unknown): value is RecipeScale =>
  value === "project" || value === "structure" || value === "utility";

/**
 * Type guard for a {@link RecipeFile}: `source` and `target` are strings, and
 * `kind` and `provider` are absent or one of their allowed values.
 */
export const isRecipeFile = (value: unknown): value is RecipeFile => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["source"] !== "string" || typeof obj["target"] !== "string") {
    return false;
  }

  if (
    obj["kind"] !== undefined &&
    !VALID_FILE_KINDS.includes(obj["kind"] as string)
  ) {
    return false;
  }

  if (
    obj["provider"] !== undefined &&
    !VALID_FILE_PROVIDERS.includes(obj["provider"] as string)
  ) {
    return false;
  }

  return true;
};

const isRecipeDependencies = (
  value: unknown,
): value is RecipeDependencies => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj["go"] !== undefined && !Array.isArray(obj["go"])) {
    return false;
  }
  if (obj["jsr"] !== undefined && !Array.isArray(obj["jsr"])) {
    return false;
  }
  if (obj["npm"] !== undefined && !Array.isArray(obj["npm"])) {
    return false;
  }

  return true;
};

/**
 * Type guard for a {@link TemplateVariable}: `name` is a non-empty string, and
 * each optional field is absent or has its declared type.
 */
export const isTemplateVariable = (
  value: unknown,
): value is TemplateVariable => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"] === "") {
    return false;
  }
  if (
    obj["description"] !== undefined && typeof obj["description"] !== "string"
  ) {
    return false;
  }
  if (obj["default"] !== undefined && typeof obj["default"] !== "string") {
    return false;
  }
  if (obj["prompt"] !== undefined && typeof obj["prompt"] !== "string") {
    return false;
  }
  if (obj["pattern"] !== undefined && typeof obj["pattern"] !== "string") {
    return false;
  }
  if (obj["required"] !== undefined && typeof obj["required"] !== "boolean") {
    return false;
  }

  return true;
};

/**
 * Lenient type guard for a standalone `recipe.json` (clone path).
 * All fields are optional — an empty object `{}` is a valid recipe that
 * triggers whole-repo mode with no variables and no post-install.
 *
 * For registry-listed recipes that require name/description/language/scale/files,
 * use `isRegistryRecipe` instead.
 */
export const isRecipe = (value: unknown): value is Recipe => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // schema — if present, must be a string
  if (obj["schema"] !== undefined && typeof obj["schema"] !== "string") {
    return false;
  }
  // name — if present, must be a non-empty string
  if (
    obj["name"] !== undefined &&
    (typeof obj["name"] !== "string" || obj["name"] === "")
  ) {
    return false;
  }
  // description — if present, must be a string
  if (
    obj["description"] !== undefined && typeof obj["description"] !== "string"
  ) {
    return false;
  }
  // language — if present, must be a string
  if (obj["language"] !== undefined && typeof obj["language"] !== "string") {
    return false;
  }
  // scale — if present, must be a valid scale value
  if (obj["scale"] !== undefined && !isValidScale(obj["scale"])) {
    return false;
  }

  // files — if present, must be a non-empty array of valid RecipeFile entries
  if (obj["files"] !== undefined) {
    if (!Array.isArray(obj["files"])) {
      return false;
    }
    for (const file of obj["files"]) {
      if (!isRecipeFile(file)) {
        return false;
      }
    }
  }

  // ignore — if present, must be an array of strings
  if (obj["ignore"] !== undefined) {
    if (!Array.isArray(obj["ignore"])) {
      return false;
    }
    for (const pattern of obj["ignore"]) {
      if (typeof pattern !== "string") {
        return false;
      }
    }
  }

  if (
    obj["dependencies"] !== undefined &&
    !isRecipeDependencies(obj["dependencies"])
  ) {
    return false;
  }

  if (obj["tags"] !== undefined && !Array.isArray(obj["tags"])) {
    return false;
  }

  if (obj["requires"] !== undefined) {
    if (!Array.isArray(obj["requires"])) {
      return false;
    }
    for (const req of obj["requires"]) {
      if (typeof req !== "string") {
        return false;
      }
    }
  }

  if (obj["variables"] !== undefined) {
    if (!Array.isArray(obj["variables"])) {
      return false;
    }
    for (const v of obj["variables"]) {
      if (!isTemplateVariable(v)) {
        return false;
      }
    }
  }

  if (obj["postInstall"] !== undefined) {
    if (!Array.isArray(obj["postInstall"])) {
      return false;
    }
    for (const cmd of obj["postInstall"]) {
      if (typeof cmd !== "string" && !Array.isArray(cmd)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Strict type guard for recipes listed in a registry manifest.
 * Retains the original required-field contract:
 * name, description, language, scale, and files are all required.
 */
export const isRegistryRecipe = (value: unknown): value is Recipe => {
  if (!isRecipe(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"] === "") {
    return false;
  }
  if (typeof obj["description"] !== "string") {
    return false;
  }
  if (typeof obj["language"] !== "string") {
    return false;
  }
  if (!isValidScale(obj["scale"])) {
    return false;
  }
  if (!Array.isArray(obj["files"]) || obj["files"].length === 0) {
    return false;
  }

  return true;
};

/**
 * Validate and parse a registry manifest from unknown data.
 * Throws a descriptive error if validation fails.
 */
export const validateRegistryManifest = (data: unknown): RegistryManifest => {
  if (typeof data !== "object" || data === null) {
    throw new Error("Registry manifest must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  // Check $schema version if present
  if (obj["$schema"] !== undefined) {
    const schema = String(obj["$schema"]);
    const hasSupported = SUPPORTED_SCHEMA_VERSIONS.some((v) =>
      schema.includes(v)
    );

    if (!hasSupported) {
      // An unknown schema version still loads; the warning tells the person
      // running kit that this CLI only knows v1.
      // deno-lint-ignore no-console
      console.warn(
        `Warning: Registry uses unknown schema "${schema}". This CLI supports v1.`,
      );
    }
  }

  if (typeof obj["name"] !== "string" || obj["name"] === "") {
    throw new Error("Registry manifest requires a non-empty 'name' field");
  }
  if (typeof obj["description"] !== "string") {
    throw new Error("Registry manifest requires a 'description' field");
  }
  if (typeof obj["author"] !== "string") {
    throw new Error("Registry manifest requires an 'author' field");
  }
  if (typeof obj["registryUrl"] !== "string" || obj["registryUrl"] === "") {
    throw new Error(
      "Registry manifest requires a non-empty 'registryUrl' field",
    );
  }
  if (!Array.isArray(obj["recipes"])) {
    throw new Error("Registry manifest requires a 'recipes' array");
  }

  // Validate each recipe (strict — registry entries require all five fields)
  for (const recipe of obj["recipes"]) {
    if (!isRegistryRecipe(recipe)) {
      const name = typeof recipe === "object" && recipe !== null
        ? (recipe as Record<string, unknown>)["name"] ?? "<unknown>"
        : "<invalid>";
      throw new Error(`Invalid recipe definition: '${name}'`);
    }
  }

  const recipes = obj["recipes"] as Recipe[];

  // Validate recipe name uniqueness (names are guaranteed non-empty by isRegistryRecipe)
  const names = new Set<string>();
  for (const recipe of recipes) {
    const recipeName = recipe.name!;
    if (names.has(recipeName)) {
      throw new Error(`Duplicate recipe name '${recipeName}' in registry`);
    }
    names.add(recipeName);
  }

  return data as RegistryManifest;
};

/**
 * Validate a standalone recipe (e.g., from a recipe.json in a GitHub repo).
 * Same validation as registry recipes but for a single recipe object.
 */
export const validateRecipe = (data: unknown): Recipe => {
  if (!isRecipe(data)) {
    throw new Error("Invalid recipe definition");
  }

  return data as Recipe;
};

// =============================================================================
// Utilities
// =============================================================================

/**
 * Resolve a registry URL by joining a base URL with a relative path.
 * Normalizes trailing/leading slashes to prevent double-slash or missing-slash.
 */
export const resolveRegistryUrl = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/{1,20}$/, "");
  const normalizedPath = path.replace(/^\/{1,20}/, "");

  return `${normalizedBase}/${normalizedPath}`;
};
