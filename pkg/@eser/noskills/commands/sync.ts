// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills sync` — Regenerate tool-specific files.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as syncEngine from "../sync/engine.ts";
import { cmd } from "../output/cmd.ts";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const config = await persistence.readManifest(root);

  if (config === null) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  out.writeln(span.dim("Syncing tool files..."));
  const synced = await syncEngine.syncAll(root, config.tools, config);

  for (const id of synced) {
    out.writeln("  ", span.green("✔"), ` ${id}`);
  }

  if (synced.length === 0) {
    out.writeln(span.dim("  No tools configured."));
  }

  out.writeln("");
  out.writeln(span.green("Done."));
  await out.close();

  return results.ok(undefined);
};
