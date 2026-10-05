// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Kit module definition for @eserstack/shell integration.
 *
 * @module
 */

import * as module from "@eserstack/shell/module";

/** The command module type, `Module` from `@eserstack/shell/module`. */
export type Module = module.Module;

/**
 * The `kit` command group: `add`, `list`, `new` (alias `create`), `clone` and
 * `update`. A command's module loads when that command runs.
 *
 * @example
 * ```typescript
 * import * as kit from "@eserstack/kit/mod";
 *
 * const command = kit.moduleDef.toCommand("kit", "1.0.0");
 * ```
 */
export const moduleDef: Module = new module.Module({
  description: "Kit — recipes, templates, project creation",
  modules: {
    add: {
      description: "Add a recipe to your project",
      category: "Distribution",
      load: () => import("./commands/add.ts"),
    },
    list: {
      description: "Browse available recipes and templates",
      category: "Distribution",
      load: () => import("./commands/list.ts"),
    },
    new: {
      description: "Create a new project from a template",
      category: "Distribution",
      load: () => import("./commands/new.ts"),
    },
    clone: {
      description: "Clone a recipe from any GitHub repo",
      category: "Distribution",
      load: () => import("./commands/clone.ts"),
    },
    update: {
      description: "Re-fetch and update an applied recipe",
      category: "Distribution",
      load: () => import("./commands/update.ts"),
    },
  },
  aliases: {
    create: "new",
  },
});
