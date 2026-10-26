// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as loader from "./loader.ts";
import * as primitives from "./primitives.ts";

/** Writes `content` to `name` in a fresh temp dir and parses that file. */
const parseText = async (
  name: string,
  content: string,
): Promise<loader.ParseResult<unknown>> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "config-loader-" });
  try {
    const filepath = runtime.path.join(dir, name);
    await runtime.fs.writeTextFile(filepath, content);

    return await loader.parse<unknown>(filepath);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

bdd.describe("parse", () => {
  bdd.it("reads JSONC with comments and trailing commas", async () => {
    const result = await parseText(
      "config.jsonc",
      '{\n  // the port\n  "port": 8080,\n  "hosts": ["a", "b",],\n}\n',
    );

    assert.assertEquals(result.content, { port: 8080, hosts: ["a", "b"] });
    assert.assertEquals(result.format, primitives.FileFormats.JsonWithComments);
  });

  bdd.it("names the position of a JSONC syntax error", async () => {
    const error = await assert.assertRejects(
      () => parseText("config.jsonc", '{\n  "a": 1\n  "b": 2\n}\n'),
      loader.ConfigParseError,
      "Failed to parse JSONC file",
    );

    assert.assertInstanceOf(error.cause, SyntaxError);
    assert.assertStringIncludes(
      error.message,
      "CommaExpected at line 3, column 3",
    );
  });

  bdd.it("rejects an empty JSONC file", async () => {
    await assert.assertRejects(
      () => parseText("config.jsonc", ""),
      loader.ConfigParseError,
      "ValueExpected",
    );
  });

  bdd.it("reads TOML tables and integers", async () => {
    const result = await parseText(
      "config.toml",
      'name = "app"\n\n[server]\nport = 8080\n',
    );

    assert.assertEquals(result.content, {
      name: "app",
      server: { port: 8080 },
    });
  });

  bdd.it("wraps a TOML syntax error", async () => {
    await assert.assertRejects(
      () => parseText("config.toml", "[invalid\nname = "),
      loader.ConfigParseError,
      "Failed to parse TOML file",
    );
  });

  bdd.it("reads YAML", async () => {
    const result = await parseText("config.yaml", "name: app\nport: 8080\n");

    assert.assertEquals(result.content, { name: "app", port: 8080 });
  });
});
