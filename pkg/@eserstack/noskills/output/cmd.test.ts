// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as cmd from "./cmd.ts";

bdd.describe("cmd.loadCommandPrefix", () => {
  let tempDir: string;
  let prefixBefore: string;

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_cmd_prefix_",
    });
    // The prefix is module state; put it back so other tests see the default.
    prefixBefore = cmd.cmdPrefix();
    cmd.setCommandPrefix(schema.DEFAULT_COMMAND_PREFIX);
  });

  bdd.afterEach(async () => {
    cmd.setCommandPrefix(prefixBefore);
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  const writeManifest = async (command: unknown): Promise<void> => {
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser`, {
      recursive: true,
    });
    await persistence.writeManifest(tempDir, {
      ...schema.createInitialManifest([], ["claude-code"], [], {
        languages: [],
        frameworks: [],
        ci: [],
        testRunner: null,
      }),
      command: command as string,
    });
  };

  bdd.it("makes the manifest's command the prefix", async () => {
    await writeManifest("deno task cli noskills");

    assert.assertEquals(
      await cmd.loadCommandPrefix(tempDir),
      "deno task cli noskills",
    );
    assert.assertEquals(
      cmd.cmd("spec list"),
      "deno task cli noskills spec list",
    );
  });

  const keeps: readonly { readonly name: string; readonly command: unknown }[] =
    [
      { name: "an empty command", command: "" },
      { name: "a command that is not a string", command: 42 },
    ];

  for (const { name, command } of keeps) {
    bdd.it(`keeps the current prefix for ${name}`, async () => {
      await writeManifest(command);

      assert.assertEquals(
        await cmd.loadCommandPrefix(tempDir),
        schema.DEFAULT_COMMAND_PREFIX,
      );
    });
  }

  bdd.it("keeps the current prefix when there is no manifest", async () => {
    assert.assertEquals(
      await cmd.loadCommandPrefix(tempDir),
      schema.DEFAULT_COMMAND_PREFIX,
    );
  });
});

bdd.describe("cmd.extractPrefix", () => {
  bdd.it("takes the Go binary's NOSKILLS_CLI_PREFIX first", async () => {
    const before = crossRuntime.runtime.env.get(cmd.CLI_PREFIX_ENV);
    crossRuntime.runtime.env.set(cmd.CLI_PREFIX_ENV, "  /opt/bin/noskills  ");

    try {
      assert.assertEquals(await cmd.extractPrefix(), "/opt/bin/noskills");
    } finally {
      if (before === undefined) {
        crossRuntime.runtime.env.delete(cmd.CLI_PREFIX_ENV);
      } else {
        crossRuntime.runtime.env.set(cmd.CLI_PREFIX_ENV, before);
      }
    }
  });

  const ignored: readonly { readonly name: string; readonly value?: string }[] =
    [
      { name: "an unset variable" },
      { name: "a blank value", value: "   " },
      { name: "a value on two lines", value: "noskills\nrm -rf /" },
    ];

  for (const { name, value } of ignored) {
    bdd.it(`ignores ${name}`, () => {
      assert.assertEquals(cmd.prefixFromEnv(value), null);
    });
  }

  bdd.it("reads a single-line value as the prefix", () => {
    assert.assertEquals(cmd.prefixFromEnv("noskills"), "noskills");
  });
});
