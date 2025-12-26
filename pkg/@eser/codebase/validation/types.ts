// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Types for the validation plugin system
 *
 * @module
 */

/** Supported stack identifiers */
export type StackId = "javascript" | "golang" | "css" | "rust" | "python";

/** Issue severity level */
export type IssueSeverity = "error" | "warning";

/**
 * A single validation issue
 */
export type ValidatorIssue = {
  /** Issue severity */
  readonly severity: IssueSeverity;
  /** Issue message */
  readonly message: string;
  /** File path (if applicable) */
  readonly file?: string;
  /** Line number (if applicable) */
  readonly line?: number;
};

/**
 * Options passed to a validator
 */
export type ValidatorOptions = {
  /** Root directory to validate */
  readonly root: string;
  /** Validator-specific options from .eser.yml */
  readonly options?: Record<string, unknown>;
};

/**
 * Result from running a validator
 */
export type ValidatorResult = {
  /** Validator name */
  readonly name: string;
  /** Whether validation passed */
  readonly passed: boolean;
  /** Issues found */
  readonly issues: readonly ValidatorIssue[];
  /** Statistics (e.g., filesChecked, packagesChecked) */
  readonly stats: Readonly<Record<string, number>>;
};

/**
 * Validator interface - all validators implement this
 */
export type Validator = {
  /** Unique validator name */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Required stacks (empty = runs for all stacks) */
  readonly requiredStacks: readonly StackId[];
  /** Run the validation */
  readonly validate: (options: ValidatorOptions) => Promise<ValidatorResult>;
};

/**
 * Validation configuration from .eser.yml
 */
export type ValidationConfig = {
  /** Validators to skip */
  readonly skip?: readonly string[];
  /** Validator-specific options */
  readonly options?: Readonly<Record<string, Record<string, unknown>>>;
};

/**
 * Project configuration from .eser.yml
 */
export type ProjectConfig = {
  /** Template name (for scaffolded projects) */
  readonly name?: string;
  /** Tech stacks used in this project */
  readonly stack?: readonly StackId[];
  /** Validation configuration */
  readonly validate?: ValidationConfig;
};

/**
 * Information about a skipped validator
 */
export type SkippedValidator = {
  /** Validator name */
  readonly name: string;
  /** Reason for skipping */
  readonly reason: string;
};

/**
 * Options for the validate function
 */
export type ValidateOptions = {
  /** Root directory to validate */
  readonly root?: string;
  /** Run only these validators */
  readonly only?: readonly string[];
  /** Skip these validators (in addition to .eser.yml skip) */
  readonly skip?: readonly string[];
  /** Enable auto-fix where supported */
  readonly fix?: boolean;
};

/**
 * Result of running all applicable validators
 */
export type ValidateResult = {
  /** Overall success (all validators passed) */
  readonly passed: boolean;
  /** Validators that were run */
  readonly results: readonly ValidatorResult[];
  /** Validators skipped due to stack mismatch */
  readonly skipped: readonly SkippedValidator[];
  /** Validators explicitly disabled via config or flags */
  readonly disabled: readonly string[];
};
