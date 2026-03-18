// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * File tool factory — creates codebase check/fix tools from declarative configs.
 *
 * Each tool is a pure function that receives file data and returns issues or mutations.
 * The factory generates: validator adapter, CLI handler, and library function.
 *
 * Supports two modes:
 * - Per-file (`checkFile`): factory auto-iterates over files
 * - Batch (`checkAll`): tool receives full file list
 *
 * Fixers return Edit-tool-shaped mutations `{path, oldContent, newContent}` —
 * the runner decides whether to apply, preview, or pass to an AI agent.
 *
 * ```
 * Pure logic (Handler)     Runner (Adapter)          Output (ResponseMapper)
 * ─────────────────────    ──────────────────        ─────────────────────────
 * checkFile() → issues[]   CLI runner                Terminal colors + exit code
 * fixFile() → mutation     MCP server (IDE tool)     JSON tool results
 *                          AI agent (SDK tool)       Structured for LLM
 * ```
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eser/primitives";
import * as functions from "@eser/functions";
import * as shell from "@eser/shell";
import type {
  StackId,
  Validator,
  ValidatorResult,
} from "./validation/types.ts";
import {
  type FileEntry,
  type FileMutation,
  loadContent,
  type WalkOptions,
  walkSourceFiles,
} from "./file-tools-shared.ts";
import { toCliEvent } from "./cli-support.ts";

const output = shell.formatting.createOutput();

// =============================================================================
// Types
// =============================================================================

/**
 * A single issue found by a tool.
 */
export type ToolIssue = {
  /** File path */
  readonly path: string;
  /** Line number (if applicable) */
  readonly line?: number;
  /** Issue description */
  readonly message: string;
  /** Whether this was auto-fixed */
  readonly fixed?: boolean;
};

/**
 * Result of running a file tool.
 */
export type ToolResult = {
  /** Tool name */
  readonly name: string;
  /** Issues found */
  readonly issues: readonly ToolIssue[];
  /** Mutations to apply (fixers only) */
  readonly mutations: readonly FileMutation[];
  /** Number of files checked */
  readonly filesChecked: number;
};

/**
 * Options passed to tool check/fix functions.
 * Merged from: defaults → .manifest.yml → CLI flags.
 */
export type ToolOptions = {
  readonly root: string;
  readonly fix: boolean;
  readonly exclude: readonly (string | RegExp)[];
  readonly [key: string]: unknown;
};

/**
 * Declarative configuration for creating a file tool.
 */
export type FileToolConfig = {
  /** Unique tool name (used as CLI command and validator name) */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Whether this tool can fix issues */
  readonly canFix: boolean;
  /** Required stacks (empty = all) */
  readonly stacks: readonly StackId[];
  /** Default option values */
  readonly defaults: Record<string, unknown>;
  /** File extensions to scan (empty = all) */
  readonly extensions?: readonly string[];

  /** Per-file check — factory auto-iterates */
  readonly checkFile?: (
    file: FileEntry,
    content: string | undefined,
    options: ToolOptions,
  ) => ToolIssue[];

  /** Batch check — receives all files */
  readonly checkAll?: (
    files: readonly FileEntry[],
    options: ToolOptions,
  ) => ToolIssue[] | Promise<ToolIssue[]>;

  /** Per-file fix — returns a mutation or undefined */
  readonly fixFile?: (
    file: FileEntry,
    content: string,
    options: ToolOptions,
  ) => FileMutation | undefined;
};

/**
 * A created file tool with all adapters.
 */
export type FileTool = {
  /** Tool configuration */
  readonly config: FileToolConfig;
  /** Run the tool programmatically */
  readonly run: (options?: Partial<ToolOptions>) => Promise<ToolResult>;
  /** Validator adapter for the validation system */
  readonly validator: Validator;
  /** CLI entry point */
  readonly main: (
    cliArgs?: readonly string[],
  ) => Promise<shell.args.CliResult<void>>;
};

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a file tool from a declarative config.
 *
 * @param config - Tool configuration
 * @returns A complete file tool with run(), validator, and main()
 */
export const createFileTool = (config: FileToolConfig): FileTool => {
  // --- Core run function ---

  const run = async (
    partialOptions?: Partial<ToolOptions>,
  ): Promise<ToolResult> => {
    const options: ToolOptions = {
      root: partialOptions?.root ?? ".",
      fix: partialOptions?.fix ?? false,
      exclude: partialOptions?.exclude ?? [],
      ...config.defaults,
      ...partialOptions,
    };

    const changedFiles = partialOptions?.["_changedFiles"] as
      | string[]
      | undefined;

    const walkOpts: WalkOptions = {
      root: options.root,
      extensions: config.extensions,
      exclude: options.exclude,
      includeOnly: changedFiles !== undefined && changedFiles.length > 0
        ? changedFiles
        : undefined,
    };

    const files = await walkSourceFiles(walkOpts);
    const allIssues: ToolIssue[] = [];
    const allMutations: FileMutation[] = [];

    if (config.checkAll !== undefined) {
      // Batch mode
      const issues = await config.checkAll(files, options);
      allIssues.push(...issues);
    } else if (config.checkFile !== undefined) {
      // Per-file mode
      for (const file of files) {
        const content = await loadContent(file);
        const issues = config.checkFile(file, content, options);
        allIssues.push(...issues);
      }
    }

    // Run fixer if fix mode is enabled
    if (options.fix && config.canFix && config.fixFile !== undefined) {
      for (const file of files) {
        const content = await loadContent(file);
        if (content === undefined) {
          continue;
        }

        const mutation = config.fixFile(file, content, options);
        if (mutation !== undefined) {
          allMutations.push(mutation);
        }
      }
    }

    return {
      name: config.name,
      issues: allIssues,
      mutations: allMutations,
      filesChecked: files.length,
    };
  };

  // --- Validator adapter ---

  const validator: Validator = {
    name: config.name,
    description: config.description,
    requiredStacks: config.stacks,

    async validate(validatorOptions): Promise<ValidatorResult> {
      const fix = validatorOptions.options?.["fix"] as boolean | undefined;
      const configOptions = validatorOptions.options ?? {};
      const result = await run({
        root: validatorOptions.root,
        fix: fix ?? false,
        exclude: [],
        ...configOptions,
      });

      return {
        name: config.name,
        passed: result.issues.length === 0,
        issues: result.issues.map((issue) => ({
          severity: "error" as const,
          message: `${issue.message}${issue.fixed ? " (fixed)" : ""}`,
          file: issue.path,
          line: issue.line,
        })),
        stats: {
          filesChecked: result.filesChecked,
          issuesFound: result.issues.length,
          fixedCount: result.mutations.length,
        },
      };
    },
  };

  // --- CLI adapter ---

  const handleCli = async (
    event: functions.triggers.CliEvent,
  ): Promise<shell.args.CliResult<void>> => {
    const fix = config.canFix && event.flags["fix"] === true;
    const root = (event.flags["root"] as string | undefined) ?? ".";
    const excludeFlag = event.flags["exclude"];
    const exclude = excludeFlag !== undefined
      ? (Array.isArray(excludeFlag)
        ? excludeFlag as string[]
        : [excludeFlag as string])
      : [];

    try {
      const result = await run({ root, fix, exclude });

      if (result.mutations.length > 0) {
        // Import writeMutations lazily to avoid circular deps
        const { writeMutations } = await import("./file-tools-shared.ts");
        const written = await writeMutations(result.mutations);
        output.printSuccess(
          `Fixed ${written} file(s) for ${config.name}.`,
        );
      }

      if (result.issues.length === 0 && result.mutations.length === 0) {
        output.printSuccess(
          `${config.name}: ${result.filesChecked} files checked, no issues.`,
        );
        return primitives.results.ok(undefined);
      }

      const unfixed = result.issues.filter((i) => !i.fixed);
      if (unfixed.length > 0) {
        for (const issue of unfixed) {
          const loc = issue.line !== undefined
            ? `${issue.path}:${issue.line}`
            : issue.path;
          output.printError(`${loc}: ${issue.message}`);
        }
        return primitives.results.fail({ exitCode: 1 });
      }

      return primitives.results.ok(undefined);
    } catch (error) {
      output.printError(
        error instanceof Error ? error.message : String(error),
      );
      return primitives.results.fail({ exitCode: 1 });
    }
  };

  // --- CLI main ---

  const main = async (
    cliArgs?: readonly string[],
  ): Promise<shell.args.CliResult<void>> => {
    const flags = config.canFix ? ["fix"] : [];
    const parsed = cliParseArgs.parseArgs(
      (cliArgs ?? []) as string[],
      {
        boolean: [...flags, "help"],
        string: ["root", "exclude"],
        alias: { h: "help" },
      },
    );

    if (parsed["help"]) {
      console.log(`eser codebase ${config.name} — ${config.description}\n`);
      console.log(`Usage: eser codebase ${config.name} [options]\n`);
      console.log("Options:");
      if (config.canFix) {
        console.log("  --fix          Auto-fix issues");
      }
      console.log("  --root <dir>   Root directory (default: .)");
      console.log("  --exclude <p>  Exclude pattern");
      console.log("  -h, --help     Show this help");
      return primitives.results.ok(undefined);
    }

    const event = toCliEvent(config.name, parsed);
    return await handleCli(event);
  };

  return { config, run, validator, main };
};

// Re-export types for tool implementations
export type {
  FileEntry,
  FileMutation,
  WalkOptions,
} from "./file-tools-shared.ts";
export { loadBytes, loadContent } from "./file-tools-shared.ts";
