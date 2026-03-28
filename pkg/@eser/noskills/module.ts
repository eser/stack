// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * noskills module definition — state-machine orchestrator for AI agents.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
  description: "noskills — state-machine orchestrator for AI agents",
  modules: {
    init: {
      description: "Initialize noskills in project",
      load: () => import("./commands/init.ts"),
    },
    status: {
      description: "Show current state",
      load: () => import("./commands/status.ts"),
    },
    spec: {
      description: "Manage specs (new, list)",
      load: () => import("./commands/spec.ts"),
    },
    next: {
      description: "Get next instruction for agent",
      load: () => import("./commands/next.ts"),
    },
    approve: {
      description: "Approve phase transition",
      load: () => import("./commands/approve.ts"),
    },
    block: {
      description: "Mark spec as blocked",
      load: () => import("./commands/block.ts"),
    },
    reset: {
      description: "Reset current spec state",
      load: () => import("./commands/reset.ts"),
    },
    done: {
      description: "Mark spec execution as complete",
      load: () => import("./commands/done.ts"),
    },
    concern: {
      description: "Manage concerns (add, remove, list)",
      load: () => import("./commands/concern.ts"),
    },
    run: {
      description: "Autonomous execution loop (Ralph loop)",
      load: () => import("./commands/run.ts"),
    },
    watch: {
      description: "Live dashboard for monitoring agent progress",
      load: () => import("./commands/watch.ts"),
    },
    sync: {
      description: "Regenerate tool-specific files",
      load: () => import("./commands/sync.ts"),
    },
    purge: {
      description:
        "Remove all noskills content (specs, rules, concerns, hooks)",
      load: () => import("./commands/purge.ts"),
    },
    "invoke-hook": {
      description: "Internal hook handlers (called by agents)",
      load: () => import("./commands/invoke-hook.ts"),
    },
    rule: {
      description: "Manage rules (add, list, promote)",
      load: () => import("./commands/rule.ts"),
    },
  },
});
