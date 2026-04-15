// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { match } from "./match.ts";

Deno.test("basic", () => {
  const str1 = "apple";

  const result = match(str1, [
    ["apple", () => "Apple is selected."],
    ["pear", () => "Pear is selected."],
    ["banana", () => "Banana is selected."],
  ]);

  assert.assertEquals(
    result,
    "Apple is selected.",
  );
});

Deno.test("conditions", () => {
  const str1 = "appLe"; // intentionally mixed case
  const str2 = "pear";
  const str3 = "banana";

  const result = match(true, [
    // @ts-ignore - intentionally testing for falsey values
    [str1 === "apple", () => "Apple is selected."],
    [str2 === "pear", () => "Pear is selected."],
    [str3 === "banana", () => "Banana is selected."],
  ]);

  assert.assertEquals(
    result,
    "Pear is selected.",
  );
});

Deno.test("otherwise callback when no pattern matches", () => {
  const result = match("orange", [
    ["apple", () => "Apple is selected."],
    ["pear", () => "Pear is selected."],
  ], () => "No match found.");

  assert.assertEquals(result, "No match found.");
});

Deno.test("returns undefined when no match and no otherwise", () => {
  const result = match("orange", [
    ["apple", () => "Apple is selected."],
    ["pear", () => "Pear is selected."],
  ]);

  assert.assertEquals(result, undefined);
});

Deno.test("empty patterns array with otherwise", () => {
  const result = match("apple", [], () => "Default value");

  assert.assertEquals(result, "Default value");
});

Deno.test("empty patterns array without otherwise", () => {
  const result = match("apple", []);

  assert.assertEquals(result, undefined);
});

Deno.test("matching null value", () => {
  const result = match(null, [
    [null, () => "Null matched"],
    [undefined, () => "Undefined matched"],
  ]);

  assert.assertEquals(result, "Null matched");
});

Deno.test("matching undefined value", () => {
  const result = match(undefined, [
    [null, () => "Null matched"],
    [undefined, () => "Undefined matched"],
  ]);

  assert.assertEquals(result, "Undefined matched");
});
