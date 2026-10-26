// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as cli from "./cli.ts";

nodeTest.test(
  "parseCliArgs reads the command, the resource and the long flags",
  () => {
    const parsed = cli.parseCliArgs([
      "generate",
      "cm/app-config",
      "--namespace",
      "prod",
      "--env=production",
      "--output",
      "json",
      "--string-only",
    ]);

    assert.assertEquals(parsed.command, "generate");
    assert.assertEquals(parsed.kubectlResource, {
      type: "configmap",
      name: "app-config",
    });
    assert.assertEquals(parsed.options, {
      namespace: "prod",
      env: "production",
      output: "json",
      stringOnly: true,
      help: false,
      version: false,
    });
  },
);

nodeTest.test("parseCliArgs reads the -n, -e, -o and -s aliases", () => {
  const parsed = cli.parseCliArgs([
    "sync",
    "secret/db",
    "-n",
    "staging",
    "-e",
    "dev",
    "-o",
    "yaml",
    "-s",
  ]);

  assert.assertEquals(parsed.command, "sync");
  assert.assertEquals(parsed.kubectlResource, { type: "secret", name: "db" });
  assert.assertEquals(parsed.options.namespace, "staging");
  assert.assertEquals(parsed.options.env, "dev");
  assert.assertEquals(parsed.options.output, "yaml");
  assert.assertEquals(parsed.options.stringOnly, true);
});

nodeTest.test("parseCliArgs reads -h and -v without a command", () => {
  const parsed = cli.parseCliArgs(["-h", "-v"]);

  assert.assertEquals(parsed.command, undefined);
  assert.assertEquals(parsed.options.help, true);
  assert.assertEquals(parsed.options.version, true);
});

nodeTest.test("parseCliArgs reads no resource for other commands", () => {
  const parsed = cli.parseCliArgs(["status", "cm/app"]);

  assert.assertEquals(parsed.command, "status");
  assert.assertEquals(parsed.kubectlResource, undefined);
  assert.assertEquals(parsed.options.stringOnly, false);
});
