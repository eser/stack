// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as learnings from "./learnings.ts";
import * as persistence from "../state/persistence.ts";
import * as syncEngine from "../sync/engine.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-promotion-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

/** Create a rule file directly (simulates what learn --rule does). */
const createRuleFile = async (
  root: string,
  text: string,
  sourceSpec: string,
): Promise<string> => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const content =
    `---\nphases: [EXECUTING]\nsource: learned from spec "${sourceSpec}" on ${
      new Date().toISOString().slice(0, 10)
    }\n---\n${text}\n`;

  const filePath = `${root}/${persistence.paths.rulesDir}/${slug}.md`;
  await runtime.fs.mkdir(`${root}/${persistence.paths.rulesDir}`, {
    recursive: true,
  });
  await runtime.fs.writeTextFile(filePath, content);
  return filePath;
};

// =============================================================================
// Rule creation from learning
// =============================================================================

bdd.describe("learning → rule promotion", () => {
  bdd.it(
    "--rule flag creates file in .eser/rules/ with frontmatter",
    async () => {
      const root = await makeTempDir();
      const filePath = await createRuleFile(
        root,
        "Always use Result types, never throw exceptions",
        "upload",
      );

      const content = await runtime.fs.readTextFile(filePath);
      assert.assert(content.includes("---"));
      assert.assert(content.includes("phases: [EXECUTING]"));
      assert.assert(content.includes('source: learned from spec "upload"'));
      assert.assert(content.includes("Always use Result types"));
    },
  );

  bdd.it("auto-generated slug is readable", async () => {
    const root = await makeTempDir();
    const filePath = await createRuleFile(
      root,
      "Never use raw malloc in this project",
      "core",
    );

    assert.assert(filePath.includes("never-use-raw-malloc"));
    assert.assert(filePath.endsWith(".md"));
  });

  bdd.it(
    "promote moves learning to rule and removes from learnings",
    async () => {
      const root = await makeTempDir();

      // Add two learnings
      await learnings.addLearning(root, {
        ts: new Date().toISOString(),
        spec: "upload",
        type: "convention",
        text: "Always use Result types",
        severity: "medium",
      });
      await learnings.addLearning(root, {
        ts: new Date().toISOString(),
        spec: "auth",
        type: "mistake",
        text: "Forgot to check auth tokens",
        severity: "high",
      });

      // Promote the first learning
      const all = await learnings.readLearnings(root);
      assert.assertEquals(all.length, 2);

      await createRuleFile(root, all[0]!.text, all[0]!.spec);
      await learnings.removeLearning(root, 0);

      // Verify: 1 learning remains, 1 rule file created
      const remaining = await learnings.readLearnings(root);
      assert.assertEquals(remaining.length, 1);
      assert.assertEquals(remaining[0]!.text, "Forgot to check auth tokens");

      // Verify rule file exists
      const rules = await syncEngine.loadScopedRules(root);
      assert.assert(rules.some((r) => r.text.includes("Result types")));
    },
  );

  bdd.it("promoted rule has source spec in frontmatter", async () => {
    const root = await makeTempDir();
    const filePath = await createRuleFile(
      root,
      "Test rule with source",
      "my-spec",
    );

    const content = await runtime.fs.readTextFile(filePath);
    assert.assert(content.includes('"my-spec"'));
  });

  bdd.it("promoted rule appears in scoped rules", async () => {
    const root = await makeTempDir();
    await createRuleFile(root, "Always validate input", "auth");

    const rules = await syncEngine.loadScopedRules(root);
    assert.assert(rules.some((r) => r.text === "Always validate input"));
  });
});

// =============================================================================
// Auto-detection
// =============================================================================

bdd.describe("rule auto-detection patterns", () => {
  bdd.it("'always' pattern detected as rule-like", () => {
    const looksLikeRule = (text: string): boolean => {
      const lower = text.toLowerCase();
      return lower.includes("always ") || lower.includes("never ") ||
        lower.includes("every time") || lower.includes("must ");
    };

    assert.assert(looksLikeRule("Always use Result types"));
    assert.assert(looksLikeRule("Never throw raw exceptions"));
    assert.assert(looksLikeRule("Must validate all inputs"));
    assert.assert(!looksLikeRule("I assumed the SDK was v2"));
    assert.assert(!looksLikeRule("The tests caught a bug"));
  });
});

// =============================================================================
// Learning still works as before
// =============================================================================

bdd.describe("learning path unchanged", () => {
  bdd.it("without --rule, learning goes to learnings.jsonl", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(root, {
      ts: new Date().toISOString(),
      spec: "test",
      type: "mistake",
      text: "Just a learning, not a rule",
      severity: "medium",
    });

    const all = await learnings.readLearnings(root);
    assert.assertEquals(all.length, 1);
    assert.assertEquals(all[0]!.text, "Just a learning, not a rule");

    // No rule file created
    const rules = await syncEngine.loadScopedRules(root);
    assert.assert(!rules.some((r) => r.text.includes("Just a learning")));
  });
});
