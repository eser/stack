// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as backendNode from "./backend-node.ts";
import * as errors from "./errors.ts";
import * as library from "./library.ts";
import * as ffiMod from "./mod.ts";

const cases: ReadonlyArray<{
  readonly signature: string;
  readonly name: string;
  readonly args: readonly string[];
  readonly ret: string;
}> = [
  {
    signature: "void* EserAjanVersion()",
    name: "EserAjanVersion",
    args: [],
    ret: "pointer",
  },
  {
    signature: "void* EserAjanCall(const char* name, const char* request)",
    name: "EserAjanCall",
    args: ["string", "string"],
    ret: "pointer",
  },
  {
    signature: "void* EserAjanStreamRead(const char* handle)",
    name: "EserAjanStreamRead",
    args: ["string"],
    ret: "pointer",
  },
  {
    signature: "void EserAjanFree(void* ptr)",
    name: "EserAjanFree",
    args: ["pointer"],
    ret: "void",
  },
  {
    signature: "int EserAjanStatus()",
    name: "EserAjanStatus",
    args: [],
    ret: "int32",
  },
];

for (const { signature, name, args, ret } of cases) {
  nodeTest.test(`parseSignature reads ${name}`, () => {
    assert.assertEquals(backendNode.parseSignature(signature), {
      name,
      definition: { arguments: [...args], return: ret },
    });
  });
}

nodeTest.test(
  "parseSignature refuses a C type node:ffi has no mapping for",
  () => {
    assert.assertThrows(
      () => backendNode.parseSignature("double EserAjanRatio(float x)"),
      Error,
      'unsupported C type "double"',
    );
  },
);

nodeTest.test("SIGNATURES declares the six dispatcher exports", () => {
  assert.assertEquals(
    backendNode.SIGNATURES.map((s) => backendNode.parseSignature(s).name),
    [
      "EserAjanVersion",
      "EserAjanCall",
      "EserAjanStreamOpen",
      "EserAjanStreamRead",
      "EserAjanStreamClose",
      "EserAjanFree",
    ],
  );
});

/** Raw exports that answer `version` with `text`, as node:ffi pointers. */
const fakeRaw = (text: string) => {
  const freed: unknown[] = [];
  const strings = new Map<bigint, string>([[1n, text]]);

  return {
    freed,
    toString: (ptr: bigint): string | null => strings.get(ptr) ?? null,
    raw: {
      EserAjanVersion: () => 1n,
      EserAjanFree: (ptr: unknown) => {
        freed.push(ptr);
      },
    },
  };
};

nodeTest.test(
  "the loader refuses a library whose handshake names another ABI version",
  () => {
    const fake = fakeRaw(
      JSON.stringify({
        version: "9.9.9",
        abi: library.ABI_VERSION + 1,
        profile: "native",
        names: [],
        streams: [],
      }),
    );

    const error = assert.assertThrows(
      () =>
        backendNode.readHandshake(
          fake.raw,
          fake.toString,
          "/lib/libeser_ajan.so",
        ),
      errors.AbiMismatchError,
    );

    assert.assertStringIncludes(
      error.message,
      `speaks dispatcher ABI ${library.ABI_VERSION + 1}, but this loader speaks ABI ${library.ABI_VERSION}`,
    );
    assert.assertStringIncludes(error.message, "/lib/libeser_ajan.so");
    // The handshake string is released even when it is refused.
    assert.assertEquals(fake.freed, [1n]);
  },
);

nodeTest.test("the loader refuses a library whose handshake is not one", () => {
  const fake = fakeRaw("eser-ajan version 4.5.2");

  const error = assert.assertThrows(
    () => backendNode.readHandshake(fake.raw, fake.toString, "/old.dylib"),
    errors.AbiMismatchError,
  );
  assert.assertStringIncludes(
    error.message,
    `speaks dispatcher ABI none, but this loader speaks ABI ${library.ABI_VERSION}`,
  );
});

nodeTest.test(
  "an unknown name raises UnknownFunctionError and leaves the library loaded",
  async () => {
    const lib = await ffiMod.loadEserAjan({ wasm: false });

    try {
      const call = lib.call as (name: string, request?: unknown) => unknown;
      const error = assert.assertThrows(
        () => call("noSuchFunction", {}),
        errors.UnknownFunctionError,
      );
      assert.assertEquals(error.code, "UNKNOWN_FUNCTION");
      assert.assertEquals(error.fn, "noSuchFunction");

      const formats = lib.call("formatList");
      assert.assert(
        (formats.formats?.length ?? 0) > 0,
        "a later call on the same library succeeds",
      );
    } finally {
      lib.close();
    }
  },
);
