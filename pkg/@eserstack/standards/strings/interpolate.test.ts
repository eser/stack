// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as interpolate from "./interpolate.ts";

nodeTest.test("interpolate - replaces single placeholder", () => {
  const result = interpolate.interpolate("Hello {name}!", { name: "World" });
  assert.assertEquals(result, "Hello World!");
});

nodeTest.test("interpolate - replaces multiple placeholders", () => {
  const result = interpolate.interpolate("{greeting} {name}!", {
    greeting: "Hello",
    name: "World",
  });
  assert.assertEquals(result, "Hello World!");
});

nodeTest.test("interpolate - replaces same placeholder multiple times", () => {
  const result = interpolate.interpolate("{x} + {x} = {result}", {
    x: 2,
    result: 4,
  });
  assert.assertEquals(result, "2 + 2 = 4");
});

nodeTest.test("interpolate - converts numbers to string", () => {
  const result = interpolate.interpolate("Item {id} costs ${price}", {
    id: 42,
    price: 9.99,
  });
  assert.assertEquals(result, "Item 42 costs $9.99");
});

nodeTest.test("interpolate - leaves unmatched placeholders", () => {
  const result = interpolate.interpolate("Hello {name}!", {});
  assert.assertEquals(result, "Hello {name}!");
});

nodeTest.test("interpolate - handles empty params", () => {
  const result = interpolate.interpolate("No placeholders here", {});
  assert.assertEquals(result, "No placeholders here");
});

nodeTest.test("interpolate - handles empty template", () => {
  const result = interpolate.interpolate("", { name: "World" });
  assert.assertEquals(result, "");
});

nodeTest.test("interpolate - converts null and undefined", () => {
  const result = interpolate.interpolate("Value: {val}", { val: null });
  assert.assertEquals(result, "Value: null");
});

nodeTest.test("createInterpolator - creates reusable function", () => {
  const greet = interpolate.createInterpolator("Hello {name}!");
  assert.assertEquals(greet({ name: "Alice" }), "Hello Alice!");
  assert.assertEquals(greet({ name: "Bob" }), "Hello Bob!");
});

nodeTest.test("createInterpolator - with multiple params", () => {
  const format = interpolate.createInterpolator("{count} {item}(s)");
  assert.assertEquals(format({ count: 1, item: "apple" }), "1 apple(s)");
  assert.assertEquals(format({ count: 5, item: "orange" }), "5 orange(s)");
});

nodeTest.test("extractPlaceholders - extracts single placeholder", () => {
  const result = interpolate.extractPlaceholders("Hello {name}!");
  assert.assertEquals(result, ["name"]);
});

nodeTest.test("extractPlaceholders - extracts multiple placeholders", () => {
  const result = interpolate.extractPlaceholders(
    "{greeting} {name}, you have {count}!",
  );
  assert.assertEquals(result, ["greeting", "name", "count"]);
});

nodeTest.test("extractPlaceholders - returns empty for no placeholders", () => {
  const result = interpolate.extractPlaceholders("No placeholders here");
  assert.assertEquals(result, []);
});

nodeTest.test("extractPlaceholders - handles duplicate placeholders", () => {
  const result = interpolate.extractPlaceholders("{x} + {x} = {result}");
  assert.assertEquals(result, ["x", "x", "result"]);
});
