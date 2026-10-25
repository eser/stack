// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as machine from "./machine.ts";
import * as persistence from "./persistence.ts";
import * as schema from "./schema.ts";
import * as split from "./split.ts";

const PREFIX = "deno run -A ./tools/nos.ts";

const answer = (
  questionId: string,
  text: string,
  user: string,
): schema.AttributedDiscoveryAnswer => ({
  questionId,
  answer: text,
  user,
  email: `${user.toLowerCase()}@example.com`,
  timestamp: "2026-01-02T03:04:05.000Z",
  type: "original",
});

const STATUS_QUO = answer(
  "status_quo",
  "Log messages flood stdout and the bot uses the wrong pronouns",
  "Ayse",
);
const STATUS_QUO_ADDITION: schema.AttributedDiscoveryAnswer = {
  ...answer(
    "status_quo",
    "The bot also forgets the pronoun after a restart",
    "Mehmet",
  ),
  type: "addition",
};
const AMBITION = answer(
  "ambition",
  "Fix the log levels and restore the bot's gender detection",
  "Ayse",
);

const parentInRefinement = (): schema.StateFile => {
  const started = machine.startSpec(
    schema.createInitialState(),
    "parent",
    "spec/parent",
  );

  return machine.completeDiscovery({
    ...started,
    discovery: {
      ...started.discovery,
      answers: [STATUS_QUO, STATUS_QUO_ADDITION, AMBITION],
    },
  });
};

bdd.describe("split.buildChildSpecState", () => {
  bdd.it("starts the child in DISCOVERY_REFINEMENT with its own branch", () => {
    const state = split.buildChildSpecState({
      name: "fix-log-levels",
      description: "Fix log levels",
      answers: [AMBITION],
    });

    assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(state.spec, "fix-log-levels");
    assert.assertEquals(state.branch, "spec/fix-log-levels");
    assert.assertEquals(state.specDescription, "Fix log levels");
    assert.assertEquals(state.discovery.completed, true);
    assert.assertEquals(state.specState.status, "draft");
  });

  bdd.it("keeps every inherited answer with its attribution", () => {
    const state = split.buildChildSpecState({
      name: "child",
      description: null,
      answers: [STATUS_QUO, STATUS_QUO_ADDITION],
    });

    assert.assertEquals(state.discovery.answers, [
      STATUS_QUO,
      STATUS_QUO_ADDITION,
    ]);
    assert.assertEquals(state.specDescription, null);
  });
});

bdd.describe("split.createChildSpec and split.splitSpec", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_split_" });
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("createChildSpec writes the directory and the state", async () => {
    await split.createChildSpec(root, {
      name: "child",
      description: "Child work",
      answers: [AMBITION],
    });

    assert.assertEquals(
      await runtime.fs.exists(`${root}/${persistence.paths.specDir("child")}`),
      true,
    );
    const written = await persistence.readSpecState(root, "child");
    assert.assertEquals(written.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(written.discovery.answers, [AMBITION]);
  });

  bdd.it("createChildSpec refuses a name that already exists", async () => {
    const existing = machine.startSpec(
      schema.createInitialState(),
      "taken",
      "spec/taken",
    );
    await runtime.fs.mkdir(`${root}/${persistence.paths.specDir("taken")}`, {
      recursive: true,
    });
    await persistence.writeSpecState(root, "taken", existing);

    const error = await assert.assertRejects(
      () =>
        split.createChildSpec(root, {
          name: "taken",
          description: null,
          answers: [],
        }),
      split.SplitRefusedError,
      `Cannot create spec "taken"`,
    );
    assert.assertEquals(error.names, ["taken"]);
    assert.assertEquals(
      (await persistence.readSpecState(root, "taken")).phase,
      "DISCOVERY",
    );
  });

  bdd.it("splitSpec creates each child and cancels the parent", async () => {
    const parent = parentInRefinement();

    const cancelled = await split.splitSpec(root, parent, [
      { name: "log-levels", description: "Log levels", answers: [AMBITION] },
      {
        name: "bot-pronouns",
        description: "Bot pronouns",
        answers: [STATUS_QUO, STATUS_QUO_ADDITION],
      },
    ], PREFIX);

    assert.assertEquals(cancelled.phase, "COMPLETED");
    assert.assertEquals(cancelled.completionReason, "cancelled");
    assert.assertEquals(
      cancelled.completionNote,
      "Split into: log-levels, bot-pronouns",
    );
    const pronouns = await persistence.readSpecState(root, "bot-pronouns");
    assert.assertEquals(pronouns.discovery.answers.length, 2);
    assert.assertEquals(
      (await persistence.readSpecState(root, "log-levels")).specDescription,
      "Log levels",
    );
  });

  bdd.it("splitSpec refuses a repeated name and creates nothing", async () => {
    const error = await assert.assertRejects(
      () =>
        split.splitSpec(root, parentInRefinement(), [
          { name: "same", description: null, answers: [] },
          { name: "other", description: null, answers: [] },
          { name: "same", description: null, answers: [] },
        ], PREFIX),
      split.SplitRefusedError,
      `these repeat: "same"`,
    );
    assert.assertEquals(error.names, ["same"]);
    assert.assertEquals(
      await runtime.fs.exists(`${root}/${persistence.paths.specDir("other")}`),
      false,
    );
  });

  bdd.it(
    "splitSpec refuses an existing spec, names the prefix and creates nothing",
    async () => {
      await runtime.fs.mkdir(`${root}/${persistence.paths.specDir("taken")}`, {
        recursive: true,
      });

      const error = await assert.assertRejects(
        () =>
          split.splitSpec(root, parentInRefinement(), [
            { name: "fresh", description: null, answers: [] },
            { name: "taken", description: null, answers: [] },
          ], PREFIX),
        split.SplitRefusedError,
      );

      assert.assertEquals(error.names, ["taken"]);
      assert.assertStringIncludes(error.message, `already exist: "taken"`);
      assert.assertStringIncludes(
        error.message,
        `\`${PREFIX} spec parent split --into`,
      );
      assert.assertEquals(
        await runtime.fs.exists(
          `${root}/${persistence.paths.specDir("fresh")}`,
        ),
        false,
      );
    },
  );
});
