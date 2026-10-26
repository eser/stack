// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as results from "@eserstack/primitives/results";

import * as command from "./command.ts";
import type { CommandContext } from "./types.ts";

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

/**
 * Builds a root command with persistent and own flags and one child, and
 * records the context each handler ran with.
 */
const withFlags = (): {
  root: command.Command;
  seen: () => { path: string; ctx: CommandContext } | null;
} => {
  let last: { path: string; ctx: CommandContext } | null = null;

  const child = new command.Command("build")
    .flag({ name: "out", short: "o", type: "string", description: "Output" })
    .flag({ name: "tag", type: "string[]", description: "Tags" })
    .run((ctx) => {
      last = { path: ctx.commandPath.join(" "), ctx };
      return results.ok(undefined);
    });

  const root = new command.Command("app")
    .persistentFlag({
      name: "verbose",
      short: "v",
      type: "boolean",
      description: "Verbose",
    })
    .flag({
      name: "port",
      type: "number",
      default: 8000,
      description: "Port",
    })
    .command(child);

  return { root, seen: () => last };
};

nodeTest.test("a subcommand reads its own and persistent flags", async () => {
  const { root, seen } = withFlags();

  const result = await root.parse([
    "build",
    "-v",
    "--out",
    "dist",
    "--tag",
    "a",
    "--tag=b",
    "src",
  ]);

  assert.assert(results.isOk(result));
  assert.assertEquals(seen()?.path, "app build");
  assert.assertEquals(seen()?.ctx.flags["verbose"], true);
  assert.assertEquals(seen()?.ctx.flags["out"], "dist");
  assert.assertEquals(seen()?.ctx.flags["tag"], ["a", "b"]);
  assert.assertEquals(seen()?.ctx.args, ["src"]);
});

nodeTest.test(
  "an absent boolean flag reaches the handler as false",
  async () => {
    const { root, seen } = withFlags();

    await root.parse(["build"]);

    assert.assertEquals(seen()?.ctx.flags["verbose"], false);
    assert.assertEquals(seen()?.ctx.flags["out"], undefined);
  },
);

nodeTest.test(
  "flags after the subcommand name go to the subcommand",
  async () => {
    const { root, seen } = withFlags();

    // --out is not a root flag; the root stops at "build" and leaves it alone.
    // The root drops the first "--", so a fallback that forwards its arguments
    // to a script does not pass the separator on.
    await root.parse(["build", "--out=lib", "--", "src"]);

    assert.assertEquals(seen()?.ctx.flags["out"], "lib");
    assert.assertEquals(seen()?.ctx.args, ["src"]);
  },
);

nodeTest.test("an unknown flag is ignored, not an error", async () => {
  const { root, seen } = withFlags();

  const result = await root.parse(["build", "--unknown", "src"]);

  assert.assert(results.isOk(result));
  assert.assertEquals(seen()?.ctx.flags["unknown"], undefined);
  assert.assertEquals(seen()?.ctx.args, ["src"]);
});

nodeTest.test(
  "a required flag that is missing fails with exit code 1",
  async () => {
    let ran = false;
    const cmd = new command.Command("deploy")
      .flag({
        name: "target",
        type: "string",
        required: true,
        description: "Target",
      })
      .run(() => {
        ran = true;
        return results.ok(undefined);
      });

    const missing = await cmd.parse([]);
    assert.assert(results.isFail(missing));
    assert.assertEquals(missing.error.exitCode, 1);
    assert.assertEquals(ran, false);

    const given = await cmd.parse(["--target", "prod"]);
    assert.assert(results.isOk(given));
    assert.assertEquals(ran, true);
  },
);

nodeTest.test("a number flag is converted and defaults apply", async () => {
  let port: unknown = null;
  const cmd = new command.Command("serve")
    .flag({ name: "port", type: "number", default: 8000, description: "" })
    .run((ctx) => {
      port = ctx.flags["port"];
      return results.ok(undefined);
    });

  await cmd.parse([]);
  assert.assertEquals(port, 8000);

  await cmd.parse(["--port", "3000"]);
  assert.assertEquals(port, 3000);
});
