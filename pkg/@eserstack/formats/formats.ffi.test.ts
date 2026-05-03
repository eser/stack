// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { ffiFormats } from "./adapters/ffi/mod.ts";
import { FORMAT_NOT_FOUND, FormatFfiError } from "./business/errors.ts";

Deno.test(
  { name: "FFI round-trip: encodeDocument JSON via EserAjanFormatEncodeDocument", sanitizeResources: false },
  async () => {
    const result = await ffiFormats.encodeDocument("json", [{ name: "app1", count: 42 }]);
    const parsed = JSON.parse(result);
    assert.assert(Array.isArray(parsed));
    assert.assertEquals(parsed[0].name, "app1");
    assert.assertEquals(parsed[0].count, 42);
  },
);

Deno.test(
  { name: "FFI round-trip: decode JSON via EserAjanFormatDecode", sanitizeResources: false },
  async () => {
    const items = await ffiFormats.decode("json", '[{"key":"value"},{"key":"other"}]');
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["key"], "value");
  },
);

Deno.test(
  { name: "FFI round-trip: list formats via EserAjanFormatList", sanitizeResources: false },
  async () => {
    const formats = await ffiFormats.list();
    assert.assert(formats.length > 0);
    const names = formats.map((f) => f.name);
    assert.assert(names.includes("json"));
    assert.assert(names.includes("yaml"));
  },
);

Deno.test(
  { name: "FFI round-trip: JSON encode+decode roundtrip", sanitizeResources: false },
  async () => {
    const data = [{ id: 1, label: "test" }];
    const encoded = await ffiFormats.encodeDocument("json", data);
    const decoded = await ffiFormats.decode("json", encoded);
    assert.assertEquals(decoded, data);
  },
);

Deno.test(
  { name: "FFI error: unknown format throws FormatFfiError", sanitizeResources: false },
  async () => {
    await assert.assertRejects(
      () => ffiFormats.decode("no-such-format", "data"),
      FormatFfiError,
    );
    await ffiFormats.decode("no-such-format", "data").catch((e: unknown) => {
      if (e instanceof FormatFfiError) {
        assert.assertEquals(e.code, FORMAT_NOT_FOUND);
      }
    });
  },
);
