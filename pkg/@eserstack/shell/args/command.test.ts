// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";

import * as results from "@eserstack/primitives/results";

import { Command } from "./command.ts";

/**
 * Builds a parent command with one lazily-loaded child that carries an alias.
 *
 * `loaded` reports whether the child's module was imported, which is the whole
 * point of registering it lazily: a command nobody invoked must not cost
 * anything at startup.
 */
const withLazyChild = (): { root: Command; loaded: () => boolean } => {
  let wasLoaded = false;

  const root = new Command("root").lazyCommand("workflows", {
    description: "Workflow engine",
    aliases: ["wf"],
    load: () => {
      wasLoaded = true;

      return Promise.resolve(
        new Command("workflows").run(() => results.ok(undefined)),
      );
    },
  });

  return { root, loaded: () => wasLoaded };
};

// Aliases used to be silently impossible on a lazy command: LazyCommandOptions
// had no such field, so anything with a short name was forced to stay eager and
// pay its import cost on every invocation. That is backwards — a command big
// enough to defer is exactly the kind that earns an alias.
Deno.test("a lazy command dispatches through its alias", async () => {
  const { root, loaded } = withLazyChild();

  assert(!loaded(), "the module loaded before anything invoked it");

  await root.parse(["wf"]);

  assert(loaded(), "invoking the alias did not load the command");
});

Deno.test("a lazy command still dispatches through its own name", async () => {
  const { root, loaded } = withLazyChild();

  await root.parse(["workflows"]);

  assert(loaded(), "invoking the canonical name did not load the command");
});

// An alias that works but is undiscoverable is worse than no alias, so help
// must render it the same way an eager command's is: "workflows, wf".
Deno.test("a lazy command's aliases appear in help", () => {
  const { root, loaded } = withLazyChild();

  const help = root.help();

  assertStringIncludes(help, "workflows, wf");

  // Generating help must not import the command — that would reintroduce the
  // eager cost this whole mechanism exists to avoid.
  assertEquals(loaded(), false);
});

Deno.test("an unaliased lazy command renders without a trailing comma", () => {
  const root = new Command("root").lazyCommand("solo", {
    description: "No alias here",
    load: () => Promise.resolve(new Command("solo")),
  });

  const help = root.help();

  assertStringIncludes(help, "solo");
  assertEquals(help.includes("solo,"), false);
});
