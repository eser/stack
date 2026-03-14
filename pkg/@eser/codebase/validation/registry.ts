// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validator registry with lazy initialization.
 *
 * Also provides `getWorkflowTools()` — an adapter that returns all
 * codebase tools in a shape structurally compatible with
 * `WorkflowTool` from `@eser/workflows` (duck-typed, no import needed).
 *
 * @module
 */

import type { Validator } from "./types.ts";
import type { FileTool, ToolOptions } from "../file-tool.ts";

// Hand-written validators
import * as circularDeps from "./validators/circular-deps.ts";
import * as modExports from "./validators/mod-exports.ts";
import * as exportNames from "./validators/export-names.ts";
import * as docs from "./validators/docs.ts";
import * as licenses from "./validators/licenses.ts";
import * as packageConfigs from "./validators/package-configs.ts";

// File tools (factory-generated — import tool objects for full adapter access)
import * as validateEof from "../validate-eof.ts";
import * as validateTrailingWhitespace from "../validate-trailing-whitespace.ts";
import * as validateBom from "../validate-bom.ts";
import * as validateLineEndings from "../validate-line-endings.ts";
import * as validateLargeFiles from "../validate-large-files.ts";
import * as validateCaseConflict from "../validate-case-conflict.ts";
import * as validateMergeConflict from "../validate-merge-conflict.ts";
import * as validateJson from "../validate-json.ts";
import * as validateToml from "../validate-toml.ts";
import * as validateYaml from "../validate-yaml.ts";
import * as validateSymlinks from "../validate-symlinks.ts";
import * as validateShebangs from "../validate-shebangs.ts";
import * as validateSecrets from "../validate-secrets.ts";
import * as validateFilenames from "../validate-filenames.ts";
import * as validateSubmodules from "../validate-submodules.ts";

// Standalone scripts (not file tools)
import * as validateCommitMsg from "../validate-commit-msg.ts";

// =============================================================================
// Registry state
// =============================================================================

type RegistryState = {
  validators: Map<string, Validator>;
  initialized: boolean;
};

const state: RegistryState = {
  validators: new Map(),
  initialized: false,
};

// =============================================================================
// Built-in registration
// =============================================================================

const initializeBuiltinValidators = (): void => {
  // Hand-written validators
  registerValidator(circularDeps.circularDepsValidator);
  registerValidator(modExports.modExportsValidator);
  registerValidator(exportNames.exportNamesValidator);
  registerValidator(docs.docsValidator);
  registerValidator(licenses.licensesValidator);
  registerValidator(packageConfigs.packageConfigsValidator);

  // File tool validators
  registerValidator(validateEof.validator);
  registerValidator(validateTrailingWhitespace.validator);
  registerValidator(validateBom.validator);
  registerValidator(validateLineEndings.validator);
  registerValidator(validateLargeFiles.validator);
  registerValidator(validateCaseConflict.validator);
  registerValidator(validateMergeConflict.validator);
  registerValidator(validateJson.validator);
  registerValidator(validateToml.validator);
  registerValidator(validateYaml.validator);
  registerValidator(validateSymlinks.validator);
  registerValidator(validateShebangs.validator);
  registerValidator(validateSecrets.validator);
  registerValidator(validateFilenames.validator);
  registerValidator(validateSubmodules.validator);
};

const ensureInitialized = (): void => {
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  initializeBuiltinValidators();
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Register a validator in the registry.
 */
export const registerValidator = (validator: Validator): void => {
  state.validators.set(validator.name, validator);
};

/**
 * Get a validator by name.
 */
export const getValidator = (name: string): Validator | null => {
  ensureInitialized();
  return state.validators.get(name) ?? null;
};

/**
 * Get all registered validators.
 */
export const getValidators = (): readonly Validator[] => {
  ensureInitialized();
  return [...state.validators.values()];
};

/**
 * Get all validator names.
 */
export const getValidatorNames = (): readonly string[] => {
  ensureInitialized();
  return [...state.validators.keys()];
};

// =============================================================================
// Workflow tool adapter
// =============================================================================

/**
 * A tool compatible with the `@eser/workflows` engine.
 * Structurally typed — no import from `@eser/workflows` required.
 */
export type WorkflowCompatibleTool = {
  readonly name: string;
  readonly description: string;
  readonly run: (
    options: Record<string, unknown>,
  ) => Promise<{
    readonly name: string;
    readonly passed: boolean;
    readonly issues: readonly {
      readonly path?: string;
      readonly line?: number;
      readonly message: string;
      readonly fixed?: boolean;
    }[];
    readonly mutations: readonly {
      readonly path: string;
      readonly oldContent: string;
      readonly newContent: string;
    }[];
    readonly stats: Record<string, number>;
  }>;
};

/**
 * Adapt a FileTool to a WorkflowCompatibleTool.
 * Uses `tool.run()` which preserves mutation data.
 */
const adaptFileTool = (fileTool: FileTool): WorkflowCompatibleTool => ({
  name: fileTool.config.name,
  description: fileTool.config.description,
  run: async (options) => {
    const result = await fileTool.run(options as Partial<ToolOptions>);

    return {
      name: result.name,
      passed: result.issues.length === 0,
      issues: result.issues.map((i) => ({
        path: i.path,
        line: i.line,
        message: i.message,
        fixed: i.fixed,
      })),
      mutations: result.mutations.map((m) => ({
        path: m.path,
        oldContent: m.oldContent,
        newContent: m.newContent,
      })),
      stats: {
        filesChecked: result.filesChecked,
        issuesFound: result.issues.length,
      },
    };
  },
});

/**
 * Adapt a Validator to a WorkflowCompatibleTool.
 * Validators don't produce mutations.
 */
const adaptValidator = (v: Validator): WorkflowCompatibleTool => ({
  name: v.name,
  description: v.description,
  run: async (options) => {
    const result = await v.validate({
      root: (options["root"] as string) ?? ".",
      options,
    });

    return {
      name: result.name,
      passed: result.passed,
      issues: result.issues.map((i) => ({
        path: i.file,
        line: i.line,
        message: i.message,
      })),
      mutations: [],
      stats: result.stats as Record<string, number>,
    };
  },
});

/**
 * Get all codebase tools adapted for the workflow engine.
 *
 * Returns duck-typed objects structurally compatible with
 * `WorkflowTool` from `@eser/workflows`.
 */
export const getWorkflowTools = (): readonly WorkflowCompatibleTool[] => {
  const tools: WorkflowCompatibleTool[] = [];

  // File tools (have full mutation support)
  const fileTools: FileTool[] = [
    validateEof.tool,
    validateTrailingWhitespace.tool,
    validateBom.tool,
    validateLineEndings.tool,
    validateLargeFiles.tool,
    validateCaseConflict.tool,
    validateMergeConflict.tool,
    validateJson.tool,
    validateToml.tool,
    validateYaml.tool,
    validateSymlinks.tool,
    validateShebangs.tool,
    validateSecrets.tool,
    validateFilenames.tool,
    validateSubmodules.tool,
  ];

  for (const ft of fileTools) {
    tools.push(adaptFileTool(ft));
  }

  // Hand-written validators (no mutations)
  const validators: Validator[] = [
    circularDeps.circularDepsValidator,
    modExports.modExportsValidator,
    exportNames.exportNamesValidator,
    docs.docsValidator,
    licenses.licensesValidator,
    packageConfigs.packageConfigsValidator,
  ];

  for (const v of validators) {
    tools.push(adaptValidator(v));
  }

  // validate-commit-msg (standalone script, needs special adapter)
  tools.push({
    name: "validate-commit-msg",
    description: "Validate conventional commit format",
    run: async (options) => {
      const commitMsgFile = (options["commitMsgFile"] as string | undefined) ??
        (options["_args"] as string[] | undefined)?.[0] ??
        ".git/COMMIT_EDITMSG";

      const { current } = await import("@eser/standards/runtime");
      let message: string;
      try {
        message = await current.fs.readTextFile(commitMsgFile);
      } catch {
        return {
          name: "validate-commit-msg",
          passed: false,
          issues: [{
            message: `cannot read commit message file: ${commitMsgFile}`,
          }],
          mutations: [],
          stats: {},
        };
      }

      const result = validateCommitMsg.validateCommitMsg(message);
      return {
        name: "validate-commit-msg",
        passed: result.valid,
        issues: result.issues.map((msg) => ({ message: msg })),
        mutations: [],
        stats: {},
      };
    },
  });

  return tools;
};
