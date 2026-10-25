// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills web` — Start the web interface.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as cmd from "../output/cmd.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    return results.fail({
      exitCode: 1,
      message: `noskills is not initialized. Run: ${cmd.cmd("init")}`,
    });
  }

  // Parse flags
  let port = 3000;
  let open = false;

  for (const arg of args ?? []) {
    if (arg.startsWith("--port=")) {
      const rawPort = arg.slice("--port=".length);
      port = Number(rawPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return results.fail({
          exitCode: 1,
          message: `--port "${rawPort}" is not a port number; pass an integer from 1 to 65535`,
        });
      }
    }
    if (arg === "--open") {
      open = true;
    }
  }

  // Dynamic import — opaque specifier prevents esbuild from bundling it
  // (avoids circular dep: noskills → noskills-web → noskills)
  const specifier = "@eserstack/noskills-web";
  let startServer: (opts: {
    root: string;
    port: number;
    open: boolean;
  }) => Promise<void>;
  try {
    const mod = await import(specifier);
    startServer = mod.startServer;
  } catch {
    return results.fail({
      exitCode: 1,
      message: "@eserstack/noskills-web is not installed. Run: pnpm install",
    });
  }
  await startServer({ root, port, open });

  return results.ok(undefined);
};
