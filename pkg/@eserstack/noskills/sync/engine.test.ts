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

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
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

describe("syncAll: Kiro tool integration", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("generates noskills-protocol.md with YAML frontmatter", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-protocol.md`;
    assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert(content.startsWith("---\n"));
  });

  it("generates noskills-coaching.md with YAML frontmatter", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-coaching.md`;
    assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert(content.startsWith("---\n"));
  });

  it("generates noskills-rules.md containing the test rule", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/steering/noskills-rules.md`;
    assert(await fileExists(path));
    const content = await crossRuntime.runtime.fs.readTextFile(path);
    assert(content.includes("Always use strict TypeScript"));
  });

  it("generates hooks.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/settings/hooks.json`;
    assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assertEquals(typeof parsed, "object");
  });

  it("generates noskills-executor.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/agents/noskills-executor.json`;
    assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assertEquals(typeof parsed, "object");
  });

  it("generates noskills-verifier.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/agents/noskills-verifier.json`;
    assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assertEquals(typeof parsed, "object");
  });

  it("generates mcp.json as valid JSON", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const path = `${tempDir}/.kiro/settings/mcp.json`;
    assert(await fileExists(path));
    const raw = await crossRuntime.runtime.fs.readTextFile(path);
    const parsed = JSON.parse(raw);
    assertEquals(typeof parsed, "object");
  });
});

// =============================================================================
// Integration: syncAll with multiple tools
// =============================================================================

describe("syncAll: multiple tools integration", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("generates both Kiro and Claude Code files", async () => {
    const config = makeConfig(["kiro", "claude-code"]);
    await engine.syncAll(tempDir, ["kiro", "claude-code"], config);

    // Kiro files
    assert(
      await fileExists(`${tempDir}/.kiro/steering/noskills-protocol.md`),
    );
    assert(
      await fileExists(`${tempDir}/.kiro/steering/noskills-coaching.md`),
    );
    assert(await fileExists(`${tempDir}/.kiro/settings/hooks.json`));
    assert(await fileExists(`${tempDir}/.kiro/agents/noskills-executor.json`));
    assert(
      await fileExists(`${tempDir}/.kiro/agents/noskills-verifier.json`),
    );
    assert(await fileExists(`${tempDir}/.kiro/settings/mcp.json`));

    // Claude Code files
    assert(await fileExists(`${tempDir}/CLAUDE.md`));
    const claudeMd = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert(claudeMd.includes("noskills orchestrator"));
  });

  it("returns synced list including both tools (and hooks marker)", async () => {
    const config = makeConfig(["kiro", "claude-code"]);
    const synced = await engine.syncAll(
      tempDir,
      ["kiro", "claude-code"],
      config,
    );

    assert(synced.includes("kiro"));
    assert(synced.includes("claude-code"));
    // Claude Code adds a "hooks" marker for backward compat
    assert(synced.includes("hooks"));
  });
});

// =============================================================================
// Integration: syncAll returns correct synced list
// =============================================================================

describe("syncAll: return value", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("includes 'kiro' in the synced list", async () => {
    const config = makeConfig(["kiro"]);
    const synced = await engine.syncAll(tempDir, ["kiro"], config);

    assert(synced.includes("kiro"));
  });

  it("does not include tools that were not requested", async () => {
    const config = makeConfig(["kiro"]);
    const synced = await engine.syncAll(tempDir, ["kiro"], config);

    assertEquals(synced.includes("claude-code"), false);
    assertEquals(synced.includes("cursor"), false);
  });
});

// =============================================================================
// Integration: idempotency
// =============================================================================

describe("syncAll: idempotency", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("produces identical files when run twice", async () => {
    const config = makeConfig(["kiro"]);

    // First run
    await engine.syncAll(tempDir, ["kiro"], config);

    const filesToCheck = [
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
      `${tempDir}/.kiro/steering/noskills-coaching.md`,
      `${tempDir}/.kiro/steering/noskills-rules.md`,
      `${tempDir}/.kiro/settings/hooks.json`,
      `${tempDir}/.kiro/agents/noskills-executor.json`,
      `${tempDir}/.kiro/agents/noskills-verifier.json`,
      `${tempDir}/.kiro/settings/mcp.json`,
    ];

    const firstRunContents: string[] = [];
    for (const path of filesToCheck) {
      firstRunContents.push(await crossRuntime.runtime.fs.readTextFile(path));
    }

    // Second run
    await engine.syncAll(tempDir, ["kiro"], config);

    const secondRunContents: string[] = [];
    for (const path of filesToCheck) {
      secondRunContents.push(await crossRuntime.runtime.fs.readTextFile(path));
    }

    // Compare
    for (let i = 0; i < filesToCheck.length; i++) {
      assertEquals(
        firstRunContents[i],
        secondRunContents[i],
        `Content mismatch for ${filesToCheck[i]}`,
      );
    }
  });
});
