// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `system` command tree, shared by every binary this workspace ships.
 *
 * A factory rather than a module-level constant, because `eser`, `noskills` and
 * `laroux` each need the same tree describing THEMSELVES: `noskills system
 * install` must install noskills, and its help must say so. One implementation,
 * parameterised by {@link CliApp} — not three copies.
 *
 * @module
 */

import * as shellArgs from "@eserstack/shell/args";

import type { CliApp } from "./app.ts";
import {
  completionsHandler,
  doctorHandler,
  infoHandler,
  installHandler,
  uninstallHandler,
  updateHandler,
  versionHandler,
} from "./handlers/mod.ts";

/**
 * Builds the `system` tree for one binary.
 *
 * The app descriptor is bound into each handler here, so the handlers stay
 * plain functions of (ctx, app) and nothing has to reach for a global.
 */
export const createSystemCommand = (app: CliApp): shellArgs.Command =>
  new shellArgs.Command("system")
    .description("Commands related with this CLI")
    .command(
      new shellArgs.Command("install")
        .description(`Install ${app.command} globally`)
        .run((ctx) => installHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("uninstall")
        .description(`Uninstall ${app.command} globally`)
        .run((ctx) => uninstallHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("update")
        .description(`Update ${app.command} to the latest version`)
        .run((ctx) => updateHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("completions")
        .description("Generate shell completion scripts")
        .flag({
          name: "shell",
          type: "string",
          description: "Shell type: bash, zsh, or fish",
        })
        .run((ctx) => completionsHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("version")
        .description("Show version and check for updates")
        .flag({
          name: "bare",
          type: "boolean",
          description: "Print version number only",
        })
        .run((ctx) => versionHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("doctor")
        .description("Run diagnostic checks")
        .run((ctx) => doctorHandler(ctx, app)),
    )
    .command(
      new shellArgs.Command("info")
        .description("Show runtime and execution context diagnostics")
        .run((ctx) => infoHandler(ctx, app)),
    );
