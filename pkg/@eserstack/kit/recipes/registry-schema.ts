// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry schema types and validation for the eser recipe registry.
 *
 * This module defines the `eser-registry.json` manifest format and provides
 * type-guard validation. This is a RECIPE registry for distributing code
 * recipes — not to be confused with `@eserstack/standards/collections` which is a
 * generic immutable data structure.
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
type RecipeScale = "project" | "structure" | "utility";

/** Kind of file entry — single file or entire folder */
type RecipeFileKind = "file" | "folder";

/** Where to fetch the file from */
type RecipeFileProvider = "local" | "github";

/** A single file mapping in a recipe */
interface RecipeFile {
  readonly source: string;
  readonly target: string;
  readonly kind?: RecipeFileKind;
  readonly provider?: RecipeFileProvider;
}

/** Dependencies grouped by ecosystem */
interface RecipeDependencies {
  readonly go?: readonly string[];
  readonly jsr?: readonly string[];
  readonly npm?: readonly string[];
}

/** A template variable definition for substitution */
interface TemplateVariable {
  readonly name: string;
  readonly description?: string;
  readonly default?: string;
  readonly prompt?: string;
  /** Regex pattern applied during interactive validation */
  readonly pattern?: string;
  /** Whether the variable is required when no default is provided (default: true) */
  readonly required?: boolean;
}

/**
 * A single recipe definition.
 *
 * All fields are optional for standalone `recipe.json` usage (clone path).
 * Registry entries have stricter requirements enforced by `isRegistryRecipe`.
 */
interface Recipe {
  /** Accepted sentinel: "registry/v1". Used for the empty-fallback synthesis. */
  readonly schema?: string;
  readonly name?: string;
  readonly description?: string;
  readonly language?: string;
  readonly scale?: RecipeScale;
  readonly tags?: readonly string[];
  readonly requires?: readonly string[];
  readonly variables?: readonly TemplateVariable[];
  readonly postInstall?: readonly string[];
  /** File list for recipe mode. Absent → whole-repo mode. */
  readonly files?: readonly RecipeFile[];
  /** Glob patterns for whole-repo mode file exclusion. */
  readonly ignore?: readonly string[];
  readonly dependencies?: RecipeDependencies;
  readonly transforms?: readonly unknown[];
}

/** The root registry manifest */
interface RegistryManifest {
  readonly $schema?: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly registryUrl: string;
  readonly recipes: readonly Recipe[];
}

// =============================================================================
// Validation
// =============================================================================

const SUPPORTED_SCHEMA_VERSIONS = ["registry/v1"];

const VALID_FILE_KINDS: readonly string[] = ["file", "folder"];
const VALID_FILE_PROVIDERS: readonly string[] = ["local", "github"];

const isValidScale = (value: unknown): value is RecipeScale =>
  value === "project" || value === "structure" || value === "utility";

const isRecipeFile = (value: unknown): value is RecipeFile => {
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

const isTemplateVariable = (value: unknown): value is TemplateVariable => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"] === "") {
    return false;
  }
  if (obj["description"] !== undefined && typeof obj["description"] !== "string") {
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
const isRecipe = (value: unknown): value is Recipe => {
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
  if (obj["description"] !== undefined && typeof obj["description"] !== "string") {
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
const isRegistryRecipe = (value: unknown): value is Recipe => {
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
const validateRegistryManifest = (data: unknown): RegistryManifest => {
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
const validateRecipe = (data: unknown): Recipe => {
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
const resolveRegistryUrl = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/{1,20}$/, "");
  const normalizedPath = path.replace(/^\/{1,20}/, "");

  return `${normalizedBase}/${normalizedPath}`;
};

export {
  isRecipe,
  isRecipeFile,
  isRegistryRecipe,
  isTemplateVariable,
  resolveRegistryUrl,
  SUPPORTED_SCHEMA_VERSIONS,
  validateRecipe,
  validateRegistryManifest,
};

export type {
  Recipe,
  RecipeDependencies,
  RecipeFile,
  RecipeFileKind,
  RecipeFileProvider,
  RecipeScale,
  RegistryManifest,
  TemplateVariable,
};
