// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * System command - system management and setup tools
 *
 * @module
 */

import { Command } from "@eser/shell/args";
import {
  completionsHandler,
  installHandler,
  uninstallHandler,
  updateHandler,
} from "./handlers/mod.ts";

export const systemCommand = new Command("system")
  .description("System management and setup tools")
  .command(
    new Command("install")
      .description("Install eser CLI globally")
      .run(installHandler),
  )
  .command(
    new Command("uninstall")
      .description("Uninstall eser CLI globally")
      .run(uninstallHandler),
  )
  .command(
    new Command("update")
      .description("Update eser CLI to the latest version")
      .run(updateHandler),
  )
  .command(
    new Command("completions")
      .description("Generate shell completion scripts")
      .flag({
        name: "shell",
        type: "string",
        description: "Shell type: bash, zsh, or fish",
      })
      .run(completionsHandler),
  );
