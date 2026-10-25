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

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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

type CopilotHooksFile = {
  readonly version: number;
  readonly hooks: Readonly<
    Record<
      string,
      readonly {
        readonly type: string;
        readonly matcher?: string;
        readonly command: string;
        readonly timeoutSec: number;
      }[]
    >
  >;
};

const readHooks = async (root: string): Promise<CopilotHooksFile> =>
  JSON.parse(
    await crossRuntime.runtime.fs.readTextFile(
      `${root}/.github/hooks/noskills.json`,
    ),
  ) as CopilotHooksFile;

// =============================================================================
// Snapshot tests — generated file content
// =============================================================================

bdd.describe("Copilot CLI adapter: snapshot tests", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "copilot_cli_snap_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — AGENTS.md + copilot-instructions.md
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: AGENTS.md + copilot-instructions.md", () => {
    bdd.it("AGENTS.md has noskills markers", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "<!-- noskills:start -->");
      assert.assertStringIncludes(content, "<!-- noskills:end -->");
    });

    bdd.it(".github/copilot-instructions.md is also generated", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.github/copilot-instructions.md`,
      );
      assert.assert(stat.isFile);
    });

    bdd.it("both files contain noskills protocol content", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const agentsMd = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );
      const copilotMd = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/copilot-instructions.md`,
      );

      // AGENTS.md has noskills Protocol section
      assert.assertStringIncludes(agentsMd, "## noskills Protocol");
      assert.assertStringIncludes(agentsMd, `${CMD_PREFIX} spec`);

      // copilot-instructions.md has noskills orchestrator section
      assert.assertStringIncludes(copilotMd, "noskills");
      assert.assertStringIncludes(copilotMd, CMD_PREFIX);
    });

    bdd.it(
      "includes git-read-only section when allowGit is not set",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        assert.assertStringIncludes(content, "Git is read-only");
      },
    );

    bdd.it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx, {
        allowGit: true,
      });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertEquals(content.includes("Git is read-only"), false);
    });

    bdd.it("preserves existing content outside noskills markers", async () => {
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

      assert.assertStringIncludes(content, "# My Project Agents");
      assert.assertStringIncludes(content, "Custom instructions.");
      assert.assertStringIncludes(content, "More user content below.");
      assert.assertEquals(content.includes("old noskills content"), false);
      assert.assertStringIncludes(content, "## noskills Protocol");
    });

    bdd.it("contains coaching content about convention discovery", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "Convention discovery");
      assert.assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .github/hooks/noskills.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncHooks: .github/hooks/noskills.json", () => {
    bdd.it("creates file at correct path", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      assert.assert(stat.isFile);
    });

    bdd.it("has version: 1 field and hooks as object (not array)", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertEquals(parsed.version, 1);
      assert.assertEquals(typeof parsed.hooks, "object");
      assert.assert(!Array.isArray(parsed.hooks));
    });

    bdd.it(
      "lists command hooks under camelCase events, as Copilot CLI reads them",
      async () => {
        await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(
          makeCtx(tempDir),
        );
        const parsed = await readHooks(tempDir);

        assert.assertEquals(Object.keys(parsed.hooks).toSorted(), [
          "agentStop",
          "postToolUse",
          "preToolUse",
          "sessionStart",
        ]);
        for (const entries of Object.values(parsed.hooks)) {
          assert.assert(Array.isArray(entries));
          for (const entry of entries) {
            assert.assertEquals(entry.type, "command");
            assert.assertEquals(typeof entry.timeoutSec, "number");
          }
        }
      },
    );

    bdd.it(
      "guards the shell and file tools, with 30 seconds for the hook",
      async () => {
        await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(
          makeCtx(tempDir),
        );
        const parsed = await readHooks(tempDir);

        assert.assertEquals(parsed.hooks["preToolUse"], [{
          type: "command",
          matcher: "bash|powershell|create|edit|str_replace_editor|apply_patch",
          command: `${CMD_PREFIX} invoke-hook pre-tool-use`,
          timeoutSec: 30,
        }]);
      },
    );

    bdd.it("asks session-start for Copilot CLI's output", async () => {
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(makeCtx(tempDir));
      const parsed = await readHooks(tempDir);

      assert.assertEquals(
        parsed.hooks["sessionStart"]?.[0]?.command,
        `${CMD_PREFIX} invoke-hook session-start --tool=copilot-cli`,
      );
    });

    bdd.it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);
      const parsed = await readHooks(tempDir);

      for (const entries of Object.values(parsed.hooks)) {
        for (const entry of entries) {
          assert.assertStringIncludes(
            entry.command,
            "custom-cli noskills invoke-hook",
          );
        }
      }
    });

    bdd.it("keeps the user's hooks and replaces its own", async () => {
      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.github/hooks`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.github/hooks/noskills.json`,
        JSON.stringify({
          version: 1,
          hooks: {
            preToolUse: [
              { type: "command", bash: "./scripts/policy.sh" },
              {
                type: "command",
                bash: "old-cli noskills invoke-hook pre-tool-use",
              },
            ],
            // What earlier noskills versions wrote: Copilot CLI rejected
            // the whole file for it.
            "noskills:preToolUse": {
              _noskills: true,
              command: ["bash", "-c", "x invoke-hook pre-tool-use"],
              timeoutSec: 5,
            },
          },
        }),
      );

      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(makeCtx(tempDir));
      await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(makeCtx(tempDir));
      const parsed = await readHooks(tempDir);

      assert.assertEquals(parsed.hooks["noskills:preToolUse"], undefined);
      assert.assertEquals(parsed.hooks["preToolUse"]?.length, 2);
      assert.assertEquals(
        (parsed.hooks["preToolUse"]?.[0] as unknown as { bash: string }).bash,
        "./scripts/policy.sh",
      );
      assert.assertEquals(
        parsed.hooks["preToolUse"]?.[1]?.command,
        `${CMD_PREFIX} invoke-hook pre-tool-use`,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .github/agents/ (.agent.md with YAML list tools)
  // ---------------------------------------------------------------------------

  bdd.describe("syncAgents: .github/agents/", () => {
    bdd.it(
      "noskills-executor.agent.md exists with correct frontmatter",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.github/agents/noskills-executor.agent.md`,
        );

        assert.assert(content.startsWith("---\n"));
        assert.assertStringIncludes(content, "name: noskills-executor");
      },
    );

    bdd.it(
      "noskills-executor.agent.md has tools as YAML list format",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.github/agents/noskills-executor.agent.md`,
        );

        // Tools should be in YAML list format (each on its own line with "  - ")
        assert.assertStringIncludes(content, "tools:");
        assert.assertStringIncludes(content, "  - read");
        assert.assertStringIncludes(content, "  - write");
        assert.assertStringIncludes(content, "  - shell");
      },
    );

    bdd.it(
      "noskills-verifier.agent.md exists with read-only tools",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.github/agents/noskills-verifier.agent.md`,
        );

        assert.assert(content.startsWith("---\n"));
        assert.assertStringIncludes(content, "name: noskills-verifier");
        assert.assertStringIncludes(content, "tools:");
        assert.assertStringIncludes(content, "  - read");
        assert.assertStringIncludes(content, "  - shell");

        // Should NOT have write tool
        assert.assertEquals(content.includes("  - write"), false);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // syncMcp — .copilot/mcp.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncMcp: .copilot/mcp.json", () => {
    bdd.it("has mcpServers.noskills entry", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assert(parsed.mcpServers !== undefined);
      assert.assert(parsed.mcpServers.noskills !== undefined);
    });

    bdd.it(
      "has type: 'local', command, args, and tools: ['*'] fields",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.copilot/mcp.json`,
        );
        const parsed = JSON.parse(raw);

        const entry = parsed.mcpServers.noskills;
        assert.assertEquals(entry.type, "local");
        assert.assertEquals(typeof entry.command, "string");
        assert.assert(entry.command.length > 0);
        assert.assert(Array.isArray(entry.args));
        assert.assert(Array.isArray(entry.tools));
        assert.assertArrayIncludes(entry.tools, ["*"]);
      },
    );

    bdd.it("args include mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.copilot/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      const args: string[] = parsed.mcpServers.noskills.args;
      assert.assert(args.includes("mcp-serve"));
    });

    bdd.it("preserves existing MCP config", async () => {
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
      assert.assert(parsed.mcpServers["my-server"] !== undefined);
      assert.assertEquals(parsed.mcpServers["my-server"].command, "node");

      // noskills server added
      assert.assert(parsed.mcpServers.noskills !== undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // AGENTS.md deduplication test
  // ---------------------------------------------------------------------------

  bdd.describe("AGENTS.md deduplication", () => {
    bdd.it(
      "when both codex and copilot-cli sync rules, AGENTS.md has ONE noskills section (not two)",
      async () => {
        const ctx = makeCtx(tempDir);

        // First: codex adapter writes AGENTS.md
        await codexAdapterMod.codexAdapter.syncRules(ctx);

        // Second: copilot-cli adapter writes AGENTS.md (should replace, not duplicate)
        await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        // Count noskills:start markers — should be exactly one
        const startMarkers = content.split("<!-- noskills:start -->").length -
          1;
        assert.assertEquals(startMarkers, 1);

        // Count noskills:end markers — should be exactly one
        const endMarkers = content.split("<!-- noskills:end -->").length - 1;
        assert.assertEquals(endMarkers, 1);
      },
    );
  });
});

// =============================================================================
// Structure validation tests
// =============================================================================

bdd.describe("Copilot CLI adapter: structure validation", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "copilot_cli_struct_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  bdd.describe("hooks JSON is valid", () => {
    bdd.it(
      "noskills.json parses without error and has hooks object",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncHooks!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.github/hooks/noskills.json`,
        );
        const parsed = JSON.parse(raw);
        assert.assertEquals(typeof parsed, "object");
        assert.assertEquals(typeof parsed.hooks, "object");
        assert.assert(!Array.isArray(parsed.hooks));
      },
    );
  });

  bdd.describe("MCP JSON is valid", () => {
    bdd.it(
      "mcp.json parses without error and has mcpServers object",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncMcp!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.copilot/mcp.json`,
        );
        const parsed = JSON.parse(raw);
        assert.assertEquals(typeof parsed, "object");
        assert.assertEquals(typeof parsed.mcpServers, "object");
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Agent markdown files have valid YAML frontmatter
  // ---------------------------------------------------------------------------

  bdd.describe("agent .md files have valid YAML frontmatter", () => {
    bdd.it("executor agent starts with --- and has closing ---", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-executor.agent.md`,
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
      await copilotCliAdapterMod.copilotCliAdapter.syncAgents!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.github/agents/noskills-verifier.agent.md`,
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
  // AGENTS.md contains valid markdown
  // ---------------------------------------------------------------------------

  bdd.describe("AGENTS.md contains valid markdown", () => {
    bdd.it(
      "has properly nested headings (## and ### inside markers)",
      async () => {
        const ctx = makeCtx(tempDir);
        await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        assert.assert(content.includes("## noskills Protocol"));
        assert.assert(content.includes("### Protocol"));
        assert.assert(content.includes("### Convention discovery"));
      },
    );

    bdd.it("markers are properly paired", async () => {
      const ctx = makeCtx(tempDir);
      await copilotCliAdapterMod.copilotCliAdapter.syncRules(ctx);

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
});

// =============================================================================
// Capability tests
// =============================================================================

bdd.describe("Copilot CLI adapter: capability tests", () => {
  bdd.it("id is 'copilot-cli'", () => {
    assert.assertEquals(
      copilotCliAdapterMod.copilotCliAdapter.id,
      "copilot-cli",
    );
  });

  bdd.it("capabilities object matches expected values", () => {
    const caps = copilotCliAdapterMod.copilotCliAdapter.capabilities;

    assert.assertEquals(caps.rules, true);
    assert.assertEquals(caps.hooks, true);
    assert.assertEquals(caps.agents, true);
    assert.assertEquals(caps.specs, false);
    assert.assertEquals(caps.mcp, true);
  });

  bdd.it("interaction.subAgentMethod is 'fleet'", () => {
    assert.assertEquals(
      copilotCliAdapterMod.copilotCliAdapter.capabilities.interaction
        .subAgentMethod,
      "fleet",
    );
  });

  bdd.it("interaction.optionPresentation is 'prose'", () => {
    assert.assertEquals(
      copilotCliAdapterMod.copilotCliAdapter.capabilities.interaction
        .optionPresentation,
      "prose",
    );
  });
});
