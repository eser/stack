// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as groupBy from "./group-by.ts";

nodeTest.test("basic", () => {
  const arr = [
    { type: "a", value: 1 },
    { type: "b", value: 2 },
    { type: "a", value: 3 },
  ];

  const result = groupBy.groupBy(arr, (x) => x.type);

  assert.assertEquals(result, {
    a: [
      { type: "a", value: 1 },
      { type: "a", value: 3 },
    ],
    b: [{ type: "b", value: 2 }],
  });
});

nodeTest.test("empty-array", () => {
  const result = groupBy.groupBy([], (x: number) => x);

  assert.assertEquals(result, {});
});

nodeTest.test("single-group", () => {
  const arr = [1, 2, 3, 4, 5];

  const result = groupBy.groupBy(arr, () => "all");

  assert.assertEquals(result, { all: [1, 2, 3, 4, 5] });
});

nodeTest.test("with-math-floor", () => {
  const arr = [1.2, 2.1, 2.4, 3.5];

  const result = groupBy.groupBy(arr, Math.floor);

  assert.assertEquals(result, {
    1: [1.2],
    2: [2.1, 2.4],
    3: [3.5],
  });
});

nodeTest.test("preserves-order", () => {
  const arr = [
    { id: 1, group: "x" },
    { id: 2, group: "x" },
    { id: 3, group: "x" },
  ];

  const result = groupBy.groupBy(arr, (x) => x.group);
  const xGroup = result["x"]!;

  assert.assertEquals(xGroup[0]!.id, 1);
  assert.assertEquals(xGroup[1]!.id, 2);
  assert.assertEquals(xGroup[2]!.id, 3);
});
