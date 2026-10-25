// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as builder from "./builder.ts";

nodeTest.test(
  "createWorkflow — builds a valid definition with string steps",
  () => {
    const wf = builder
      .createWorkflow("my-wf")
      .on("precommit")
      .step("fix-eof")
      .step("check-json")
      .build();

    assert.assertEquals(wf.id, "my-wf");
    assert.assertEquals(wf.on, ["precommit"]);
    assert.assertEquals(wf.steps, ["fix-eof", "check-json"]);
  },
);

nodeTest.test(
  "createWorkflow — step with options produces record format",
  () => {
    const wf = builder
      .createWorkflow("opts-wf")
      .on("precommit", "prepush")
      .step("check-json", { exclude: ["tsconfig.json"] })
      .step("fix-eof")
      .build();

    assert.assertEquals(wf.id, "opts-wf");
    assert.assertEquals(wf.on, ["precommit", "prepush"]);
    assert.assertEquals(wf.steps.length, 2);
    assert.assertEquals(wf.steps[0], {
      "check-json": { exclude: ["tsconfig.json"] },
    });
    assert.assertEquals(wf.steps[1], "fix-eof");
  },
);

nodeTest.test("defineWorkflow — empty id throws", () => {
  assert.assertThrows(
    () =>
      builder.defineWorkflow({
        id: "",
        on: ["precommit"],
        steps: ["fix-eof"],
      }),
    Error,
    "Workflow id is required",
  );
});

nodeTest.test("defineWorkflow — empty on array throws", () => {
  assert.assertThrows(
    () =>
      builder.defineWorkflow({
        id: "bad-wf",
        on: [],
        steps: ["fix-eof"],
      }),
    Error,
    "must have at least one event",
  );
});
