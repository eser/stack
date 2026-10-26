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

import * as primitives from "@eserstack/primitives";
import type * as functions from "@eserstack/functions";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import type {
  StackId,
  Validator,
  ValidatorResult,
} from "./validation/types.ts";
import * as fileToolsShared from "./file-tools-shared.ts";
import type {
  FileEntry,
  FileMutation,
  WalkOptions,
} from "./file-tools-shared.ts";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";

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
 * Merged from: defaults → .eser/manifest.yml → CLI flags.
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
  ) => Promise<shellArgs.CliResult<void>>;
};

// =============================================================================
// Factory
// =============================================================================

/**
 * Reads a CLI flag that may hold several values. `main` collects repeated
 * flags into an array; a `CliEvent` built by another caller may carry one
 * string.
 */
const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
};

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
      includeOnly:
        changedFiles !== undefined && changedFiles.length > 0
          ? changedFiles
          : undefined,
    };

    const files = await fileToolsShared.walkSourceFiles(walkOpts);
    const allIssues: ToolIssue[] = [];
    const allMutations: FileMutation[] = [];

    if (config.checkAll !== undefined) {
      // Batch mode
      const issues = await config.checkAll(files, options);
      allIssues.push(...issues);
    } else if (config.checkFile !== undefined) {
      // Per-file mode
      for (const file of files) {
        // Files load one at a time: reading thousands at once can exhaust the
        // open file handle limit.
        // oxlint-disable-next-line no-await-in-loop
        const content = await fileToolsShared.loadContent(file);
        const issues = config.checkFile(file, content, options);
        allIssues.push(...issues);
      }
    }

    // Run fixer if fix mode is enabled
    if (options.fix && config.canFix && config.fixFile !== undefined) {
      for (const file of files) {
        // One file at a time, for the same reason as the check loop.
        // oxlint-disable-next-line no-await-in-loop
        const content = await fileToolsShared.loadContent(file);
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
  ): Promise<shellArgs.CliResult<void>> => {
    const { ctx } = cliSupport.getCliContext();
    const fix = config.canFix && event.flags["fix"] === true;
    const root = (event.flags["root"] as string | undefined) ?? ".";
    const exclude = toStringList(event.flags["exclude"]);

    // An empty pattern matches every path, so the tool would check nothing
    // and pass.
    if (exclude.includes("")) {
      tui.log.error(
        ctx,
        `${config.name}: --exclude needs a pattern, for example --exclude docs/api/`,
      );
      return primitives.results.fail({ exitCode: 1 });
    }

    try {
      const result = await run({ root, fix, exclude });

      if (result.mutations.length > 0) {
        const written = await fileToolsShared.writeMutations(result.mutations);
        tui.log.success(ctx, `Fixed ${written} file(s) for ${config.name}.`);
      }

      if (result.issues.length === 0 && result.mutations.length === 0) {
        tui.log.success(
          ctx,
          `${config.name}: ${result.filesChecked} files checked, no issues.`,
        );
        return primitives.results.ok(undefined);
      }

      const unfixed = result.issues.filter((i) => !i.fixed);
      if (unfixed.length > 0) {
        for (const issue of unfixed) {
          const loc =
            issue.line !== undefined
              ? `${issue.path}:${issue.line}`
              : issue.path;
          tui.log.error(ctx, `${loc}: ${issue.message}`);
        }
        return primitives.results.fail({ exitCode: 1 });
      }

      return primitives.results.ok(undefined);
    } catch (error) {
      tui.log.error(
        ctx,
        error instanceof Error ? error.message : String(error),
      );
      return primitives.results.fail({ exitCode: 1 });
    }
  };

  // --- CLI main ---

  const main = async (
    cliArgs?: readonly string[],
  ): Promise<shellArgs.CliResult<void>> => {
    const event = cliSupport.parseCliEvent(config.name, cliArgs, {
      ...(config.canFix ? { fix: { type: "boolean" } } : {}),
      help: { type: "boolean", short: "h" },
      root: { type: "string" },
      // Each --exclude adds a pattern, the way the manifest lists several.
      exclude: { type: "string", multiple: true, default: [] },
    });

    if (event.flags["help"] === true) {
      const { output: out } = cliSupport.getCliContext();
      out.writeln(`eser codebase ${config.name} — ${config.description}\n`);
      out.writeln(`Usage: eser codebase ${config.name} [options]\n`);
      out.writeln("Options:");
      if (config.canFix) {
        out.writeln("  --fix          Auto-fix issues");
      }
      out.writeln("  --root <dir>   Root directory (default: .)");
      out.writeln(
        "  --exclude <p>  Skip paths matching the regular expression <p>;",
      );
      out.writeln("                 repeat the flag to add more patterns");
      out.writeln("  -h, --help     Show this help");
      await out.flush();
      return primitives.results.ok(undefined);
    }

    return await handleCli(event);
  };

  return { config, run, validator, main };
};

/**
 * Wraps a FileTool so its registry-facing `validator.validate` delegates to Go's
 * built-in file validators when the native FFI library is available.
 *
 * `run` and `main` are left unchanged so that `--fix` mode still works through
 * the TypeScript path (Go validators are check-only).
 *
 * @param tool - The original FileTool created by `createFileTool`
 * @param goValidatorName - The short name used by the Go bridge
 *   (`"eof"`, `"bom"`, `"trailing"`, `"line-endings"`, `"merge-conflicts"`, `"secrets"`)
 */
export const withGoValidator = (
  tool: FileTool,
  goValidatorName: string,
): FileTool => {
  // Pre-compute dot-prefixed extensions from the tool config (e.g. "ts" → ".ts").
  // Passed to Go so the walker only reads relevant files — saves I/O.
  const goExtensions =
    tool.config.extensions !== undefined
      ? [...tool.config.extensions.map((e) => `.${e}`)]
      : undefined;

  const goValidator: Validator = {
    ...tool.validator,
    validate: async (options): Promise<ValidatorResult> => {
      await ffiClient.ensureLib();
      const lib = ffiClient.getLib();
      if (lib === null) {
        throw new Error(
          `FFI library unavailable — cannot run validator "${goValidatorName}"`,
        );
      }
      // Excludes go on the request, where the Go walk applies them, so an
      // excluded file is never read on that side either. Regex excludes stay
      // TypeScript-only (the TS tool applies them after the walk); Go gets the
      // string patterns. Validator options are sent FLAT ({root, ...options}):
      // the Go factories read `exclude`, `rules` etc. from the top level of
      // their entry, and the nested `{root, options: {...}}` shape used before
      // left every one of them reading defaults.
      const configOptions = options.options ?? {};
      const rawExclude = configOptions["exclude"];
      const goExcludes = Array.isArray(rawExclude)
        ? rawExclude.filter((e): e is string => typeof e === "string")
        : [];

      const parsed = lib.call("codebaseValidateFiles", {
        dir: options.root,
        validators: [goValidatorName],
        extensions: goExtensions,
        exclude: goExcludes,
        validatorOptions: {
          [goValidatorName]: { root: options.root, ...configOptions },
        },
        gitAware: true,
      }) as {
        results?: ValidatorResult[];
        error?: string;
      };
      if (parsed.error) {
        throw new Error(
          `Go validator "${goValidatorName}" error: ${parsed.error}`,
        );
      }
      if (!parsed.results?.length) {
        throw new Error(
          `Go validator "${goValidatorName}" returned no results`,
        );
      }
      // Go marshals `issues` with omitempty, so a clean run has no field at
      // all; every consumer maps over it.
      const first = parsed.results[0]!;

      return {
        ...first,
        issues: first.issues ?? [],
        name: tool.validator.name,
      } as ValidatorResult;
    },
  };

  return { ...tool, validator: goValidator };
};

// Re-export types for tool implementations
export type {
  FileEntry,
  FileMutation,
  WalkOptions,
} from "./file-tools-shared.ts";
export { loadBytes, loadContent } from "./file-tools-shared.ts";
