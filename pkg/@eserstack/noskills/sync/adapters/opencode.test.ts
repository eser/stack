// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Snapshot tests and structure validation tests for the OpenCode adapter's
 * generated files.
 *
 * These tests call the real adapter methods with a temp directory and then
 * read the generated files to validate content and structure.
 *
 * @module
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as opencodeAdapterMod from "./opencode.ts";

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

describe("OpenCode adapter: snapshot tests", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "opencode_snap_",
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
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "<!-- noskills:start -->");
      assertStringIncludes(content, "<!-- noskills:end -->");
    });

    it("contains 'noskills Protocol' heading and protocol commands with CMD_PREFIX", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "## noskills Protocol");
      assertStringIncludes(content, `${CMD_PREFIX} spec`);
      assertStringIncludes(content, `--answer=`);
    });

    it("includes git-read-only section when allowGit is not set", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Git is read-only");
    });

    it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx, {
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
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

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
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "Convention discovery");
      assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });

    it("contains rules when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assertStringIncludes(content, "### Active Rules");
      assertStringIncludes(content, "- Test rule 1");
      assertStringIncludes(content, "- Test rule 2");
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .opencode/plugins/noskills.ts
  // ---------------------------------------------------------------------------

  describe("syncHooks: .opencode/plugins/noskills.ts", () => {
    it("creates file in correct path", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );
      assert(stat.isFile);
    });

    it("contains session.created hook", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assertStringIncludes(content, '"session.created"');
    });

    it("contains tool.execute.before and tool.execute.after hooks", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assertStringIncludes(content, '"tool.execute.before"');
      assertStringIncludes(content, '"tool.execute.after"');
    });

    it("contains session.deleted hook", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assertStringIncludes(content, '"session.deleted"');
    });

    it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assertStringIncludes(content, "custom-cli noskills invoke-hook");
      assertEquals(content.includes(CMD_PREFIX), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .opencode/agents/
  // ---------------------------------------------------------------------------

  describe("syncAgents: .opencode/agents/", () => {
    it("noskills-executor.md has YAML frontmatter with name: noskills-executor", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-executor.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "name: noskills-executor");
    });

    it("noskills-executor.md has tools object with all required keys", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-executor.md`,
      );

      const toolsMatch = content.match(/\ntools:\n((?:[ ]{2}\w+: [^\n]+\n)+)/);
      assert(toolsMatch !== null, "tools section not found in YAML frontmatter");

      const toolsBlock = toolsMatch![1]!;
      assertStringIncludes(toolsBlock, "read: true");
      assertStringIncludes(toolsBlock, "write: true");
      assertStringIncludes(toolsBlock, "glob: true");
      assertStringIncludes(toolsBlock, "grep: true");
      assertStringIncludes(toolsBlock, "shell: true");
      assertStringIncludes(toolsBlock, "delegate: true");
      assertEquals(toolsBlock.includes(","), false, "tools should not use comma-separated format");
    });

    it("noskills-verifier.md has YAML frontmatter with name: noskills-verifier", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-verifier.md`,
      );

      assert(content.startsWith("---\n"));
      assertStringIncludes(content, "name: noskills-verifier");
    });

    it("noskills-verifier.md has read-only tools object (no write, no delegate)", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-verifier.md`,
      );

      const toolsMatch = content.match(/\ntools:\n((?:[ ]{2}\w+: [^\n]+\n)+)/);
      assert(toolsMatch !== null, "tools section not found in YAML frontmatter");

      const toolsBlock = toolsMatch![1]!;
      assertStringIncludes(toolsBlock, "read: true");
      assertStringIncludes(toolsBlock, "glob: true");
      assertStringIncludes(toolsBlock, "grep: true");
      assertStringIncludes(toolsBlock, "shell: true");
      assertEquals(toolsBlock.includes("write"), false);
      assertEquals(toolsBlock.includes("delegate"), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncSpecs — .opencode/skills/
  // ---------------------------------------------------------------------------

  describe("syncSpecs: .opencode/skills/", () => {
    it("generates skill file from spec content", async () => {
      const ctx = makeCtx(tempDir);

      // Create a spec file
      const specDir = `${tempDir}/.eser/specs/my-feature`;
      await crossRuntime.runtime.fs.mkdir(specDir, { recursive: true });

      const specContent = [
        "# Spec: My Feature",
        "",
        "## Concerns",
        "",
        "Performance and reliability.",
        "",
        "## Discovery Answers",
        "",
        "The feature does X and Y.",
        "",
        "## Tasks",
        "",
        "- [ ] Implement X",
        "- [ ] Implement Y",
        "",
      ].join("\n");

      await crossRuntime.runtime.fs.writeTextFile(
        `${specDir}/spec.md`,
        specContent,
      );

      await opencodeAdapterMod.opencodeAdapter.syncSpecs!(
        ctx,
        `${specDir}/spec.md`,
      );

      const skillContent = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/skills/my-feature.md`,
      );

      assertStringIncludes(skillContent, "# My Feature");
      assertStringIncludes(skillContent, "Performance and reliability.");
      assertStringIncludes(skillContent, "The feature does X and Y.");
    });

    it("skill file has YAML frontmatter with name and description", async () => {
      const ctx = makeCtx(tempDir);

      const specDir = `${tempDir}/.eser/specs/test-spec`;
      await crossRuntime.runtime.fs.mkdir(specDir, { recursive: true });

      const specContent = [
        "# Spec: Test Spec Title",
        "",
        "## Tasks",
        "",
        "- [ ] Do something",
        "",
      ].join("\n");

      await crossRuntime.runtime.fs.writeTextFile(
        `${specDir}/spec.md`,
        specContent,
      );

      await opencodeAdapterMod.opencodeAdapter.syncSpecs!(
        ctx,
        `${specDir}/spec.md`,
      );

      const skillContent = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/skills/test-spec.md`,
      );

      assert(skillContent.startsWith("---\n"));
      assertStringIncludes(skillContent, "name: Test Spec Title");
      assertStringIncludes(skillContent, 'description: "noskills spec:');
    });

    it("skips gracefully when spec file doesn't exist", async () => {
      const ctx = makeCtx(tempDir);

      // Call with a non-existent spec path — should not throw
      await opencodeAdapterMod.opencodeAdapter.syncSpecs!(
        ctx,
        `${tempDir}/.eser/specs/nonexistent/spec.md`,
      );

      // Skills directory should not even be created
      let exists = true;
      try {
        await crossRuntime.runtime.fs.stat(
          `${tempDir}/.opencode/skills`,
        );
      } catch {
        exists = false;
      }
      assertEquals(exists, false);
    });

    it("skips gracefully when spec file is empty", async () => {
      const ctx = makeCtx(tempDir);

      const specDir = `${tempDir}/.eser/specs/empty-spec`;
      await crossRuntime.runtime.fs.mkdir(specDir, { recursive: true });

      await crossRuntime.runtime.fs.writeTextFile(
        `${specDir}/spec.md`,
        "   \n  \n",
      );

      await opencodeAdapterMod.opencodeAdapter.syncSpecs!(
        ctx,
        `${specDir}/spec.md`,
      );

      // Skill file should not be created
      let exists = true;
      try {
        await crossRuntime.runtime.fs.stat(
          `${tempDir}/.opencode/skills/empty-spec.md`,
        );
      } catch {
        exists = false;
      }
      assertEquals(exists, false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — opencode.json
  // ---------------------------------------------------------------------------

  describe("syncMcp: opencode.json", () => {
    it("has mcp.noskills entry with type: local and enabled: true", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);

      assert(parsed.mcp !== undefined);
      assert(parsed.mcp.noskills !== undefined);
      assertEquals(parsed.mcp.noskills.type, "local");
      assertEquals(parsed.mcp.noskills.enabled, true);
    });

    it("has command array ending with mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);

      const cmd = parsed.mcp.noskills.command;
      assert(Array.isArray(cmd));
      assert(cmd.length > 0);
      assertEquals(cmd[cmd.length - 1], "mcp-serve");
    });

    it("preserves existing non-noskills config in opencode.json", async () => {
      const ctx = makeCtx(tempDir);

      // Pre-create opencode.json with user config
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/opencode.json`,
        JSON.stringify({
          theme: "dark",
          mcp: {
            "my-server": {
              type: "local",
              command: "node",
              args: ["server.js"],
            },
          },
        }),
      );

      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);

      // User config preserved
      assertEquals(parsed.theme, "dark");
      assert(parsed.mcp["my-server"] !== undefined);

      // noskills server added
      assert(parsed.mcp.noskills !== undefined);
    });
  });
});

// =============================================================================
// Structure validation tests
// =============================================================================

describe("OpenCode adapter: structure validation", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "opencode_struct_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  describe("all JSON files parse without error", () => {
    it("opencode.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);
      assertEquals(typeof parsed, "object");
    });
  });

  // ---------------------------------------------------------------------------
  // AGENTS.md contains valid markdown
  // ---------------------------------------------------------------------------

  describe("AGENTS.md contains valid markdown", () => {
    it("has properly nested headings (## and ### inside markers)", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      // Should contain ## and ### headings
      assert(content.includes("## noskills Protocol"));
      assert(content.includes("### Protocol"));
      assert(content.includes("### Convention discovery"));
    });

    it("markers are properly paired", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

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

  // ---------------------------------------------------------------------------
  // Agent markdown files have valid YAML frontmatter
  // ---------------------------------------------------------------------------

  describe("agent markdown files have valid YAML frontmatter", () => {
    it("executor agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-executor.md`,
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
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-verifier.md`,
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
  // MCP JSON structure
  // ---------------------------------------------------------------------------

  describe("MCP JSON structure", () => {
    it("has mcp object with server entries having command array + enabled", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);

      assertEquals(typeof parsed.mcp, "object");
      assert(parsed.mcp !== null);

      for (const [_key, server] of Object.entries(parsed.mcp)) {
        const srv = server as { command: string[]; enabled: boolean };
        assert(Array.isArray(srv.command));
        assertEquals(srv.enabled, true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Plugin file structure
  // ---------------------------------------------------------------------------

  describe("plugin file structure", () => {
    it("is a valid TypeScript module with default export", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assertStringIncludes(content, "export default");
      assertStringIncludes(content, "import");
    });
  });
});
