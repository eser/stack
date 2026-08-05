// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { PLUGIN_PREFIX, resolvePlugin, runPlugin } from "./plugins.ts";

// The rule under test is git's: any `eser-<name>` on PATH is reachable as
// `eser <name>`. Generic, so a new binary needs no registration here.

const withPluginOnPath = async (
  name: string,
  body: string,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "eser-plugin-" });
  const file = `${dir}/${PLUGIN_PREFIX}${name}`;

  await Deno.writeTextFile(file, body);
  await Deno.chmod(file, 0o755);

  const previous = Deno.env.get("PATH") ?? "";

  Deno.env.set("PATH", `${dir}:${previous}`);

  try {
    await run(dir);
  } finally {
    // Restored, not left set: PATH is process-global, so leaking it would
    // change what every other test in this process resolves.
    Deno.env.set("PATH", previous);
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test("an eser-* executable on PATH is resolvable as a subcommand", async () => {
  await withPluginOnPath("demo", "#!/bin/sh\nexit 0\n", async () => {
    const resolved = await resolvePlugin("demo");

    if (resolved === null) {
      throw new Error("eser-demo on PATH was not resolved");
    }

    assert(
      resolved.endsWith("eser-demo"),
      `resolved to ${resolved}, not the plugin`,
    );
  });
});

Deno.test("an absent plugin resolves to null rather than throwing", async () => {
  assertEquals(await resolvePlugin("nothing-is-called-this-xyz"), null);
});

// Resolution must never leave a PATH directory. Note what actually guarantees
// that: every candidate is `<dir>/eser-<name>`, so a `..` in the name sits
// inside the component `eser-..` and is never its own path segment. The
// explicit reject in resolvePlugin is defence in depth on top of that — removing
// it does not make this test fail, which is why the assertion below targets the
// invariant rather than the guard.
Deno.test("a name cannot escape a PATH directory", async () => {
  const outside = await Deno.makeTempDir({ prefix: "eser-outside-" });
  const pathDir = await Deno.makeTempDir({ prefix: "eser-plugin-" });

  // A real, executable target sitting outside every PATH entry.
  await Deno.writeTextFile(`${outside}/victim`, "#!/bin/sh\nexit 0\n");
  await Deno.chmod(`${outside}/victim`, 0o755);

  const previous = Deno.env.get("PATH") ?? "";

  Deno.env.set("PATH", pathDir);

  try {
    for (
      const name of [
        "../evil",
        "a/b",
        "..",
        "a\\b",
        `../${outside.split("/").pop()}/victim`,
      ]
    ) {
      assertEquals(await resolvePlugin(name), null, `name ${name} resolved`);
    }
  } finally {
    Deno.env.set("PATH", previous);
    await Deno.remove(outside, { recursive: true });
    await Deno.remove(pathDir, { recursive: true });
  }
});

Deno.test("plugin exit codes propagate", async () => {
  await withPluginOnPath("failing", "#!/bin/sh\nexit 7\n", async (dir) => {
    const resolved = await resolvePlugin("failing");

    if (resolved === null) {
      throw new Error("eser-failing was not resolved");
    }

    assertEquals(await runPlugin(resolved, [], { cwd: dir }), 7);
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
    const resolved = await resolvePlugin("argecho");

    if (resolved === null) {
      throw new Error("eser-argecho was not resolved");
    }

    // "a b" is one argument with a space: the plugin path must not re-split it,
    // which is exactly what a shell round-trip would do.
    assertEquals(
      await runPlugin(resolved, ["--backend", "kiro", "a b"], { cwd: dir }),
      0,
    );
  });
});

// A non-executable file with the right name must not be "found". Reporting it
// as a plugin moves the failure to spawn time, with an error about permissions
// rather than about the plugin — which is the confusion PATH lookup exists to
// prevent.
Deno.test("a non-executable file with the right name is not a plugin", async () => {
  const dir = await Deno.makeTempDir({ prefix: "eser-plugin-" });

  await Deno.writeTextFile(
    `${dir}/${PLUGIN_PREFIX}inert`,
    "#!/bin/sh\nexit 0\n",
  );
  await Deno.chmod(`${dir}/${PLUGIN_PREFIX}inert`, 0o644);

  const previous = Deno.env.get("PATH") ?? "";

  Deno.env.set("PATH", `${dir}:${previous}`);

  try {
    assertEquals(await resolvePlugin("inert"), null);
  } finally {
    Deno.env.set("PATH", previous);
    await Deno.remove(dir, { recursive: true });
  }
});
