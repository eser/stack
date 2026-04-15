// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests that sync output includes tool-specific interaction guidance.
 *
 * - CLAUDE.md mentions AskUserQuestion
 * - Kiro steering mentions numbered lists
 * - Cursor .cursorrules mentions numbered lists and sequential execution
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

let tempDir: string;

// =============================================================================
// CLAUDE.md mentions AskUserQuestion
// =============================================================================

describe("CLAUDE.md sync includes AskUserQuestion guidance", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("CLAUDE.md contains AskUserQuestion reference", async () => {
    const config = makeConfig(["claude-code"]);
    await engine.syncAll(tempDir, ["claude-code"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert(content.includes("AskUserQuestion"));
  });

  it("CLAUDE.md contains interactive choices section", async () => {
    const config = makeConfig(["claude-code"]);
    await engine.syncAll(tempDir, ["claude-code"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/CLAUDE.md`,
    );
    assert(content.includes("Interactive choices"));
  });
});

// =============================================================================
// Kiro steering mentions numbered lists
// =============================================================================

describe("Kiro steering includes numbered list guidance", () => {
  beforeEach(async () => {
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

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("noskills-protocol.md contains numbered list guidance", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
    );
    assert(content.includes("numbered list"));
  });

  it("noskills-protocol.md does NOT mention AskUserQuestion", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
    );
    assertEquals(content.includes("AskUserQuestion"), false);
  });

  it("noskills-protocol.md contains interactive choices section", async () => {
    const config = makeConfig(["kiro"]);
    await engine.syncAll(tempDir, ["kiro"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.kiro/steering/noskills-protocol.md`,
    );
    assert(content.includes("Interactive choices"));
  });
});

// =============================================================================
// Cursor .cursorrules mentions numbered lists + sequential
// =============================================================================

describe("Cursor .cursorrules includes interaction guidance", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_cursor_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it(".cursorrules contains numbered list guidance", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assert(content.includes("numbered list"));
  });

  it(".cursorrules contains sequential execution guidance", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assert(content.includes("Execute tasks sequentially"));
  });

  it(".cursorrules does NOT mention AskUserQuestion", async () => {
    const config = makeConfig(["cursor"]);
    await engine.syncAll(tempDir, ["cursor"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.cursorrules`,
    );
    assertEquals(content.includes("AskUserQuestion"), false);
  });
});

// =============================================================================
// Copilot and Windsurf also get interaction guidance
// =============================================================================

describe("Copilot and Windsurf include interaction guidance", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "sync_other_int_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/rules`, {
      recursive: true,
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("copilot-instructions.md contains numbered list guidance", async () => {
    const config = makeConfig(["copilot"]);
    await engine.syncAll(tempDir, ["copilot"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.github/copilot-instructions.md`,
    );
    assert(content.includes("numbered list"));
    assert(content.includes("Execute tasks sequentially"));
  });

  it(".windsurfrules contains numbered list guidance", async () => {
    const config = makeConfig(["windsurf"]);
    await engine.syncAll(tempDir, ["windsurf"], config);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.windsurfrules`,
    );
    assert(content.includes("numbered list"));
    assert(content.includes("Execute tasks sequentially"));
  });
});
