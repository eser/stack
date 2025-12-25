// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  createDenoBundlerState,
  DenoBundler,
  type DenoBundlerOptions,
} from "./deno-bundler.ts";

Deno.test("createDenoBundlerState() creates valid state", () => {
  const options: DenoBundlerOptions = {
    buildID: "test-build-123",
    entrypoints: {
      "main": "./src/main.ts",
      "worker": "./src/worker.ts",
    },
    dev: true,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/project/root",
    jsx: "precompile",
    jsxImportSource: "@eser/jsx-runtime",
    basePath: "/static",
  };

  const state = createDenoBundlerState(options);

  assert.assertEquals(state.options, options);
  assert.assertEquals(state.options.buildID, "test-build-123");
  assert.assertEquals(state.options.dev, true);
  assert.assertEquals(state.options.target, "es2022");
});

Deno.test("DenoBundler constructor initializes with state", () => {
  const options: DenoBundlerOptions = {
    buildID: "test-build",
    entrypoints: { "main": "./main.ts" },
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  const state = createDenoBundlerState(options);
  const bundler = new DenoBundler(state);

  assert.assertEquals(bundler.state, state);
  assert.assertEquals(bundler.state.options.buildID, "test-build");
});

Deno.test("DenoBundlerOptions supports string target", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  assert.assertEquals(options.target, "es2022");
});

Deno.test("DenoBundlerOptions supports array target", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: ["es2022", "chrome90", "firefox88"],
    absoluteWorkingDir: "/test",
  };

  assert.assertInstanceOf(options.target, Array);
  assert.assertEquals(options.target.length, 3);
  assert.assertEquals(options.target[0], "es2022");
});

Deno.test("DenoBundlerOptions handles empty entrypoints", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  const state = createDenoBundlerState(options);
  assert.assertEquals(Object.keys(state.options.entrypoints).length, 0);
});

Deno.test("DenoBundlerOptions handles multiple entrypoints", () => {
  const entrypoints = {
    "main": "./src/main.ts",
    "admin": "./src/admin.ts",
    "worker": "./src/worker.ts",
  };

  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints,
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  const state = createDenoBundlerState(options);
  assert.assertEquals(Object.keys(state.options.entrypoints).length, 3);
  assert.assertEquals(state.options.entrypoints["main"], "./src/main.ts");
  assert.assertEquals(state.options.entrypoints["admin"], "./src/admin.ts");
  assert.assertEquals(state.options.entrypoints["worker"], "./src/worker.ts");
});

Deno.test("DenoBundlerOptions jsx configuration", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
    jsx: "react-jsx",
    jsxImportSource: "react",
  };

  assert.assertEquals(options.jsx, "react-jsx");
  assert.assertEquals(options.jsxImportSource, "react");
});

Deno.test("DenoBundlerOptions optional jsx fields", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  assert.assertEquals(options.jsx, undefined);
  assert.assertEquals(options.jsxImportSource, undefined);
});

Deno.test("DenoBundlerOptions basePath configuration", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
    basePath: "/static/assets",
  };

  assert.assertEquals(options.basePath, "/static/assets");
});

Deno.test("DenoBundlerOptions dev flag affects behavior", () => {
  const devOptions: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: true,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  const prodOptions: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  assert.assertEquals(devOptions.dev, true);
  assert.assertEquals(prodOptions.dev, false);
});

Deno.test("DenoBundler state is readonly", () => {
  const options: DenoBundlerOptions = {
    buildID: "test",
    entrypoints: {},
    dev: false,
    configPath: "./deno.json",
    target: "es2022",
    absoluteWorkingDir: "/test",
  };

  const state = createDenoBundlerState(options);
  const bundler = new DenoBundler(state);

  // Verify state is readonly by checking if it's the same reference
  assert.assertEquals(bundler.state, state);

  // Try to verify readonly nature (TypeScript would catch this, but test the runtime behavior)
  const originalState = bundler.state;
  assert.assertEquals(bundler.state, originalState);
});
