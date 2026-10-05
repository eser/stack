// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Integration tests for the sync engine's syncAll function.
 *
 * These tests create real temp directories with the expected directory
 * structure, call syncAll, and verify that all expected files are generated
 * with correct content.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
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

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

let tempDir: string;

// =============================================================================
// Integration: syncAll with Kiro tool
// =============================================================================

bdd.describe("syncAll: Kiro tool integration", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "engine_kiro_",
    });
    // Create .kiro/ so the adapter can write into it
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.kiro`, {
      recursive: true,
    });
    // Create .eser/rules/ with a test rule file
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/.eser/rules/test-rule.md`,
      "Always use strict TypeScript\n",
    );
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("generates noskills-protocol.md with YAML frontmatter", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-protocol.md`;
    assert.assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert.assert(content.startsWith("---\n"));
  });

  bdd.it("generates noskills-coaching.md with YAML frontmatter", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-coaching.md`;
    assert.assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert.assert(content.startsWith("---\n"));
  });

  bdd.it("generates noskills-rules.md containing the test rule", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-rules.md`;
    assert.assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert.assert(content.includes("Always use strict TypeScript"));
  });

  bdd.it("generates hooks/noskills.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/hooks/noskills.json`;
    assert.assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assert.assertEquals(typeof parsed, "object");
  });

  bdd.it("generates noskills-executor.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/agents/noskills-executor.json`;
    assert.assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assert.assertEquals(typeof parsed, "object");
  });

  bdd.it("generates noskills-verifier.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/agents/noskills-verifier.json`;
    assert.assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assert.assertEquals(typeof parsed, "object");
  });

  bdd.it("generates mcp.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/settings/mcp.json`;
    assert.assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assert.assertEquals(typeof parsed, "object");
  });
});

// =============================================================================
// Integration: syncAll with multiple tools
// =============================================================================

bdd.describe("syncAll: multiple tools integration", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "engine_multi_",
    });
    // Create both tool directories so adapters can write
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.kiro`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.claude`, {
      recursive: true,
    });
    // Create .eser/rules/ (empty — no rules)
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("generates both Kiro and Claude Code files", async () => {
    const config = makeConfig(["kiro", "claude-code"]);
    await engine.syncAll(tempDir, ["kiro", "claude-code"], config);

    // Kiro files
    assert.assert(
      await fileExists(`${tempDir}/.kiro/steering/noskills-protocol.md`),
    );
    assert.assert(
      await fileExists(`${tempDir}/.kiro/steering/noskills-coaching.md`),
    );
    assert.assert(await fileExists(`${tempDir}/.kiro/hooks/noskills.json`));
    assert.assert(
      await fileExists(`${tempDir}/.kiro/agents/noskills-executor.json`),
    );
    assert.assert(
      await fileExists(`${tempDir}/.kiro/agents/noskills-verifier.json`),
    );
    assert.assert(await fileExists(`${tempDir}/.kiro/settings/mcp.json`));

    // Claude Code files
    assert.assert(await fileExists(`${tempDir}/CLAUDE.md`));
    const claudeMd = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert.assert(claudeMd.includes("noskills orchestrator"));
  });

  bdd.it(
    "returns synced list including both tools (and hooks marker)",
    async () => {
      const config = makeConfig(["kiro", "claude-code"]);
      const synced = await engine.syncAll(
        tempDir,
        ["kiro", "claude-code"],
        config,
      );

      assert.assert(synced.includes("kiro"));
      assert.assert(synced.includes("claude-code"));
      // Claude Code adds a "hooks" marker for backward compat
      assert.assert(synced.includes("hooks"));
    },
  );
});

// =============================================================================
// Integration: syncAll returns correct synced list
// =============================================================================

bdd.describe("syncAll: return value", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "engine_ret_",
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

  bdd.it("includes 'kiro' in the synced list", async () => {
    const config = makeConfig(["kiro"]);
    const synced = await engine.syncAll(tempDir, ["kiro"], config);

    assert.assert(synced.includes("kiro"));
  });

  bdd.it("does not include tools that were not requested", async () => {
    const config = makeConfig(["kiro"]);
    const synced = await engine.syncAll(tempDir, ["kiro"], config);

    assert.assertEquals(synced.includes("claude-code"), false);
    assert.assertEquals(synced.includes("cursor"), false);
  });
});

// =============================================================================
// Integration: idempotency
// =============================================================================

bdd.describe("syncAll: idempotency", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "engine_idem_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.kiro`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/.eser/rules/idem-rule.md`,
      "Idempotency test rule\n",
    );
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("produces identical files when run twice", async () => {
    const config = makeConfig(["kiro"]);

    // First run
    await engine.syncAll(tempDir, ["kiro"], config);

    const filesToCheck = [
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
      `${tempDir}/.kiro/steering/noskills-coaching.md`,
      `${tempDir}/.kiro/steering/noskills-rules.md`,
      `${tempDir}/.kiro/hooks/noskills.json`,
      `${tempDir}/.kiro/agents/noskills-executor.json`,
      `${tempDir}/.kiro/agents/noskills-verifier.json`,
      `${tempDir}/.kiro/settings/mcp.json`,
    ];

    const readAll = (): Promise<string[]> =>
      Promise.all(
        filesToCheck.map((path) => crossRuntime.runtime.fs.readTextFile(path)),
      );

    const firstRunContents = await readAll();

    // Second run
    await engine.syncAll(tempDir, ["kiro"], config);

    const secondRunContents = await readAll();

    // Compare
    for (let i = 0; i < filesToCheck.length; i++) {
      assert.assertEquals(
        firstRunContents[i],
        secondRunContents[i],
        `Content mismatch for ${filesToCheck[i]}`,
      );
    }
  });
});

bdd.describe("toolsWithHooks", () => {
  bdd.it("keeps the tools whose adapter writes noskills hooks", () => {
    assert.assertEquals(
      engine.toolsWithHooks([
        "cursor",
        "claude-code",
        "windsurf",
        "kiro",
        "copilot",
        "opencode",
        "codex",
        "copilot-cli",
      ]),
      ["claude-code", "kiro", "opencode", "codex", "copilot-cli"],
    );
  });
});
