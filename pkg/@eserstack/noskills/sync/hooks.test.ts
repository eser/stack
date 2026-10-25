// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the Claude Code hook settings that `syncHooks` writes to
 * `.claude/settings.json`. What each hook decides is tested against the real
 * code: the pure decisions in commands/hook-decisions.test.ts, the handlers in
 * commands/invoke-hook.test.ts and the git guard in
 * commands/git-guard-hook.test.ts.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as hooks from "./hooks.ts";

type HookEntry = {
  readonly matcher?: string;
  readonly hooks: readonly {
    readonly type: string;
    readonly command: string;
    readonly timeout: number;
  }[];
};

type Settings = {
  readonly model?: string;
  readonly hooks: Readonly<Record<string, readonly HookEntry[]>>;
};

const PREFIX = "deno task cli noskills";

const readSettings = async (root: string): Promise<Settings> =>
  JSON.parse(
    await runtime.fs.readTextFile(`${root}/.claude/settings.json`),
  ) as Settings;

bdd.describe("syncHooks", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_sync_hooks_" });
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  // TASK-327: a settings.json holding null threw on null["hooks"].
  bdd.it("treats a settings.json holding null as empty", async () => {
    await runtime.fs.mkdir(`${root}/.claude`, { recursive: true });
    await runtime.fs.writeTextFile(`${root}/.claude/settings.json`, "null");

    await hooks.syncHooks(root, PREFIX);

    const settings = await readSettings(root);
    assert.assert(settings.hooks !== undefined);
  });

  bdd.it("runs every hook through the invoke-hook command", async () => {
    await hooks.syncHooks(root, PREFIX);
    const settings = await readSettings(root);

    const commands = Object.values(settings.hooks).flatMap((entries) =>
      entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)),
    );

    assert.assertEquals(commands.toSorted(), [
      `${PREFIX} invoke-hook post-ask-user-question`,
      `${PREFIX} invoke-hook post-bash`,
      `${PREFIX} invoke-hook post-file-write`,
      `${PREFIX} invoke-hook pre-tool-use`,
      `${PREFIX} invoke-hook session-start`,
      `${PREFIX} invoke-hook stop`,
    ]);
  });

  bdd.it("gates Bash and the file tools before they run", async () => {
    await hooks.syncHooks(root, PREFIX);
    const settings = await readSettings(root);

    assert.assertEquals(
      settings.hooks["PreToolUse"]?.[0]?.matcher,
      "Write|Edit|MultiEdit|Bash",
    );
  });

  bdd.it(
    "gives PreToolUse 30 seconds, so a slow npx does not skip the guard",
    async () => {
      await hooks.syncHooks(root, PREFIX);
      const settings = await readSettings(root);

      assert.assertEquals(
        settings.hooks["PreToolUse"]?.[0]?.hooks[0]?.timeout,
        30,
      );
    },
  );

  bdd.it("keeps the settings that are not hooks", async () => {
    await runtime.fs.mkdir(`${root}/.claude`, { recursive: true });
    await runtime.fs.writeTextFile(
      `${root}/.claude/settings.json`,
      JSON.stringify({ model: "opus", hooks: { Stop: [] } }),
    );

    await hooks.syncHooks(root, PREFIX);
    const settings = await readSettings(root);

    assert.assertEquals(settings.model, "opus");
    assert.assertEquals(settings.hooks["SessionStart"]?.length, 1);
  });

  bdd.it("keeps the user's own hooks and replaces its own", async () => {
    await runtime.fs.mkdir(`${root}/.claude`, { recursive: true });
    await runtime.fs.writeTextFile(
      `${root}/.claude/settings.json`,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "./scripts/policy.sh" }],
            },
          ],
        },
      }),
    );

    await hooks.syncHooks(root, "old-cli noskills");
    await hooks.syncHooks(root, PREFIX);
    const settings = await readSettings(root);

    assert.assertEquals(
      settings.hooks["PreToolUse"]?.map((entry) => entry.hooks[0]?.command),
      ["./scripts/policy.sh", `${PREFIX} invoke-hook pre-tool-use`],
    );
  });
});
