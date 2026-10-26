// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Symlink checker — detects broken and destroyed symlinks.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: "validate-symlinks",
    description: "Detect broken symlinks",
    canFix: false,
    stacks: [],
    defaults: {},

    checkAll: async (files) => {
      // Only flag BROKEN symlinks (target doesn't exist).
      // Valid symlinks like AGENTS.md → CLAUDE.md pass silently.
      // Each check is independent, so they run concurrently.
      const symlinks = files.filter((file) => file.isSymlink);
      const broken = await Promise.all(
        symlinks.map(async (file): Promise<boolean> => {
          try {
            await standards.crossRuntime.runtime.fs.stat(file.path);
            return false;
          } catch {
            return true;
          }
        }),
      );

      return symlinks
        .filter((_file, index) => broken[index] === true)
        .map((file) => ({
          path: file.path,
          message: "broken symlink — target not found",
        }));
    },
  }),
  "symlinks",
);

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result);
}
