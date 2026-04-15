// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { formatSize } from "./format-size.ts";

Deno.test("formatSize returns bytes for small values", () => {
  assert.assertEquals(formatSize(0), "0.00 B");
  assert.assertEquals(formatSize(500), "500.00 B");
  assert.assertEquals(formatSize(1023), "1023.00 B");
});

Deno.test("formatSize returns KB for kilobyte values", () => {
  assert.assertEquals(formatSize(1024), "1.00 KB");
  assert.assertEquals(formatSize(1536), "1.50 KB");
});

Deno.test("formatSize returns MB for megabyte values", () => {
  assert.assertEquals(formatSize(1048576), "1.00 MB");
});

Deno.test("formatSize returns GB for gigabyte values", () => {
  assert.assertEquals(formatSize(1073741824), "1.00 GB");
});

Deno.test("formatSize throws for negative values", () => {
  assert.assertThrows(
    () => formatSize(-1),
    Error,
    "Size must be a non-negative finite number",
  );
});

Deno.test("formatSize throws for non-finite values", () => {
  assert.assertThrows(
    () => formatSize(Infinity),
    Error,
    "Size must be a non-negative finite number",
  );
  assert.assertThrows(
    () => formatSize(NaN),
    Error,
    "Size must be a non-negative finite number",
  );
});
