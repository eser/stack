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
  WorkflowResult,
  WorkflowTool,
} from "./types.ts";
import { createRegistry } from "./registry.ts";
import { runByEvent, runWorkflowWithConfig } from "./engine.ts";
import { loadFromFile } from "./loader.ts";
import { shellTool } from "./shell-tool.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

// =============================================================================
// Output formatting
// =============================================================================

const COLUMN_WIDTH = 50;

const renderer = streams.renderers.ansi();

const formatStepLine = (
  name: string,
  result: StepResult,
  verbose: boolean,
): string => {
  const dots = ".".repeat(Math.max(1, COLUMN_WIDTH - name.length));
  const timing = `${(result.durationMs / 1000).toFixed(1)}s`;

  let statusStr: string;
  if (result.passed && result.mutations.length > 0) {
    statusStr = renderer.render([
      span.yellow(
        `Fixed (${result.mutations.length} file${
          result.mutations.length === 1 ? "" : "s"
        }, ${timing})`,
      ),
    ]);
  } else if (result.passed) {
    if (verbose && Object.keys(result.stats).length > 0) {
      const statsStr = Object.entries(result.stats)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      statusStr = renderer.render([
        span.green(`Passed (${statsStr}, ${timing})`),
      ]);
    } else {
      statusStr = renderer.render([span.green(`Passed (${timing})`)]);
    }
  } else {
    statusStr = renderer.render([span.red(`Failed (${timing})`)]);
  }

  return `${name}${dots}${statusStr}`;
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
 * @param cliArgs - CLI arguments
 * @param cliOptions - Injected options (tools, config)
 */
export const main = async (
  cliArgs?: readonly string[],
  cliOptions?: RunCliOptions,
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      string: ["event", "workflow", "only", "config"],
      boolean: ["fix", "dry-run", "help", "verbose", "json", "changed"],
      alias: { e: "event", w: "workflow", h: "help", v: "verbose" },
    },
  );

  if (parsed.help) {
    console.log("eser workflows run — Run workflow pipelines\n");
    console.log("Usage:");
    console.log("  eser workflows run -e <event>        Run by event");
    console.log(
      "  eser workflows run -w <workflow-id>  Run by workflow id",
    );
    console.log();
    console.log("Options:");
    console.log(
      "  -e, --event <name>     Event to trigger (precommit, commitmsg, prepush)",
    );
    console.log("  -w, --workflow <id>    Workflow id to run");
    console.log("  --fix                  Auto-fix issues where supported");
    console.log("  --dry-run              Preview mutations without writing");
    console.log("  --only <step>          Run only a specific step");
    console.log(
      "  --config <path>        Config directory (default: .)",
    );
    console.log(
      "  -v, --verbose          Show stats and issues for all steps",
    );
    console.log("  --json                 Output results as JSON");
    console.log(
      "  --changed              Only check files changed in git",
    );
    console.log("  -h, --help             Show this help");
    return results.ok(undefined);
  }

  const out = streams.output({
    renderer,
    sink: streams.sinks.stdout(),
  });

  const eventArg = parsed.event as string | undefined;
  const workflowArg = parsed.workflow as string | undefined;
  const fixMode = (parsed.fix as boolean | undefined) ?? false;
  const dryRun = (parsed["dry-run"] as boolean | undefined) ?? false;
  const onlyArg = parsed.only as string | undefined;
  const positionalArgs = parsed._ as string[];
  const verbose = (parsed.verbose as boolean | undefined) ?? false;
  const jsonOutput = (parsed.json as boolean | undefined) ?? false;
  const changed = (parsed.changed as boolean | undefined) ?? false;

  if (eventArg === undefined && workflowArg === undefined) {
    console.error(
      "Error: specify -e <event> or -w <workflow-id>. Use --help for usage.",
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // --- Create registry (shell tool built-in, then injected tools) ---
  const registry = createRegistry();
  registry.register(shellTool);
  if (cliOptions?.tools !== undefined) {
    registry.registerAll(cliOptions.tools);
  }

  // --- Load config ---
  const configDir = (parsed.config as string | undefined) ?? ".";
  const config = await loadFromFile(configDir);
  if (config === null) {
    console.error(
      "Error: no .eser/manifest.yml found in current directory.",
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // --- Detect changed files ---
  let changedFiles: string[] | undefined;
  if (changed) {
    try {
      const changedOutput = await shellExec.exec`git diff --name-only HEAD`
        .cwd(configDir)
        .noThrow()
        .lines();
      changedFiles = changedOutput;
    } catch {
      out.writeln(
        span.yellow(
          "Warning: could not run git, running without file filtering.",
        ),
      );
    }
  }

  // --- Build run options ---
  const allResults: WorkflowResult[] = [];

  const runOptions: RunOptions = {
    root: configDir,
    fix: fixMode,
    dryRun,
    only: onlyArg,
    args: positionalArgs,
    changedFiles,

    onStepStart: jsonOutput ? undefined : undefined,

    onStepEnd: jsonOutput ? undefined : (result) => {
      console.log(formatStepLine(result.name, result, verbose));

      // Print issues under failed steps (or all steps when verbose)
      if (!result.passed || verbose) {
        for (const issue of result.issues) {
          const loc = issue.path !== undefined
            ? issue.line !== undefined
              ? `${issue.path}:${issue.line}`
              : issue.path
            : "";
          console.log(
            `  ${renderer.render([span.red("✗")])} ${loc}${
              loc.length > 0 ? ": " : ""
            }${issue.message}`,
          );
        }
      }
    },

    onMutations: async (mutations) => {
      if (dryRun) {
        return;
      }
      for (const mutation of mutations) {
        if (mutation.oldContent !== mutation.newContent) {
          await runtime.fs.writeTextFile(
            mutation.path,
            mutation.newContent,
          );
        }
      }
    },
  };

  // --- Run ---
  try {
    let allPassed = true;
    let totalIssues = 0;
    let totalFailed = 0;

    // --- Try Go FFI (faster path for event/workflow runs with built-in tools only) ---
    if (cliOptions?.tools === undefined) {
      try {
        await ensureLib();
        const lib = getLib();

        if (lib !== null) {
          const raw = lib.symbols.EserAjanWorkflowRun(
            JSON.stringify({
              root: configDir,
              event: eventArg ?? "",
              workflowId: workflowArg ?? "",
              fix: fixMode,
              only: onlyArg,
              changedFiles,
              workflows: config.workflows,
            }),
          );
          const goResult = JSON.parse(raw) as {
            results?: WorkflowResult[];
            error?: string;
          };

          if (!goResult.error && goResult.results !== undefined) {
            for (const wfResult of goResult.results) {
              allResults.push(wfResult);
              if (!wfResult.passed) allPassed = false;
              for (const step of wfResult.steps) {
                if (!step.passed) {
                  totalFailed++;
                  totalIssues += step.issues.length;
                }
                if (runOptions.onStepEnd !== undefined) {
                  runOptions.onStepEnd(step);
                }
              }
            }

            if (jsonOutput) {
              console.log(JSON.stringify(allResults, null, 2));
            }

            if (!allPassed) {
              if (!jsonOutput) {
                out.writeln(
                  span.red(
                    `\n${totalFailed} check(s) failed with ${totalIssues} issue(s)`,
                  ),
                );
              }
              await out.close();
              return results.fail({ exitCode: 1 });
            }

            if (!jsonOutput) {
              out.writeln(span.green("\nAll checks passed!"));
            }
            await out.close();
            return results.ok(undefined);
          }
        }
      } catch {
        // Go unavailable or failed — fall through to TS engine
      }
    }

    if (eventArg !== undefined) {
      const eventResult = await task.runTask(
        runByEvent(
          eventArg,
          config.workflows,
          registry,
          runOptions,
        ),
      );

      if (results.isFail(eventResult)) {
        throw new Error(eventResult.error.message);
      }

      for (const wfResult of eventResult.value) {
        allResults.push(wfResult);
        if (!wfResult.passed) {
          allPassed = false;
        }
        for (const step of wfResult.steps) {
          if (!step.passed) {
            totalFailed++;
            totalIssues += step.issues.length;
          }
        }
      }
    } else {
      const wfTaskResult = await task.runTask(
        runWorkflowWithConfig(
          workflowArg!,
          config,
          registry,
          runOptions,
        ),
      );

      if (results.isFail(wfTaskResult)) {
        throw new Error(wfTaskResult.error.message);
      }

      const wfResult = wfTaskResult.value;
      allResults.push(wfResult);
      allPassed = wfResult.passed;
      for (const step of wfResult.steps) {
        if (!step.passed) {
          totalFailed++;
          totalIssues += step.issues.length;
        }
      }
    }

    // --- JSON output ---
    if (jsonOutput) {
      console.log(JSON.stringify(allResults, null, 2));
    }

    // --- Summary ---
    if (!allPassed) {
      if (!jsonOutput) {
        out.writeln(
          span.red(
            `\n${totalFailed} check(s) failed with ${totalIssues} issue(s)`,
          ),
        );
      }
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    if (!jsonOutput) {
      out.writeln(span.green("\nAll checks passed!"));
    }
    await out.close();
    return results.ok(undefined);
  } catch (error) {
    out.writeln(
      span.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }
};
