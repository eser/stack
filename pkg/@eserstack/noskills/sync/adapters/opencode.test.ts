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

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
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

type PluginHooks = {
  readonly event: (input: { event: { type: string } }) => Promise<void>;
  readonly "tool.execute.before": (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ) => Promise<void>;
  readonly "tool.execute.after": (input: {
    tool: string;
    sessionID: string;
    callID: string;
    args: unknown;
  }) => Promise<void>;
};

type PluginModule = {
  readonly NoskillsPlugin: (input: {
    directory: string;
  }) => Promise<PluginHooks>;
};

const importPlugin = async (root: string): Promise<PluginModule> =>
  (await import(
    `file://${root}/.opencode/plugins/noskills.ts`
  )) as PluginModule;

// =============================================================================
// Snapshot tests — generated file content
// =============================================================================

bdd.describe("OpenCode adapter: snapshot tests", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "opencode_snap_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // TASK-327: an opencode.json holding null threw on existing.mcp.
  bdd.it("syncMcp treats an opencode.json holding null as empty", async () => {
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/opencode.json`,
      "null",
    );

    await opencodeAdapterMod.opencodeAdapter.syncMcp!(makeCtx(tempDir));

    const config = JSON.parse(
      await crossRuntime.runtime.fs.readTextFile(`${tempDir}/opencode.json`),
    ) as { mcp?: { noskills?: unknown } };
    assert.assert(config.mcp?.noskills !== undefined);
  });

  // ---------------------------------------------------------------------------
  // syncRules — AGENTS.md
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: AGENTS.md", () => {
    bdd.it("contains noskills:start and noskills:end markers", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "<!-- noskills:start -->");
      assert.assertStringIncludes(content, "<!-- noskills:end -->");
    });

    bdd.it(
      "contains 'noskills Protocol' heading and protocol commands with CMD_PREFIX",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        assert.assertStringIncludes(content, "## noskills Protocol");
        assert.assertStringIncludes(content, `${CMD_PREFIX} spec`);
        assert.assertStringIncludes(content, `--answer=`);
      },
    );

    bdd.it(
      "includes git-read-only section when allowGit is not set",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        assert.assertStringIncludes(content, "Git is read-only");
      },
    );

    bdd.it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx, {
        allowGit: true,
      });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertEquals(content.includes("Git is read-only"), false);
    });

    bdd.it(
      "preserves existing content outside noskills markers when AGENTS.md already exists",
      async () => {
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
        assert.assertStringIncludes(content, "# My Project Agents");
        assert.assertStringIncludes(content, "Some custom instructions here.");
        assert.assertStringIncludes(content, "More user content below.");

        // Old noskills content should be replaced
        assert.assertEquals(content.includes("old noskills content"), false);

        // New noskills content should be present
        assert.assertStringIncludes(content, "## noskills Protocol");
      },
    );

    bdd.it("contains convention discovery coaching content", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "Convention discovery");
      assert.assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });

    bdd.it("contains rules when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "### Active Rules");
      assert.assertStringIncludes(content, "- Test rule 1");
      assert.assertStringIncludes(content, "- Test rule 2");
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .opencode/plugins/noskills.ts
  // ---------------------------------------------------------------------------

  bdd.describe("syncHooks: .opencode/plugins/noskills.ts", () => {
    bdd.it("creates file in correct path", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );
      assert.assert(stat.isFile);
    });

    bdd.it(
      "subscribes to session events and the tool hooks OpenCode calls",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.opencode/plugins/noskills.ts`,
        );

        assert.assertStringIncludes(content, '"session.created"');
        assert.assertStringIncludes(content, '"session.idle"');
        assert.assertStringIncludes(content, '"tool.execute.before"');
        assert.assertStringIncludes(content, '"tool.execute.after"');
      },
    );

    bdd.it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/plugins/noskills.ts`,
      );

      assert.assertStringIncludes(
        content,
        'const COMMAND = "custom-cli noskills";',
      );
      assert.assertEquals(content.includes(CMD_PREFIX), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .opencode/agents/
  // ---------------------------------------------------------------------------

  bdd.describe("syncAgents: .opencode/agents/", () => {
    bdd.it(
      "noskills-executor.md has YAML frontmatter with name: noskills-executor",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.opencode/agents/noskills-executor.md`,
        );

        assert.assert(content.startsWith("---\n"));
        assert.assertStringIncludes(content, "name: noskills-executor");
      },
    );

    bdd.it(
      "noskills-executor.md has tools object with all required keys",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.opencode/agents/noskills-executor.md`,
        );

        const toolsMatch = content.match(
          /\ntools:\n((?:[ ]{2}\w+: [^\n]+\n)+)/,
        );
        assert.assert(
          toolsMatch !== null,
          "tools section not found in YAML frontmatter",
        );

        const toolsBlock = toolsMatch![1]!;
        assert.assertStringIncludes(toolsBlock, "read: true");
        assert.assertStringIncludes(toolsBlock, "write: true");
        assert.assertStringIncludes(toolsBlock, "glob: true");
        assert.assertStringIncludes(toolsBlock, "grep: true");
        assert.assertStringIncludes(toolsBlock, "shell: true");
        assert.assertStringIncludes(toolsBlock, "delegate: true");
        assert.assertEquals(
          toolsBlock.includes(","),
          false,
          "tools should not use comma-separated format",
        );
      },
    );

    bdd.it(
      "noskills-verifier.md has YAML frontmatter with name: noskills-verifier",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.opencode/agents/noskills-verifier.md`,
        );

        assert.assert(content.startsWith("---\n"));
        assert.assertStringIncludes(content, "name: noskills-verifier");
      },
    );

    bdd.it(
      "noskills-verifier.md has read-only tools object (no write, no delegate)",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.opencode/agents/noskills-verifier.md`,
        );

        const toolsMatch = content.match(
          /\ntools:\n((?:[ ]{2}\w+: [^\n]+\n)+)/,
        );
        assert.assert(
          toolsMatch !== null,
          "tools section not found in YAML frontmatter",
        );

        const toolsBlock = toolsMatch![1]!;
        assert.assertStringIncludes(toolsBlock, "read: true");
        assert.assertStringIncludes(toolsBlock, "glob: true");
        assert.assertStringIncludes(toolsBlock, "grep: true");
        assert.assertStringIncludes(toolsBlock, "shell: true");
        assert.assertEquals(toolsBlock.includes("write"), false);
        assert.assertEquals(toolsBlock.includes("delegate"), false);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // syncSpecs — .opencode/skills/
  // ---------------------------------------------------------------------------

  bdd.describe("syncSpecs: .opencode/skills/", () => {
    bdd.it("generates skill file from spec content", async () => {
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

      assert.assertStringIncludes(skillContent, "# My Feature");
      assert.assertStringIncludes(skillContent, "Performance and reliability.");
      assert.assertStringIncludes(skillContent, "The feature does X and Y.");
    });

    bdd.it(
      "skill file has YAML frontmatter with name and description",
      async () => {
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

        assert.assert(skillContent.startsWith("---\n"));
        assert.assertStringIncludes(skillContent, "name: Test Spec Title");
        assert.assertStringIncludes(
          skillContent,
          'description: "noskills spec:',
        );
      },
    );

    bdd.it("skips gracefully when spec file doesn't exist", async () => {
      const ctx = makeCtx(tempDir);

      // Call with a non-existent spec path — should not throw
      await opencodeAdapterMod.opencodeAdapter.syncSpecs!(
        ctx,
        `${tempDir}/.eser/specs/nonexistent/spec.md`,
      );

      // Skills directory should not even be created
      let exists = true;
      try {
        await crossRuntime.runtime.fs.stat(`${tempDir}/.opencode/skills`);
      } catch {
        exists = false;
      }
      assert.assertEquals(exists, false);
    });

    bdd.it("skips gracefully when spec file is empty", async () => {
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
      assert.assertEquals(exists, false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — opencode.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncMcp: opencode.json", () => {
    bdd.it(
      "has mcp.noskills entry with type: local and enabled: true",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/opencode.json`,
        );
        const parsed = JSON.parse(raw);

        assert.assert(parsed.mcp !== undefined);
        assert.assert(parsed.mcp.noskills !== undefined);
        assert.assertEquals(parsed.mcp.noskills.type, "local");
        assert.assertEquals(parsed.mcp.noskills.enabled, true);
      },
    );

    bdd.it("has command array ending with mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);

      const cmd = parsed.mcp.noskills.command;
      assert.assert(Array.isArray(cmd));
      assert.assert(cmd.length > 0);
      assert.assertEquals(cmd[cmd.length - 1], "mcp-serve");
    });

    bdd.it(
      "preserves existing non-noskills config in opencode.json",
      async () => {
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
        assert.assertEquals(parsed.theme, "dark");
        assert.assert(parsed.mcp["my-server"] !== undefined);

        // noskills server added
        assert.assert(parsed.mcp.noskills !== undefined);
      },
    );
  });
});

// =============================================================================
// Structure validation tests
// =============================================================================

bdd.describe("OpenCode adapter: structure validation", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "opencode_struct_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  bdd.describe("all JSON files parse without error", () => {
    bdd.it("opencode.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/opencode.json`,
      );
      const parsed = JSON.parse(raw);
      assert.assertEquals(typeof parsed, "object");
    });
  });

  // ---------------------------------------------------------------------------
  // AGENTS.md contains valid markdown
  // ---------------------------------------------------------------------------

  bdd.describe("AGENTS.md contains valid markdown", () => {
    bdd.it(
      "has properly nested headings (## and ### inside markers)",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        // Should contain ## and ### headings
        assert.assert(content.includes("## noskills Protocol"));
        assert.assert(content.includes("### Protocol"));
        assert.assert(content.includes("### Convention discovery"));
      },
    );

    bdd.it("markers are properly paired", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      const startIdx = content.indexOf("<!-- noskills:start -->");
      const endIdx = content.indexOf("<!-- noskills:end -->");

      assert.assert(startIdx !== -1);
      assert.assert(endIdx !== -1);
      assert.assert(startIdx < endIdx);
    });
  });

  // ---------------------------------------------------------------------------
  // Agent markdown files have valid YAML frontmatter
  // ---------------------------------------------------------------------------

  bdd.describe("agent markdown files have valid YAML frontmatter", () => {
    bdd.it("executor agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-executor.md`,
      );

      assert.assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert.assert(frontmatterEnd > 0);

      const frontmatter = content.slice(4, frontmatterEnd);
      assert.assertStringIncludes(frontmatter, "name:");
      assert.assertStringIncludes(frontmatter, "description:");
      assert.assertStringIncludes(frontmatter, "tools:");
    });

    bdd.it("verifier agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.opencode/agents/noskills-verifier.md`,
      );

      assert.assert(content.startsWith("---\n"));
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      assert.assert(frontmatterEnd > 0);

      const frontmatter = content.slice(4, frontmatterEnd);
      assert.assertStringIncludes(frontmatter, "name:");
      assert.assertStringIncludes(frontmatter, "description:");
      assert.assertStringIncludes(frontmatter, "tools:");
    });
  });

  // ---------------------------------------------------------------------------
  // MCP JSON structure
  // ---------------------------------------------------------------------------

  bdd.describe("MCP JSON structure", () => {
    bdd.it(
      "has mcp object with server entries having command array + enabled",
      async () => {
        const ctx = makeCtx(tempDir);
        await opencodeAdapterMod.opencodeAdapter.syncMcp!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/opencode.json`,
        );
        const parsed = JSON.parse(raw);

        assert.assertEquals(typeof parsed.mcp, "object");
        assert.assert(parsed.mcp !== null);

        for (const [_key, server] of Object.entries(parsed.mcp)) {
          const srv = server as { command: string[]; enabled: boolean };
          assert.assert(Array.isArray(srv.command));
          assert.assertEquals(srv.enabled, true);
        }
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Plugin file structure
  // ---------------------------------------------------------------------------

  bdd.describe("plugin file structure", () => {
    bdd.it("exports one plugin function, as OpenCode loads them", async () => {
      const ctx = makeCtx(tempDir);
      await opencodeAdapterMod.opencodeAdapter.syncHooks!(ctx);

      const plugin = await importPlugin(tempDir);

      assert.assertEquals(Object.keys(plugin), ["NoskillsPlugin"]);
      assert.assertEquals(typeof plugin.NoskillsPlugin, "function");
    });
  });
});

// =============================================================================
// The generated plugin, run as OpenCode runs it
// =============================================================================

// A stand-in for the noskills command: it keeps each hook's stdin next to
// itself and answers as the `mode` file says.
const FAKE_NOSKILLS = `#!/bin/sh
dir=$(dirname "$0")
cat > "$dir/stdin-$2.json"
case "$(cat "$dir/mode")" in
  deny) echo "noskills: refused for the test" >&2; exit 2 ;;
  fail) echo "boom" >&2; exit 1 ;;
  *) exit 0 ;;
esac
`;

bdd.describe("OpenCode plugin: the hooks it runs", () => {
  let root: string;
  let hooks: PluginHooks;

  const setMode = (mode: "allow" | "deny" | "fail"): Promise<void> =>
    crossRuntime.runtime.fs.writeTextFile(`${root}/mode`, mode);

  const stdinOf = async (event: string): Promise<unknown> =>
    JSON.parse(
      await crossRuntime.runtime.fs.readTextFile(`${root}/stdin-${event}.json`),
    );

  const exists = async (path: string): Promise<boolean> => {
    try {
      await crossRuntime.runtime.fs.stat(path);
      return true;
    } catch {
      return false;
    }
  };

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.realPath(
      await crossRuntime.runtime.fs.makeTempDir({ prefix: "opencode_plugin_" }),
    );
    await crossRuntime.runtime.fs.writeTextFile(
      `${root}/fake-noskills.sh`,
      FAKE_NOSKILLS,
    );
    await setMode("allow");
    await opencodeAdapterMod.opencodeAdapter.syncHooks!({
      root,
      rules: [],
      commandPrefix: `sh ${root}/fake-noskills.sh`,
    });
    hooks = await (
      await importPlugin(root)
    ).NoskillsPlugin({
      directory: root,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "passes the tool name and input to pre-tool-use on stdin",
    async () => {
      await hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_1", callID: "call_1" },
        { args: { command: "git status" } },
      );

      assert.assertEquals(await stdinOf("pre-tool-use"), {
        hook_event_name: "PreToolUse",
        session_id: "ses_1",
        cwd: root,
        tool_name: "bash",
        tool_input: { command: "git status" },
      });
    },
  );

  bdd.it("refuses the call with noskills' reason on exit code 2", async () => {
    await setMode("deny");

    await assert.assertRejects(
      () =>
        hooks["tool.execute.before"](
          { tool: "edit", sessionID: "ses_1", callID: "call_1" },
          { args: { filePath: "a.ts", oldString: "a", newString: "b" } },
        ),
      Error,
      "noskills: refused for the test",
    );
  });

  bdd.it("refuses the call when the check fails to answer", async () => {
    await setMode("fail");

    await assert.assertRejects(
      () =>
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "ses_1", callID: "call_1" },
          { args: { filePath: "a.ts", content: "x" } },
        ),
      Error,
      "the PreToolUse check exited with code 1",
    );
  });

  bdd.it("leaves tools it does not guard alone", async () => {
    await setMode("deny");

    await hooks["tool.execute.before"](
      { tool: "read", sessionID: "ses_1", callID: "call_1" },
      { args: { filePath: "a.ts" } },
    );

    assert.assertEquals(await exists(`${root}/stdin-pre-tool-use.json`), false);
  });

  bdd.it("logs file and shell calls after they run", async () => {
    await hooks["tool.execute.after"]({
      tool: "apply_patch",
      sessionID: "ses_1",
      callID: "call_1",
      args: { patchText: "*** Update File: a.ts" },
    });
    await hooks["tool.execute.after"]({
      tool: "bash",
      sessionID: "ses_1",
      callID: "call_2",
      args: { command: "ls" },
    });

    assert.assertEquals(
      ((await stdinOf("post-file-write")) as { tool_name: string }).tool_name,
      "apply_patch",
    );
    assert.assertEquals(
      ((await stdinOf("post-bash")) as { tool_input: unknown }).tool_input,
      { command: "ls" },
    );
  });

  bdd.it("runs session-start and stop on session events", async () => {
    await hooks.event({ event: { type: "session.created" } });
    await hooks.event({ event: { type: "session.idle" } });

    assert.assertEquals(await stdinOf("session-start"), {});
    assert.assertEquals(
      ((await stdinOf("stop")) as { hook_event_name: string }).hook_event_name,
      "Stop",
    );
  });
});

const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../../..",
);

bdd.describe("OpenCode plugin: with the real noskills command", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.realPath(
      await crossRuntime.runtime.fs.makeTempDir({ prefix: "opencode_e2e_" }),
    );
    await crossRuntime.runtime.fs.mkdir(`${root}/.eser`, { recursive: true });
    await crossRuntime.runtime.fs.writeTextFile(
      `${root}/.eser/manifest.yml`,
      "noskills:\n  allowGit: false\n",
    );
    await opencodeAdapterMod.opencodeAdapter.syncHooks!({
      root,
      rules: [],
      commandPrefix: [
        crossRuntime.runtime.process.execPath(),
        `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
      ].join(" "),
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("refuses a git write and an allowGit edit", async () => {
    const hooks = await (
      await importPlugin(root)
    ).NoskillsPlugin({
      directory: root,
    });
    const before = hooks["tool.execute.before"];

    await assert.assertRejects(
      () =>
        before(
          { tool: "bash", sessionID: "ses_1", callID: "call_1" },
          { args: { command: "git push origin main" } },
        ),
      Error,
      "Git write operations are not allowed",
    );
    await assert.assertRejects(
      () =>
        before(
          { tool: "edit", sessionID: "ses_1", callID: "call_2" },
          {
            args: {
              filePath: `${root}/.eser/manifest.yml`,
              oldString: "allowGit: false",
              newString: "allowGit: true",
            },
          },
        ),
      Error,
      "allowGit",
    );
    await before(
      { tool: "bash", sessionID: "ses_1", callID: "call_3" },
      { args: { command: "git status" } },
    );
  });
});
