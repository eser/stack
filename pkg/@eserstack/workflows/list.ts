// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI command handler for `eser workflows list`.
 *
 * Lists available workflows and registered tools from the configuration.
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import type { WorkflowTool } from "./types.ts";
import * as registry from "./registry.ts";
import * as loader from "./loader.ts";
import * as shellTool from "./shell-tool.ts";

/**
 * Options injected by the CLI dispatcher.
 */
export type ListCliOptions = {
  readonly tools?: readonly WorkflowTool[];
};

const writeHelp = (out: streams.Output): void => {
  out.writeln("eser workflows list — List available workflows and tools\n");
  out.writeln("Options:");
  out.writeln("  --config <path>  Config directory (default: .)");
  out.writeln("  -h, --help       Show this help");
};

const writeListing = async (
  out: streams.Output,
  configArg: string | undefined,
  cliOptions: ListCliOptions | undefined,
): Promise<void> => {
  const configDir = configArg ?? ".";
  const config = await loader.loadFromFile(configDir);

  // Registry (shell tool built-in, then injected tools)
  const toolRegistry = registry.createRegistry();
  toolRegistry.register(shellTool.shellTool);
  if (cliOptions?.tools !== undefined) {
    toolRegistry.registerAll(cliOptions.tools);
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
  const tools = toolRegistry.getAll();
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
  const parsed = cliParseArgs.parseArgs((cliArgs ?? []) as string[], {
    string: ["config"],
    boolean: ["help"],
    alias: { h: "help" },
  });

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    if (parsed.help) {
      writeHelp(out);
      return results.ok(undefined);
    }

    await writeListing(out, parsed.config as string | undefined, cliOptions);
    return results.ok(undefined);
  } finally {
    await out.close();
  }
};
