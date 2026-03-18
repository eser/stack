// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as execCtx from "./execution-context.ts";

// =============================================================================
// Test fixtures
// =============================================================================

const ESER_OPTS: execCtx.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

// =============================================================================
// detectInvoker() — pure function tests
// =============================================================================

Deno.test("detectInvoker: compiled binary", () => {
  const result = execCtx.detectInvoker({}, "deno", true);
  assert.assertEquals(result, { invoker: "binary", mode: "installed" });
});

Deno.test("detectInvoker: node runtime, no special env", () => {
  const result = execCtx.detectInvoker({}, "node", false);
  assert.assertEquals(result, { invoker: "npm", mode: "installed" });
});

Deno.test("detectInvoker: node runtime, npx execpath", () => {
  const result = execCtx.detectInvoker(
    { npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js" },
    "node",
    false,
  );
  assert.assertEquals(result, { invoker: "npx", mode: "on-demand" });
});

Deno.test("detectInvoker: node runtime, pnpm user agent (global install)", () => {
  const result = execCtx.detectInvoker(
    { npm_config_user_agent: "pnpm/8.0.0 npm/? node/v20.0.0 linux x64" },
    "node",
    false,
  );
  assert.assertEquals(result, { invoker: "pnpm", mode: "installed" });
});

Deno.test("detectInvoker: node runtime, pnpm execpath (on-demand)", () => {
  const result = execCtx.detectInvoker(
    { npm_execpath: "/home/user/.local/share/pnpm/pnpm.cjs" },
    "node",
    false,
  );
  assert.assertEquals(result, { invoker: "pnpx", mode: "on-demand" });
});

Deno.test("detectInvoker: bun runtime, BUN_INSTALL set (global install)", () => {
  const result = execCtx.detectInvoker(
    { BUN_INSTALL: "/home/user/.bun" },
    "bun",
    false,
  );
  assert.assertEquals(result, { invoker: "bun", mode: "installed" });
});

Deno.test("detectInvoker: bun runtime, no BUN_INSTALL (bunx on-demand)", () => {
  const result = execCtx.detectInvoker({}, "bun", false);
  assert.assertEquals(result, { invoker: "bunx", mode: "on-demand" });
});

Deno.test("detectInvoker: deno runtime, jsr: main module (on-demand)", () => {
  const result = execCtx.detectInvoker(
    {},
    "deno",
    false,
    "jsr:@eser/cli",
  );
  assert.assertEquals(result, { invoker: "deno", mode: "on-demand" });
});

Deno.test("detectInvoker: deno runtime, local file module (installed)", () => {
  const result = execCtx.detectInvoker(
    {},
    "deno",
    false,
    "/home/user/.deno/bin/eser",
  );
  assert.assertEquals(result, { invoker: "deno", mode: "installed" });
});

Deno.test("detectInvoker: deno runtime, dev context flag (workspace)", () => {
  const result = execCtx.detectInvoker(
    {},
    "deno",
    false,
    "file:///workspace/pkg/@eser/cli/main.ts",
    true,
  );
  assert.assertEquals(result, { invoker: "dev", mode: "dev" });
});

Deno.test("detectInvoker: deno runtime, https: main module (on-demand)", () => {
  const result = execCtx.detectInvoker(
    {},
    "deno",
    false,
    "https://deno.land/x/eser/main.ts",
  );
  assert.assertEquals(result, { invoker: "deno", mode: "on-demand" });
});

Deno.test("detectInvoker: unknown runtime", () => {
  const result = execCtx.detectInvoker({}, "unknown", false);
  assert.assertEquals(result, { invoker: "unknown", mode: "installed" });
});

// =============================================================================
// buildCommand() — pure function tests
// =============================================================================

Deno.test("buildCommand: binary invoker uses opts.command", () => {
  const result = execCtx.buildCommand("binary", "installed", ESER_OPTS);
  assert.assertEquals(result, "eser");
});

Deno.test("buildCommand: npm installed invoker uses opts.command", () => {
  const result = execCtx.buildCommand("npm", "installed", ESER_OPTS);
  assert.assertEquals(result, "eser");
});

Deno.test("buildCommand: npx invoker uses opts.npmPackage", () => {
  const result = execCtx.buildCommand("npx", "on-demand", ESER_OPTS);
  assert.assertEquals(result, "npx eser");
});

Deno.test("buildCommand: pnpx invoker uses opts.npmPackage", () => {
  const result = execCtx.buildCommand("pnpx", "on-demand", ESER_OPTS);
  assert.assertEquals(result, "pnpx eser");
});

Deno.test("buildCommand: bunx invoker uses opts.npmPackage", () => {
  const result = execCtx.buildCommand("bunx", "on-demand", ESER_OPTS);
  assert.assertEquals(result, "bunx eser");
});

Deno.test("buildCommand: deno on-demand uses opts.jsrPackage", () => {
  const result = execCtx.buildCommand("deno", "on-demand", ESER_OPTS);
  assert.assertEquals(result, "deno run --allow-all jsr:@eser/cli");
});

Deno.test("buildCommand: dev invoker uses opts.devCommand", () => {
  const result = execCtx.buildCommand("dev", "dev", ESER_OPTS);
  assert.assertEquals(result, "deno task cli");
});

Deno.test("buildCommand: parameterization — different opts produce different output", () => {
  const customOpts: execCtx.CliCommandOptions = {
    command: "foo",
    devCommand: "make run",
    npmPackage: "bar",
    jsrPackage: "@foo/bar",
  };

  assert.assertEquals(
    execCtx.buildCommand("npx", "on-demand", customOpts),
    "npx bar",
  );
  assert.assertEquals(
    execCtx.buildCommand("deno", "on-demand", customOpts),
    "deno run --allow-all jsr:@foo/bar",
  );
  assert.assertEquals(
    execCtx.buildCommand("dev", "dev", customOpts),
    "make run",
  );
});

// =============================================================================
// resolvePathDirs() — pure function tests
// =============================================================================

Deno.test("resolvePathDirs: empty string returns empty array", () => {
  assert.assertEquals(execCtx.resolvePathDirs("", "linux"), []);
});

Deno.test("resolvePathDirs: colon-separated unix paths", () => {
  const result = execCtx.resolvePathDirs("/usr/bin:/usr/local/bin", "linux");
  assert.assertEquals(result, ["/usr/bin", "/usr/local/bin"]);
});

Deno.test("resolvePathDirs: semicolon-separated windows paths", () => {
  const result = execCtx.resolvePathDirs(
    "C:\\Windows\\System32;C:\\bin",
    "windows",
  );
  assert.assertEquals(result, ["C:\\Windows\\System32", "C:\\bin"]);
});

Deno.test("resolvePathDirs: filters empty segments from double separators", () => {
  const result = execCtx.resolvePathDirs("/usr/bin::/usr/local/bin", "linux");
  assert.assertEquals(result, ["/usr/bin", "/usr/local/bin"]);
});

// =============================================================================
// Integration tests (async — use real filesystem / environment)
// =============================================================================

Deno.test("isCommandInPath: deno is available in PATH", async () => {
  const result = await execCtx.isCommandInPath("deno");
  assert.assertEquals(result, true);
});

Deno.test("isCommandInPath: nonexistent binary returns false", async () => {
  const result = await execCtx.isCommandInPath("nonexistent-binary-eser-xyz");
  assert.assertEquals(result, false);
});

Deno.test("getCliCommand: returns a non-empty string", async () => {
  const result = await execCtx.getCliCommand(ESER_OPTS);
  assert.assert(typeof result === "string" && result.length > 0);
});

Deno.test("getCliCommand: result is a known valid command pattern", async () => {
  const result = await execCtx.getCliCommand(ESER_OPTS);
  const validPatterns = [
    "eser",
    "npx eser",
    "pnpx eser",
    "bunx eser",
    "deno run --allow-all jsr:@eser/cli",
  ];
  assert.assert(
    validPatterns.includes(result),
    `Expected one of ${validPatterns.join(", ")}, got: ${result}`,
  );
});

Deno.test("detectExecutionContext: returns valid context with all required fields", async () => {
  const ctx = await execCtx.detectExecutionContext(ESER_OPTS);

  assert.assertExists(ctx.runtime);
  assert.assertExists(ctx.mode);
  assert.assertExists(ctx.invoker);
  assert.assertExists(ctx.command);
  assert.assertEquals(typeof ctx.isInPath, "boolean");

  const validRuntimes: execCtx.CliRuntime[] = [
    "deno",
    "node",
    "bun",
    "compiled",
  ];
  const validModes: execCtx.CliMode[] = ["installed", "on-demand", "dev"];
  const validInvokers: execCtx.CliInvoker[] = [
    "binary",
    "deno",
    "npm",
    "npx",
    "pnpm",
    "pnpx",
    "bun",
    "bunx",
    "dev",
    "unknown",
  ];

  assert.assert(validRuntimes.includes(ctx.runtime));
  assert.assert(validModes.includes(ctx.mode));
  assert.assert(validInvokers.includes(ctx.invoker));
  assert.assert(ctx.command.length > 0);
});
