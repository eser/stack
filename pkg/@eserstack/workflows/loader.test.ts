// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as loader from "./loader.ts";

nodeTest.test("parseConfig — valid YAML → correct WorkflowsConfig", () => {
  const yamlStr = `
workflows:
  - id: default
    on: [precommit]
    steps:
      - fix-eof
      - check-json: { exclude: ["x.json"] }
`;

  const config = loader.parseConfig(yamlStr);

  assert.assertEquals(config.workflows.length, 1);
  assert.assertEquals(config.workflows[0]!.id, "default");
  assert.assertEquals(config.workflows[0]!.on, ["precommit"]);
  assert.assertEquals(config.workflows[0]!.steps.length, 2);
  assert.assertEquals(config.workflows[0]!.steps[0], "fix-eof");
  assert.assertEquals(config.workflows[0]!.steps[1], {
    "check-json": { exclude: ["x.json"] },
  });
});

nodeTest.test(
  "parseConfig — YAML without workflows key → { workflows: [] }",
  () => {
    const yamlStr = `
stack:
  - javascript
`;

    // workflows defaults to [], which validateConfig accepts
    const config = loader.parseConfig(yamlStr);
    assert.assertEquals(config.workflows.length, 0);
    assert.assertEquals(config.stack, ["javascript"]);
  },
);

nodeTest.test("parseConfig — YAML with missing workflow id → throws", () => {
  const yamlStr = `
workflows:
  - on: [precommit]
    steps:
      - fix-eof
`;

  assert.assertThrows(
    () => loader.parseConfig(yamlStr),
    Error,
    "must have a non-empty 'id' string",
  );
});

nodeTest.test("validateConfig — step with 2 keys in record → throws", () => {
  // validateConfig explicitly checks that object steps have exactly one key
  assert.assertThrows(
    () =>
      loader.validateConfig({
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
