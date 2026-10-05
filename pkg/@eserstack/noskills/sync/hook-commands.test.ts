// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as gitWrapper from "../commands/git-wrapper.ts";
import * as hookCommands from "./hook-commands.ts";

bdd.describe("HOOK_TIMEOUT_SECONDS", () => {
  bdd.it("gives PreToolUse as long as the git wrapper's check", () => {
    assert.assertEquals(
      hookCommands.HOOK_TIMEOUT_SECONDS["pre-tool-use"],
      gitWrapper.GIT_CHECK_TIMEOUT_SECONDS,
    );
    assert.assertEquals(hookCommands.HOOK_TIMEOUT_SECONDS["pre-tool-use"], 30);
  });
});

bdd.describe("hookCommand", () => {
  bdd.it("joins the prefix, invoke-hook, the event and its arguments", () => {
    assert.assertEquals(
      hookCommands.hookCommand("eser noskills", "session-start", [
        "--tool=copilot-cli",
      ]),
      "eser noskills invoke-hook session-start --tool=copilot-cli",
    );
  });
});

bdd.describe("isNoskillsHookCommand", () => {
  const cases: readonly [unknown, boolean][] = [
    ["npx eser@latest noskills invoke-hook pre-tool-use", true],
    ["eser noskills invoke-hook session-start --tool=copilot-cli", true],
    ["old-cli invoke-hook stop", true],
    ["python3 policy.py", false],
    ["noskills invoke-hook git-exec", false],
    ["invoke-hook pre-tool-user", false],
    [42, false],
  ];

  for (const [command, expected] of cases) {
    bdd.it(`${expected ? "matches" : "skips"} ${String(command)}`, () => {
      assert.assertEquals(
        hookCommands.isNoskillsHookCommand(command),
        expected,
      );
    });
  }
});

bdd.describe("networkRunnerOf", () => {
  const cases: readonly [string, string | null][] = [
    ["npx eser@latest noskills", "npx"],
    ["npx eser noskills", "npx"],
    ["pnpx eser noskills", "pnpx"],
    ["bunx eser noskills", "bunx"],
    ["npm exec eser -- noskills", "npm exec"],
    ["npm x eser noskills", "npm x"],
    ["pnpm dlx eser noskills", "pnpm dlx"],
    ["yarn dlx eser noskills", "yarn dlx"],
    [
      "deno run --allow-all jsr:@eserstack/cli noskills",
      "deno run jsr:@eserstack/cli",
    ],
    ["deno x npm:eser noskills", "deno x npm:eser"],
    ["NODE_OPTIONS=--x npx eser noskills", "npx"],
    ["eser noskills", null],
    ["deno task cli noskills", null],
    ["deno run -A ./main.ts", null],
    ["npm run noskills", null],
    ["pnpm exec noskills", null],
    ["", null],
  ];

  for (const [command, expected] of cases) {
    bdd.it(`${command === "" ? "(empty)" : command} -> ${expected}`, () => {
      assert.assertEquals(hookCommands.networkRunnerOf(command), expected);
    });
  }
});

bdd.describe("networkCommandWarning", () => {
  bdd.it("names the command, the timeout and the installed command", () => {
    const warning = hookCommands.networkCommandWarning(
      "npx eser@latest noskills",
    );

    assert.assertNotEquals(warning, null);
    assert.assertStringIncludes(warning ?? "", '"npx eser@latest noskills"');
    assert.assertStringIncludes(warning ?? "", "30 seconds");
    assert.assertStringIncludes(warning ?? "", "eser noskills init");
  });

  bdd.it("says nothing for an installed command", () => {
    assert.assertEquals(
      hookCommands.networkCommandWarning("eser noskills"),
      null,
    );
  });
});

bdd.describe("userHookGroups and mergeHookGroups", () => {
  const userGroup = {
    matcher: "Bash",
    hooks: [{ type: "command", command: "./policy.sh" }],
  };
  const settingsHooks = {
    PreToolUse: [{
      ...userGroup,
      hooks: [
        ...userGroup.hooks,
        { type: "command", command: "x noskills invoke-hook pre-tool-use" },
      ],
    }],
    Stop: [{
      hooks: [{ type: "command", command: "x noskills invoke-hook stop" }],
    }],
    Broken: "not a list",
  };

  bdd.it("drops noskills' handlers and the groups they leave empty", () => {
    assert.assertEquals(hookCommands.userHookGroups(settingsHooks), {
      PreToolUse: [userGroup],
    });
  });

  bdd.it("gives nothing for a value that is not an object", () => {
    assert.assertEquals(hookCommands.userHookGroups([1, 2]), {});
    assert.assertEquals(hookCommands.userHookGroups(undefined), {});
  });

  bdd.it("puts noskills' groups after the user's in each event", () => {
    const ours = { hooks: [{ type: "command", command: "y" }] };

    assert.assertEquals(
      hookCommands.mergeHookGroups(
        { PreToolUse: [userGroup], Notification: [userGroup] },
        { PreToolUse: [ours], Stop: [ours] },
      ),
      {
        PreToolUse: [userGroup, ours],
        Notification: [userGroup],
        Stop: [ours],
      },
    );
  });
});
