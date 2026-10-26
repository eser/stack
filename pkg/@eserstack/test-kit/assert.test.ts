// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "./assert.ts";

nodeTest.test(
  "the re-exported assertions pass and fail like @std/assert",
  () => {
    assert.assertEquals({ a: [1, 2] }, { a: [1, 2] });
    assert.assertStrictEquals(1, 1);
    assert.assertStringIncludes("hello world", "world");
    assert.assertMatch("abc", /b/);
    assert.assertArrayIncludes([1, 2, 3], [2]);
    assert.assertObjectMatch({ a: 1, b: 2 }, { a: 1 });
    assert.assertExists(0);
    assert.assertFalse(false);
    assert.assertGreater(2, 1);
    assert.assertLess(1, 2);

    const error = assert.assertThrows(() => assert.assertEquals(1, 2));
    assert.assertInstanceOf(error, assert.AssertionError);
  },
);
