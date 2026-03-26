// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI command handler for `eser workflows list`.
 *
 * Lists available workflows and registered tools from the configuration.
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import type { WorkflowTool } from "./types.ts";
import { createRegistry } from "./registry.ts";
import { loadFromFile } from "./loader.ts";
import { shellTool } from "./shell-tool.ts";

/**
 * Options injected by the CLI dispatcher.
 */
export type ListCliOptions = {
  readonly tools?: readonly WorkflowTool[];
};

/**
 * CLI main function.
 *
 * @param cliArgs - CLI arguments
 * @param cliOptions - Injected options (tools)
 */
export const main = async (
  cliArgs?: readonly string[],
  cliOptions?: ListCliOptions,
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      string: ["config"],
      boolean: ["help"],
      alias: { h: "help" },
    },
  );

  if (parsed.help) {
    console.log("eser workflows list — List available workflows and tools\n");
    console.log("Options:");
    console.log("  --config <path>  Config directory (default: .)");
    console.log("  -h, --help       Show this help");
    return results.ok(undefined);
  }

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const configDir = (parsed.config as string | undefined) ?? ".";
  const config = await loadFromFile(configDir);

  // Registry (shell tool built-in, then injected tools)
  const registry = createRegistry();
  registry.register(shellTool);
  if (cliOptions?.tools !== undefined) {
    registry.registerAll(cliOptions.tools);
  }

  // Print workflows
  if (config !== null && config.workflows.length > 0) {
    out.writeln(span.bold("Workflows:"));
    for (const wf of config.workflows) {
      const events = wf.on.length > 0 ? wf.on.join(", ") : "(no events)";
      const stepCount = wf.steps.length;
      const stepWord = stepCount === 1 ? "step" : "steps";
      out.writeln(
        span.text(`  ${wf.id.padEnd(20)} `),
        span.dim(events.padEnd(25)),
        span.text(` ${stepCount} ${stepWord}`),
      );
    }
  } else {
    out.writeln(span.dim("No workflows defined."));
  }

  out.writeln();

  // Print registered tools
  const tools = registry.getAll();
  if (tools.length > 0) {
    out.writeln(span.bold(`Registered tools (${tools.length}):`));
    for (const tool of tools) {
      out.writeln(
        span.text(`  ${tool.name.padEnd(28)} `),
        span.dim(tool.description),
      );
    }
  } else {
    out.writeln(span.dim("No tools registered."));
  }

  await out.close();
  return results.ok(undefined);
};
