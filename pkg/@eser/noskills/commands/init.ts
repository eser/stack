// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills init` — Initialize .nos/ in project.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as toolDetect from "../detect/tools.ts";
import * as codebaseDetect from "../detect/codebase.ts";
import * as concernDefs from "../context/concerns.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  // Check if already initialized
  if (await persistence.isInitialized(root)) {
    out.writeln(
      span.yellow("noskills is already initialized in this project."),
    );
    out.writeln(span.dim("Run `noskills sync` to regenerate tool files."));
    await out.close();

    return results.ok(undefined);
  }

  out.writeln(span.bold("noskills init"));
  out.writeln("");

  // Detect project traits
  out.writeln(span.dim("Scanning project..."));
  const project = await codebaseDetect.detectProject(root);

  for (const lang of project.languages) {
    out.writeln("  ", span.green("✔"), ` ${lang}`);
  }
  for (const fw of project.frameworks) {
    out.writeln("  ", span.green("✔"), ` ${fw}`);
  }
  for (const ci of project.ci) {
    out.writeln("  ", span.green("✔"), ` ${ci}`);
  }
  if (project.testRunner !== null) {
    out.writeln("  ", span.green("✔"), ` test runner: ${project.testRunner}`);
  }

  // Detect AI providers via @eser/ai
  out.writeln("");
  out.writeln(span.dim("Detecting AI providers..."));
  const providers = await toolDetect.detectProviders();

  for (const p of providers) {
    if (p.available) {
      out.writeln(
        "  ",
        span.green("●"),
        " ",
        span.bold(`${p.name} (${p.alias})`),
        span.dim(`  ${p.detail}`),
      );
    } else {
      out.writeln(
        "  ",
        span.dim("○"),
        " ",
        span.dim(`${p.name} (${p.alias})  ${p.detail}`),
      );
    }
  }

  const availableProviders = providers.filter((p) => p.available).map((p) =>
    p.name
  );

  // Scaffold directories
  out.writeln("");
  out.writeln(span.dim("Initializing..."));
  await persistence.scaffoldNosDir(root);
  out.writeln("  Created .nos/");

  // Bootstrap built-in concerns
  for (const concern of concernDefs.BUILTIN_CONCERNS) {
    await persistence.writeConcern(root, concern);
  }
  out.writeln(
    `  Bootstrapped ${concernDefs.BUILTIN_CONCERNS.length} concerns into .nos/concerns/`,
  );

  // Write config
  const config = schema.createInitialConfig([], availableProviders, project);
  await persistence.writeConfig(root, config);
  out.writeln("  Created .nos/config.json");

  // Write initial state
  const state = schema.createInitialState();
  await persistence.writeState(root, state);
  out.writeln("  Created .nos/.state/state.json");

  out.writeln("");
  const count = availableProviders.length;
  out.writeln(span.green("Done."), ` ${count} AI provider(s) detected.`);
  out.writeln("Start a spec with: ", span.bold('noskills spec new "..."'));
  await out.close();

  return results.ok(undefined);
};
