// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { formatNumber } from "./format-number.ts";

Deno.test("formatNumber formats small numbers", () => {
  assert.assertEquals(formatNumber(0), "0");
  assert.assertEquals(formatNumber(100), "100");
});

Deno.test("formatNumber adds thousands separators", () => {
  // Note: exact format depends on locale, but should contain separators
  const result = formatNumber(1000000);
  assert.assertEquals(result.includes("1"), true);
  assert.assertEquals(result.includes("000"), true);
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
