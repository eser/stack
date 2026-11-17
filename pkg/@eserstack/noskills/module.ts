// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The commands the Go noskills hands over to this package: `watch`, `web` and
 * `manager`. Every other noskills command runs in the Go binary (cmd/noskills),
 * which forwards these three until they are ported (TASK-266). Internal: the
 * npm noskills launcher runs this CLI, and nothing else should.
 *
 * @module
 */

import * as module from "@eserstack/shell/module";

/** The command module type, `Module` from `@eserstack/shell/module`. */
export type Module = module.Module;

/** The `noskills` command group that drives the spec state machine. */
export const moduleDef: Module = new module.Module({
  description: "noskills — state-machine orchestrator for AI agents",
  modules: {
    watch: {
      description: "Live dashboard for monitoring agent progress",
      load: () => import("./commands/watch.ts"),
    },
    web: {
      description: "Start web interface (browser dashboard)",
      load: () => import("./commands/web.ts"),
    },
    manager: {
      description: "Multi-spec TUI with tab management",
      load: () => import("./commands/manager.ts"),
    },
    mgr: {
      description: "Alias for manager",
      load: () => import("./commands/manager.ts"),
    },
  },
});
