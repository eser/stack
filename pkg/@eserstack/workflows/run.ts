// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI command handler for `eser workflows run`.
 *
 * This module is the glue between the engine and the terminal.
 * It accepts tools injected by the CLI dispatcher (to avoid coupling
 * this package to any specific tool provider like `@eserstack/codebase`).
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as shellExec from "@eserstack/shell/exec";
import type * as shellArgs from "@eserstack/shell/args";
import type {
  RunOptions,
  StepResult,
  WorkflowFileMutation,
  WorkflowIssue,
  WorkflowResult,
  WorkflowTool,
} from "./types.ts";
import * as registry from "./registry.ts";
import * as engine from "./engine.ts";
import * as loader from "./loader.ts";
import * as shellTool from "./shell-tool.ts";

// =============================================================================
// Output formatting
// =============================================================================

const COLUMN_WIDTH = 50;

// Lines are written synchronously so each step line appears when its step
// ends. The synchronous FFI validators hold the event loop for most of a run,
// and a streams.output sink writes only when the event loop runs, so its lines
// would arrive late, in one batch, after the FFI calls return.
type LineWriter = {
  readonly writeln: (...args: span.SpanInput[]) => void;
};

const createLineWriter = (): LineWriter => {
  const renderer = streams.renderers.ansi();
  const encoder = new TextEncoder();

  return {
    writeln: (...args) => {
      const rendered = renderer.render(span.normalize(args));
      runtime.process.writeToStdout(encoder.encode(`${rendered}\n`));
    },
  };
};

// `git diff --name-only` returns in well under a second; the bound keeps a hung
// git (a held index lock, a credential prompt) from stalling the whole run.
const GIT_DIFF_TIMEOUT_MS = 30_000;

const formatStepLine = (
  name: string,
  result: StepResult,
  verbose: boolean,
): span.Span[] => {
  const dots = ".".repeat(Math.max(1, COLUMN_WIDTH - name.length));
  const timing = `${(result.durationMs / 1000).toFixed(1)}s`;

  let status: span.Span;
  if (result.passed && result.mutations.length > 0) {
    status = span.yellow(
      `Fixed (${result.mutations.length} file${
        result.mutations.length === 1 ? "" : "s"
      }, ${timing})`,
    );
  } else if (result.passed) {
    if (verbose && Object.keys(result.stats).length > 0) {
      const statsStr = Object.entries(result.stats)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      status = span.green(`Passed (${statsStr}, ${timing})`);
    } else {
      status = span.green(`Passed (${timing})`);
    }
  } else {
    status = span.red(`Failed (${timing})`);
  }

  return [span.text(`${name}${dots}`), status];
};

const formatIssueLine = (issue: WorkflowIssue): span.Span[] => {
  const location =
    issue.path === undefined
      ? ""
      : issue.line === undefined
        ? issue.path
        : `${issue.path}:${issue.line}`;
  const prefix = location.length > 0 ? `${location}: ` : "";

  return [
    span.text("  "),
    span.red("✗"),
    span.text(` ${prefix}${issue.message}`),
  ];
};

const writeStepResult = (
  out: LineWriter,
  result: StepResult,
  verbose: boolean,
): void => {
  out.writeln(...formatStepLine(result.name, result, verbose));

  // Print issues under failed steps (or all steps when verbose)
  if (!result.passed || verbose) {
    for (const issue of result.issues) {
      out.writeln(...formatIssueLine(issue));
    }
  }
};

const writeHelp = (out: LineWriter): void => {
  out.writeln("eser workflows run — Run workflow pipelines\n");
  out.writeln("Usage:");
  out.writeln("  eser workflows run -e <event>        Run by event");
  out.writeln("  eser workflows run -w <workflow-id>  Run by workflow id");
  out.writeln();
  out.writeln("Options:");
  out.writeln(
    "  -e, --event <name>     Event to trigger (precommit, commitmsg, prepush)",
  );
  out.writeln("  -w, --workflow <id>    Workflow id to run");
  out.writeln("  --fix                  Auto-fix issues where supported");
  out.writeln("  --dry-run              Preview mutations without writing");
  out.writeln("  --only <step>          Run only a specific step");
  out.writeln("  --config <path>        Config directory (default: .)");
  out.writeln("  -v, --verbose          Show stats and issues for all steps");
  out.writeln("  --json                 Output results as JSON");
  out.writeln("  --changed              Only check files changed in git");
  out.writeln("  -h, --help             Show this help");
};

// =============================================================================
// Run summary
// =============================================================================

type RunSummary = {
  readonly passed: boolean;
  readonly failedSteps: number;
  readonly issues: number;
};

const summarize = (workflowResults: readonly WorkflowResult[]): RunSummary => {
  let failedSteps = 0;
  let issues = 0;
  for (const workflowResult of workflowResults) {
    for (const step of workflowResult.steps) {
      if (!step.passed) {
        failedSteps++;
        issues += step.issues.length;
      }
    }
  }

  return {
    passed: workflowResults.every((workflowResult) => workflowResult.passed),
    failedSteps,
    issues,
  };
};

const reportResults = (
  out: LineWriter,
  workflowResults: readonly WorkflowResult[],
  jsonOutput: boolean,
): shellArgs.CliResult<void> => {
  const summary = summarize(workflowResults);

  if (jsonOutput) {
    out.writeln(JSON.stringify(workflowResults, null, 2));
  } else if (summary.passed) {
    out.writeln(span.green("\nAll checks passed!"));
  } else {
    out.writeln(
      span.red(
        `\n${summary.failedSteps} check(s) failed with ${summary.issues} issue(s)`,
      ),
    );
  }

  return summary.passed ? results.ok(undefined) : results.fail({ exitCode: 1 });
};

// =============================================================================
// Execution
// =============================================================================

const writeMutations = async (
  mutations: readonly WorkflowFileMutation[],
): Promise<void> => {
  for (const mutation of mutations) {
    if (mutation.oldContent === mutation.newContent) {
      continue;
    }

    // One write at a time on purpose: a step can fix hundreds of files, so
    // this keeps one file open at a time, and a later mutation of the same
    // path overwrites an earlier one instead of racing it.
    // oxlint-disable-next-line no-await-in-loop
    await runtime.fs.writeTextFile(mutation.path, mutation.newContent);
  }
};

const failRun = (
  out: LineWriter,
  message: string,
): shellArgs.CliResult<void> => {
  out.writeln(span.red(`Error: ${message}`));
  return results.fail({ exitCode: 1 });
};

type RunFlags = {
  readonly event: string | undefined;
  readonly workflow: string | undefined;
  readonly config: string;
  readonly fix: boolean;
  readonly dryRun: boolean;
  readonly only: string | undefined;
  readonly args: readonly string[];
  readonly verbose: boolean;
  readonly json: boolean;
  readonly changed: boolean;
};

const runCommand = async (
  out: LineWriter,
  flags: RunFlags,
  cliOptions: RunCliOptions | undefined,
): Promise<shellArgs.CliResult<void>> => {
  if (flags.event === undefined && flags.workflow === undefined) {
    return results.fail({
      message:
        "Error: specify -e <event> or -w <workflow-id>. Use --help for usage.",
      exitCode: 1,
    });
  }

  // --- Create registry (shell tool built-in, then injected tools) ---
  const toolRegistry = registry.createRegistry();
  toolRegistry.register(shellTool.shellTool);
  if (cliOptions?.tools !== undefined) {
    toolRegistry.registerAll(cliOptions.tools);
  }

  // --- Load config ---
  const config = await loader.loadFromFile(flags.config);
  if (config === null) {
    return results.fail({
      message: "Error: no .eser/manifest.yml found in current directory.",
      exitCode: 1,
    });
  }

  // --- Detect changed files ---
  let changedFiles: string[] | undefined;
  if (flags.changed) {
    try {
      changedFiles = await shellExec.exec`git diff --name-only HEAD`
        .cwd(flags.config)
        .timeout(GIT_DIFF_TIMEOUT_MS)
        .noThrow()
        .lines();
    } catch {
      out.writeln(
        span.yellow(
          "Warning: could not run git, running without file filtering.",
        ),
      );
    }
  }

  // --- Build run options ---
  const runOptions: RunOptions = {
    root: flags.config,
    fix: flags.fix,
    dryRun: flags.dryRun,
    only: flags.only,
    args: flags.args,
    changedFiles,

    onStepEnd: flags.json
      ? undefined
      : (result) => writeStepResult(out, result, flags.verbose),

    onMutations: flags.dryRun ? undefined : writeMutations,
  };

  // --- Run ---
  // Every workflow runs on the TypeScript engine; WIRING.md says why the Go
  // engine of the native library is not used.
  try {
    let workflowResults: readonly WorkflowResult[];
    if (flags.event !== undefined) {
      const eventResult = await task.runTask(
        engine.runByEvent(
          flags.event,
          config.workflows,
          toolRegistry,
          runOptions,
        ),
      );

      if (results.isFail(eventResult)) {
        return failRun(out, eventResult.error.message);
      }

      workflowResults = eventResult.value;
    } else {
      const workflowResult = await task.runTask(
        engine.runWorkflowWithConfig(
          // Defined: the guard at the top returns when neither -e nor -w is set.
          flags.workflow!,
          config,
          toolRegistry,
          runOptions,
        ),
      );

      if (results.isFail(workflowResult)) {
        return failRun(out, workflowResult.error.message);
      }

      workflowResults = [workflowResult.value];
    }

    return reportResults(out, workflowResults, flags.json);
  } catch (error) {
    // The engine throws for circular or unknown includes and malformed steps,
    // and writing a fixed file to disk can fail.
    return failRun(out, error instanceof Error ? error.message : String(error));
  }
};

// =============================================================================
// CLI entry point
// =============================================================================

/**
 * Options injected by the CLI dispatcher.
 */
export type RunCliOptions = {
  readonly tools?: readonly WorkflowTool[];
};

/**
 * CLI main function.
 *
 * Usage errors (no `-e` or `-w`, no manifest) come back as the `message` of
 * the failed result, for the entry point to print.
 *
 * @param cliArgs - CLI arguments
 * @param cliOptions - Injected options (tools, config)
 */
export const main = async (
  cliArgs?: readonly string[],
  cliOptions?: RunCliOptions,
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs((cliArgs ?? []) as string[], {
    string: ["event", "workflow", "only", "config"],
    boolean: ["fix", "dry-run", "help", "verbose", "json", "changed"],
    alias: { e: "event", w: "workflow", h: "help", v: "verbose" },
  });

  const out = createLineWriter();

  if (parsed.help) {
    writeHelp(out);
    return results.ok(undefined);
  }

  const flags: RunFlags = {
    event: parsed.event as string | undefined,
    workflow: parsed.workflow as string | undefined,
    config: (parsed.config as string | undefined) ?? ".",
    fix: (parsed.fix as boolean | undefined) ?? false,
    dryRun: (parsed["dry-run"] as boolean | undefined) ?? false,
    only: parsed.only as string | undefined,
    args: parsed._ as string[],
    verbose: (parsed.verbose as boolean | undefined) ?? false,
    json: (parsed.json as boolean | undefined) ?? false,
    changed: (parsed.changed as boolean | undefined) ?? false,
  };

  return await runCommand(out, flags, cliOptions);
};
