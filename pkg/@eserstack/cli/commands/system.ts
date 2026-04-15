// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * System command - Commands related with this CLI
 *
 * @module
 */

import * as shellArgs from "@eserstack/shell/args";
import {
  completionsHandler,
  doctorHandler,
  infoHandler,
  installHandler,
  uninstallHandler,
  updateHandler,
  versionHandler,
} from "./handlers/mod.ts";

export const systemCommand = new shellArgs.Command("system")
  .description("Commands related with this CLI")
  .command(
    new shellArgs.Command("install")
      .description("Install eser CLI globally")
      .run(installHandler),
  )
  .command(
    new shellArgs.Command("uninstall")
      .description("Uninstall eser CLI globally")
      .run(uninstallHandler),
  )
  .command(
    new shellArgs.Command("update")
      .description("Update eser CLI to the latest version")
      .run(updateHandler),
  )
  .command(
    new shellArgs.Command("completions")
      .description("Generate shell completion scripts")
      .flag({
        name: "shell",
        type: "string",
        description: "Shell type: bash, zsh, or fish",
      })
      .run(completionsHandler),
  )
  .command(
    new shellArgs.Command("version")
      .description("Show version and check for updates")
      .flag({
        name: "bare",
        type: "boolean",
        description: "Print version number only",
      })
      .run(versionHandler),
  )
  .command(
    new shellArgs.Command("doctor")
      .description("Run diagnostic checks")
      .run(doctorHandler),
  )
  .command(
    new shellArgs.Command("info")
      .description("Show runtime and execution context diagnostics")
      .run(infoHandler),
  );
