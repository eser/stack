// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as larouxRuntime from "./mod.ts";

nodeTest.test("createRuntime returns a new runtime with fresh state", () => {
  const first = larouxRuntime.createRuntime();
  const second = larouxRuntime.createRuntime();

  assert.assertInstanceOf(first, larouxRuntime.LarouxRuntime);
  assert.assertNotStrictEquals(first.state, second.state);
  assert.assertEquals(first.state.manifests, []);
  assert.assertEquals(first.state.baseUrl, null);
});
