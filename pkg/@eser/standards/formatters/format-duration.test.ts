// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { formatDuration } from "./format-duration.ts";

Deno.test("formatDuration returns milliseconds for values under 1000", () => {
  assert.assertEquals(formatDuration(0), "0ms");
  assert.assertEquals(formatDuration(500), "500ms");
  assert.assertEquals(formatDuration(999), "999ms");
});

Deno.test("formatDuration returns seconds for values 1000 and above", () => {
  assert.assertEquals(formatDuration(1000), "1.00s");
  assert.assertEquals(formatDuration(1500), "1.50s");
  assert.assertEquals(formatDuration(65000), "65.00s");
});

Deno.test("formatDuration throws for negative values", () => {
  assert.assertThrows(
    () => formatDuration(-1),
    Error,
    "Duration must be a non-negative finite number",
  );
});

Deno.test("formatDuration throws for non-finite values", () => {
  assert.assertThrows(
    () => formatDuration(Infinity),
    Error,
    "Duration must be a non-negative finite number",
  );
  assert.assertThrows(
    () => formatDuration(NaN),
    Error,
    "Duration must be a non-negative finite number",
  );
});
