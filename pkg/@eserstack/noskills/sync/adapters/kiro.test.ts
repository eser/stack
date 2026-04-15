// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tasks 9 & 10: Snapshot tests and structure validation tests for the Kiro
 * adapter's generated files.
 *
 * These tests call the real adapter methods with a temp directory and then
 * read the generated files to validate content and structure.
 *
 * @module
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as kiroAdapterMod from "./kiro.ts";

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
// Task 9: Snapshot tests — generated file content
// =============================================================================

describe("Kiro adapter: snapshot tests", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "kiro_snap_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — protocol file
  // ---------------------------------------------------------------------------

  describe("syncRules: noskills-protocol.md", () => {
    it("contains YAML frontmatter with inclusion: always", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "inclusion: always");
    });

    it("contains 'noskills Protocol' heading and protocol commands", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assertStringIncludes(content, "# noskills Protocol");
      assertStringIncludes(content, `${CMD_PREFIX} spec`);
      assertStringIncludes(content, `--answer=`);
    });

    it("includes git-read-only section when allowGit is not set", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assertStringIncludes(content, "Git is read-only");
    });

    it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx, { allowGit: true });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assertEquals(content.includes("Git is read-only"), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncRules — coaching file
  // ---------------------------------------------------------------------------

  describe("syncRules: noskills-coaching.md", () => {
    it("contains YAML frontmatter with inclusion: auto and name: noskills-coaching", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-coaching.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "inclusion: auto");
      assertStringIncludes(content, "name: noskills-coaching");
    });

    it("contains coaching content about convention discovery", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-coaching.md`,
      );

      assertStringIncludes(content, "Convention discovery");
      assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });
  });

  // ---------------------------------------------------------------------------
  // syncRules — rules file conditional generation
  // ---------------------------------------------------------------------------

  describe("syncRules: noskills-rules.md", () => {
    it("is NOT created when rules are empty", async () => {
      const ctx = makeCtx(tempDir, []);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      let exists = true;
      try {
        await crossRuntime.runtime.fs.stat(
          `${tempDir}/.kiro/steering/noskills-rules.md`,
        );
      } catch {
        exists = false;
      }
      assertEquals(exists, false);
    });

    it("IS created when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-rules.md`,
      );

      assertStringIncludes(content, "inclusion: always");
      assertStringIncludes(content, "- Test rule 1");
      assertStringIncludes(content, "- Test rule 2");
    });

    it("removes stale rules file when rules become empty", async () => {
      // First write with rules
      const ctxWithRules = makeCtx(tempDir, ["Existing rule"]);
      await kiroAdapterMod.kiroAdapter.syncRules(ctxWithRules);

      // Verify it exists
      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-rules.md`,
      );
      assertStringIncludes(content, "Existing rule");

      // Now sync with empty rules
      const ctxNoRules = makeCtx(tempDir, []);
      await kiroAdapterMod.kiroAdapter.syncRules(ctxNoRules);

      let exists = true;
      try {
        await crossRuntime.runtime.fs.stat(
          `${tempDir}/.kiro/steering/noskills-rules.md`,
        );
      } catch {
        exists = false;
      }
      assertEquals(exists, false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — hooks.json
  // ---------------------------------------------------------------------------

  describe("syncHooks: hooks.json", () => {
    it("contains hooks array with _noskills: true markers", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      assert(Array.isArray(parsed.hooks));
      assert(parsed.hooks.length > 0);

      for (const hook of parsed.hooks) {
        assertEquals(hook._noskills, true);
      }
    });

    it("contains 'Pre Tool Use' and 'Agent Stop' triggers", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      const triggers = parsed.hooks.map(
        (h: { trigger: string }) => h.trigger,
      );
      assert(triggers.includes("Pre Tool Use"));
      assert(triggers.includes("Agent Stop"));
    });

    it("contains 'Prompt Submit' and 'Post Tool Use' triggers", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      const triggers = parsed.hooks.map(
        (h: { trigger: string }) => h.trigger,
      );
      assert(triggers.includes("Prompt Submit"));
      assert(triggers.includes("Post Tool Use"));
    });

    it("preserves non-noskills hooks during merge", async () => {
      const ctx = makeCtx(tempDir);

      // Pre-create a hooks.json with a user hook
      const settingsDir = `${tempDir}/.kiro/settings`;
      await crossRuntime.runtime.fs.mkdir(settingsDir, { recursive: true });
      await crossRuntime.runtime.fs.writeTextFile(
        `${settingsDir}/hooks.json`,
        JSON.stringify({
          hooks: [
            {
              trigger: "Custom User Hook",
              action: { type: "Run Command", command: "echo hello" },
              timeout: 1000,
            },
          ],
        }),
      );

      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${settingsDir}/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      // User hook should still be there
      const userHook = parsed.hooks.find(
        (h: { trigger: string }) => h.trigger === "Custom User Hook",
      );
      assert(userHook !== undefined);

      // noskills hooks should also be present
      const noskillsHooks = parsed.hooks.filter(
        (h: { _noskills?: boolean }) => h._noskills === true,
      );
      assert(noskillsHooks.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — agent JSON files
  // ---------------------------------------------------------------------------

  describe("syncAgents: noskills-executor.json", () => {
    it("has correct tools list including 'delegate'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assert(parsed.tools.includes("delegate"));
      assert(parsed.tools.includes("read"));
      assert(parsed.tools.includes("write"));
      assert(parsed.tools.includes("shell"));
    });

    it("has name 'noskills-executor'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(parsed.name, "noskills-executor");
    });
  });

  describe("syncAgents: noskills-verifier.json", () => {
    it("has 'use_subagent' in tools", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assert(parsed.tools.includes("use_subagent"));
    });

    it("has name 'noskills-verifier'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(parsed.name, "noskills-verifier");
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — mcp.json
  // ---------------------------------------------------------------------------

  describe("syncMcp: mcp.json", () => {
    it("has 'noskills' server entry with 'command' field", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      assert(parsed.mcpServers !== undefined);
      assert(parsed.mcpServers.noskills !== undefined);
      assertEquals(typeof parsed.mcpServers.noskills.command, "string");
      assert(parsed.mcpServers.noskills.command.length > 0);
    });

    it("has args array ending with 'mcp-serve'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      const args = parsed.mcpServers.noskills.args;
      assert(Array.isArray(args));
      assertEquals(args[args.length - 1], "mcp-serve");
    });

    it("preserves existing non-noskills MCP servers", async () => {
      const ctx = makeCtx(tempDir);

      // Pre-create mcp.json with a user server
      const settingsDir = `${tempDir}/.kiro/settings`;
      await crossRuntime.runtime.fs.mkdir(settingsDir, { recursive: true });
      await crossRuntime.runtime.fs.writeTextFile(
        `${settingsDir}/mcp.json`,
        JSON.stringify({
          mcpServers: {
            "my-custom-server": {
              command: "node",
              args: ["server.js"],
              env: {},
              autoApprove: [],
              disabled: false,
            },
          },
        }),
      );

      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${settingsDir}/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      // User server preserved
      assert(parsed.mcpServers["my-custom-server"] !== undefined);
      // noskills server added
      assert(parsed.mcpServers.noskills !== undefined);
    });
  });
});

// =============================================================================
// Task 10: Structure validation tests
// =============================================================================

describe("Kiro adapter: structure validation", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "kiro_struct_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  describe("all JSON files parse without error", () => {
    it("hooks.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/hooks.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
    });

    it("noskills-executor.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
    });

    it("noskills-verifier.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
    });

    it("mcp.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
    });
  });

  // ---------------------------------------------------------------------------
  // YAML frontmatter validation
  // ---------------------------------------------------------------------------

  describe("YAML frontmatter in steering files", () => {
    it("protocol file starts with --- and has inclusion: field", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert(frontmatterEnd > 0);
      const frontmatter = content.slice(4, frontmatterEnd);
      assertStringIncludes(frontmatter, "inclusion:");
    });

    it("coaching file starts with --- and has inclusion: field", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-coaching.md`,
      );

      assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert(frontmatterEnd > 0);
      const frontmatter = content.slice(4, frontmatterEnd);
      assertStringIncludes(frontmatter, "inclusion:");
    });

    it("rules file starts with --- and has inclusion: field when rules exist", async () => {
      const ctx = makeCtx(tempDir, ["A rule"]);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-rules.md`,
      );

      assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert(frontmatterEnd > 0);
      const frontmatter = content.slice(4, frontmatterEnd);
      assertStringIncludes(frontmatter, "inclusion:");
    });
  });

  // ---------------------------------------------------------------------------
  // Agent JSON required fields
  // ---------------------------------------------------------------------------

  describe("agent JSON has required fields", () => {
    it("executor agent has name, description, tools, prompt", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(typeof parsed.name, "string");
      assertEquals(typeof parsed.description, "string");
      assert(Array.isArray(parsed.tools));
      assertEquals(typeof parsed.prompt, "string");
      assert(parsed.name.length > 0);
      assert(parsed.description.length > 0);
      assert(parsed.tools.length > 0);
      assert(parsed.prompt.length > 0);
    });

    it("verifier agent has name, description, tools, prompt", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(typeof parsed.name, "string");
      assertEquals(typeof parsed.description, "string");
      assert(Array.isArray(parsed.tools));
      assertEquals(typeof parsed.prompt, "string");
      assert(parsed.name.length > 0);
      assert(parsed.description.length > 0);
      assert(parsed.tools.length > 0);
      assert(parsed.prompt.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // MCP JSON structure
  // ---------------------------------------------------------------------------

  describe("MCP JSON structure", () => {
    it("has mcpServers object with server entries having command + args", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(typeof parsed.mcpServers, "object");
      assert(parsed.mcpServers !== null);

      for (const [_key, server] of Object.entries(parsed.mcpServers)) {
        const srv = server as { command: string; args: string[] };
        assertEquals(typeof srv.command, "string");
        assert(Array.isArray(srv.args));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Hooks JSON structure
  // ---------------------------------------------------------------------------

  describe("Hooks JSON structure", () => {
    it("has hooks array where each entry has trigger + action fields", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/hooks.json`,
      );
      const parsed = JSON.parse(raw);

      assert(Array.isArray(parsed.hooks));

      for (const hook of parsed.hooks) {
        assertEquals(typeof hook.trigger, "string");
        assert(hook.trigger.length > 0);
        assertEquals(typeof hook.action, "object");
        assert(hook.action !== null);
        assertEquals(typeof hook.action.type, "string");
        assertEquals(typeof hook.action.command, "string");
      }
    });
  });
});
