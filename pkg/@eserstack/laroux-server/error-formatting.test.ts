// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for error formatting utilities
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  BuildError,
  ConfigError,
  errors,
  formatError,
  LarouxError,
  RuntimeError,
} from "./error-formatting.ts";

const TEST_PORT_USED = 3000;

Deno.test("LarouxError - should be an Error subclass", () => {
  const error = new LarouxError("test message", "TEST_CODE", "test hint");
  assert(error instanceof Error);
  assert(error instanceof LarouxError);
  assertEquals(error.message, "test message");
  assertEquals(error.code, "TEST_CODE");
  assertEquals(error.hint, "test hint");
  assertEquals(error.name, "LarouxError");
});

Deno.test("ConfigError - should extend LarouxError", () => {
  const error = new ConfigError(
    "config issue",
    "CONFIG_ERROR",
    "check your config",
  );
  assert(error instanceof LarouxError);
  assert(error instanceof ConfigError);
  assertEquals(error.message, "config issue");
  assertEquals(error.code, "CONFIG_ERROR");
  assertEquals(error.hint, "check your config");
  assertEquals(error.name, "ConfigError");
});

Deno.test("BuildError - should extend LarouxError", () => {
  const error = new BuildError("build failed", "BUILD_ERROR");
  assert(error instanceof LarouxError);
  assert(error instanceof BuildError);
  assertEquals(error.code, "BUILD_ERROR");
  assertEquals(error.name, "BuildError");
});

Deno.test("RuntimeError - should extend LarouxError", () => {
  const error = new RuntimeError("runtime issue", "RUNTIME_ERROR");
  assert(error instanceof LarouxError);
  assert(error instanceof RuntimeError);
  assertEquals(error.code, "RUNTIME_ERROR");
  assertEquals(error.name, "RuntimeError");
});

Deno.test("formatError - should format a basic error", () => {
  const error = new Error("Basic error");
  const formatted = formatError(error);

  assertStringIncludes(formatted, "Error");
  assertStringIncludes(formatted, "Basic error");
  assert(formatted.includes("─")); // Box drawing characters
});

Deno.test("formatError - should format LarouxError with code", () => {
  const error = new LarouxError("Test message", "TEST_CODE");
  const formatted = formatError(error);

  assertStringIncludes(formatted, "LarouxError");
  assertStringIncludes(formatted, "TEST_CODE");
  assertStringIncludes(formatted, "Test message");
});

Deno.test("formatError - should include hint when present", () => {
  const error = new ConfigError(
    "Config invalid",
    "CONFIG300",
    "Check laroux.config.ts",
  );
  const formatted = formatError(error);

  assertStringIncludes(formatted, "Config invalid");
  assertStringIncludes(formatted, "Hint:");
  assertStringIncludes(formatted, "Check laroux.config.ts");
});

Deno.test("errors.invalidConfig - should create ConfigError", () => {
  const error = errors.invalidConfig("./config.ts", "Invalid export");

  assert(error instanceof ConfigError);
  assertStringIncludes(error.message, "./config.ts");
  assertStringIncludes(error.hint!, "Invalid export");
});

Deno.test("errors.missingDirectory - should create ConfigError", () => {
  const error = errors.missingDirectory("./dist", "build output");

  assert(error instanceof ConfigError);
  assertStringIncludes(error.message, "./dist");
  assertStringIncludes(error.hint!, "build output");
  assertStringIncludes(error.hint!, "mkdir -p");
});

Deno.test("errors.portInUse - should create RuntimeError", () => {
  const error = errors.portInUse(TEST_PORT_USED);

  assert(error instanceof RuntimeError);
  assertStringIncludes(error.message, String(TEST_PORT_USED));
  assertStringIncludes(error.hint!, "3001");
});

Deno.test("errors.moduleNotFound - should create BuildError", () => {
  const error = errors.moduleNotFound("./missing.ts");

  assert(error instanceof BuildError);
  assertStringIncludes(error.message, "./missing.ts");
});

Deno.test("errors.buildFailed - should create BuildError", () => {
  const error = errors.buildFailed("TypeScript error");

  assert(error instanceof BuildError);
  assertStringIncludes(error.message, "TypeScript error");
});

Deno.test("errors.actionFailed - should create RuntimeError", () => {
  const error = errors.actionFailed("myAction", "Network error");

  assert(error instanceof RuntimeError);
  assertStringIncludes(error.message, "myAction");
  assertStringIncludes(error.hint!, "Network error");
});

Deno.test("errors.componentError - should create RuntimeError", () => {
  const error = errors.componentError("Counter", "Props missing");

  assert(error instanceof RuntimeError);
  assertStringIncludes(error.message, "Counter");
  assertStringIncludes(error.hint!, "Props missing");
});
