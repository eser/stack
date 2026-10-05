// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the `noskills purge` command and `noskills purge restore`.
 *
 * The --force and restore tests use a temporary project passed as the root,
 * never the working directory.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as yaml from "@eemeli/yaml";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";
import * as purgeHistory from "../state/purge-history.ts";
import * as syncEngine from "../sync/engine.ts";
import * as purge from "./purge.ts";

// =============================================================================
// Module structure
// =============================================================================

bdd.describe("noskills purge: module structure", () => {
  bdd.it("exports main as a function", () => {
    assert.assertExists(purge.main);
    assert.assertEquals(typeof purge.main, "function");
  });
});

// =============================================================================
// Agent mode without --force
// =============================================================================

// TUI writes to stderr asynchronously — disable sanitizers to avoid false leak detection
bdd.describe({
  name: "noskills purge: agent mode without --force",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    bdd.it("returns exit code 1", async () => {
      const result = await purge.main(["--agent"]);

      assert.assertEquals(results.isFail(result), true);

      if (results.isFail(result)) {
        assert.assertEquals(result.error.exitCode, 1);
      }
    });

    bdd.it("fails with --no-history but without --force", async () => {
      const result = await purge.main(["--agent", "--no-history"]);

      assert.assertEquals(results.isFail(result), true);

      if (results.isFail(result)) {
        assert.assertEquals(result.error.exitCode, 1);
      }
    });

    bdd.it("refuses an argument it does not know", async () => {
      const cases = [["--agent", "--some-flag"], ["--agent", "--force", "x"]];

      for (const args of cases) {
        // Each case runs on its own; none of them may touch the project.
        // deno-lint-ignore no-await-in-loop
        const result = await purge.main(args);

        assert.assertEquals(results.isFail(result), true, args.join(" "));
      }
    });
  },
});

// =============================================================================
// Agent mode with --force
// =============================================================================

const MANIFEST = `precommit:
  validators: [fmt]
noskills:
  concerns: [open-source]
`;

const SETTINGS = JSON.stringify({
  permissions: { allow: [] },
  hooks: {
    PreToolUse: [{
      matcher: "Bash",
      hooks: [
        { type: "command", command: "./scripts/policy.sh" },
        { type: "command", command: "eser noskills invoke-hook pre-tool-use" },
      ],
    }],
    Stop: [{
      hooks: [{ type: "command", command: "eser noskills invoke-hook stop" }],
    }],
  },
});

// Every path purge removes, each seeded with content first.
const SEEDED_FILES: Readonly<Record<string, string>> = {
  ".eser/concerns/c.json": "{}",
  ".eser/specs/s/spec.md": "# s",
  ".eser/rules/r.md": "rule",
  ".eser/.state/progresses/state.json": "{}",
  ".claude/agents/noskills-executor.md": "agent",
  ".cursorrules": "rules",
  ".github/copilot-instructions.md": "rules",
  ".kiro/hooks/noskills.json": "{}",
  ".github/hooks/noskills.json": "{}",
  ".opencode/plugins/noskills.ts": "export {};",
};

bdd.describe({
  name: "noskills purge: agent mode with --force",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    let root: string;

    bdd.beforeEach(async () => {
      root = await runtime.fs.makeTempDir({ prefix: "nos_purge_" });
      await Promise.all(
        Object.entries(SEEDED_FILES).map(async ([path, content]) => {
          await runtime.fs.mkdir(runtime.path.dirname(`${root}/${path}`), {
            recursive: true,
          });
          await runtime.fs.writeTextFile(`${root}/${path}`, content);
        }),
      );
      await runtime.fs.writeTextFile(`${root}/.eser/manifest.yml`, MANIFEST);
      await runtime.fs.writeTextFile(`${root}/.claude/settings.json`, SETTINGS);
      await runtime.fs.writeTextFile(`${root}/keep.txt`, "project file");
    });

    bdd.afterEach(async () => {
      await runtime.fs.remove(root, { recursive: true });
    });

    bdd.it("removes noskills content and keeps everything else", async () => {
      const result = await purge.main(["--agent", "--force"], root);

      assert.assertEquals(results.isOk(result), true);
      const left = await Promise.all(
        Object.keys(SEEDED_FILES).map(async (path) =>
          (await runtime.fs.exists(`${root}/${path}`)) ? path : null
        ),
      );
      assert.assertEquals(left.filter((path) => path !== null), []);

      const manifest = await runtime.fs.readTextFile(
        `${root}/.eser/manifest.yml`,
      );
      assert.assertStringIncludes(manifest, "precommit:");
      assert.assertEquals(manifest.includes("noskills:"), false);

      // The user's own hook stays; noskills' hooks go.
      const settings = JSON.parse(
        await runtime.fs.readTextFile(`${root}/.claude/settings.json`),
      );
      assert.assertEquals(settings.hooks, {
        PreToolUse: [{
          matcher: "Bash",
          hooks: [{ type: "command", command: "./scripts/policy.sh" }],
        }],
      });
      assert.assertEquals("permissions" in settings, true);
      assert.assertEquals(await runtime.fs.exists(`${root}/keep.txt`), true);
    });

    bdd.it("keeps every removed category in one history entry", async () => {
      await purge.main(["--agent", "--force"], root);

      const entries = await purgeHistory.listEntries(root);
      assert.assertEquals(entries.length, 1);
      assert.assertEquals(entries[0]?.categories, [
        "concerns",
        "specs",
        "rules",
        "manifest",
        "agent-integration",
      ]);

      const entryDir = `${root}/${purgeHistory.entryPath(entries[0]!.id)}`;
      const kept = await Promise.all(
        Object.entries(SEEDED_FILES).map(async ([path, content]) => {
          const category = path.startsWith(".eser/concerns")
            ? "concerns"
            : path.startsWith(".eser/rules")
            ? "rules"
            : path.startsWith(".eser/")
            ? "specs"
            : "agent-integration";

          return (await runtime.fs.readTextFile(
            `${entryDir}/${category}/${path}`,
          )) === content;
        }),
      );
      assert.assertEquals(kept.every((same) => same), true);
    });

    bdd.it("deletes without a copy with --no-history", async () => {
      const result = await purge.main(
        ["--agent", "--force", "--no-history"],
        root,
      );

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(
        await runtime.fs.exists(`${root}/.eser/concerns/c.json`),
        false,
      );
      assert.assertEquals(
        await runtime.fs.exists(
          `${root}/${persistence.paths.purgeHistoryDir}`,
        ),
        false,
      );
    });

    bdd.it("succeeds when there is nothing to purge", async () => {
      const empty = await runtime.fs.makeTempDir({
        prefix: "nos_purge_empty_",
      });
      try {
        const result = await purge.main(["--agent", "--force"], empty);

        assert.assertEquals(results.isOk(result), true);
        // Neither a history entry nor .eser/ is created.
        assert.assertEquals(await runtime.fs.exists(`${empty}/.eser`), false);
      } finally {
        await runtime.fs.remove(empty, { recursive: true });
      }
    });
  },
});

// =============================================================================
// purge restore
// =============================================================================

const SYNCED_MANIFEST = `precommit:
  validators: [fmt]
noskills:
  command: eser noskills
  concerns: [open-source]
  tools: [claude-code, cursor]
  providers: []
  maxIterationsBeforeRestart: 15
  verifyCommand: null
  allowGit: false
`;

const USER_HOOK = { type: "command", command: "./scripts/policy.sh" };

// A sample file of each category purge moves, with its content.
const CATEGORY_SAMPLES: Readonly<
  Record<"concerns" | "specs" | "rules", readonly [string, string]>
> = {
  concerns: [".eser/concerns/open-source.json", '{"id":"open-source"}'],
  specs: [".eser/specs/photo/spec.md", "# photo"],
  rules: [".eser/rules/tabs.md", "Use tabs"],
};

/**
 * A project set up the way `noskills init` leaves it for Claude Code and
 * Cursor, with the user's own CLAUDE.md text and hook next to noskills' part.
 */
const seedSyncedProject = async (root: string): Promise<void> => {
  const files: Record<string, string> = {
    ".eser/manifest.yml": SYNCED_MANIFEST,
    ".eser/.state/progresses/state.json": "{}",
    "CLAUDE.md": "# My project\n",
    ".claude/settings.json": JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [USER_HOOK] }] },
    }),
    ...Object.fromEntries(Object.values(CATEGORY_SAMPLES)),
  };

  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      await runtime.fs.mkdir(runtime.path.dirname(`${root}/${path}`), {
        recursive: true,
      });
      await runtime.fs.writeTextFile(`${root}/${path}`, content);
    }),
  );

  const config = await persistence.readManifest(root);
  await syncEngine.syncAll(root, config?.tools ?? [], config);
};

const restore = (
  root: string,
  ...args: readonly string[]
): ReturnType<typeof purge.main> =>
  purge.main(["--agent", "restore", ...args], root);

const ALL_TOOLS = [
  "claude-code",
  "cursor",
  "kiro",
  "copilot",
  "windsurf",
  "opencode",
  "codex",
  "copilot-cli",
];

/** Every file in the project outside the purge history, with its content. */
const snapshot = async (
  root: string,
): Promise<Readonly<Record<string, string>>> => {
  const paths: string[] = [];
  for await (
    const entry of runtime.fs.walk(root, {
      includeDirs: false,
      skip: [/purge-history/],
    })
  ) {
    paths.push(runtime.path.relative(root, entry.path));
  }

  return Object.fromEntries(
    await Promise.all(
      paths.sort().map(async (path) => [
        path,
        await runtime.fs.readTextFile(`${root}/${path}`),
      ]),
    ),
  );
};

const hookCommandsIn = (settings: unknown): readonly string[] =>
  JSON.stringify(settings).match(/"command":"[^"]*"/g) ?? [];

bdd.describe({
  name: "noskills purge restore",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    let root: string;

    bdd.beforeEach(async () => {
      root = await runtime.fs.makeTempDir({ prefix: "nos_restore_" });
      await seedSyncedProject(root);
    });

    bdd.afterEach(async () => {
      await runtime.fs.remove(root, { recursive: true });
    });

    for (
      const [category, [path, content]] of Object.entries(CATEGORY_SAMPLES)
    ) {
      bdd.it(`restores ${category} on its own`, async () => {
        await purge.main(["--agent", "--force"], root);
        assert.assertEquals(await runtime.fs.exists(`${root}/${path}`), false);

        const result = await restore(root, "latest", category);

        assert.assertEquals(results.isOk(result), true);
        assert.assertEquals(
          await runtime.fs.readTextFile(`${root}/${path}`),
          content,
        );
        // Only the chosen category comes back.
        const others = Object.entries(CATEGORY_SAMPLES).filter(([name]) =>
          name !== category
        );
        const back = await Promise.all(
          others.map(([, [otherPath]]) =>
            runtime.fs.exists(`${root}/${otherPath}`)
          ),
        );
        assert.assertEquals(back, [false, false]);
        assert.assertEquals(await persistence.isInitialized(root), false);
      });
    }

    bdd.it("restores the workflow state with the specs", async () => {
      await purge.main(["--agent", "--force"], root);
      await restore(root, "latest", "specs");

      assert.assertEquals(
        await runtime.fs.readTextFile(
          `${root}/${persistence.paths.stateFile}`,
        ),
        "{}",
      );
    });

    bdd.it("restores the noskills section of the manifest", async () => {
      await purge.main(["--agent", "--force"], root);
      assert.assertEquals(await persistence.isInitialized(root), false);

      const result = await restore(root, "latest", "manifest");

      assert.assertEquals(results.isOk(result), true);
      const manifest = yaml.parse(
        await runtime.fs.readTextFile(`${root}/.eser/manifest.yml`),
      );
      assert.assertEquals(manifest.precommit, { validators: ["fmt"] });
      assert.assertEquals(manifest.noskills.command, "eser noskills");
      assert.assertEquals(manifest.noskills.tools, ["claude-code", "cursor"]);
    });

    bdd.it(
      "restores the agent integration by running sync with the manifest",
      async () => {
        const before = {
          claudeMd: await runtime.fs.readTextFile(`${root}/CLAUDE.md`),
          cursorrules: await runtime.fs.readTextFile(`${root}/.cursorrules`),
        };
        await purge.main(["--agent", "--force"], root);
        assert.assertEquals(
          (await runtime.fs.readTextFile(`${root}/CLAUDE.md`)).includes(
            "<!-- noskills:start -->",
          ),
          false,
        );

        // The rules go into the generated files, so they come back first.
        const result = await restore(
          root,
          "latest",
          "rules",
          "manifest",
          "agent-integration",
        );

        assert.assertEquals(results.isOk(result), true);
        assert.assertEquals(
          await runtime.fs.readTextFile(`${root}/CLAUDE.md`),
          before.claudeMd,
        );
        assert.assertEquals(
          await runtime.fs.readTextFile(`${root}/.cursorrules`),
          before.cursorrules,
        );
        assert.assertEquals(
          await runtime.fs.exists(
            `${root}/.claude/agents/noskills-executor.md`,
          ),
          true,
        );
        const commands = hookCommandsIn(
          JSON.parse(
            await runtime.fs.readTextFile(`${root}/.claude/settings.json`),
          ).hooks,
        );
        assert.assertEquals(
          commands.includes(`"command":"./scripts/policy.sh"`),
          true,
        );
        assert.assertEquals(
          commands.some((command) =>
            command.includes("eser noskills invoke-hook pre-tool-use")
          ),
          true,
        );
        // The specs were not asked for.
        assert.assertEquals(
          await runtime.fs.exists(`${root}/${CATEGORY_SAMPLES.specs[0]}`),
          false,
        );
      },
    );

    bdd.it(
      "does not restore the agent integration without a noskills section",
      async () => {
        await purge.main(["--agent", "--force"], root);

        const result = await restore(root, "latest", "agent-integration");

        assert.assertEquals(results.isFail(result), true);
        assert.assertEquals(
          await runtime.fs.exists(`${root}/.cursorrules`),
          false,
        );
        assert.assertEquals(
          (await runtime.fs.readTextFile(`${root}/CLAUDE.md`)).includes(
            "<!-- noskills:start -->",
          ),
          false,
        );
      },
    );

    bdd.it(
      "refuses to overwrite existing content unless --overwrite is passed",
      async () => {
        const [path, content] = CATEGORY_SAMPLES.concerns;
        await purge.main(["--agent", "--force"], root);
        await runtime.fs.mkdir(runtime.path.dirname(`${root}/${path}`), {
          recursive: true,
        });
        await runtime.fs.writeTextFile(`${root}/${path}`, "written later");

        const refused = await restore(root, "latest", "concerns");

        assert.assertEquals(results.isFail(refused), true);
        assert.assertEquals(
          await runtime.fs.readTextFile(`${root}/${path}`),
          "written later",
        );

        const replaced = await restore(
          root,
          "latest",
          "concerns",
          "--overwrite",
        );

        assert.assertEquals(results.isOk(replaced), true);
        assert.assertEquals(
          await runtime.fs.readTextFile(`${root}/${path}`),
          content,
        );
      },
    );

    bdd.it(
      "refuses to replace a noskills section written after the purge",
      async () => {
        await purge.main(["--agent", "--force"], root);
        await runtime.fs.writeTextFile(
          `${root}/.eser/manifest.yml`,
          "noskills:\n  command: deno task cli noskills\n",
        );

        const refused = await restore(root, "latest", "manifest");

        assert.assertEquals(results.isFail(refused), true);
        assert.assertEquals(
          (await persistence.readManifest(root))?.command,
          "deno task cli noskills",
        );

        await restore(root, "latest", "manifest", "--overwrite");

        assert.assertEquals(
          (await persistence.readManifest(root))?.command,
          "eser noskills",
        );
      },
    );

    bdd.it("restores every category of an entry by default", async () => {
      await purge.main(["--agent", "--force"], root);
      const [entry] = await purgeHistory.listEntries(root);

      const result = await restore(root, entry!.id);

      assert.assertEquals(results.isOk(result), true);
      const restored = await Promise.all(
        Object.values(CATEGORY_SAMPLES).map(([path]) =>
          runtime.fs.exists(`${root}/${path}`)
        ),
      );
      assert.assertEquals(restored, [true, true, true]);
      assert.assertEquals(await persistence.isInitialized(root), true);
      assert.assertEquals(
        await runtime.fs.exists(`${root}/.cursorrules`),
        true,
      );
    });

    bdd.it("keeps the newest five entries", async () => {
      const [path] = CATEGORY_SAMPLES.rules;

      for (let run = 1; run <= 7; run++) {
        // Purges run one after another, as a user runs them.
        // deno-lint-ignore no-await-in-loop
        await runtime.fs.mkdir(`${root}/.eser/rules`, { recursive: true });
        // deno-lint-ignore no-await-in-loop
        await runtime.fs.writeTextFile(`${root}/${path}`, `rule ${run}`);
        // deno-lint-ignore no-await-in-loop
        await purge.main(["--agent", "--force"], root);
      }

      const entries = await purgeHistory.listEntries(root);
      assert.assertEquals(entries.length, purgeHistory.PURGE_HISTORY_LIMIT);

      const kept = await Promise.all(
        entries.map((entry) =>
          runtime.fs.readTextFile(
            `${root}/${purgeHistory.entryPath(entry.id)}/rules/${path}`,
          )
        ),
      );
      assert.assertEquals(kept, [
        "rule 7",
        "rule 6",
        "rule 5",
        "rule 4",
        "rule 3",
      ]);
    });

    bdd.it("lists the history when no entry is named", async () => {
      await purge.main(["--agent", "--force"], root);

      assert.assertEquals(results.isOk(await restore(root)), true);
    });

    bdd.it("succeeds with nothing to list before any purge", async () => {
      assert.assertEquals(results.isOk(await restore(root)), true);
    });

    bdd.it("rejects arguments it cannot act on", async () => {
      await purge.main(["--agent", "--force"], root);
      const cases: readonly (readonly string[])[] = [
        ["2026-01-01T00-00-00-000Z"],
        ["latest", "hooks"],
        ["latest", "--force"],
      ];

      for (const args of cases) {
        // Each case is checked on its own.
        // deno-lint-ignore no-await-in-loop
        const result = await restore(root, ...args);

        assert.assertEquals(results.isFail(result), true, args.join(" "));
      }
    });

    bdd.it(
      "rejects a category the entry did not keep",
      async () => {
        const rulesOnly = await runtime.fs.makeTempDir({
          prefix: "nos_restore_rules_",
        });
        try {
          const [path, content] = CATEGORY_SAMPLES.rules;
          await runtime.fs.mkdir(`${rulesOnly}/.eser/rules`, {
            recursive: true,
          });
          await runtime.fs.writeTextFile(`${rulesOnly}/${path}`, content);
          await purge.main(["--agent", "--force"], rulesOnly);

          const result = await restore(rulesOnly, "latest", "concerns");

          assert.assertEquals(results.isFail(result), true);
          assert.assertEquals(
            (await purgeHistory.listEntries(rulesOnly))[0]?.categories,
            ["rules"],
          );
        } finally {
          await runtime.fs.remove(rulesOnly, { recursive: true });
        }
      },
    );

    bdd.it(
      "takes every tool's files out and restores the project as it was",
      async () => {
        const project = await runtime.fs.makeTempDir({
          prefix: "nos_restore_all_",
        });
        try {
          const userFiles: Record<string, string> = {
            "AGENTS.md": "# Agents\n\nUser text.\n",
            ".codex/config.toml": '[model]\nmodel = "o3"\n',
            "opencode.json": '{\n  "theme": "dark"\n}\n',
          };
          await Promise.all(
            Object.entries({
              ...userFiles,
              ".eser/manifest.yml": SYNCED_MANIFEST.replace(
                "tools: [claude-code, cursor]",
                `tools: [${ALL_TOOLS.join(", ")}]`,
              ),
              ".eser/specs/photo/spec.md": "# Spec: photo\n",
            }).map(async ([path, content]) => {
              await runtime.fs.mkdir(
                runtime.path.dirname(`${project}/${path}`),
                { recursive: true },
              );
              await runtime.fs.writeTextFile(`${project}/${path}`, content);
            }),
          );
          const config = await persistence.readManifest(project);
          await syncEngine.syncAll(project, config?.tools ?? [], config);
          const before = await snapshot(project);

          await purge.main(["--agent", "--force"], project);

          // Only the user's content is left, in the files they share with
          // noskills.
          assert.assertEquals(await snapshot(project), {
            ...userFiles,
            ".eser/manifest.yml": "precommit:\n  validators: [fmt]\n",
          });

          const result = await restore(project, "latest");

          assert.assertEquals(results.isOk(result), true);
          assert.assertEquals(await snapshot(project), before);
        } finally {
          await runtime.fs.remove(project, { recursive: true });
        }
      },
    );

    bdd.it("never purges when --force comes before restore", async () => {
      const result = await purge.main(["--agent", "--force", "restore"], root);

      assert.assertEquals(results.isFail(result), true);
      assert.assertEquals(await persistence.isInitialized(root), true);
      assert.assertEquals(await purgeHistory.listEntries(root), []);
    });
  },
});
