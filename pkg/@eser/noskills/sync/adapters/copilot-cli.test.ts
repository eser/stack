// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Snapshot tests and structure validation tests for the Copilot CLI adapter's
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
import * as copilotCliAdapterMod from "./copilot-cli.ts";
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

describe("Copilot CLI adapter: snapshot tests", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "copilot_cli_snap_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — AGENTS.md + copilot-instructions.md
  // ---------------------------------------------------------------------------

  describe("syncRules: AGENTS.md + copilot-instructions.md", () => {
    it("AGENTS.md has noskills markers", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "<!-- noskills:start -->");
      assertStringIncludes(content, "<!-- noskills:end -->");
    });

    it(".github/copilot-instructions.md is also generated", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.github/copilot-instructions.md`,
      );
      assert(stat.isFile);
    });

    it("both files contain noskills protocol content", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const agentsMd = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );
      const copilotMd = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/copilot-instructions.md`,
      );

      // AGENTS.md has noskills Protocol section
      assertStringIncludes(agentsMd, "## noskills Protocol");
      assertStringIncludes(agentsMd, `${CMD_PREFIX} spec`);

      // copilot-instructions.md has noskills orchestrator section
      assertStringIncludes(copilotMd, "noskills");
      assertStringIncludes(copilotMd, CMD_PREFIX);
    });

    it("includes git-read-only section when allowGit is not set", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Git is read-only");
    });

    it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx, {
        allowGit: true,
      });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertEquals(content.includes("Git is read-only"), false);
    });

    it("preserves existing content outside noskills markers", async () => {
      const existingContent = [
        "# My Project Agents",
        "",
        "Custom instructions.",
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
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "# My Project Agents");
      assertStringIncludes(content, "Custom instructions.");
      assertStringIncludes(content, "More user content below.");
      assertEquals(content.includes("old noskills content"), false);
      assertStringIncludes(content, "## noskills Protocol");
    });

    it("contains coaching content about convention discovery", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Convention discovery");
      assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .github/hooks/noskills.json
  // ---------------------------------------------------------------------------

  describe("syncHooks: .github/hooks/noskills.json", () => {
    it("creates file at correct path", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      assert(stat.isFile);
    });

    it("has version: 1 field and hooks as object (not array)", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(parsed.version, 1);
      assertEquals(typeof parsed.hooks, "object");
      assert(!Array.isArray(parsed.hooks));
    });

    it("hooks have _noskills: true markers", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      for (const hook of Object.values(parsed.hooks)) {
        assertEquals((hook as { _noskills: boolean })._noskills, true);
      }
    });

    it("contains noskills:sessionStart, noskills:preToolUse, noskills:postToolUse, noskills:agentStop keys", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      const keys = Object.keys(parsed.hooks);
      assert(keys.includes("noskills:sessionStart"));
      assert(keys.includes("noskills:preToolUse"));
      assert(keys.includes("noskills:postToolUse"));
      assert(keys.includes("noskills:agentStop"));
    });

    it("hook command is an array ['bash', '-c', '...'] and uses timeoutSec", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      for (
        const hook of Object.values(parsed.hooks) as Array<{
          command: string[];
          timeoutSec: number;
        }>
      ) {
        assert(Array.isArray(hook.command));
        assertEquals(hook.command[0], "bash");
        assertEquals(hook.command[1], "-c");
        assertEquals(typeof hook.timeoutSec, "number");
      }
    });

    it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      for (
        const hook of Object.values(parsed.hooks) as Array<{
          command: string[];
        }>
      ) {
        assertStringIncludes(
          hook.command[2]!,
          "custom-cli noskills invoke-hook",
        );
      }
      assertEquals(raw.includes(CMD_PREFIX), false);
    });

    it("preserves non-noskills hooks during merge", async () => {
      // Pre-create noskills.json with a user hook (object format)
      const existing = {
        version: 1,
        hooks: {
          "myapp:onDeploy": {
            command: ["bash", "-c", "echo user-hook"],
            timeoutSec: 10,
          },
        },
      };

      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.github/hooks`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
        JSON.stringify(existing, null, 2),
      );

      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      // User hook should still be present
      assert(parsed.hooks["myapp:onDeploy"] !== undefined);
      assertEquals(
        parsed.hooks["myapp:onDeploy"].command[2],
        "echo user-hook",
      );

      // noskills hooks should also be present
      const noskillsKeys = Object.keys(parsed.hooks).filter((k) =>
        k.startsWith("noskills:")
      );
      assert(noskillsKeys.length >= 4);
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .github/agents/ (.agent.md with YAML list tools)
  // ---------------------------------------------------------------------------

  describe("syncAgents: .github/agents/", () => {
    it("noskills-executor.agent.md exists with correct frontmatter", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-executor.agent.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "name: noskills-executor");
    });

    it("noskills-executor.agent.md has tools as YAML list format", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-executor.agent.md`,
      );

      // Tools should be in YAML list format (each on its own line with "  - ")
      assertStringIncludes(content, "tools:");
      assertStringIncludes(content, "  - read");
      assertStringIncludes(content, "  - write");
      assertStringIncludes(content, "  - shell");
    });

    it("noskills-verifier.agent.md exists with read-only tools", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-verifier.agent.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "name: noskills-verifier");
      assertStringIncludes(content, "tools:");
      assertStringIncludes(content, "  - read");
      assertStringIncludes(content, "  - shell");

      // Should NOT have write tool
      assertEquals(content.includes("  - write"), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — .copilot/mcp.json
  // ---------------------------------------------------------------------------

  describe("syncMcp: .copilot/mcp.json", () => {
    it("has mcpServers.noskills entry", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      assert(parsed.mcpServers !== undefined);
      assert(parsed.mcpServers.noskills !== undefined);
    });

    it("has type: 'local', command, args, and tools: ['*'] fields", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      const entry = parsed.mcpServers.noskills;
      assertEquals(entry.type, "local");
      assertEquals(typeof entry.command, "string");
      assert(entry.command.length > 0);
      assert(Array.isArray(entry.args));
      assert(Array.isArray(entry.tools));
      assert(entry.tools.includes("*"));
    });

    it("args include mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      const args: string[] = parsed.mcpServers.noskills.args;
      assert(args.includes("mcp-serve"));
    });

    it("preserves existing MCP config", async () => {
      // Pre-create mcp.json with a user server
      const existing = {
        mcpServers: {
          "my-server": {
            type: "local",
            command: "node",
            args: ["server.js"],
          },
        },
      };

      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.copilot`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.copilot/mcp.json`,
        JSON.stringify(existing, null, 2),
      );

      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      // User server preserved
      assert(parsed.mcpServers["my-server"] !== undefined);
      assertEquals(parsed.mcpServers["my-server"].command, "node");

      // noskills server added
      assert(parsed.mcpServers.noskills !== undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // AGENTS.md deduplication test
  // ---------------------------------------------------------------------------

  describe("AGENTS.md deduplication", () => {
    it("when both codex and copilot-cli sync rules, AGENTS.md has ONE noskills section (not two)", async () => {
      const ctx = makeCtx(tempDir);

      // First: codex adapter writes AGENTS.md
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      // Second: copilot-cli adapter writes AGENTS.md (should replace, not duplicate)
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      // Count noskills:start markers — should be exactly one
      const startMarkers = content.split("<!-- noskills:start -->").length - 1;
      assertEquals(startMarkers, 1);

      // Count noskills:end markers — should be exactly one
      const endMarkers = content.split("<!-- noskills:end -->").length - 1;
      assertEquals(endMarkers, 1);
    });
  });
});

// =============================================================================
// Structure validation tests
// =============================================================================

describe("Copilot CLI adapter: structure validation", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "copilot_cli_struct_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  describe("hooks JSON is valid", () => {
    it("noskills.json parses without error and has hooks object", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
      assertEquals(typeof parsed.hooks, "object");
      assert(!Array.isArray(parsed.hooks));
    });
  });

  describe("MCP JSON is valid", () => {
    it("mcp.json parses without error and has mcpServers object", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
      assertEquals(typeof parsed.mcpServers, "object");
    });
  });

  // ---------------------------------------------------------------------------
  // Agent markdown files have valid YAML frontmatter
  // ---------------------------------------------------------------------------

  describe("agent .md files have valid YAML frontmatter", () => {
    it("executor agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-executor.agent.md`,
      );

      assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert(frontmatterEnd > 0);

      const frontmatter = content.slice(4, frontmatterEnd);
      assertStringIncludes(frontmatter, "name:");
      assertStringIncludes(frontmatter, "description:");
      assertStringIncludes(frontmatter, "tools:");
    });

    it("verifier agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-verifier.agent.md`,
      );

      assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert(frontmatterEnd > 0);

      const frontmatter = content.slice(4, frontmatterEnd);
      assertStringIncludes(frontmatter, "name:");
      assertStringIncludes(frontmatter, "description:");
      assertStringIncludes(frontmatter, "tools:");
    });
  });

  // ---------------------------------------------------------------------------
  // AGENTS.md contains valid markdown
  // ---------------------------------------------------------------------------

  describe("AGENTS.md contains valid markdown", () => {
    it("has properly nested headings (## and ### inside markers)", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert(content.includes("## noskills Protocol"));
      assert(content.includes("### Protocol"));
      assert(content.includes("### Convention discovery"));
    });

    it("markers are properly paired", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      const startIdx = content.indexOf("<!-- noskills:start -->");
      const endIdx = content.indexOf("<!-- noskills:end -->");

      assert(startIdx !== -1);
      assert(endIdx !== -1);
      assert(startIdx < endIdx);
    });
  });
});

// =============================================================================
// Capability tests
// =============================================================================

describe("Copilot CLI adapter: capability tests", () => {
  it("id is 'copilot-cli'", () => {
    assertEquals(copilotCliAdapterMod.copilotCliAdapter.id, "copilot-cli");
  });

  it("capabilities object matches expected values", () => {
    const caps = copilotCliAdapterMod.copilotCliAdapter.capabilities;

    assertEquals(caps.rules, true);
    assertEquals(caps.hooks, true);
    assertEquals(caps.agents, true);
    assertEquals(caps.specs, false);
    assertEquals(caps.mcp, true);
  });

  it("interaction.subAgentMethod is 'fleet'", () => {
    assertEquals(
      copilotCliAdapterMod.copilotCliAdapter.capabilities.interaction
        .subAgentMethod,
      "fleet",
    );
  });

  it("interaction.optionPresentation is 'prose'", () => {
    assertEquals(
      copilotCliAdapterMod.copilotCliAdapter.capabilities.interaction
        .optionPresentation,
      "prose",
    );
  });
});
