// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AI module definition for @eserstack/shell integration.
 *
 * @module
 */

import * as module from "@eserstack/shell/module";

/** The command module type, `Module` from `@eserstack/shell/module`. */
export type Module = module.Module;

/** The `ai` command group: `ask` and `list`. */
export const moduleDef: Module = new module.Module({
  description: "AI provider interface — ask questions, generate content",
  modules: {
    ask: {
      description: "Send a prompt to an AI provider",
      load: () => import("./commands/ask.ts"),
    },
    list: {
      description: "List available AI providers",
      load: () => import("./commands/list.ts"),
    },
  },
});
