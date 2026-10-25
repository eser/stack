// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as results from "@eserstack/primitives/results";

import * as command from "./command.ts";

/**
 * Builds a parent command with one lazily-loaded child that carries an alias.
 *
 * `loaded` reports whether the child's module was imported, which is the whole
 * point of registering it lazily: a command nobody invoked must not cost
 * anything at startup.
 */
const withLazyChild = (): { root: command.Command; loaded: () => boolean } => {
  let wasLoaded = false;

  const root = new command.Command("root").lazyCommand("workflows", {
    description: "Workflow engine",
    aliases: ["wf"],
    load: () => {
      wasLoaded = true;

      return Promise.resolve(
        new command.Command("workflows").run(() => results.ok(undefined)),
      );
    },
  });

  return { root, loaded: () => wasLoaded };
};

// Aliases used to be silently impossible on a lazy command: LazyCommandOptions
// had no such field, so anything with a short name was forced to stay eager and
// pay its import cost on every invocation. That is backwards — a command big
// enough to defer is exactly the kind that earns an alias.
nodeTest.test("a lazy command dispatches through its alias", async () => {
  const { root, loaded } = withLazyChild();

  assert.assert(!loaded(), "the module loaded before anything invoked it");

  await root.parse(["wf"]);

  assert.assert(loaded(), "invoking the alias did not load the command");
});

nodeTest.test(
  "a lazy command still dispatches through its own name",
  async () => {
    const { root, loaded } = withLazyChild();

    await root.parse(["workflows"]);

    assert.assert(
      loaded(),
      "invoking the canonical name did not load the command",
    );
  },
);

// An alias that works but is undiscoverable is worse than no alias, so help
// must render it the same way an eager command's is: "workflows, wf".
nodeTest.test("a lazy command's aliases appear in help", () => {
  const { root, loaded } = withLazyChild();

  const help = root.help();

  assert.assertStringIncludes(help, "workflows, wf");

  // Generating help must not import the command — that would reintroduce the
  // eager cost this whole mechanism exists to avoid.
  assert.assertEquals(loaded(), false);
});

nodeTest.test(
  "an unaliased lazy command renders without a trailing comma",
  () => {
    const root = new command.Command("root").lazyCommand("solo", {
      description: "No alias here",
      load: () => Promise.resolve(new command.Command("solo")),
    });

    const help = root.help();

    assert.assertStringIncludes(help, "solo");
    assert.assertEquals(help.includes("solo,"), false);
  },
);

/**
 * Builds a root command with one module group. `received` reports the
 * arguments the dispatched module's `main` was called with, or null when no
 * module ran.
 */
const withGroup = (): {
  root: command.Command;
  received: () => readonly string[] | null;
} => {
  let receivedArgs: readonly string[] | null = null;

  const root = new command.Command("root").group("tools", {
    description: "Tool modules",
    aliases: { fmt: "format" },
    modules: {
      format: {
        description: "Format files",
        load: () =>
          Promise.resolve({
            main: (cliArgs?: readonly string[]) => {
              receivedArgs = cliArgs ?? [];
              return Promise.resolve(results.ok(undefined));
            },
          }),
      },
    },
  });

  return { root, received: () => receivedArgs };
};

nodeTest.test(
  "a group dispatches to its module with the remaining args",
  async () => {
    const { root, received } = withGroup();

    const result = await root.parse(["tools", "format", "src"]);

    assert.assert(results.isOk(result));
    assert.assertEquals(received(), ["src"]);
  },
);

nodeTest.test("a group resolves a module alias", async () => {
  const { root, received } = withGroup();

  await root.parse(["tools", "fmt", "src"]);

  assert.assertEquals(received(), ["src"]);
});

nodeTest.test(
  "a group rejects an unknown module with exit code 1",
  async () => {
    const { root, received } = withGroup();

    const result = await root.parse(["tools", "missing"]);

    assert.assert(results.isFail(result));
    assert.assertEquals(result.error.exitCode, 1);
    assert.assertEquals(received(), null);
  },
);
