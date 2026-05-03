// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Symlink checker — detects broken and destroyed symlinks.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool, withGoValidator } from "./file-tool.ts";

export const tool: FileTool = withGoValidator(createFileTool({
  name: "validate-symlinks",
  description: "Detect broken symlinks",
  canFix: false,
  stacks: [],
  defaults: {},

  async checkAll(files) {
    const issues = [];

    for (const file of files) {
      if (!file.isSymlink) {
        continue;
      }

      // Only flag BROKEN symlinks (target doesn't exist).
      // Valid symlinks like AGENTS.md → CLAUDE.md pass silently.
      try {
        await standards.crossRuntime.runtime.fs.stat(file.path);
      } catch {
        issues.push({
          path: file.path,
          message: "broken symlink — target not found",
        });
      }
    }

    return issues;
  },
}), "symlinks");

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
