// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pack schema — types for pack manifests, registries, and installed packs.
 *
 * @module
 */

import type * as stateSchema from "../state/schema.ts";

// =============================================================================
// Pack Manifest (pack.json)
// =============================================================================

export type PackManifest = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author?: string;
  readonly tags?: readonly string[];
  readonly requires?: readonly string[];
  readonly rules?: readonly string[];
  readonly concerns?: readonly string[];
  readonly folderRules?: Readonly<Record<string, string>>;
};

// =============================================================================
// Pack Registry (remote registry.json)
// =============================================================================

export type PackRegistryEntry = {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly tags?: readonly string[];
  readonly source: "builtin" | "local" | "remote";
  readonly specifier?: string;
};

export type PackRegistry = {
  readonly packs: readonly PackRegistryEntry[];
};

// =============================================================================
// Installed Pack (tracked in .eser/packs.json)
// =============================================================================

export type InstalledPack = {
  readonly name: string;
  readonly version: string;
  readonly installedAt: string;
  readonly source: string;
  readonly rules: readonly string[];
  readonly concerns: readonly string[];
  readonly folderRules: readonly string[];
};

export type InstalledPacksFile = {
  readonly installed: readonly InstalledPack[];
};

// =============================================================================
// Built-in Pack (runtime representation with embedded content)
// =============================================================================

export type BuiltinPack = {
  readonly manifest: PackManifest;
  readonly ruleContents: Readonly<Record<string, string>>;
  readonly concernContents: readonly stateSchema.ConcernDefinition[];
  readonly folderRuleContents?: Readonly<Record<string, string>>;
};

// =============================================================================
// Validation
// =============================================================================

export const validatePackManifest = (data: unknown): PackManifest => {
  const obj = data as Record<string, unknown>;

  if (typeof obj?.["name"] !== "string" || obj["name"].length === 0) {
    throw new Error("Pack manifest must have a non-empty 'name' field");
  }

  if (typeof obj?.["version"] !== "string" || obj["version"].length === 0) {
    throw new Error("Pack manifest must have a non-empty 'version' field");
  }

  if (
    typeof obj?.["description"] !== "string" ||
    obj["description"].length === 0
  ) {
    throw new Error(
      "Pack manifest must have a non-empty 'description' field",
    );
  }

  return obj as unknown as PackManifest;
};

export const createEmptyPacksFile = (): InstalledPacksFile => ({
  installed: [],
});
