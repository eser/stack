// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as base from "./base.ts";
import * as loader from "./loader.ts";

// Tests share the process environment, so each one reads its environment name
// from a variable no other test or tool uses.
const uniqueVariable = (): string =>
  `DOTENV_LOADER_TEST_${crypto.randomUUID().replaceAll("-", "_")}`;

Deno.test("load() takes the environment name from the value of an envVars variable", async () => {
  const variable = uniqueVariable();
  const dir = await runtime.fs.makeTempDir({ prefix: "dotenv_loader_test_" });
  runtime.env.set(variable, "staging");

  try {
    await runtime.fs.writeTextFile(
      `${dir}/.env.staging`,
      "LOADER_TEST_VALUE=from-staging",
    );

    const vars = await loader.load({
      baseDir: dir,
      envVars: [variable],
      loadProcessEnv: false,
    });

    assert.assertEquals(vars.get(base.env), "staging");
    assert.assertEquals(vars.get("LOADER_TEST_VALUE"), "from-staging");
  } finally {
    runtime.env.delete(variable);
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("load() uses defaultEnvValue when the envVars variables are unset or empty", async () => {
  const unset = uniqueVariable();
  const empty = uniqueVariable();
  const dir = await runtime.fs.makeTempDir({ prefix: "dotenv_loader_test_" });
  runtime.env.set(empty, "");

  try {
    const vars = await loader.load({
      baseDir: dir,
      envVars: [unset, empty],
      defaultEnvValue: "fallback",
      loadProcessEnv: false,
    });

    assert.assertEquals(vars.get(base.env), "fallback");
  } finally {
    runtime.env.delete(empty);
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("load() prefers the env option over the envVars variables", async () => {
  const variable = uniqueVariable();
  const dir = await runtime.fs.makeTempDir({ prefix: "dotenv_loader_test_" });
  runtime.env.set(variable, "staging");

  try {
    const vars = await loader.load({
      baseDir: dir,
      env: "production",
      envVars: [variable],
      loadProcessEnv: false,
    });

    assert.assertEquals(vars.get(base.env), "production");
  } finally {
    runtime.env.delete(variable);
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("load() keeps percent signs in values as written", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "dotenv_loader_test_" });

  try {
    await runtime.fs.writeTextFile(
      `${dir}/.env`,
      "LOADER_TEST_URL=postgres://app:p%40ss@db/main\nLOADER_TEST_DISCOUNT=50%",
    );

    const vars = await loader.load({
      baseDir: dir,
      env: "production",
      loadProcessEnv: false,
    });

    assert.assertEquals(
      vars.get("LOADER_TEST_URL"),
      "postgres://app:p%40ss@db/main",
    );
    assert.assertEquals(vars.get("LOADER_TEST_DISCOUNT"), "50%");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});
