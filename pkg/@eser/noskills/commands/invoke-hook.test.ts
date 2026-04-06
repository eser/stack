// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Integration tests for the post-ask-user-question hook handler.
 *
 * These tests exercise `processAskUserQuestionHook` — the testable core of
 * `handlePostAskUserQuestion` — end to end: given a parsed Claude Code hook
 * input plus a temp project root, verify that `.eser/.state/progresses/
 * ask-token.json` is (or is not) produced with the expected shape.
 *
 * This covers the discovery integrity system's write half (the read/consume
 * half is covered in `next.test.ts` via `consumeAskToken`).
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
import * as invokeHook from "./invoke-hook.ts";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";

let tempDir: string;

const initProject = async (root: string): Promise<void> => {
  // Minimal layout so `persistence.readState` has somewhere to look. We don't
  // need a full init — an empty progresses/ dir plus a state.json is enough.
  const stateDir = `${root}/${persistence.paths.progressesDir}`;
  await crossRuntime.runtime.fs.mkdir(stateDir, { recursive: true });
  const initial = schema.createInitialState();
  await crossRuntime.runtime.fs.writeTextFile(
    `${root}/${persistence.paths.stateFile}`,
    JSON.stringify(initial, null, 2) + "\n",
  );
};

const readTokenFile = async (
  root: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await crossRuntime.runtime.fs.readTextFile(
      `${root}/${persistence.paths.askTokenFile}`,
    );
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

bdd.describe("processAskUserQuestionHook — token writing", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_invoke_hook_",
    });
    await initProject(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(
    "writes token file with correct structure for AskUserQuestion input",
    async () => {
      const input: Record<string, unknown> = {
        tool_name: "AskUserQuestion",
        tool_input: {
          questions: [
            { question: "What is the current behavior of the upload flow?" },
          ],
        },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertExists(token, "token file should exist");
      assert.assertEquals(typeof token["token"], "string");
      assert.assertEquals(typeof token["stepId"], "string");
      // spec is null because the initial state has no active spec
      assert.assertEquals(token["spec"], null);
      assert.assertEquals(
        token["match"] === "exact" || token["match"] === "modified",
        true,
      );
      assert.assertEquals(typeof token["createdAt"], "string");
      assert.assertEquals(
        token["askedQuestion"],
        "What is the current behavior of the upload flow?",
      );
    },
  );

  bdd.it(
    "skips non-AskUserQuestion tools (no token file written)",
    async () => {
      const input: Record<string, unknown> = {
        tool_name: "Bash",
        tool_input: { command: "ls" },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertEquals(token, null);
    },
  );

  bdd.it(
    "handles missing questions array gracefully (no throw, no file)",
    async () => {
      const input: Record<string, unknown> = {
        tool_name: "AskUserQuestion",
        tool_input: {},
        cwd: tempDir,
      };

      // Should not throw
      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertEquals(token, null);
    },
  );

  bdd.it(
    "uses Claude Code questions[0].question array shape extraction",
    async () => {
      const input: Record<string, unknown> = {
        tool_name: "AskUserQuestion",
        tool_input: {
          questions: [
            { question: "First question" },
            { question: "Second question (ignored)" },
          ],
        },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertExists(token);
      assert.assertEquals(token["askedQuestion"], "First question");
    },
  );

  bdd.it(
    "falls back to legacy single-string `question` field shape",
    async () => {
      const input: Record<string, unknown> = {
        tool_name: "AskUserQuestion",
        tool_input: {
          question: "Legacy single-string shape",
        },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertExists(token);
      assert.assertEquals(token["askedQuestion"], "Legacy single-string shape");
    },
  );
});
