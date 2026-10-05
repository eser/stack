// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Checks the agent-facing text every adapter generates: one discovery question
 * rule and one discovery answer rule with no contradicting copy, and executor
 * and verifier steps that name the project's own type check and tests.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type * as adapter from "./adapter.ts";
import * as discoveryAnswers from "../context/discovery-answers.ts";
import * as claudeCodeAdapterMod from "./adapters/claude-code.ts";
import * as cursorAdapterMod from "./adapters/cursor.ts";
import * as kiroAdapterMod from "./adapters/kiro.ts";
import * as copilotAdapterMod from "./adapters/copilot.ts";
import * as windsurfAdapterMod from "./adapters/windsurf.ts";
import * as opencodeAdapterMod from "./adapters/opencode.ts";
import * as codexAdapterMod from "./adapters/codex.ts";
import * as copilotCliAdapterMod from "./adapters/copilot-cli.ts";

const CMD_PREFIX = "npx eser@latest noskills";

const ADAPTERS: readonly adapter.ToolAdapter[] = [
  claudeCodeAdapterMod.claudeCodeAdapter,
  cursorAdapterMod.cursorAdapter,
  kiroAdapterMod.kiroAdapter,
  copilotAdapterMod.copilotAdapter,
  windsurfAdapterMod.windsurfAdapter,
  opencodeAdapterMod.opencodeAdapter,
  codexAdapterMod.codexAdapter,
  copilotCliAdapterMod.copilotCliAdapter,
];

// Wordings the old generators used that contradict the answer rule or the
// question rule (base questions together, follow-ups one at a time).
const CONFLICTING = [
  "Do NOT pre-fill",
  "Do NOT batch",
  "batch-submit",
  "one discovery question at a time",
  "discovery questions one at a time",
  "ONE AT A TIME",
];

/** Runs an adapter's rule and agent sync and returns every file it wrote. */
const generate = async (
  toolAdapter: adapter.ToolAdapter,
): Promise<ReadonlyMap<string, string>> => {
  const root = await crossRuntime.runtime.fs.makeTempDir({
    prefix: `nos_prompts_${toolAdapter.id}_`,
  });

  try {
    const ctx = { root, rules: [], commandPrefix: CMD_PREFIX };
    await toolAdapter.syncRules(ctx);
    if (toolAdapter.syncAgents !== undefined) {
      await toolAdapter.syncAgents(ctx);
    }

    const paths: string[] = [];
    for await (
      const entry of crossRuntime.runtime.fs.walk(root, { includeDirs: false })
    ) {
      paths.push(entry.path);
    }
    const contents = await Promise.all(
      paths.map((path) => crossRuntime.runtime.fs.readTextFile(path)),
    );

    return new Map(
      paths.map((path, i) => [path.slice(root.length + 1), contents[i]!]),
    );
  } finally {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  }
};

for (const toolAdapter of ADAPTERS) {
  bdd.describe(`generated prompts: ${toolAdapter.id}`, () => {
    bdd.it("states the discovery answer rule", async () => {
      const files = await generate(toolAdapter);
      const rule = discoveryAnswers.discoveryAnswerRule(
        `${CMD_PREFIX} spec <name> next --answer`,
      );

      // Copilot CLI writes two instruction files, so count at least one.
      const withRule = [...files.values()].filter((content) =>
        content.includes(rule)
      );
      assert.assertGreater(withRule.length, 0);
    });

    bdd.it("states the discovery question rule", async () => {
      const files = await generate(toolAdapter);
      const rule = discoveryAnswers.discoveryQuestionRule();

      const withRule = [...files.values()].filter((content) =>
        content.includes(rule)
      );
      assert.assertGreater(withRule.length, 0);
    });

    bdd.it("has no wording that contradicts the answer rule", async () => {
      const files = await generate(toolAdapter);

      for (const [path, content] of files) {
        for (const phrase of CONFLICTING) {
          assert.assertEquals(
            content.includes(phrase),
            false,
            `${path}: ${phrase}`,
          );
        }
      }
    });

    if (toolAdapter.syncAgents !== undefined) {
      bdd.it(
        "executor and verifier name the project's checks, not Deno's",
        async () => {
          const files = await generate(toolAdapter);
          const agentFiles = [...files].filter(([path]) =>
            path.includes("noskills-executor") ||
            path.includes("noskills-verifier")
          );

          assert.assertEquals(agentFiles.length, 2);
          for (const [path, content] of agentFiles) {
            assert.assertEquals(content.includes("deno check"), false, path);
            assert.assertEquals(content.includes("deno test"), false, path);
            assert.assertStringIncludes(content, "the project's type check");
            assert.assertStringIncludes(content, "the project's tests");
          }
        },
      );
    }
  });
}
