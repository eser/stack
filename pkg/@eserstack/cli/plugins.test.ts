// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as plugins from "./plugins.ts";

// The rule under test is git's: any `eser-<name>` on PATH is reachable as
// `eser <name>`. Generic, so a new binary needs no registration here.

const withPluginOnPath = async (
  name: string,
  body: string,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "eser-plugin-" });
  const file = runtime.path.join(dir, `${plugins.PLUGIN_PREFIX}${name}`);

  await runtime.fs.writeTextFile(file, body);
  await runtime.fs.chmod(file, 0o755);

  const previous = runtime.env.get("PATH") ?? "";

  runtime.env.set("PATH", `${dir}${runtime.path.delimiter}${previous}`);

  try {
    await run(dir);
  } finally {
    // Restored, not left set: PATH is process-global, so leaking it would
    // change what every other test in this process resolves.
    runtime.env.set("PATH", previous);
    await runtime.fs.remove(dir, { recursive: true });
  }
};

Deno.test("an eser-* executable on PATH is resolvable as a subcommand", async () => {
  await withPluginOnPath("demo", "#!/bin/sh\nexit 0\n", async () => {
    const resolved = await plugins.resolvePlugin("demo");

    if (resolved === null) {
      throw new Error("eser-demo on PATH was not resolved");
    }

    assert.assert(
      resolved.endsWith("eser-demo"),
      `resolved to ${resolved}, not the plugin`,
    );
  });
});

Deno.test("an absent plugin resolves to null rather than throwing", async () => {
  assert.assertEquals(
    await plugins.resolvePlugin("nothing-is-called-this-xyz"),
    null,
  );
});

// Resolution must never leave a PATH directory. Note what actually guarantees
// that: every candidate is `<dir>/eser-<name>`, so a `..` in the name sits
// inside the component `eser-..` and is never its own path segment. The
// explicit reject in resolvePlugin is defence in depth on top of that — removing
// it does not make this test fail, which is why the assertion below targets the
// invariant rather than the guard.
Deno.test("a name cannot escape a PATH directory", async () => {
  const outside = await runtime.fs.makeTempDir({ prefix: "eser-outside-" });
  const pathDir = await runtime.fs.makeTempDir({ prefix: "eser-plugin-" });
  const victim = runtime.path.join(outside, "victim");

  // A real, executable target sitting outside every PATH entry.
  await runtime.fs.writeTextFile(victim, "#!/bin/sh\nexit 0\n");
  await runtime.fs.chmod(victim, 0o755);

  const previous = runtime.env.get("PATH") ?? "";

  // Prepend rather than replace: tests run in parallel in one process, and a
  // PATH without the system directories breaks every concurrent spawn of sh.
  runtime.env.set("PATH", `${pathDir}${runtime.path.delimiter}${previous}`);

  try {
    const names = [
      "../evil",
      "a/b",
      "..",
      "a\\b",
      `../${runtime.path.basename(outside)}/victim`,
    ];
    const resolved = await Promise.all(
      names.map((name) => plugins.resolvePlugin(name)),
    );

    for (const [index, name] of names.entries()) {
      assert.assertEquals(resolved[index], null, `name ${name} resolved`);
    }
  } finally {
    runtime.env.set("PATH", previous);
    await runtime.fs.remove(outside, { recursive: true });
    await runtime.fs.remove(pathDir, { recursive: true });
  }
});

Deno.test("plugin exit codes propagate", async () => {
  await withPluginOnPath("failing", "#!/bin/sh\nexit 7\n", async (dir) => {
    const resolved = await plugins.resolvePlugin("failing");

    if (resolved === null) {
      throw new Error("eser-failing was not resolved");
    }

    assert.assertEquals(await plugins.runPlugin(resolved, [], { cwd: dir }), 7);
  });
});

Deno.test("arguments reach the plugin verbatim", async () => {
  const script = `#!/bin/sh
[ "$1" = "--backend" ] || exit 1
[ "$2" = "kiro" ] || exit 1
[ "$3" = "a b" ] || exit 1
exit 0
`;

  await withPluginOnPath("argecho", script, async (dir) => {
    const resolved = await plugins.resolvePlugin("argecho");

    if (resolved === null) {
      throw new Error("eser-argecho was not resolved");
    }

    // "a b" is one argument with a space: the plugin path must not re-split it,
    // which is exactly what a shell round-trip would do.
    assert.assertEquals(
      await plugins.runPlugin(resolved, ["--backend", "kiro", "a b"], {
        cwd: dir,
      }),
      0,
    );
  });
});

// A non-executable file with the right name must not be "found". Reporting it
// as a plugin moves the failure to spawn time, with an error about permissions
// rather than about the plugin — which is the confusion PATH lookup exists to
// prevent.
Deno.test("a non-executable file with the right name is not a plugin", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "eser-plugin-" });
  const file = runtime.path.join(dir, `${plugins.PLUGIN_PREFIX}inert`);

  await runtime.fs.writeTextFile(file, "#!/bin/sh\nexit 0\n");
  await runtime.fs.chmod(file, 0o644);

  const previous = runtime.env.get("PATH") ?? "";

  runtime.env.set("PATH", `${dir}${runtime.path.delimiter}${previous}`);

  try {
    assert.assertEquals(await plugins.resolvePlugin("inert"), null);
  } finally {
    runtime.env.set("PATH", previous);
    await runtime.fs.remove(dir, { recursive: true });
  }
});
