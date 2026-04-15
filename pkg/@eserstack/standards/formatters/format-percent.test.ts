// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { formatPercent } from "./format-percent.ts";

Deno.test("formatPercent formats percentage values", () => {
  assert.assertEquals(formatPercent(75.5), "75.5%");
  assert.assertEquals(formatPercent(0), "0.0%");
  assert.assertEquals(formatPercent(100), "100.0%");
});

Deno.test("formatPercent handles ratio mode", () => {
  assert.assertEquals(formatPercent(0.75, 1, true), "75.0%");
  assert.assertEquals(formatPercent(0.5, 1, true), "50.0%");
  assert.assertEquals(formatPercent(1, 1, true), "100.0%");
});

Deno.test("formatPercent respects decimals parameter", () => {
  assert.assertEquals(formatPercent(75.555, 0), "76%");
  assert.assertEquals(formatPercent(75.555, 2), "75.56%");
});

Deno.test("formatPercent throws for non-finite values", () => {
  assert.assertThrows(
    () => formatPercent(Infinity),
    Error,
    "Value must be a finite number",
  );
  assert.assertThrows(
    () => formatPercent(NaN),
    Error,
    "Value must be a finite number",
  );
});

Deno.test("formatPercent throws for negative decimals", () => {
  assert.assertThrows(
    () => formatPercent(50, -1),
    Error,
    "Decimals must be a non-negative integer",
  );
});

Deno.test("formatPercent throws for non-integer decimals", () => {
  assert.assertThrows(
    () => formatPercent(50, 1.5),
    Error,
    "Decimals must be a non-negative integer",
  );
});
