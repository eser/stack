// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Core types for the workflow engine.
 *
 * @module
 */

// =============================================================================
// Config types
// =============================================================================

/** A step in a workflow — either a tool name string or a name→options record. */
export type WorkflowStepConfig =
  | string
  | Record<string, Record<string, unknown>>;

/**
 * A parsed step with resolved name, tool options, and engine directives.
 *
 * Engine directives (`continueOnError`, `timeout`) are extracted from the
 * step config and removed from `options` before passing to the tool.
 */
export type ResolvedStep = {
  readonly name: string;
  readonly options: Record<string, unknown>;
  /** If true, tool errors are caught and reported as a failed step instead of crashing the workflow. Default: false. */
  readonly continueOnError: boolean;
  /** Per-step timeout in milliseconds. Overrides RunOptions.defaultTimeout. */
  readonly timeout?: number;
};

/** A workflow definition with an id, triggering events, and ordered steps. */
export type WorkflowDefinition = {
  readonly id: string;
  readonly on: readonly string[];
  readonly steps: readonly WorkflowStepConfig[];
  /** Workflow ids to include (their steps are prepended before this workflow's steps). */
  readonly includes?: readonly string[];
};

/** Top-level configuration (can be loaded from .manifest.yml or built programmatically). */
export type WorkflowsConfig = {
  readonly stack?: readonly string[];
  readonly workflows: readonly WorkflowDefinition[];
};

// =============================================================================
// Tool types
// =============================================================================

/** A single issue found by a workflow tool. */
export type WorkflowIssue = {
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
  readonly fixed?: boolean;
};

/** A file mutation produced by a fixer tool. */
export type WorkflowFileMutation = {
  readonly path: string;
  readonly oldContent: string;
  readonly newContent: string;
};

/** A tool that can be registered and run within a workflow. */
export type WorkflowTool = {
  readonly name: string;
  readonly description: string;
  readonly run: (
    options: Record<string, unknown>,
  ) => Promise<WorkflowToolResult>;
};

/** Result from running a single workflow tool. */
export type WorkflowToolResult = {
  readonly name: string;
  readonly passed: boolean;
  readonly issues: readonly WorkflowIssue[];
  readonly mutations: readonly WorkflowFileMutation[];
  readonly stats: Record<string, number>;
};

// =============================================================================
// Execution types
// =============================================================================

/** Result from a single step execution (includes timing). */
export type StepResult = WorkflowToolResult & {
  readonly durationMs: number;
};

/** Aggregate result from running a full workflow. */
export type WorkflowResult = {
  readonly workflowId: string;
  readonly passed: boolean;
  readonly steps: readonly StepResult[];
  readonly totalDurationMs: number;
};

/** Options for running a workflow. */
export type RunOptions = {
  readonly root?: string;
  readonly fix?: boolean;
  readonly dryRun?: boolean;
  readonly only?: string;
  /** Default timeout for all steps in milliseconds. Default: 60000 (60s). */
  readonly defaultTimeout?: number;
  /** Positional args passed through to tools (e.g., commit message file path). */
  readonly args?: readonly string[];
  /** Changed file paths for incremental mode (only run tools on these files). */
  readonly changedFiles?: readonly string[];
  /** Called when a step starts. */
  readonly onStepStart?: (name: string) => void;
  /** Called when a step finishes. */
  readonly onStepEnd?: (result: StepResult) => void;
  /** Called when a step produces mutations — allows the caller to write them to disk between steps. */
  readonly onMutations?: (
    mutations: readonly WorkflowFileMutation[],
  ) => Promise<void>;
};
