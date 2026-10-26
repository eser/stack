// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as install from "./install.ts";

// git exports GIT_DIR and GIT_INDEX_FILE, among others, to a hook in a linked
// worktree. The workflows a hook runs include tests that create scratch
// repositories; with those variables inherited, their git calls wrote
// commits, tags and config into the repository being committed to.
nodeTest.test(
  "generateHookScript clears the repository variables git exports to hooks",
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eser-hook-"));
    try {
      const names = [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_PREFIX",
      ];
      const probe = `for v in ${names.join(" ")}; do eval "echo $v=\\\${$v-unset}"; done #`;
      const script = path.join(dir, "pre-commit");
      await fs.writeFile(
        script,
        install.generateHookScript(probe, "precommit", ""),
      );

      const out = childProcess.execFileSync("sh", [script], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_DIR: path.join(dir, "repo", ".git", "worktrees", "wt"),
          GIT_WORK_TREE: dir,
          GIT_INDEX_FILE: path.join(dir, "index"),
          GIT_COMMON_DIR: path.join(dir, "repo", ".git"),
          GIT_PREFIX: "sub/",
        },
      });

      assert.assertEquals(out, names.map((name) => `${name}=unset\n`).join(""));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);

nodeTest.test("parseInstallArgs reads the long flags", () => {
  assert.assertEquals(
    install.parseInstallArgs(["--force", "--dry-run", "--help"]),
    { help: true, force: true, dryRun: true },
  );
});

nodeTest.test("parseInstallArgs reads the -f, -n and -h aliases", () => {
  assert.assertEquals(install.parseInstallArgs(["-f", "-n"]), {
    help: false,
    force: true,
    dryRun: true,
  });
  assert.assertEquals(install.parseInstallArgs(["-h"]).help, true);
});

nodeTest.test("parseInstallArgs defaults every flag to false", () => {
  assert.assertEquals(install.parseInstallArgs(), {
    help: false,
    force: false,
    dryRun: false,
  });
});

nodeTest.test(
  "parseHelpArgs reads --help and -h for uninstall and status",
  () => {
    assert.assertEquals(install.parseHelpArgs(["--help"]), { help: true });
    assert.assertEquals(install.parseHelpArgs(["-h"]), { help: true });
    assert.assertEquals(install.parseHelpArgs([]), { help: false });
  },
);
