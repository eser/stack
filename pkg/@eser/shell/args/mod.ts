// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cobra-like CLI framework
 *
 * Provides a Command class for building CLI applications with:
 * - Hierarchical command trees (commands and subcommands)
 * - Flag definitions with types and validation
 * - Automatic help generation
 * - Shell completion script generation
 *
 * @example
 * ```ts
 * import { Command } from "@eser/shell/args";
 *
 * const app = new Command("myapp")
 *   .description("My CLI application")
 *   .version("1.0.0")
 *   .persistentFlag({ name: "verbose", short: "v", type: "boolean", description: "Verbose output" })
 *   .command(
 *     new Command("init")
 *       .description("Initialize a new project")
 *       .flag({ name: "template", short: "t", type: "string", description: "Template name" })
 *       .run(async (ctx) => {
 *         console.log("Initializing with template:", ctx.flags["template"]);
 *       })
 *   )
 *   .command(
 *     new Command("build")
 *       .description("Build the project")
 *       .run(async (ctx) => {
 *         console.log("Building...");
 *       })
 *   );
 *
 * await app.parse();
 * ```
 *
 * @module
 */

export * from "./types.ts";
export * from "./command.ts";
export * from "./flags.ts";
export * from "./help.ts";
