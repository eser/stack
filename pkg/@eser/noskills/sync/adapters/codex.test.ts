// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Snapshot tests and structure validation tests for the Codex CLI adapter's
 * generated files.
 *
 * These tests call the real adapter methods with a temp directory and then
 * read the generated files to validate content and structure.
 *
 * @module
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
import * as codexAdapterMod from "./codex.ts";

// =============================================================================
// Helpers
// =============================================================================

const CMD_PREFIX = "npx eser@latest noskills";

const makeCtx = (root: string, rules: string[] = []) => ({
  root,
  rules,
  commandPrefix: CMD_PREFIX,
});

let tempDir: string;

// =============================================================================
// Snapshot tests — generated file content
// =============================================================================

describe("Codex adapter: snapshot tests", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "codex_snap_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — AGENTS.md
  // ---------------------------------------------------------------------------

  describe("syncRules: AGENTS.md", () => {
    it("contains noskills:start and noskills:end markers", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "<!-- noskills:start -->");
      assertStringIncludes(content, "<!-- noskills:end -->");
    });

    it("contains 'noskills Protocol' heading and protocol commands with CMD_PREFIX", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "## noskills Protocol");
      assertStringIncludes(content, `${CMD_PREFIX} next --spec=`);
      assertStringIncludes(content, `--answer=`);
    });

    it("includes git-read-only section when allowGit is not set", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Git is read-only");
    });

    it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx, {
        allowGit: true,
      });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertEquals(content.includes("Git is read-only"), false);
    });

    it("preserves existing content outside noskills markers when AGENTS.md already exists", async () => {
      // Pre-create AGENTS.md with user content and markers
      const existingContent = [
        "# My Project Agents",
        "",
        "Some custom instructions here.",
        "",
        "<!-- noskills:start -->",
        "old noskills content",
        "<!-- noskills:end -->",
        "",
        "More user content below.",
        "",
      ].join("\n");

      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/AGENTS.md`,
        existingContent,
      );

      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      // User content before and after markers should be preserved
      assertStringIncludes(content, "# My Project Agents");
      assertStringIncludes(content, "Some custom instructions here.");
      assertStringIncludes(content, "More user content below.");

      // Old noskills content should be replaced
      assertEquals(content.includes("old noskills content"), false);

      // New noskills content should be present
      assertStringIncludes(content, "## noskills Protocol");
    });

    it("contains convention discovery coaching content", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Convention discovery");
      assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });

    it("contains rules when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "### Active Rules");
      assertStringIncludes(content, "- Test rule 1");
      assertStringIncludes(content, "- Test rule 2");
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .codex/hooks.json
  // ---------------------------------------------------------------------------

  describe("syncHooks: .codex/hooks.json", () => {
    it("creates file in correct path", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.codex/hooks.json`,
      );
      assert(stat.isFile);
    });

    it("contains hooks array with _noskills: true markers", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      assert(Array.isArray(parsed.hooks));
      assert(parsed.hooks.length > 0);

      for (const hook of parsed.hooks) {
        assertEquals(hook._noskills, true);
      }
    });

    it("contains PascalCase events: SessionStart, PreToolUse, PostToolUse, Stop", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      const events = parsed.hooks.map(
        (h: { event: string }) => h.event,
      );
      assert(events.includes("SessionStart"));
      assert(events.includes("PreToolUse"));
      assert(events.includes("PostToolUse"));
      assert(events.includes("Stop"));
    });

    it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      for (const hook of parsed.hooks) {
        assertStringIncludes(hook.command, "custom-cli noskills invoke-hook");
      }
      assertEquals(raw.includes(CMD_PREFIX), false);
    });

    it("preserves non-noskills hooks during merge", async () => {
      // Pre-create hooks.json with a user hook
      const existing = {
        hooks: [
          {
            event: "SessionStart",
            command: "echo user-hook",
            timeout: 1000,
          },
        ],
      };

      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.codex`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.codex/hooks.json`,
        JSON.stringify(existing, null, 2),
      );

      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      // User hook should still be present
      const userHook = parsed.hooks.find(
        (h: { command: string }) => h.command === "echo user-hook",
      );
      assert(userHook !== undefined);

      // noskills hooks should also be present
      const noskillsHooks = parsed.hooks.filter(
        (h: { _noskills?: boolean }) => h._noskills === true,
      );
      assert(noskillsHooks.length >= 4);
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .codex/agents/ (TOML files)
  // ---------------------------------------------------------------------------

  describe("syncAgents: .codex/agents/", () => {
    it("noskills-executor.toml has name = and description = fields", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-executor.toml`,
      );

      assertStringIncludes(content, 'name = "noskills-executor"');
      assertStringIncludes(content, 'description = "');
    });

    it("noskills-executor.toml has developer_instructions with triple-quoted block", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-executor.toml`,
      );

      assertStringIncludes(content, 'developer_instructions = """');
      // Closing triple-quote
      assert(content.includes('"""'));
      // Should contain task execution instructions
      assertStringIncludes(content, "Self-Verification");
      assertStringIncludes(content, "Reporting");
    });

    it("noskills-executor.toml references commandPrefix in instructions", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-executor.toml`,
      );

      assertStringIncludes(content, CMD_PREFIX);
    });

    it("noskills-verifier.toml has name = and description = fields", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-verifier.toml`,
      );

      assertStringIncludes(content, 'name = "noskills-verifier"');
      assertStringIncludes(content, 'description = "');
    });

    it("noskills-verifier.toml has developer_instructions for verification", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-verifier.toml`,
      );

      assertStringIncludes(content, 'developer_instructions = """');
      assertStringIncludes(content, "Read-only access only");
      assertStringIncludes(content, "Verification Steps");
      assertStringIncludes(content, "PASS");
      assertStringIncludes(content, "FAIL");
    });

    it("noskills-verifier.toml does NOT contain write or spawn references", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-verifier.toml`,
      );

      assertStringIncludes(content, "CANNOT edit files");
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — .codex/config.toml
  // ---------------------------------------------------------------------------

  describe("syncMcp: .codex/config.toml", () => {
    it("contains [mcp_servers.noskills] section", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assertStringIncludes(content, "[mcp_servers.noskills]");
    });

    it("contains command = and args = fields", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assertStringIncludes(content, "command =");
      assertStringIncludes(content, "args =");
    });

    it("args include mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assertStringIncludes(content, "mcp-serve");
    });

    it("preserves existing config content", async () => {
      // Pre-create config.toml with user content
      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.codex`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.codex/config.toml`,
        '[model]\nprovider = "openai"\nmodel = "o3"\n',
      );

      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      // User config preserved
      assertStringIncludes(content, "[model]");
      assertStringIncludes(content, 'provider = "openai"');

      // noskills MCP section added
      assertStringIncludes(content, "[mcp_servers.noskills]");
    });
  });
});

// =============================================================================
// Structure validation tests
// =============================================================================

describe("Codex adapter: structure validation", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "codex_struct_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  describe("hooks.json is valid JSON", () => {
    it("parses without error and has hooks array", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/hooks.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
      assert(Array.isArray(parsed.hooks));
    });
  });

  // ---------------------------------------------------------------------------
  // Agent TOML files have correct structure
  // ---------------------------------------------------------------------------

  describe("agent .toml files have correct structure", () => {
    it("executor agent has name, description, developer_instructions keys", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-executor.toml`,
      );

      assert(/^name\s*=/.test(content));
      assert(/^description\s*=/m.test(content));
      assert(/^developer_instructions\s*=/m.test(content));
    });

    it("verifier agent has name, description, developer_instructions keys", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/agents/noskills-verifier.toml`,
      );

      assert(/^name\s*=/.test(content));
      assert(/^description\s*=/m.test(content));
      assert(/^developer_instructions\s*=/m.test(content));
    });
  });

  // ---------------------------------------------------------------------------
  // TOML config has correct section headers
  // ---------------------------------------------------------------------------

  describe("TOML config has correct section headers", () => {
    it("has [mcp_servers.noskills] section header and key=value pairs", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      // Valid TOML section header
      assert(content.includes("[mcp_servers.noskills]"));

      // Key=value pairs follow the section
      const lines = content.split("\n");
      const sectionIdx = lines.findIndex((l) =>
        l.includes("[mcp_servers.noskills]")
      );
      assert(sectionIdx !== -1);

      // Lines after the section header should contain key = value
      const afterSection = lines.slice(sectionIdx + 1).join("\n");
      assert(/command\s*=/.test(afterSection));
      assert(/args\s*=/.test(afterSection));
    });
  });
});

// =============================================================================
// Capability tests
// =============================================================================

describe("Codex adapter: capability tests", () => {
  it("id is 'codex'", () => {
    assertEquals(codexAdapterMod.codexAdapter.id, "codex");
  });

  it("capabilities object matches expected values", () => {
    const caps = codexAdapterMod.codexAdapter.capabilities;

    assertEquals(caps.rules, true);
    assertEquals(caps.hooks, true);
    assertEquals(caps.agents, true);
    assertEquals(caps.specs, false);
    assertEquals(caps.mcp, true);
  });

  it("interaction.subAgentMethod is 'delegation'", () => {
    assertEquals(
      codexAdapterMod.codexAdapter.capabilities.interaction.subAgentMethod,
      "delegation",
    );
  });

  it("interaction.optionPresentation is 'prose'", () => {
    assertEquals(
      codexAdapterMod.codexAdapter.capabilities.interaction.optionPresentation,
      "prose",
    );
  });
});
