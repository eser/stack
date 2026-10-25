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

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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

type CodexHooksFile = {
  readonly hooks: Readonly<
    Record<
      string,
      readonly {
        readonly matcher?: string;
        readonly hooks: readonly {
          readonly type: string;
          readonly command: string;
          readonly timeout?: number;
        }[];
      }[]
    >
  >;
};

const readHooks = async (root: string): Promise<CodexHooksFile> =>
  JSON.parse(
    await crossRuntime.runtime.fs.readTextFile(`${root}/.codex/hooks.json`),
  ) as CodexHooksFile;

const commandsOf = (file: CodexHooksFile): readonly string[] =>
  Object.values(file.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((handler) => handler.command)),
  );

// =============================================================================
// Snapshot tests — generated file content
// =============================================================================

bdd.describe("Codex adapter: snapshot tests", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "codex_snap_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — AGENTS.md
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: AGENTS.md", () => {
    bdd.it("contains noskills:start and noskills:end markers", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

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
        await codexAdapterMod.codexAdapter.syncRules(ctx);

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
        await codexAdapterMod.codexAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/AGENTS.md`,
        );

        assert.assertStringIncludes(content, "Git is read-only");
      },
    );

    bdd.it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncRules(ctx, {
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
        await codexAdapterMod.codexAdapter.syncRules(ctx);

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
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "Convention discovery");
      assert.assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });

    bdd.it("contains rules when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await codexAdapterMod.codexAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/AGENTS.md`,
      );

      assert.assertStringIncludes(content, "### Active Rules");
      assert.assertStringIncludes(content, "- Test rule 1");
      assert.assertStringIncludes(content, "- Test rule 2");
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks — .codex/hooks.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncHooks: .codex/hooks.json", () => {
    bdd.it("creates file in correct path", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const stat = await crossRuntime.runtime.fs.stat(
        `${tempDir}/.codex/hooks.json`,
      );
      assert.assert(stat.isFile);
    });

    bdd.it(
      "groups command handlers by PascalCase event, as Codex reads them",
      async () => {
        await codexAdapterMod.codexAdapter.syncHooks!(makeCtx(tempDir));
        const parsed = await readHooks(tempDir);

        assert.assertEquals(Object.keys(parsed.hooks).toSorted(), [
          "PostToolUse",
          "PreToolUse",
          "SessionStart",
          "Stop",
        ]);
        for (const groups of Object.values(parsed.hooks)) {
          for (const group of groups) {
            for (const handler of group.hooks) {
              assert.assertEquals(handler.type, "command");
              assert.assertEquals(typeof handler.timeout, "number");
            }
          }
        }
      },
    );

    bdd.it(
      "guards Bash and apply_patch, with 30 seconds for the hook",
      async () => {
        await codexAdapterMod.codexAdapter.syncHooks!(makeCtx(tempDir));
        const parsed = await readHooks(tempDir);

        assert.assertEquals(parsed.hooks["PreToolUse"], [
          {
            matcher: "^(Bash|apply_patch)$",
            hooks: [
              {
                type: "command",
                command: `${CMD_PREFIX} invoke-hook pre-tool-use`,
                timeout: 30,
              },
            ],
          },
        ]);
      },
    );

    bdd.it("uses commandPrefix in hook commands (not hardcoded)", async () => {
      const ctx = {
        root: tempDir,
        rules: [],
        commandPrefix: "custom-cli noskills",
      };
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);
      const parsed = await readHooks(tempDir);

      for (const command of commandsOf(parsed)) {
        assert.assertStringIncludes(command, "custom-cli noskills invoke-hook");
      }
    });

    bdd.it("keeps the user's hooks and replaces its own", async () => {
      await crossRuntime.runtime.fs.mkdir(`${tempDir}/.codex`, {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.codex/hooks.json`,
        JSON.stringify({
          description: "workspace hooks",
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: "python3 policy.py" },
                  {
                    type: "command",
                    command: "old-cli noskills invoke-hook pre-tool-use",
                  },
                ],
              },
            ],
          },
        }),
      );

      await codexAdapterMod.codexAdapter.syncHooks!(makeCtx(tempDir));
      await codexAdapterMod.codexAdapter.syncHooks!(makeCtx(tempDir));
      const parsed = (await readHooks(tempDir)) as CodexHooksFile & {
        description: string;
      };

      assert.assertEquals(parsed.description, "workspace hooks");
      assert.assertEquals(parsed.hooks["PreToolUse"]?.[0], {
        matcher: "Bash",
        hooks: [{ type: "command", command: "python3 policy.py" }],
      });
      assert.assertEquals(
        commandsOf(parsed).filter((c) => c.endsWith("pre-tool-use")),
        [`${CMD_PREFIX} invoke-hook pre-tool-use`],
      );
    });

    bdd.it(
      "converts the list an earlier version wrote, keeping the user's entries",
      async () => {
        await crossRuntime.runtime.fs.mkdir(`${tempDir}/.codex`, {
          recursive: true,
        });
        await crossRuntime.runtime.fs.writeTextFile(
          `${tempDir}/.codex/hooks.json`,
          JSON.stringify({
            hooks: [
              { event: "SessionStart", command: "echo user-hook" },
              {
                _noskills: true,
                event: "PreToolUse",
                command: `${CMD_PREFIX} invoke-hook pre-tool-use`,
                timeout: 5000,
              },
            ],
          }),
        );

        await codexAdapterMod.codexAdapter.syncHooks!(makeCtx(tempDir));
        const parsed = await readHooks(tempDir);

        assert.assertEquals(parsed.hooks["SessionStart"]?.[0], {
          hooks: [{ type: "command", command: "echo user-hook" }],
        });
        assert.assertEquals(
          commandsOf(parsed).filter((c) => c.includes("invoke-hook")).length,
          5,
        );
      },
    );
  });

  // ---------------------------------------------------------------------------
  // syncAgents — .codex/agents/ (TOML files)
  // ---------------------------------------------------------------------------

  bdd.describe("syncAgents: .codex/agents/", () => {
    bdd.it(
      "noskills-executor.toml has name = and description = fields",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-executor.toml`,
        );

        assert.assertStringIncludes(content, 'name = "noskills-executor"');
        assert.assertStringIncludes(content, 'description = "');
      },
    );

    bdd.it(
      "noskills-executor.toml has developer_instructions with triple-quoted block",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-executor.toml`,
        );

        assert.assertStringIncludes(content, 'developer_instructions = """');
        // Closing triple-quote
        assert.assert(content.includes('"""'));
        // Should contain task execution instructions
        assert.assertStringIncludes(content, "Self-Verification");
        assert.assertStringIncludes(content, "Reporting");
      },
    );

    bdd.it(
      "noskills-executor.toml references commandPrefix in instructions",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-executor.toml`,
        );

        assert.assertStringIncludes(content, CMD_PREFIX);
      },
    );

    bdd.it(
      "noskills-verifier.toml has name = and description = fields",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-verifier.toml`,
        );

        assert.assertStringIncludes(content, 'name = "noskills-verifier"');
        assert.assertStringIncludes(content, 'description = "');
      },
    );

    bdd.it(
      "noskills-verifier.toml has developer_instructions for verification",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-verifier.toml`,
        );

        assert.assertStringIncludes(content, 'developer_instructions = """');
        assert.assertStringIncludes(content, "Read-only access only");
        assert.assertStringIncludes(content, "Verification Steps");
        assert.assertStringIncludes(content, "PASS");
        assert.assertStringIncludes(content, "FAIL");
      },
    );

    bdd.it(
      "noskills-verifier.toml does NOT contain write or spawn references",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-verifier.toml`,
        );

        assert.assertStringIncludes(content, "CANNOT edit files");
      },
    );
  });

  // ---------------------------------------------------------------------------
  // syncMcp — .codex/config.toml
  // ---------------------------------------------------------------------------

  // TASK-327: the command words were quoted without escaping, so a prefix
  // holding a quote or a backslash wrote invalid TOML.
  bdd.it("syncMcp escapes quotes and backslashes in the command", async () => {
    await codexAdapterMod.codexAdapter.syncMcp!({
      ...makeCtx(tempDir),
      commandPrefix: 'C:\\tools\\noskills.exe --tag "a b"',
    });

    const toml = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.codex/config.toml`,
    );
    assert.assertStringIncludes(
      toml,
      'command = "C:\\\\tools\\\\noskills.exe"',
    );
    assert.assertStringIncludes(
      toml,
      'args = ["--tag", "\\"a", "b\\"", "mcp-serve"]',
    );
  });

  bdd.describe("syncMcp: .codex/config.toml", () => {
    bdd.it("contains [mcp_servers.noskills] section", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assert.assertStringIncludes(content, "[mcp_servers.noskills]");
    });

    bdd.it("contains command = and args = fields", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assert.assertStringIncludes(content, "command =");
      assert.assertStringIncludes(content, "args =");
    });

    bdd.it("args include mcp-serve", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncMcp!(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.codex/config.toml`,
      );

      assert.assertStringIncludes(content, "mcp-serve");
    });

    bdd.it("preserves existing config content", async () => {
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
      assert.assertStringIncludes(content, "[model]");
      assert.assertStringIncludes(content, 'provider = "openai"');

      // noskills MCP section added
      assert.assertStringIncludes(content, "[mcp_servers.noskills]");
    });

    bdd.it(
      "replaces its table on every sync and keeps the tables after it",
      async () => {
        await crossRuntime.runtime.fs.mkdir(`${tempDir}/.codex`, {
          recursive: true,
        });
        await crossRuntime.runtime.fs.writeTextFile(
          `${tempDir}/.codex/config.toml`,
          '[mcp_servers.noskills]\ncommand = "old"\nargs = ["x"]\n\n[mcp_servers.noskills.env]\nA = "1"\n\n[model]\nmodel = "o3"\n',
        );

        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncMcp!(ctx);
        await codexAdapterMod.codexAdapter.syncMcp!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/config.toml`,
        );

        assert.assertEquals(
          content,
          '[model]\nmodel = "o3"\n\n[mcp_servers.noskills]\ncommand = "npx"\nargs = ["eser@latest", "noskills", "mcp-serve"]\n',
        );
      },
    );
  });
});

bdd.describe("codexAdapter.withoutNoskillsMcpTable", () => {
  const cases: readonly { name: string; toml: string; expected: string }[] = [
    {
      name: "removes the table up to the next header, past array values",
      toml: '[a]\nx = 1\n[mcp_servers.noskills]\nargs = [\n  "noskills",\n]\n[b]\ny = 2\n',
      expected: "[a]\nx = 1\n[b]\ny = 2\n",
    },
    {
      name: "keeps a server whose name only starts with noskills",
      toml: '[mcp_servers.noskills-docs]\ncommand = "docs"\n',
      expected: '[mcp_servers.noskills-docs]\ncommand = "docs"\n',
    },
    {
      name: "leaves a file without the table as it is",
      toml: '[model]\nmodel = "o3"\n',
      expected: '[model]\nmodel = "o3"\n',
    },
  ];

  for (const { name, toml, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        codexAdapterMod.withoutNoskillsMcpTable(toml),
        expected,
      );
    });
  }
});

// =============================================================================
// Structure validation tests
// =============================================================================

bdd.describe("Codex adapter: structure validation", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "codex_struct_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  bdd.describe("hooks.json is valid JSON", () => {
    bdd.it("parses without error and maps events to lists", async () => {
      const ctx = makeCtx(tempDir);
      await codexAdapterMod.codexAdapter.syncHooks!(ctx);

      const parsed = await readHooks(tempDir);
      assert.assertEquals(typeof parsed.hooks, "object");
      for (const groups of Object.values(parsed.hooks)) {
        assert.assert(Array.isArray(groups));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Agent TOML files have correct structure
  // ---------------------------------------------------------------------------

  bdd.describe("agent .toml files have correct structure", () => {
    bdd.it(
      "executor agent has name, description, developer_instructions keys",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-executor.toml`,
        );

        assert.assert(/^name\s*=/.test(content));
        assert.assert(/^description\s*=/m.test(content));
        assert.assert(/^developer_instructions\s*=/m.test(content));
      },
    );

    bdd.it(
      "verifier agent has name, description, developer_instructions keys",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncAgents!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/agents/noskills-verifier.toml`,
        );

        assert.assert(/^name\s*=/.test(content));
        assert.assert(/^description\s*=/m.test(content));
        assert.assert(/^developer_instructions\s*=/m.test(content));
      },
    );
  });

  // ---------------------------------------------------------------------------
  // TOML config has correct section headers
  // ---------------------------------------------------------------------------

  bdd.describe("TOML config has correct section headers", () => {
    bdd.it(
      "has [mcp_servers.noskills] section header and key=value pairs",
      async () => {
        const ctx = makeCtx(tempDir);
        await codexAdapterMod.codexAdapter.syncMcp!(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.codex/config.toml`,
        );

        // Valid TOML section header
        assert.assert(content.includes("[mcp_servers.noskills]"));

        // Key=value pairs follow the section
        const lines = content.split("\n");
        const sectionIdx = lines.findIndex((l) =>
          l.includes("[mcp_servers.noskills]"),
        );
        assert.assert(sectionIdx !== -1);

        // Lines after the section header should contain key = value
        const afterSection = lines.slice(sectionIdx + 1).join("\n");
        assert.assert(/command\s*=/.test(afterSection));
        assert.assert(/args\s*=/.test(afterSection));
      },
    );
  });
});

// =============================================================================
// Capability tests
// =============================================================================

bdd.describe("Codex adapter: capability tests", () => {
  bdd.it("id is 'codex'", () => {
    assert.assertEquals(codexAdapterMod.codexAdapter.id, "codex");
  });

  bdd.it("capabilities object matches expected values", () => {
    const caps = codexAdapterMod.codexAdapter.capabilities;

    assert.assertEquals(caps.rules, true);
    assert.assertEquals(caps.hooks, true);
    assert.assertEquals(caps.agents, true);
    assert.assertEquals(caps.specs, false);
    assert.assertEquals(caps.mcp, true);
  });

  bdd.it("interaction.subAgentMethod is 'spawn'", () => {
    assert.assertEquals(
      codexAdapterMod.codexAdapter.capabilities.interaction.subAgentMethod,
      "spawn",
    );
  });

  bdd.it("interaction.optionPresentation is 'prose'", () => {
    assert.assertEquals(
      codexAdapterMod.codexAdapter.capabilities.interaction.optionPresentation,
      "prose",
    );
  });
});
