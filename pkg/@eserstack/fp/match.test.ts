// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as match from "./match.ts";

nodeTest.test("basic", () => {
  const str1 = "apple";

  const result = match.match(str1, [
    ["apple", () => "Apple is selected."],
    ["pear", () => "Pear is selected."],
    ["banana", () => "Banana is selected."],
  ]);

  assert.assertEquals(result, "Apple is selected.");
});

nodeTest.test("conditions", () => {
  const str1 = "appLe"; // intentionally mixed case
  const str2 = "pear";
  const str3 = "banana";

  const result = match.match(true, [
    // @ts-ignore - intentionally testing for falsey values
    [str1 === "apple", () => "Apple is selected."],
    [str2 === "pear", () => "Pear is selected."],
    [str3 === "banana", () => "Banana is selected."],
  ]);

  assert.assertEquals(result, "Pear is selected.");
});

nodeTest.test("otherwise callback when no pattern matches", () => {
  const result = match.match(
    "orange",
    [
      ["apple", () => "Apple is selected."],
      ["pear", () => "Pear is selected."],
    ],
    () => "No match found.",
  );

  assert.assertEquals(result, "No match found.");
});

nodeTest.test("returns undefined when no match and no otherwise", () => {
  const result = match.match("orange", [
    ["apple", () => "Apple is selected."],
    ["pear", () => "Pear is selected."],
  ]);

  assert.assertEquals(result, undefined);
});

nodeTest.test("empty patterns array with otherwise", () => {
  const result = match.match("apple", [], () => "Default value");

  assert.assertEquals(result, "Default value");
});

nodeTest.test("empty patterns array without otherwise", () => {
  const result = match.match("apple", []);

  assert.assertEquals(result, undefined);
});

nodeTest.test("matching null value", () => {
  const result = match.match(null, [
    [null, () => "Null matched"],
    [undefined, () => "Undefined matched"],
  ]);

  assert.assertEquals(result, "Null matched");
});

nodeTest.test("matching undefined value", () => {
  const result = match.match(undefined, [
    [null, () => "Null matched"],
    [undefined, () => "Undefined matched"],
  ]);

  assert.assertEquals(result, "Undefined matched");
});
