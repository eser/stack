// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as flags from "./flags.ts";
import type { FlagDef } from "./types.ts";

const options: flags.ParseArgsOptions["options"] = {
  "dry-run": { type: "boolean", short: "n" },
  name: { type: "string", short: "p" },
  var: { type: "string", multiple: true, default: [] },
};

nodeTest.describe("flags.parseArgs", () => {
  nodeTest.it("reads long and short flags and keeps positionals", () => {
    const parsed = flags.parseArgs(["-n", "--name", "demo", "a", "b"], {
      options,
    });

    assert.assertEquals(parsed.values["dry-run"], true);
    assert.assertEquals(parsed.values["name"], "demo");
    assert.assertEquals(parsed.positionals, ["a", "b"]);
  });

  nodeTest.it("reads --flag=value and a short flag with its value", () => {
    const parsed = flags.parseArgs(["--name=demo", "-pother"], { options });

    assert.assertEquals(parsed.values["name"], "other");
  });

  nodeTest.it("leaves an absent flag out and applies a default", () => {
    const parsed = flags.parseArgs([], { options });

    assert.assertEquals(parsed.values["dry-run"], undefined);
    assert.assertEquals(parsed.values["name"], undefined);
    assert.assertEquals(parsed.values["var"], []);
  });

  nodeTest.it("collects a multiple flag in order", () => {
    const parsed = flags.parseArgs(["--var", "a=1", "--var=b=2"], { options });

    assert.assertEquals(parsed.values["var"], ["a=1", "b=2"]);
  });

  nodeTest.it("keeps the last value of a repeated single flag", () => {
    const parsed = flags.parseArgs(["--name", "a", "--name", "b"], {
      options,
    });

    assert.assertEquals(parsed.values["name"], "b");
  });

  nodeTest.it("reads a string flag without a value as an empty string", () => {
    const parsed = flags.parseArgs(["--name"], { options });

    assert.assertEquals(parsed.values["name"], "");
  });

  nodeTest.it("reads --flag=false on a boolean flag as false", () => {
    assert.assertEquals(
      flags.parseArgs(["--dry-run=false"], { options }).values["dry-run"],
      false,
    );
    assert.assertEquals(
      flags.parseArgs(["--dry-run=true"], { options }).values["dry-run"],
      true,
    );
  });

  nodeTest.it("keeps an unknown flag instead of failing", () => {
    const parsed = flags.parseArgs(["--other", "--level=3", "x"], { options });

    assert.assertEquals(parsed.values["other"], true);
    assert.assertEquals(parsed.values["level"], "3");
    assert.assertEquals(parsed.positionals, ["x"]);
  });

  nodeTest.it("reads --no-name as its own flag, not a negation", () => {
    const parsed = flags.parseArgs(["--no-install"], {
      options: { "no-install": { type: "boolean" } },
    });

    assert.assertEquals(parsed.values["no-install"], true);
  });

  nodeTest.it("keeps positionals as strings, numbers included", () => {
    const parsed = flags.parseArgs(["1.2", "007"], { options });

    assert.assertEquals(parsed.positionals, ["1.2", "007"]);
  });

  nodeTest.it("treats everything after -- as positional", () => {
    const parsed = flags.parseArgs(["a", "--", "--dry-run"], { options });

    assert.assertEquals(parsed.values["dry-run"], undefined);
    assert.assertEquals(parsed.positionals, ["a", "--dry-run"]);
  });

  nodeTest.it("stopEarly reads flags up to the first positional only", () => {
    const parsed = flags.parseArgs(
      ["-n", "--name", "x", "run", "--dry-run", "--name", "y"],
      { options, stopEarly: true },
    );

    assert.assertEquals(parsed.values["dry-run"], true);
    assert.assertEquals(parsed.values["name"], "x");
    assert.assertEquals(parsed.positionals, [
      "run",
      "--dry-run",
      "--name",
      "y",
    ]);
  });

  nodeTest.it("stopEarly drops the first -- after the positional", () => {
    const parsed = flags.parseArgs(["run", "--", "--fix", "--", "x"], {
      options,
      stopEarly: true,
    });

    assert.assertEquals(parsed.positionals, ["run", "--fix", "--", "x"]);
  });

  nodeTest.it("stopEarly keeps a later -- when one came first", () => {
    const parsed = flags.parseArgs(["-n", "--", "run", "--", "x"], {
      options,
      stopEarly: true,
    });

    assert.assertEquals(parsed.values["dry-run"], true);
    assert.assertEquals(parsed.positionals, ["run", "--", "x"]);
  });
});

const defs: readonly FlagDef[] = [
  { name: "port", short: "p", type: "number", default: 8000, description: "" },
  { name: "verbose", type: "boolean", description: "" },
  { name: "tag", type: "string[]", description: "" },
  { name: "mode", type: "string", description: "" },
];

nodeTest.describe("flags.parseFlags", () => {
  nodeTest.it("converts number flags and applies defaults", () => {
    assert.assertEquals(
      flags.parseFlags(["-p", "3000"], defs).flags["port"],
      3000,
    );
    assert.assertEquals(flags.parseFlags([], defs).flags["port"], 8000);
  });

  nodeTest.it("reads an absent boolean as false", () => {
    assert.assertEquals(flags.parseFlags([], defs).flags["verbose"], false);
    assert.assertEquals(
      flags.parseFlags(["--verbose"], defs).flags["verbose"],
      true,
    );
  });

  nodeTest.it("collects every occurrence of a string[] flag", () => {
    assert.assertEquals(
      flags.parseFlags(["--tag", "a", "--tag", "b"], defs).flags["tag"],
      ["a", "b"],
    );
  });

  nodeTest.it("drops flags that are not defined", () => {
    const parsed = flags.parseFlags(["--unknown", "--mode=dev", "x"], defs);

    assert.assertEquals(parsed.flags["unknown"], undefined);
    assert.assertEquals(parsed.flags["mode"], "dev");
    assert.assertEquals(parsed.positional, ["x"]);
  });
});
