// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Built-in pack definitions — embedded as imports so they survive bundling.
 *
 * Pack manifests and concerns are imported as JSON. Rule content is embedded
 * as string constants since .md files cannot be imported with { type: "json" }.
 *
 * @module
 */

import type * as schema from "../../pack/schema.ts";
import type * as stateSchema from "../../state/schema.ts";

import typescriptManifest from "./typescript/pack.json" with { type: "json" };
import tsQuality from "./typescript/concerns/ts-quality.json" with {
  type: "json",
};

import reactManifest from "./react/pack.json" with { type: "json" };

import securityManifest from "./security/pack.json" with { type: "json" };
import securityAudit from "./security/concerns/security-audit.json" with {
  type: "json",
};

// =============================================================================
// Embedded rule content (source .md files live in the pack directories)
// =============================================================================

const TYPESCRIPT_RULES: Readonly<Record<string, string>> = {
  "use-strict-types":
    "Prefer explicit types over inference for function params and returns",
  "no-any": "Never use 'any'. Use 'unknown' when type is genuinely unknown.",
  "prefer-const": "Use const by default, let only when reassignment is needed",
};

const REACT_RULES: Readonly<Record<string, string>> = {
  "component-structure": "One component per file. Name file same as component.",
  "prefer-function-components":
    "Use function components with hooks. No class components.",
  "state-management": "Keep state as close to where it's used as possible.",
};

const SECURITY_RULES: Readonly<Record<string, string>> = {
  "no-secrets-in-code": "Never hardcode API keys, passwords, or tokens",
  "validate-input": "Validate and sanitize all user input at API boundaries",
  "no-eval":
    "Never use eval(), new Function(), or equivalent dynamic code execution",
};

// =============================================================================
// Built-in packs
// =============================================================================

const typescriptPack: schema.BuiltinPack = {
  manifest: typescriptManifest as unknown as schema.PackManifest,
  ruleContents: TYPESCRIPT_RULES,
  concernContents: [tsQuality as unknown as stateSchema.ConcernDefinition],
};

const reactPack: schema.BuiltinPack = {
  manifest: reactManifest as unknown as schema.PackManifest,
  ruleContents: REACT_RULES,
  concernContents: [],
};

const securityPack: schema.BuiltinPack = {
  manifest: securityManifest as unknown as schema.PackManifest,
  ruleContents: SECURITY_RULES,
  concernContents: [
    securityAudit as unknown as stateSchema.ConcernDefinition,
  ],
};

/** All built-in packs, keyed by name. */
export const BUILTIN_PACKS: ReadonlyMap<string, schema.BuiltinPack> = new Map([
  ["typescript", typescriptPack],
  ["react", reactPack],
  ["security", securityPack],
]);
