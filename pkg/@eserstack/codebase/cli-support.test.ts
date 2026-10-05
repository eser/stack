// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as cliSupport from "./cli-support.ts";

Deno.test("getCliContext creates one context on first use and reuses it", () => {
  const first = cliSupport.getCliContext();
  const second = cliSupport.getCliContext();

  assert.assertStrictEquals(second, first);
  assert.assertStrictEquals(first.output, first.ctx.output);
});
