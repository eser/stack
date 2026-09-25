// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import {
  feedsShellFromStdin,
  hasGitWrite,
  shellScriptTargets,
  writesFile,
} from "./git.ts";

// Shapes from the security audit that reached git without being denied.
const BYPASSES = [
  "g''it push origin main",
  'g""it push origin main',
  '"git" push origin main',
  "'git' push origin main",
  "\\git push origin main",
  "GIT push origin main",
  "Git commit -m x",
  "GIT=$(which g?t); $GIT push",
  "${G} push origin main",
  "env FOO=1 git push",
  "FOO=1 git commit -m x",
  "sudo -E git push",
  "sh <<< 'git push origin main'",
  "bash << EOF\ngit push origin main\nEOF",
  "echo 'git push origin main' | sh",
  'printf "git push" | bash -s',
];

const BENIGN = [
  "git status",
  "GIT_PAGER=cat git log --oneline",
  "env NO_COLOR=1 git diff",
  'echo "git push"',
  'rg "git push" src/',
  "ls | grep git",
  "cat README.md | sh",
  "deno task test",
  "echo $HOME",
];

Deno.test("reported bypass shapes are git writes", () => {
  for (const cmd of BYPASSES) assertEquals(hasGitWrite(cmd), true, cmd);
});

Deno.test("read-only and non-git commands stay allowed", () => {
  for (const cmd of BENIGN) assertEquals(hasGitWrite(cmd), false, cmd);
});

Deno.test("stdin-fed shells and script files are recognised", () => {
  assertEquals(feedsShellFromStdin("echo x | sh"), true);
  assertEquals(feedsShellFromStdin("sh <<< 'x'"), true);
  assertEquals(feedsShellFromStdin("sh run.sh"), false);
  assertEquals(
    shellScriptTargets(
      "printf x > r.sh; sh r.sh && bash -e run.sh; source env.sh; . ./x.sh; sh -c 'y'",
    ),
    ["r.sh", "run.sh", "env.sh", "./x.sh"],
  );
  assertEquals(
    writesFile("printf 'g%sit push' '' > r.sh; sh r.sh", "r.sh"),
    true,
  );
  assertEquals(writesFile("sh r.sh", "r.sh"), false);
});
