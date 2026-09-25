// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertNotEquals } from "@std/assert";
import { checkGitGuard } from "./invoke-hook.ts";

Deno.test("hook guard denies shapes that skipped the old substring pre-check", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (
      const cmd of [
        "GIT push origin main",
        "g''it push origin main",
        "GIT=$(which g?t); $GIT push",
        "echo 'git push origin main' | sh",
      ]
    ) {
      assertNotEquals(await checkGitGuard(cmd, false, root), null, cmd);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("hook guard inspects shell scripts it runs", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${root}/run.sh`,
      "#!/bin/sh\ngit push origin main\n",
    );
    await Deno.writeTextFile(
      `${root}/test.sh`,
      "#!/bin/sh\ndeno test\ngit status\n",
    );

    assertNotEquals(await checkGitGuard("bash run.sh", false, root), null);
    assertEquals(await checkGitGuard("bash test.sh", false, root), null);

    // Written and run by the same command: content is unknown ahead of time.
    assertNotEquals(
      await checkGitGuard(
        "printf 'g%sit push' '' > r.sh; sh r.sh",
        false,
        root,
      ),
      null,
    );

    // allowGit turns the guard off.
    assertEquals(await checkGitGuard("bash run.sh", true, root), null);
    assertEquals(await checkGitGuard("git status", false, root), null);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
