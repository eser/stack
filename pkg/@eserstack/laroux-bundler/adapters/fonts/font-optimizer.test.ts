// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as types from "../../types.ts";
import * as fontOptimizer from "./font-optimizer.ts";

// Fonts with a Google provider are downloaded from fonts.googleapis.com, which
// a unit test cannot reach; these cases cover the fonts the optimizer leaves
// to the app without a request.
const cases: { name: string; fonts: types.FontDefinition[] }[] = [
  {
    name: "googleFontOptimizer returns null for an empty font list",
    fonts: [],
  },
  {
    name: "googleFontOptimizer returns null when no font comes from Google",
    fonts: [{ provider: "local", family: "Brand Sans" }],
  },
];

for (const { name, fonts } of cases) {
  nodeTest.test(name, async () => {
    const result = await fontOptimizer.googleFontOptimizer.optimize(fonts, {
      outputDir: "fonts",
      publicPath: "/fonts",
    });

    assert.assertEquals(result, null);
  });
}
