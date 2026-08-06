// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";

import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";

import { attachStandardCommands } from "../cli-support.ts";
import { createSystemCommand } from "./mod.ts";

/**
 * The command names a help text actually lists.
 *
 * Substring searching the whole help is not good enough: "info" appears inside
 * "more information", and "version" inside "--version".
 */
const listedCommands = (help: string): string[] => {
  const block = help.split("Commands:")[1]?.split("\nOptions:")[0] ?? "";

  return block
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((name) => name !== "")
    .map((name) => name.replace(/,$/, ""));
};

const SUBCOMMANDS = [
  "install",
  "uninstall",
  "update",
  "completions",
  "version",
  "doctor",
  "info",
];

Deno.test("every binary gets the same system subcommands", () => {
  for (const name of ["eser", "noskills", "laroux"]) {
    const help = createSystemCommand({
      command: name,
      devCommand: `deno task cli ${name}`,
    }).help();

    for (const sub of SUBCOMMANDS) {
      assertStringIncludes(help, sub);
    }
  }
});

// The tree is built once and bound per app, so the help has to describe the
// binary it belongs to. A shared tree that said "eser" everywhere would be a
// worse lie than three copies.
Deno.test("the system tree names the binary it belongs to", () => {
  const help = createSystemCommand({
    command: "noskills",
    devCommand: "deno task cli noskills",
  }).help();

  assertStringIncludes(help, "Install noskills globally");
  assertEquals(help.includes("Install eser globally"), false);
});

Deno.test("root aliases exist for the common operations", () => {
  const listed = listedCommands(
    attachStandardCommands(new shellArgs.Command("noskills").version("9.9.9"))
      .help(),
  );

  for (const alias of ["install", "update", "version", "doctor", "system"]) {
    assertEquals(listed.includes(alias), true, `${alias} is missing`);
  }
});

// The line that shapes the design: the layer attaches to the ROOT command, not
// to the Module. `eser` mounts the very same module object the standalone
// binary re-roots, so a layer on the module would appear in both — implying a
// submodule has a version and an installer of its own.
Deno.test("a submodule inherits none of it", () => {
  const submodule = new shellArgs.Command("noskills").command(
    new shellArgs.Command("next").run(() => results.ok(undefined)),
  );

  const root = attachStandardCommands(
    new shellArgs.Command("eser").version("9.9.9").command(submodule),
  );

  // listedCommands, not a substring search: the shortcut entries render as
  // `install -> "system install"`, so "system" appears in the help even when
  // the command itself is absent.
  assertEquals(listedCommands(root.help()).includes("system"), true);

  // The submodule offers none of the layer. Asserted on the parsed Commands
  // list rather than a substring search of the whole help text -- "info"
  // matches inside "more information", which made an earlier version of this
  // test fail for a reason that had nothing to do with the layer.
  //
  // And asserted on help rather than dispatch: an unknown subcommand falls back
  // to printing help, so `parse(["noskills", "version"])` succeeds either way
  // and would prove nothing. What matters is that the commands are not THERE.
  const listed = listedCommands(submodule.help());

  for (const command of [...SUBCOMMANDS, "system"]) {
    assertEquals(
      listed.includes(command),
      false,
      `submodule offers ${command}; the layer leaked past the root`,
    );
  }

  assertEquals(listed, ["next"]);
});
