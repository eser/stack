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

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
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

type KiroHooksFile = {
  readonly version: string;
  readonly hooks: readonly {
    readonly name: string;
    readonly trigger: string;
    readonly matcher?: string;
    readonly action: { readonly type: string; readonly command: string };
    readonly timeout: number;
  }[];
};

const readHooks = async (root: string): Promise<KiroHooksFile> =>
  JSON.parse(
    await crossRuntime.runtime.fs.readTextFile(
      `${root}/.kiro/hooks/noskills.json`,
    ),
  ) as KiroHooksFile;

// =============================================================================
// Task 9: Snapshot tests — generated file content
// =============================================================================

bdd.describe("Kiro adapter: snapshot tests", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "kiro_snap_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // syncRules — protocol file
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: noskills-protocol.md", () => {
    bdd.it("contains YAML frontmatter with inclusion: always", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assert.assert(content.startsWith("---\n"));
      assert.assertStringIncludes(content, "inclusion: always");
    });

    bdd.it(
      "contains 'noskills Protocol' heading and protocol commands",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-protocol.md`,
        );

        assert.assertStringIncludes(content, "# noskills Protocol");
        assert.assertStringIncludes(content, `${CMD_PREFIX} spec`);
        assert.assertStringIncludes(content, `--answer=`);
      },
    );

    bdd.it(
      "includes git-read-only section when allowGit is not set",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-protocol.md`,
        );

        assert.assertStringIncludes(content, "Git is read-only");
      },
    );

    bdd.it("omits git-read-only section when allowGit is true", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx, { allowGit: true });

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-protocol.md`,
      );

      assert.assertEquals(content.includes("Git is read-only"), false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncRules — coaching file
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: noskills-coaching.md", () => {
    bdd.it(
      "contains YAML frontmatter with inclusion: auto and name: noskills-coaching",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-coaching.md`,
        );

        assert.assert(content.startsWith("---\n"));
        assert.assertStringIncludes(content, "inclusion: auto");
        assert.assertStringIncludes(content, "name: noskills-coaching");
      },
    );

    bdd.it("contains coaching content about convention discovery", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-coaching.md`,
      );

      assert.assertStringIncludes(content, "Convention discovery");
      assert.assertStringIncludes(content, `${CMD_PREFIX} rule add`);
    });
  });

  // ---------------------------------------------------------------------------
  // syncRules — rules file conditional generation
  // ---------------------------------------------------------------------------

  bdd.describe("syncRules: noskills-rules.md", () => {
    bdd.it("is NOT created when rules are empty", async () => {
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
      assert.assertEquals(exists, false);
    });

    bdd.it("IS created when rules are provided", async () => {
      const ctx = makeCtx(tempDir, ["Test rule 1", "Test rule 2"]);
      await kiroAdapterMod.kiroAdapter.syncRules(ctx);

      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-rules.md`,
      );

      assert.assertStringIncludes(content, "inclusion: always");
      assert.assertStringIncludes(content, "- Test rule 1");
      assert.assertStringIncludes(content, "- Test rule 2");
    });

    bdd.it("removes stale rules file when rules become empty", async () => {
      // First write with rules
      const ctxWithRules = makeCtx(tempDir, ["Existing rule"]);
      await kiroAdapterMod.kiroAdapter.syncRules(ctxWithRules);

      // Verify it exists
      const content = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/steering/noskills-rules.md`,
      );
      assert.assertStringIncludes(content, "Existing rule");

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
      assert.assertEquals(exists, false);
    });
  });

  // ---------------------------------------------------------------------------
  // syncHooks: .kiro/hooks/noskills.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncHooks: .kiro/hooks/noskills.json", () => {
    bdd.it("writes the v1 hook file with PascalCase triggers", async () => {
      await kiroAdapterMod.kiroAdapter.syncHooks!(makeCtx(tempDir));
      const parsed = await readHooks(tempDir);

      assert.assertEquals(parsed.version, "v1");
      assert.assertEquals(
        parsed.hooks.map((h) => h.trigger),
        ["SessionStart", "PreToolUse", "PostToolUse", "PostToolUse", "Stop"],
      );
      for (const hook of parsed.hooks) {
        assert.assert(hook.name.startsWith("noskills-"));
        assert.assertEquals(hook.action.type, "command");
        assert.assertStringIncludes(
          hook.action.command,
          `${CMD_PREFIX} invoke-hook `,
        );
      }
    });

    bdd.it(
      "guards the write and shell tools, with 30 seconds for the hook",
      async () => {
        await kiroAdapterMod.kiroAdapter.syncHooks!(makeCtx(tempDir));
        const parsed = await readHooks(tempDir);
        const pre = parsed.hooks.find((h) => h.trigger === "PreToolUse");

        assert.assertEquals(pre?.timeout, 30);
        const matcher = new RegExp(pre?.matcher ?? "^$");
        for (const tool of [
          "write",
          "fs_write",
          "fsWrite",
          "fs_append",
          "str_replace",
          "delete_file",
          "shell",
          "execute_bash",
          "execute_cmd",
        ]) {
          assert.assert(matcher.test(tool), tool);
        }
        assert.assertEquals(matcher.test("read"), false);
      },
    );

    bdd.it(
      "removes its entries from the old .kiro/settings/hooks.json",
      async () => {
        const settingsDir = `${tempDir}/.kiro/settings`;
        await crossRuntime.runtime.fs.mkdir(settingsDir, { recursive: true });
        await crossRuntime.runtime.fs.writeTextFile(
          `${settingsDir}/hooks.json`,
          JSON.stringify({
            hooks: [
              {
                trigger: "Custom User Hook",
                action: { type: "Run Command", command: "echo hello" },
              },
              {
                _noskills: true,
                trigger: "Pre Tool Use",
                action: {
                  type: "Run Command",
                  command: `${CMD_PREFIX} invoke-hook pre-tool-use`,
                },
              },
            ],
          }),
        );

        await kiroAdapterMod.kiroAdapter.syncHooks!(makeCtx(tempDir));

        const legacy = JSON.parse(
          await crossRuntime.runtime.fs.readTextFile(
            `${settingsDir}/hooks.json`,
          ),
        ) as { hooks: { trigger: string }[] };
        assert.assertEquals(
          legacy.hooks.map((h) => h.trigger),
          ["Custom User Hook"],
        );
      },
    );

    bdd.it(
      "deletes the old file when only its own entries were in it",
      async () => {
        const settingsDir = `${tempDir}/.kiro/settings`;
        await crossRuntime.runtime.fs.mkdir(settingsDir, { recursive: true });
        await crossRuntime.runtime.fs.writeTextFile(
          `${settingsDir}/hooks.json`,
          JSON.stringify({
            hooks: [{ _noskills: true, trigger: "Agent Stop" }],
          }),
        );

        await kiroAdapterMod.kiroAdapter.syncHooks!(makeCtx(tempDir));

        let exists = true;
        try {
          await crossRuntime.runtime.fs.stat(`${settingsDir}/hooks.json`);
        } catch {
          exists = false;
        }
        assert.assertEquals(exists, false);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // syncAgents — agent JSON files
  // ---------------------------------------------------------------------------

  bdd.describe("syncAgents: noskills-executor.json", () => {
    bdd.it("has correct tools list including 'delegate'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertArrayIncludes(parsed.tools, [
        "delegate",
        "read",
        "write",
        "shell",
      ]);
    });

    bdd.it("has name 'noskills-executor'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertEquals(parsed.name, "noskills-executor");
    });
  });

  bdd.describe("syncAgents: noskills-verifier.json", () => {
    bdd.it("has 'use_subagent' in tools", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertArrayIncludes(parsed.tools, ["use_subagent"]);
    });

    bdd.it("has name 'noskills-verifier'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertEquals(parsed.name, "noskills-verifier");
    });
  });

  // ---------------------------------------------------------------------------
  // syncMcp — mcp.json
  // ---------------------------------------------------------------------------

  bdd.describe("syncMcp: mcp.json", () => {
    bdd.it("has 'noskills' server entry with 'command' field", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assert(parsed.mcpServers !== undefined);
      assert.assert(parsed.mcpServers.noskills !== undefined);
      assert.assertEquals(typeof parsed.mcpServers.noskills.command, "string");
      assert.assert(parsed.mcpServers.noskills.command.length > 0);
    });

    bdd.it("has args array ending with 'mcp-serve'", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);

      const args = parsed.mcpServers.noskills.args;
      assert.assert(Array.isArray(args));
      assert.assertEquals(args[args.length - 1], "mcp-serve");
    });

    bdd.it("preserves existing non-noskills MCP servers", async () => {
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
      assert.assert(parsed.mcpServers["my-custom-server"] !== undefined);
      // noskills server added
      assert.assert(parsed.mcpServers.noskills !== undefined);
    });
  });
});

// =============================================================================
// Task 10: Structure validation tests
// =============================================================================

bdd.describe("Kiro adapter: structure validation", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "kiro_struct_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // ---------------------------------------------------------------------------
  // JSON files parse without error
  // ---------------------------------------------------------------------------

  bdd.describe("all JSON files parse without error", () => {
    bdd.it("hooks/noskills.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

      const parsed = await readHooks(tempDir);
      assert.assertEquals(typeof parsed, "object");
    });

    bdd.it("noskills-executor.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);
      assert.assertEquals(typeof parsed, "object");
    });

    bdd.it("noskills-verifier.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);
      assert.assertEquals(typeof parsed, "object");
    });

    bdd.it("mcp.json is valid JSON", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/settings/mcp.json`,
      );
      const parsed = JSON.parse(raw);
      assert.assertEquals(typeof parsed, "object");
    });
  });

  // ---------------------------------------------------------------------------
  // YAML frontmatter validation
  // ---------------------------------------------------------------------------

  bdd.describe("YAML frontmatter in steering files", () => {
    bdd.it(
      "protocol file starts with --- and has inclusion: field",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-protocol.md`,
        );

        assert.assert(content.startsWith("---\n"));
        const frontmatterEnd = content.indexOf("\n---\n", 4);
        assert.assert(frontmatterEnd > 0);
        const frontmatter = content.slice(4, frontmatterEnd);
        assert.assertStringIncludes(frontmatter, "inclusion:");
      },
    );

    bdd.it(
      "coaching file starts with --- and has inclusion: field",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-coaching.md`,
        );

        assert.assert(content.startsWith("---\n"));
        const frontmatterEnd = content.indexOf("\n---\n", 4);
        assert.assert(frontmatterEnd > 0);
        const frontmatter = content.slice(4, frontmatterEnd);
        assert.assertStringIncludes(frontmatter, "inclusion:");
      },
    );

    bdd.it(
      "rules file starts with --- and has inclusion: field when rules exist",
      async () => {
        const ctx = makeCtx(tempDir, ["A rule"]);
        await kiroAdapterMod.kiroAdapter.syncRules(ctx);

        const content = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/steering/noskills-rules.md`,
        );

        assert.assert(content.startsWith("---\n"));
        const frontmatterEnd = content.indexOf("\n---\n", 4);
        assert.assert(frontmatterEnd > 0);
        const frontmatter = content.slice(4, frontmatterEnd);
        assert.assertStringIncludes(frontmatter, "inclusion:");
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Agent JSON required fields
  // ---------------------------------------------------------------------------

  bdd.describe("agent JSON has required fields", () => {
    bdd.it("executor agent has name, description, tools, prompt", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-executor.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertEquals(typeof parsed.name, "string");
      assert.assertEquals(typeof parsed.description, "string");
      assert.assert(Array.isArray(parsed.tools));
      assert.assertEquals(typeof parsed.prompt, "string");
      assert.assert(parsed.name.length > 0);
      assert.assert(parsed.description.length > 0);
      assert.assert(parsed.tools.length > 0);
      assert.assert(parsed.prompt.length > 0);
    });

    bdd.it("verifier agent has name, description, tools, prompt", async () => {
      const ctx = makeCtx(tempDir);
      await kiroAdapterMod.kiroAdapter.syncAgents!(ctx);

      const raw = await crossRuntime.runtime.fs.readTextFile(
        `${tempDir}/.kiro/agents/noskills-verifier.json`,
      );
      const parsed = JSON.parse(raw);

      assert.assertEquals(typeof parsed.name, "string");
      assert.assertEquals(typeof parsed.description, "string");
      assert.assert(Array.isArray(parsed.tools));
      assert.assertEquals(typeof parsed.prompt, "string");
      assert.assert(parsed.name.length > 0);
      assert.assert(parsed.description.length > 0);
      assert.assert(parsed.tools.length > 0);
      assert.assert(parsed.prompt.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // MCP JSON structure
  // ---------------------------------------------------------------------------

  bdd.describe("MCP JSON structure", () => {
    bdd.it(
      "has mcpServers object with server entries having command + args",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncMcp!(ctx);

        const raw = await crossRuntime.runtime.fs.readTextFile(
          `${tempDir}/.kiro/settings/mcp.json`,
        );
        const parsed = JSON.parse(raw);

        assert.assertEquals(typeof parsed.mcpServers, "object");
        assert.assert(parsed.mcpServers !== null);

        for (const [_key, server] of Object.entries(parsed.mcpServers)) {
          const srv = server as { command: string; args: string[] };
          assert.assertEquals(typeof srv.command, "string");
          assert.assert(Array.isArray(srv.args));
        }
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Hooks JSON structure
  // ---------------------------------------------------------------------------

  bdd.describe("Hooks JSON structure", () => {
    bdd.it(
      "has hooks array where each entry has trigger + action fields",
      async () => {
        const ctx = makeCtx(tempDir);
        await kiroAdapterMod.kiroAdapter.syncHooks!(ctx);

        const parsed = await readHooks(tempDir);

        assert.assert(Array.isArray(parsed.hooks));

        for (const hook of parsed.hooks) {
          assert.assertEquals(typeof hook.trigger, "string");
          assert.assert(hook.trigger.length > 0);
          assert.assertEquals(typeof hook.action, "object");
          assert.assert(hook.action !== null);
          assert.assertEquals(typeof hook.action.type, "string");
          assert.assertEquals(typeof hook.action.command, "string");
        }
      },
    );
  });
});
