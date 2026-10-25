// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as backendNode from "./backend-node.ts";

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
    signature: "int EserAjanInit()",
    name: "EserAjanInit",
    args: [],
    ret: "int32",
  },
  {
    signature: "void EserAjanShutdown()",
    name: "EserAjanShutdown",
    args: [],
    ret: "void",
  },
  {
    signature: "void EserAjanFree(void* ptr)",
    name: "EserAjanFree",
    args: ["pointer"],
    ret: "void",
  },
  {
    signature:
      "void* EserAjanAiGenerateText(const char* modelHandle, const char* optionsJSON)",
    name: "EserAjanAiGenerateText",
    args: ["string", "string"],
    ret: "pointer",
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
