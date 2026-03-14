// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { parseConfig, validateConfig } from "./loader.ts";

Deno.test("parseConfig — valid YAML → correct WorkflowsConfig", () => {
  const yamlStr = `
workflows:
  - id: default
    on: [precommit]
    steps:
      - fix-eof
      - check-json: { exclude: ["x.json"] }
`;

  const config = parseConfig(yamlStr);

  assert.assertEquals(config.workflows.length, 1);
  assert.assertEquals(config.workflows[0]!.id, "default");
  assert.assertEquals(config.workflows[0]!.on, ["precommit"]);
  assert.assertEquals(config.workflows[0]!.steps.length, 2);
  assert.assertEquals(config.workflows[0]!.steps[0], "fix-eof");
  assert.assertEquals(config.workflows[0]!.steps[1], {
    "check-json": { exclude: ["x.json"] },
  });
});

Deno.test("parseConfig — YAML without workflows key → { workflows: [] } then throws validation", () => {
  const yamlStr = `
stack:
  - deno
`;

  // parseConfig calls validateConfig which throws because workflows is empty array
  // Actually, workflows defaults to [] which is an array, but validateConfig doesn't throw on empty array
  // Let's check: validateConfig iterates over workflows but doesn't throw if empty
  // Actually no — workflows is [] (valid array), and the for loop just doesn't execute.
  // So this should succeed with an empty workflows array.
  const config = parseConfig(yamlStr);
  assert.assertEquals(config.workflows.length, 0);
  assert.assertEquals(config.stack, ["deno"]);
});

Deno.test("parseConfig — YAML with missing workflow id → throws", () => {
  const yamlStr = `
workflows:
  - on: [precommit]
    steps:
      - fix-eof
`;

  assert.assertThrows(
    () => parseConfig(yamlStr),
    Error,
    "must have a non-empty 'id' string",
  );
});

Deno.test("validateConfig — step with 2 keys in record → throws", () => {
  // validateConfig explicitly checks that object steps have exactly one key
  assert.assertThrows(
    () =>
      validateConfig({
        workflows: [
          {
            id: "bad",
            on: ["precommit"],
            steps: [{ a: { x: 1 }, b: { y: 2 } } as unknown as string],
          },
        ],
      }),
    Error,
    "must be an object with exactly one key",
  );
});
