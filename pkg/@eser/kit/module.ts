// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Kit module definition for @eser/shell integration.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
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
