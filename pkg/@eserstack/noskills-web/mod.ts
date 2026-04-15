// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * noskills web — browser interface for noskills dashboard.
 *
 * Provides the same experience as the TUI manager:
 * tabs, spec reading, inline CTAs, terminal interaction.
 *
 * @module
 */

export { startServer } from "./server.ts";
export type { ServerOptions } from "./server.ts";
export { PtyManager } from "./terminal/pty-manager.ts";
