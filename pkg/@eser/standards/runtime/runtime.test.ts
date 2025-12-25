// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  createRuntime,
  DENO_CAPABILITIES,
  detectRuntime,
  getCapabilities,
  getRuntimeVersion,
  hasCapability,
  isBrowser,
  isBun,
  isDeno,
  isNode,
  isServer,
  isWorkerd,
  posixPath,
  runtime,
  RuntimeCapabilityError,
} from "./mod.ts";

// =============================================================================
// Detection Tests
// =============================================================================

Deno.test("detectRuntime() should detect Deno runtime", () => {
  assert.assertEquals(detectRuntime(), "deno");
});

Deno.test("getRuntimeVersion() should return Deno version", () => {
  const version = getRuntimeVersion();
  assert.assertExists(version);
  assert.assertEquals(version, Deno.version.deno);
});

Deno.test("isDeno() should return true in Deno", () => {
  assert.assertEquals(isDeno(), true);
});

Deno.test("isNode() should return false in Deno", () => {
  assert.assertEquals(isNode(), false);
});

Deno.test("isBun() should return false in Deno", () => {
  assert.assertEquals(isBun(), false);
});

Deno.test("isWorkerd() should return false in Deno", () => {
  assert.assertEquals(isWorkerd(), false);
});

Deno.test("isBrowser() should return false in Deno", () => {
  assert.assertEquals(isBrowser(), false);
});

Deno.test("isServer() should return true in Deno", () => {
  assert.assertEquals(isServer(), true);
});

// =============================================================================
// Capabilities Tests
// =============================================================================

Deno.test("getCapabilities() should return Deno capabilities", () => {
  const caps = getCapabilities("deno");
  assert.assertEquals(caps, DENO_CAPABILITIES);
  assert.assertEquals(caps.fs, true);
  assert.assertEquals(caps.exec, true);
  assert.assertEquals(caps.kv, true);
});

Deno.test("getCapabilities() should return limited Workers capabilities", () => {
  const caps = getCapabilities("workerd");
  assert.assertEquals(caps.fs, false);
  assert.assertEquals(caps.exec, false);
  assert.assertEquals(caps.kv, true);
});

Deno.test("hasCapability() should check capabilities correctly", () => {
  assert.assertEquals(hasCapability("deno", "fs"), true);
  assert.assertEquals(hasCapability("deno", "exec"), true);
  assert.assertEquals(hasCapability("workerd", "fs"), false);
  assert.assertEquals(hasCapability("workerd", "exec"), false);
});

// =============================================================================
// Runtime Singleton Tests
// =============================================================================

Deno.test("runtime singleton should be Deno runtime", () => {
  assert.assertEquals(runtime.name, "deno");
  assert.assertExists(runtime.version);
  assert.assertEquals(runtime.capabilities.fs, true);
  assert.assertEquals(runtime.capabilities.exec, true);
});

Deno.test("runtime.path should work", () => {
  const joined = runtime.path.join("src", "lib", "utils.ts");
  assert.assertEquals(joined, "src/lib/utils.ts");

  const dir = runtime.path.dirname("/home/user/file.txt");
  assert.assertEquals(dir, "/home/user");

  const base = runtime.path.basename("/home/user/file.txt");
  assert.assertEquals(base, "file.txt");

  const ext = runtime.path.extname("file.txt");
  assert.assertEquals(ext, ".txt");
});

Deno.test("runtime.env should work", () => {
  // Set a test env var
  runtime.env.set("TEST_VAR", "test_value");
  assert.assertEquals(runtime.env.get("TEST_VAR"), "test_value");
  assert.assertEquals(runtime.env.has("TEST_VAR"), true);

  // Delete it
  runtime.env.delete("TEST_VAR");
  assert.assertEquals(runtime.env.get("TEST_VAR"), undefined);
  assert.assertEquals(runtime.env.has("TEST_VAR"), false);
});

// =============================================================================
// Filesystem Tests
// =============================================================================

Deno.test("runtime.fs.exists() should check file existence", async () => {
  const exists = await runtime.fs.exists("deno.json");
  assert.assertEquals(exists, true);

  const notExists = await runtime.fs.exists("nonexistent-file.xyz");
  assert.assertEquals(notExists, false);
});

Deno.test("runtime.fs.readTextFile() should read files", async () => {
  const content = await runtime.fs.readTextFile(
    "pkg/@eser/standards/package.json",
  );
  assert.assertExists(content);
  assert.assertEquals(content.includes("@eser/standards"), true);
});

Deno.test("runtime.fs.stat() should return file info", async () => {
  const stat = await runtime.fs.stat("deno.json");
  assert.assertEquals(stat.isFile, true);
  assert.assertEquals(stat.isDirectory, false);
});

// =============================================================================
// Exec Tests
// =============================================================================

Deno.test("runtime.exec.exec() should execute commands", async () => {
  const result = await runtime.exec.exec("echo", ["hello"]);
  assert.assertEquals(result, "hello");
});

Deno.test("runtime.exec.spawn() should return process output", async () => {
  const result = await runtime.exec.spawn("echo", ["world"]);
  assert.assertEquals(result.success, true);
  assert.assertEquals(result.code, 0);
  assert.assertEquals(new TextDecoder().decode(result.stdout).trim(), "world");
});

Deno.test("runtime.exec.execJson() should parse JSON output", async () => {
  const result = await runtime.exec.execJson<{ hello: string }>(
    "echo",
    ['{"hello":"world"}'],
  );
  assert.assertEquals(result.hello, "world");
});

Deno.test("runtime.exec.spawnChild() should spawn process with piped I/O", async () => {
  const child = runtime.exec.spawnChild("echo", ["hello from child"]);

  assert.assertExists(child.pid);
  assert.assertExists(child.status);
  assert.assertExists(child.output);

  const { success, code, stdout } = await child.output();

  assert.assertEquals(success, true);
  assert.assertEquals(code, 0);
  assert.assertEquals(
    new TextDecoder().decode(stdout).trim(),
    "hello from child",
  );
});

Deno.test("runtime.exec.spawnChild() should support piped stdin", async () => {
  // Use cat to echo back what we write to stdin
  const child = runtime.exec.spawnChild("cat", [], {
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });

  assert.assertExists(child.stdin);

  // Write to stdin
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode("piped input test"));
  await writer.close();

  const { success, stdout } = await child.output();

  assert.assertEquals(success, true);
  assert.assertEquals(
    new TextDecoder().decode(stdout).trim(),
    "piped input test",
  );
});

Deno.test("runtime.exec.spawnChild() should provide status promise", async () => {
  // Use null streams to test status without resource leak issues
  const child = runtime.exec.spawnChild("echo", ["status test"], {
    stdout: "null",
    stderr: "null",
  });

  const status = await child.status;

  assert.assertEquals(status.success, true);
  assert.assertEquals(status.code, 0);
});

// =============================================================================
// Factory Tests
// =============================================================================

Deno.test("createRuntime() should create Deno runtime", () => {
  const rt = createRuntime();
  assert.assertEquals(rt.name, "deno");
  assert.assertEquals(rt.capabilities.fs, true);
});

Deno.test("createRuntime() with overrides should merge", () => {
  const mockEnv = {
    get: () => "mock",
    set: () => {},
    delete: () => {},
    has: () => true,
    toObject: () => ({ MOCK: "value" }),
  };

  const rt = createRuntime({ env: mockEnv });
  assert.assertEquals(rt.env.get("anything"), "mock");
});

// =============================================================================
// Path Polyfill Tests
// =============================================================================

Deno.test("posixPath.join() should join paths", () => {
  assert.assertEquals(posixPath.join("a", "b", "c"), "a/b/c");
  assert.assertEquals(posixPath.join("/a", "b", "c"), "/a/b/c");
  assert.assertEquals(posixPath.join("a", "", "c"), "a/c");
});

Deno.test("posixPath.dirname() should return directory", () => {
  assert.assertEquals(posixPath.dirname("/a/b/c"), "/a/b");
  assert.assertEquals(posixPath.dirname("a/b/c"), "a/b");
  assert.assertEquals(posixPath.dirname("file.txt"), ".");
});

Deno.test("posixPath.basename() should return filename", () => {
  assert.assertEquals(posixPath.basename("/a/b/file.txt"), "file.txt");
  assert.assertEquals(posixPath.basename("/a/b/file.txt", ".txt"), "file");
  assert.assertEquals(posixPath.basename("file.txt"), "file.txt");
});

Deno.test("posixPath.extname() should return extension", () => {
  assert.assertEquals(posixPath.extname("file.txt"), ".txt");
  assert.assertEquals(posixPath.extname("file"), "");
  assert.assertEquals(posixPath.extname(".gitignore"), "");
  assert.assertEquals(posixPath.extname("file.tar.gz"), ".gz");
});

Deno.test("posixPath.normalize() should normalize paths", () => {
  assert.assertEquals(posixPath.normalize("a/b/../c"), "a/c");
  assert.assertEquals(posixPath.normalize("a/./b/c"), "a/b/c");
  assert.assertEquals(posixPath.normalize("//a//b//"), "/a/b/");
});

Deno.test("posixPath.isAbsolute() should detect absolute paths", () => {
  assert.assertEquals(posixPath.isAbsolute("/a/b"), true);
  assert.assertEquals(posixPath.isAbsolute("a/b"), false);
  assert.assertEquals(posixPath.isAbsolute("C:/a/b"), true);
});

Deno.test("posixPath.relative() should compute relative paths", () => {
  assert.assertEquals(posixPath.relative("/a/b", "/a/c"), "../c");
  assert.assertEquals(posixPath.relative("/a/b", "/a/b/c"), "c");
});

Deno.test("posixPath.parse() should parse path components", () => {
  const parsed = posixPath.parse("/home/user/file.txt");
  assert.assertEquals(parsed.root, "/");
  assert.assertEquals(parsed.dir, "/home/user");
  assert.assertEquals(parsed.base, "file.txt");
  assert.assertEquals(parsed.ext, ".txt");
  assert.assertEquals(parsed.name, "file");
});

// =============================================================================
// Error Tests
// =============================================================================

Deno.test("RuntimeCapabilityError should have correct properties", () => {
  const error = new RuntimeCapabilityError("fs", "workerd");
  assert.assertEquals(error.capability, "fs");
  assert.assertEquals(error.runtimeName, "workerd");
  assert.assertEquals(error.name, "RuntimeCapabilityError");
  assert.assertExists(error.message);
});
