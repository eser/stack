// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as assert from "@eserstack/test-kit/assert";
import * as release from "./release.ts";

const LOAD_ERROR = "eser-ajan native library unavailable: did not load";

/**
 * Runs `fn` inside a new git repository at version 1.2.3. The release flow
 * reads git and VERSION from the working directory.
 */
const inTempRepo = async <T>(
  fn: (run: (...args: string[]) => string) => Promise<T>,
): Promise<T> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eser-release-"));
  const previous = runtime.process.cwd();
  const run = (...args: string[]): string =>
    childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" });

  try {
    fs.writeFileSync(path.join(root, "VERSION"), "1.2.3\n");
    run("init", "-q", "-b", "main");
    run("add", "-A");
    run(
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release@example.com",
      "commit",
      "-q",
      "-m",
      "chore: start",
    );
    runtime.process.chdir(root);
    return await fn(run);
  } finally {
    runtime.process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const failingChangelog: release.ReleaseDeps = {
  generateChangelog: () => Promise.reject(new Error(LOAD_ERROR)),
};

// generateChangelog throws when the native library does not load or when git
// or the file write fails; no commit range makes it throw. Swallowing that
// reported "no user-facing changes" and tagged a release with no section, which
// the release gate only rejects after the tag is pushed.
nodeTest.test(
  "release surfaces a changelog failure and commits nothing",
  async () => {
    await inTempRepo(async (run) => {
      const head = run("rev-parse", "HEAD");

      const error = await assert.assertRejects(
        () => release.release({ type: "same", yes: true }, failingChangelog),
        Error,
        LOAD_ERROR,
      );

      assert.assertStringIncludes(error.message, "nothing was committed");
      assert.assertEquals(run("rev-parse", "HEAD"), head);
    });
  },
);

nodeTest.test("a dry run surfaces a changelog failure too", async () => {
  await inTempRepo(async () => {
    await assert.assertRejects(
      () =>
        release.release(
          { type: "same", dryRun: true, yes: true },
          failingChangelog,
        ),
      Error,
      LOAD_ERROR,
    );
  });
});

nodeTest.test("a dry run asks for a preview and changes nothing", async () => {
  await inTempRepo(async (run) => {
    const calls: unknown[] = [];

    const result = await release.release(
      { type: "same", dryRun: true, yes: true },
      {
        generateChangelog: (options) => {
          calls.push(options);
          return Promise.resolve({
            version: "1.2.3",
            commitCount: 1,
            entryCount: 1,
            content: "## 1.2.3 - 2026-11-07\n",
            dryRun: true,
          });
        },
      },
    );

    assert.assertEquals(calls, [{ dryRun: true, version: "1.2.3" }]);
    assert.assertEquals(result.changelogGenerated, true);
    assert.assertEquals(result.committed, false);
    assert.assertEquals(result.tagPushed, false);
    assert.assertEquals(run("status", "--porcelain"), "");
  });
});

nodeTest.test(
  "parseReleaseArgs reads the bump type, --dry-run and --yes",
  () => {
    const event = release.parseReleaseArgs(["minor", "--dry-run", "--yes"]);

    assert.assertEquals(event.command, "release");
    assert.assertEquals(event.args, ["minor"]);
    assert.assertEquals(event.flags["dry-run"], true);
    assert.assertEquals(event.flags["yes"], true);
  },
);

nodeTest.test("parseReleaseArgs reads the -n and -y aliases", () => {
  const event = release.parseReleaseArgs(["-n", "-y", "patch"]);

  assert.assertEquals(event.args, ["patch"]);
  assert.assertEquals(event.flags["dry-run"], true);
  assert.assertEquals(event.flags["yes"], true);
});

nodeTest.test("parseReleaseArgs leaves absent flags out", () => {
  const event = release.parseReleaseArgs(["major"]);

  assert.assertEquals(event.flags["dry-run"], undefined);
  assert.assertEquals(event.flags["yes"], undefined);
});

nodeTest.test(
  "parseRereleaseArgs reads --dry-run, --yes and their aliases",
  () => {
    assert.assertEquals(
      release.parseRereleaseArgs(["-n"]).flags["dry-run"],
      true,
    );
    assert.assertEquals(
      release.parseRereleaseArgs(["--yes"]).flags["yes"],
      true,
    );
    assert.assertEquals(release.parseRereleaseArgs([]).command, "rerelease");
  },
);

nodeTest.test("parseUnreleaseArgs reads --yes and -y", () => {
  assert.assertEquals(release.parseUnreleaseArgs(["-y"]).flags["yes"], true);
  assert.assertEquals(release.parseUnreleaseArgs(["--yes"]).flags["yes"], true);
  assert.assertEquals(release.parseUnreleaseArgs([]).flags["yes"], undefined);
});
