// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests that sync output includes tool-specific interaction guidance.
 *
 * - CLAUDE.md mentions AskUserQuestion
 * - Kiro steering mentions numbered lists
 * - Cursor .cursorrules mentions numbered lists and sequential execution
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as engine from "./engine.ts";

// =============================================================================
// Helpers
// =============================================================================

const makeConfig = (tools: readonly string[]) => ({
  concerns: [] as readonly string[],
  tools: tools as readonly (
    | "kiro"
    | "claude-code"
    | "cursor"
    | "copilot"
    | "windsurf"
  )[],
  providers: [] as readonly string[],
  project: {
    languages: ["typescript"] as readonly string[],
    frameworks: [] as readonly string[],
    ci: [] as readonly string[],
    testRunner: "deno" as string | null,
  },
  maxIterationsBeforeRestart: 15,
  verifyCommand: null as string | null,
  allowGit: false,
  command: "npx eser@latest noskills",
});

let tempDir: string;

// =============================================================================
// CLAUDE.md mentions AskUserQuestion
// =============================================================================

bdd.describe("CLAUDE.md sync includes AskUserQuestion guidance", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_claude_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.claude`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("CLAUDE.md contains AskUserQuestion reference", async () => {
    const config = makeConfig(["claude-code"]);
    await engine.syncAll(tempDir, ["claude-code"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert.assert(content.includes("AskUserQuestion"));
  });

  bdd.it("CLAUDE.md contains interactive choices section", async () => {
    const config = makeConfig(["claude-code"]);
    await engine.syncAll(tempDir, ["claude-code"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert.assert(content.includes("Interactive choices"));
  });
});

// =============================================================================
// Kiro steering mentions numbered lists
// =============================================================================

bdd.describe("Kiro steering includes numbered list guidance", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_kiro_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.kiro`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("noskills-protocol.md contains numbered list guidance", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
    );
    assert.assert(content.includes("numbered list"));
  });

  bdd.it("noskills-protocol.md does NOT mention AskUserQuestion", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
    );
    assert.assertEquals(content.includes("AskUserQuestion"), false);
  });

  bdd.it(
    "noskills-protocol.md contains interactive choices section",
    async () => {
      const config = makeConfig(["kiro"]);
      await engine.syncAll(tempDir, ["kiro"], config);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );
      assert.assert(content.includes("Interactive choices"));
    },
  );
});

// =============================================================================
// Cursor .cursorrules mentions numbered lists + sequential
// =============================================================================

bdd.describe("Cursor .cursorrules includes interaction guidance", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_cursor_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(".cursorrules contains numbered list guidance", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assert.assert(content.includes("numbered list"));
  });

  bdd.it(".cursorrules contains sequential execution guidance", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assert.assert(content.includes("Execute tasks sequentially"));
  });

  bdd.it(".cursorrules does NOT mention AskUserQuestion", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assert.assertEquals(content.includes("AskUserQuestion"), false);
  });
});

// =============================================================================
// Copilot and Windsurf also get interaction guidance
// =============================================================================

bdd.describe("Copilot and Windsurf include interaction guidance", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_other_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(
    "copilot-instructions.md contains numbered list guidance",
    async () => {
      const config = makeConfig(["copilot"]);
      await engine.syncAll(tempDir, ["copilot"], config);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/copilot-instructions.md`,
      );
      assert.assert(content.includes("numbered list"));
      assert.assert(content.includes("Execute tasks sequentially"));
    },
  );

  bdd.it(".windsurfrules contains numbered list guidance", async () => {
    const config = makeConfig(["windsurf"]);
    await engine.syncAll(tempDir, ["windsurf"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.windsurfrules`,
    );
    assert.assert(content.includes("numbered list"));
    assert.assert(content.includes("Execute tasks sequentially"));
  });
});
