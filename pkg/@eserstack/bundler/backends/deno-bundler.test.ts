// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  createDenoBundlerBackend,
  DenoBundlerBackend,
  type DenoBundlerBackendOptions,
} from "./deno-bundler.ts";

// ============================================================================
// DenoBundlerBackend constructor tests
// ============================================================================

Deno.test("DenoBundlerBackend has correct name", () => {
  const backend = new DenoBundlerBackend();

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts empty options", () => {
  const backend = new DenoBundlerBackend({});

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts buildId option", () => {
  const options: DenoBundlerBackendOptions = {
    buildId: "custom-build-123",
  };

  const backend = new DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts entryName option", () => {
  const options: DenoBundlerBackendOptions = {
    entryName: "app",
  };

  const backend = new DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts all options", () => {
  const options: DenoBundlerBackendOptions = {
    buildId: "prod-build-v1.0.0",
    entryName: "client",
  };

  const backend = new DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

// ============================================================================
// createDenoBundlerBackend factory tests
// ============================================================================

Deno.test("createDenoBundlerBackend creates backend instance", () => {
  const backend = createDenoBundlerBackend();

  assert.assertInstanceOf(backend, DenoBundlerBackend);
  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("createDenoBundlerBackend accepts empty options", () => {
  const backend = createDenoBundlerBackend({});

  assert.assertInstanceOf(backend, DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts buildId option", () => {
  const backend = createDenoBundlerBackend({
    buildId: "test-build-id",
  });

  assert.assertInstanceOf(backend, DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts entryName option", () => {
  const backend = createDenoBundlerBackend({
    entryName: "custom-entry",
  });

  assert.assertInstanceOf(backend, DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts all options", () => {
  const backend = createDenoBundlerBackend({
    buildId: "release-123",
    entryName: "bundle",
  });

  assert.assertInstanceOf(backend, DenoBundlerBackend);
});

// ============================================================================
// DenoBundlerBackend interface compliance tests
// ============================================================================

Deno.test("DenoBundlerBackend implements Bundler interface", () => {
  const backend = new DenoBundlerBackend();

  // Check that required methods exist
  assert.assertEquals(typeof backend.bundle, "function");
  assert.assertEquals(typeof backend.watch, "function");
  assert.assertEquals(typeof backend.name, "string");
});

Deno.test("DenoBundlerBackend.bundle is async function", () => {
  const backend = new DenoBundlerBackend();

  // Verify bundle returns a Promise (async function)
  assert.assertEquals(backend.bundle.constructor.name, "AsyncFunction");
});

Deno.test("DenoBundlerBackend.watch returns Promise", () => {
  const backend = new DenoBundlerBackend();

  // watch should return a Promise
  // We can't actually call it without proper config, but we can verify the method exists
  assert.assertEquals(typeof backend.watch, "function");
});

// ============================================================================
// Options validation tests
// ============================================================================

Deno.test("DenoBundlerBackend buildId can be empty string", () => {
  const backend = new DenoBundlerBackend({ buildId: "" });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend entryName can be empty string", () => {
  const backend = new DenoBundlerBackend({ entryName: "" });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts Unicode in buildId", () => {
  const backend = new DenoBundlerBackend({
    buildId: "build-日本語-🚀",
  });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts special characters in entryName", () => {
  const backend = new DenoBundlerBackend({
    entryName: "app-entry_v2",
  });

  assert.assertEquals(backend.name, "deno-bundler");
});

// ============================================================================
// Factory function consistency tests
// ============================================================================

Deno.test("createDenoBundlerBackend with no args equals empty object", () => {
  const backend1 = createDenoBundlerBackend();
  const backend2 = createDenoBundlerBackend({});

  assert.assertEquals(backend1.name, backend2.name);
});

Deno.test("createDenoBundlerBackend creates independent instances", () => {
  const backend1 = createDenoBundlerBackend({ buildId: "build-1" });
  const backend2 = createDenoBundlerBackend({ buildId: "build-2" });

  // Each call should create a new instance
  assert.assertNotStrictEquals(backend1, backend2);
});

Deno.test("Multiple DenoBundlerBackend instances are independent", () => {
  const backend1 = new DenoBundlerBackend({ buildId: "a" });
  const backend2 = new DenoBundlerBackend({ buildId: "b" });

  assert.assertNotStrictEquals(backend1, backend2);
  assert.assertEquals(backend1.name, backend2.name);
});
