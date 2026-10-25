// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as ffi from "./adapters/ffi/mod.ts";
import * as errors from "./business/errors.ts";
import * as ffiClient from "./ffi-client.ts";
import * as formats from "./mod.ts";
import * as serializer from "./serializer.ts";

nodeTest.test(
  "FFI round-trip: encodeDocument JSON via EserAjanFormatEncodeDocument",
  async () => {
    const result = await ffi.ffiFormats.encodeDocument("json", [
      {
        name: "app1",
        count: 42,
      },
    ]);
    const parsed = JSON.parse(result);
    assert.assert(Array.isArray(parsed));
    assert.assertEquals(parsed[0].name, "app1");
    assert.assertEquals(parsed[0].count, 42);
  },
);

nodeTest.test(
  "FFI encode: document writes one YAML mapping, not a sequence entry",
  async () => {
    const data = { name: "app", replicas: 3 };

    assert.assertEquals(
      await ffi.ffiFormats.encode("yaml", data, { document: true }),
      "name: app\nreplicas: 3\n",
    );
    assert.assertEquals(
      await ffi.ffiFormats.encode("yaml", data, { isFirst: true }),
      "- name: app\n  replicas: 3\n",
    );
  },
);

nodeTest.test(
  "FFI round-trip: decode JSON via EserAjanFormatDecode",
  async () => {
    const items = await ffi.ffiFormats.decode(
      "json",
      '[{"key":"value"},{"key":"other"}]',
    );
    assert.assertEquals(items.length, 2);
    assert.assertEquals((items[0] as Record<string, unknown>)["key"], "value");
  },
);

nodeTest.test(
  "FFI round-trip: list formats via EserAjanFormatList",
  async () => {
    const formats = await ffi.ffiFormats.list();
    assert.assert(formats.length > 0);
    const names = formats.map((f) => f.name);
    assert.assert(names.includes("json"));
    assert.assert(names.includes("yaml"));
  },
);

nodeTest.test("FFI round-trip: JSON encode+decode roundtrip", async () => {
  const data = [{ id: 1, label: "test" }];
  const encoded = await ffi.ffiFormats.encodeDocument("json", data);
  const decoded = await ffi.ffiFormats.decode("json", encoded);
  assert.assertEquals(decoded, data);
});

nodeTest.test("FFI error: unknown format throws FormatFfiError", async () => {
  await assert.assertRejects(
    () => ffi.ffiFormats.decode("no-such-format", "data"),
    errors.FormatFfiError,
  );
  await ffi.ffiFormats.decode("no-such-format", "data").catch((e: unknown) => {
    if (e instanceof errors.FormatFfiError) {
      assert.assertEquals(e.code, errors.FORMAT_NOT_FOUND);
    }
  });
});

// Keys are in sorted order, so Go's sorted maps do not differ by order.
const app = { name: "app", replicas: 3, server: { port: 80 } };
const apps = [
  { name: "app1", replicas: 1 },
  { name: "app2", replicas: 2 },
];

const sameTextCases = [
  { name: "a single value as one YAML mapping", data: app, format: "yaml" },
  {
    name: "YAML with the indent option",
    data: app,
    format: "yaml",
    options: { indent: 4 },
  },
  {
    name: "TOML whole numbers as integers",
    data: { name: "app", replicas: 3 },
    format: "toml",
    options: { pretty: false },
  },
  {
    name: "a single value as one pretty JSON document",
    data: app,
    format: "json",
    options: { pretty: true },
  },
  { name: "a compact JSON array", data: apps, format: "json" },
  {
    name: "a pretty JSON array",
    data: apps,
    format: "json",
    options: { pretty: true },
  },
  {
    name: "a pretty JSON array with indent 4",
    data: apps,
    format: "json",
    options: { pretty: true, indent: 4 },
  },
];

for (const { name, data, format, options } of sameTextCases) {
  nodeTest.test(
    `serializeWith: Go and TypeScript write ${name} the same way`,
    async () => {
      formats.registerBuiltinFormats();
      await ffiClient.ensureLib();
      const lib = ffiClient.getLib();
      assert.assert(lib !== null, "the native library did not load");

      assert.assertEquals(
        serializer.serializeWith(lib, data, format, options),
        serializer.serializeWith(null, data, format, options),
      );
    },
  );
}
