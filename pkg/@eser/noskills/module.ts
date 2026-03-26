// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * NoSkills module definition.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
  description: "not disclosed yet",
  modules: {
    init: {
      description: "Initialize noskills",
      load: () => import("./init.ts"),
    },
  },
});
