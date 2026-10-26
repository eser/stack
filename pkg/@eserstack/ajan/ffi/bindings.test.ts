// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as bindings from "./bindings.ts";

const entries = Object.entries(bindings.BINDINGS) as ReadonlyArray<
  readonly [string, bindings.BindingSpec]
>;

nodeTest.test("the blocking names are the ones that wait on I/O", () => {
  const blocking = entries
    .filter(([, spec]) => spec.blocking)
    .map(([name]) => name)
    .sort();

  assert.assertEquals(blocking, [
    // AI: the generation, its stream and the five batch calls
    "aiBatchCancel",
    "aiBatchCreate",
    "aiBatchDownload",
    "aiBatchGet",
    "aiBatchList",
    "aiGenerateText",
    "aiTextStream",
    // HTTP
    "httpRequest",
    "httpRequestStream",
    // kit and posts: the network-backed calls
    "kitApplyRecipe",
    "kitCloneRecipe",
    "kitListRecipes",
    "kitNewProject",
    "kitUpdateRecipe",
    "postsCompose",
    "postsGetTimeline",
    "postsSearch",
    // shell: the one-shot exec, the exec and PTY readers and the keypress
    // reader
    "shellExec",
    "shellExecStream",
    "shellPtyStream",
    "shellTuiKeypressStream",
    // workflows: a run executes its steps' commands
    "workflowRun",
  ]);
});

nodeTest.test("every blocking call answers a promise", () => {
  for (const [name, spec] of entries) {
    if (spec.kind === "call" && spec.blocking) {
      assert.assertEquals(
        spec.async,
        true,
        `${name} is blocking but not async`,
      );
    }
  }
});

nodeTest.test("each cancellable blocking name has its cancel entry", () => {
  const cancels = Object.fromEntries(
    entries
      .filter(([, spec]) => spec.cancel !== undefined)
      .map(([name, spec]) => [name, spec.cancel]),
  );

  assert.assertEquals(cancels, {
    aiGenerateText: "aiCancelRequest",
    aiTextStream: "aiCancelRequest",
    aiBatchCreate: "aiCancelRequest",
    aiBatchGet: "aiCancelRequest",
    aiBatchList: "aiCancelRequest",
    aiBatchDownload: "aiCancelRequest",
    aiBatchCancel: "aiCancelRequest",
    httpRequestStream: "close",
    shellExecStream: "close",
    shellPtyStream: "shellPtyKill",
    shellTuiKeypressStream: "close",
  });

  for (const [name, spec] of entries) {
    if (spec.cancel !== undefined) {
      assert.assert(
        spec.blocking,
        `${name} has a cancel entry but never blocks`,
      );
    }
  }
});
