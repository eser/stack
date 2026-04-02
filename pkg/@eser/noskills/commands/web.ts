// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills web` — Start the web interface.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    console.error("noskills is not initialized. Run: noskills init");
    return results.fail({ exitCode: 1 });
  }

  // Parse flags
  let port = 3000;
  let open = false;

  for (const arg of args ?? []) {
    if (arg.startsWith("--port=")) {
      port = parseInt(arg.slice("--port=".length), 10);
    }
    if (arg === "--open") {
      open = true;
    }
  }

  const { startServer } = await import("@eser/noskills-web");
  await startServer({ root, port, open });

  return results.ok(undefined);
};
