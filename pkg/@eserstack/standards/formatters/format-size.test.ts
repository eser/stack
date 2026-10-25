// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as formatSize from "./format-size.ts";

nodeTest.test("formatSize returns bytes for small values", () => {
  assert.assertEquals(formatSize.formatSize(0), "0.00 B");
  assert.assertEquals(formatSize.formatSize(500), "500.00 B");
  assert.assertEquals(formatSize.formatSize(1023), "1023.00 B");
});

nodeTest.test("formatSize returns KB for kilobyte values", () => {
  assert.assertEquals(formatSize.formatSize(1024), "1.00 KB");
  assert.assertEquals(formatSize.formatSize(1536), "1.50 KB");
});

nodeTest.test("formatSize returns MB for megabyte values", () => {
  assert.assertEquals(formatSize.formatSize(1048576), "1.00 MB");
});

nodeTest.test("formatSize returns GB for gigabyte values", () => {
  assert.assertEquals(formatSize.formatSize(1073741824), "1.00 GB");
});

nodeTest.test("formatSize throws for negative values", () => {
  assert.assertThrows(
    () => formatSize.formatSize(-1),
    Error,
    "Size must be a non-negative finite number",
  );
});

nodeTest.test("formatSize throws for non-finite values", () => {
  assert.assertThrows(
    () => formatSize.formatSize(Infinity),
    Error,
    "Size must be a non-negative finite number",
  );
  assert.assertThrows(
    () => formatSize.formatSize(NaN),
    Error,
    "Size must be a non-negative finite number",
  );
});
