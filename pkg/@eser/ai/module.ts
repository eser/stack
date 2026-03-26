// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AI module definition for @eser/shell integration.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
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
