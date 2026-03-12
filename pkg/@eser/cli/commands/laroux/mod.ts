// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux command - laroux.js framework commands
 *
 * Subcommands:
 *   init   Create a new laroux.js project
 *   dev    Start development server with hot reload
 *   build  Build for production
 *   serve  Serve production build locally
 *
 * Uses lazy loading for command handlers to avoid loading heavy dependencies
 * (like react-dom/server) until actually needed.
 *
 * @module
 */

import * as shellArgs from "@eser/shell/args";

// Lazy-loaded handlers - dynamically import only when command is invoked
const lazyBuildHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const { buildHandler } = await import("./build.ts");
  return await buildHandler(ctx);
};

const lazyDevHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const { devHandler } = await import("./dev.ts");
  return await devHandler(ctx);
};

const lazyServeHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const { serveHandler } = await import("./serve.ts");
  return await serveHandler(ctx);
};

const lazyInitHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const { initHandler } = await import("./init.ts");
  return await initHandler(ctx);
};

export const larouxCommand = new shellArgs.Command("laroux")
  .description("laroux.js framework commands")
  .command(
    new shellArgs.Command("init")
      .description("Create a new laroux.js project")
      .flag({
        name: "template",
        short: "t",
        type: "string",
        description: "Project template (minimal, blog, dashboard, docs)",
        default: "minimal",
      })
      .flag({
        name: "force",
        short: "f",
        type: "boolean",
        description: "Overwrite existing files",
      })
      .flag({
        name: "no-git",
        type: "boolean",
        description: "Skip git initialization",
      })
      .flag({
        name: "no-install",
        type: "boolean",
        description: "Skip dependency installation",
      })
      .run(lazyInitHandler),
  )
  .command(
    new shellArgs.Command("dev")
      .description("Start development server with hot reload")
      .flag({
        name: "port",
        short: "p",
        type: "number",
        description: "Server port",
        default: 8000,
      })
      .flag({
        name: "no-hmr",
        type: "boolean",
        description: "Disable hot module replacement",
      })
      .flag({
        name: "log-level",
        type: "string",
        description: "Log level (debug, info, warn, error)",
        default: "info",
      })
      .flag({
        name: "open",
        short: "o",
        type: "boolean",
        description: "Open browser automatically",
      })
      .run(lazyDevHandler),
  )
  .command(
    new shellArgs.Command("build")
      .description("Build for production")
      .flag({
        name: "out-dir",
        type: "string",
        description: "Output directory",
        default: "dist",
      })
      .flag({
        name: "clean",
        type: "boolean",
        description: "Clean output directory first",
      })
      .flag({
        name: "no-minify",
        type: "boolean",
        description: "Disable minification",
      })
      .flag({
        name: "analyze",
        type: "boolean",
        description: "Analyze bundle size",
      })
      .flag({
        name: "log-level",
        type: "string",
        description: "Log level (debug, info, warn, error)",
        default: "info",
      })
      .run(lazyBuildHandler),
  )
  .command(
    new shellArgs.Command("serve")
      .description("Serve production build locally")
      .flag({
        name: "port",
        short: "p",
        type: "number",
        description: "Server port",
        default: 8000,
      })
      .flag({
        name: "log-level",
        type: "string",
        description: "Log level (debug, info, warn, error)",
        default: "info",
      })
      .run(lazyServeHandler),
  );
