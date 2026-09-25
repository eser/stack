// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { hasGitWrite, isGitAllowed } from "./git.ts";

const READS = [
  "git config --get user.name",
  "git config --global --get user.email",
  "git config --local --get-regexp ^remote",
  "git config --list",
  "git config --global --list --show-origin",
  "git config -l",
  "git config user.name",
  "git config --global user.name",
  "git config get user.name",
  "git config list --global",
  "git config --file .gitmodules --get submodule.x.url",
  "git config --type=bool --get core.bare",
];

const WRITES = [
  "git config --global user.name attacker",
  "git config --local core.hooksPath /tmp/evil",
  "git config --system core.sshCommand evil",
  "git config user.email x@y",
  "git config --global --add alias.x '!sh'",
  "git config --local --unset user.name",
  "git config --global --unset-all user.name",
  "git config --replace-all user.name x",
  "git config --global --edit",
  "git config -e",
  "git config --rename-section a b",
  "git config --remove-section a",
  "git config set user.name x",
  "git config unset user.name",
  "git config --global",
];

Deno.test("git config reads are allowed", () => {
  for (const cmd of READS) assertEquals(isGitAllowed(cmd), true, cmd);
});

Deno.test("git config writes are denied even with a scope flag", () => {
  for (const cmd of WRITES) {
    assertEquals(isGitAllowed(cmd), false, cmd);
    assertEquals(hasGitWrite(cmd), true, cmd);
  }
});
