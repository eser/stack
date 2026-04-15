// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  createInterpolator,
  extractPlaceholders,
  interpolate,
} from "./interpolate.ts";

Deno.test("interpolate - replaces single placeholder", () => {
  const result = interpolate("Hello {name}!", { name: "World" });
  assert.assertEquals(result, "Hello World!");
});

Deno.test("interpolate - replaces multiple placeholders", () => {
  const result = interpolate("{greeting} {name}!", {
    greeting: "Hello",
    name: "World",
  });
  assert.assertEquals(result, "Hello World!");
});

Deno.test("interpolate - replaces same placeholder multiple times", () => {
  const result = interpolate("{x} + {x} = {result}", { x: 2, result: 4 });
  assert.assertEquals(result, "2 + 2 = 4");
});

Deno.test("interpolate - converts numbers to string", () => {
  const result = interpolate("Item {id} costs ${price}", {
    id: 42,
    price: 9.99,
  });
  assert.assertEquals(result, "Item 42 costs $9.99");
});

Deno.test("interpolate - leaves unmatched placeholders", () => {
  const result = interpolate("Hello {name}!", {});
  assert.assertEquals(result, "Hello {name}!");
});

Deno.test("interpolate - handles empty params", () => {
  const result = interpolate("No placeholders here", {});
  assert.assertEquals(result, "No placeholders here");
});

Deno.test("interpolate - handles empty template", () => {
  const result = interpolate("", { name: "World" });
  assert.assertEquals(result, "");
});

Deno.test("interpolate - converts null and undefined", () => {
  const result = interpolate("Value: {val}", { val: null });
  assert.assertEquals(result, "Value: null");
});

Deno.test("createInterpolator - creates reusable function", () => {
  const greet = createInterpolator("Hello {name}!");
  assert.assertEquals(greet({ name: "Alice" }), "Hello Alice!");
  assert.assertEquals(greet({ name: "Bob" }), "Hello Bob!");
});

Deno.test("createInterpolator - with multiple params", () => {
  const format = createInterpolator("{count} {item}(s)");
  assert.assertEquals(format({ count: 1, item: "apple" }), "1 apple(s)");
  assert.assertEquals(format({ count: 5, item: "orange" }), "5 orange(s)");
});

Deno.test("extractPlaceholders - extracts single placeholder", () => {
  const result = extractPlaceholders("Hello {name}!");
  assert.assertEquals(result, ["name"]);
});

Deno.test("extractPlaceholders - extracts multiple placeholders", () => {
  const result = extractPlaceholders("{greeting} {name}, you have {count}!");
  assert.assertEquals(result, ["greeting", "name", "count"]);
});

Deno.test("extractPlaceholders - returns empty for no placeholders", () => {
  const result = extractPlaceholders("No placeholders here");
  assert.assertEquals(result, []);
});

Deno.test("extractPlaceholders - handles duplicate placeholders", () => {
  const result = extractPlaceholders("{x} + {x} = {result}");
  assert.assertEquals(result, ["x", "x", "result"]);
});
