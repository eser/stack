// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux serve command handler
 *
 * Serves the production build locally.
 * Uses dynamic imports to keep CLI startup fast.
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import type { CommandContext } from "@eser/shell/args";

// Valid log levels
const VALID_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

export const serveHandler = async (ctx: CommandContext): Promise<void> => {
  // deno-lint-ignore no-console
  console.log(fmtColors.cyan("\n🚀 Serving production build...\n"));

  // Get flags with defaults
  const port = ctx.flags["port"] as number | undefined;
  const logLevelInput = (ctx.flags["log-level"] as string) ?? "info";

  // Validate log level
  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
      logLevelInput.toLowerCase() as LogLevel,
    )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  // Dynamic imports - deferred until command execution for fast CLI startup
  const [
    { startServer },
    { reactRenderer, reactHtmlShellBuilder },
    { reactPlugin },
    { createTailwindPlugin },
  ] = await Promise.all([
    import("@eser/laroux-server"),
    import("@eser/laroux-server/adapters/react"),
    import("@eser/laroux-bundler/adapters/react"),
    import("@eser/laroux-bundler/adapters/tailwindcss"),
  ]);

  // Start server in serve mode with explicit plugin injection
  await startServer({
    mode: "serve",
    port,
    logLevel,
    hmr: false,
    // Explicit plugin injection (hexagonal architecture)
    renderer: reactRenderer,
    htmlShell: reactHtmlShellBuilder,
    frameworkPlugin: reactPlugin,
    cssPlugin: createTailwindPlugin({
      globalCssPath: "src/app/styles/global.css",
    }),
  });
};
