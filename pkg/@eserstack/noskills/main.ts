// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The TypeScript CLI of `watch`, `web` and `manager`, the noskills commands the
 * Go noskills (cmd/noskills) forwards until they are ported (TASK-266). The npm
 * noskills launcher points the binary at the emitted `dist/main.js`; run the
 * noskills binary rather than this file.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("noskills", config.version);

/** Parse the process arguments and run the matching noskills command. */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // The CLI reports a failed command to the user on stderr.
        // oxlint-disable-next-line no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
