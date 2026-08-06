// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { formatNumber } from "./format-number.ts";

Deno.test("formatNumber formats small numbers", () => {
  assert.assertEquals(formatNumber(0), "0");
  assert.assertEquals(formatNumber(100), "100");
});

Deno.test("formatNumber adds thousands separators", () => {
  // Asserts the EXACT string, not that it contains "1" and "000".
  //
  // The old version passed against a function that added no separators at all --
  // "1000000" contains both substrings -- so it could not observe the one
  // behaviour it was named for. That matters now: under `deno compile
  // --engine quickjs` there is no Intl, and the previous toLocaleString
  // implementation returned exactly that unseparated string.
  assert.assertEquals(formatNumber(1000000), "1,000,000");
  assert.assertEquals(formatNumber(1000), "1,000");
  assert.assertEquals(formatNumber(999), "999");
  assert.assertEquals(formatNumber(1234567.5), "1,234,567.5");
});

Deno.test("formatNumber handles negative numbers", () => {
  const result = formatNumber(-1000);
  assert.assertEquals(result.includes("1"), true);
});

Deno.test("formatNumber throws for non-finite values", () => {
  assert.assertThrows(
    () => formatNumber(Infinity),
    Error,
    "Number must be finite",
  );
  assert.assertThrows(
    () => formatNumber(NaN),
    Error,
    "Number must be finite",
  );
});
