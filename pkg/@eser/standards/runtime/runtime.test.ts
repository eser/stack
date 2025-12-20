// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertExists, assertThrows } from "@std/assert";
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
  assertEquals(detectRuntime(), "deno");
});

Deno.test("getRuntimeVersion() should return Deno version", () => {
  const version = getRuntimeVersion();
  assertExists(version);
  assertEquals(version, Deno.version.deno);
});

Deno.test("isDeno() should return true in Deno", () => {
  assertEquals(isDeno(), true);
});

Deno.test("isNode() should return false in Deno", () => {
  assertEquals(isNode(), false);
});

Deno.test("isBun() should return false in Deno", () => {
  assertEquals(isBun(), false);
});

Deno.test("isWorkerd() should return false in Deno", () => {
  assertEquals(isWorkerd(), false);
});

Deno.test("isBrowser() should return false in Deno", () => {
  assertEquals(isBrowser(), false);
});

Deno.test("isServer() should return true in Deno", () => {
  assertEquals(isServer(), true);
});

// =============================================================================
// Capabilities Tests
// =============================================================================

Deno.test("getCapabilities() should return Deno capabilities", () => {
  const caps = getCapabilities("deno");
  assertEquals(caps, DENO_CAPABILITIES);
  assertEquals(caps.fs, true);
  assertEquals(caps.exec, true);
  assertEquals(caps.kv, true);
});

Deno.test("getCapabilities() should return limited Workers capabilities", () => {
  const caps = getCapabilities("workerd");
  assertEquals(caps.fs, false);
  assertEquals(caps.exec, false);
  assertEquals(caps.kv, true);
});

Deno.test("hasCapability() should check capabilities correctly", () => {
  assertEquals(hasCapability("deno", "fs"), true);
  assertEquals(hasCapability("deno", "exec"), true);
  assertEquals(hasCapability("workerd", "fs"), false);
  assertEquals(hasCapability("workerd", "exec"), false);
});

// =============================================================================
// Runtime Singleton Tests
// =============================================================================

Deno.test("runtime singleton should be Deno runtime", () => {
  assertEquals(runtime.name, "deno");
  assertExists(runtime.version);
  assertEquals(runtime.capabilities.fs, true);
  assertEquals(runtime.capabilities.exec, true);
});

Deno.test("runtime.path should work", () => {
  const joined = runtime.path.join("src", "lib", "utils.ts");
  assertEquals(joined, "src/lib/utils.ts");

  const dir = runtime.path.dirname("/home/user/file.txt");
  assertEquals(dir, "/home/user");

  const base = runtime.path.basename("/home/user/file.txt");
  assertEquals(base, "file.txt");

  const ext = runtime.path.extname("file.txt");
  assertEquals(ext, ".txt");
});

Deno.test("runtime.env should work", () => {
  // Set a test env var
  runtime.env.set("TEST_VAR", "test_value");
  assertEquals(runtime.env.get("TEST_VAR"), "test_value");
  assertEquals(runtime.env.has("TEST_VAR"), true);

  // Delete it
  runtime.env.delete("TEST_VAR");
  assertEquals(runtime.env.get("TEST_VAR"), undefined);
  assertEquals(runtime.env.has("TEST_VAR"), false);
});

// =============================================================================
// Filesystem Tests
// =============================================================================

Deno.test("runtime.fs.exists() should check file existence", async () => {
  const exists = await runtime.fs.exists("deno.json");
  assertEquals(exists, true);

  const notExists = await runtime.fs.exists("nonexistent-file.xyz");
  assertEquals(notExists, false);
});

Deno.test("runtime.fs.readTextFile() should read files", async () => {
  const content = await runtime.fs.readTextFile(
    "pkg/@eser/standards/package.json",
  );
  assertExists(content);
  assertEquals(content.includes("@eser/standards"), true);
});

Deno.test("runtime.fs.stat() should return file info", async () => {
  const stat = await runtime.fs.stat("deno.json");
  assertEquals(stat.isFile, true);
  assertEquals(stat.isDirectory, false);
});

// =============================================================================
// Exec Tests
// =============================================================================

Deno.test("runtime.exec.exec() should execute commands", async () => {
  const result = await runtime.exec.exec("echo", ["hello"]);
  assertEquals(result, "hello");
});

Deno.test("runtime.exec.spawn() should return process output", async () => {
  const result = await runtime.exec.spawn("echo", ["world"]);
  assertEquals(result.success, true);
  assertEquals(result.code, 0);
  assertEquals(new TextDecoder().decode(result.stdout).trim(), "world");
});

Deno.test("runtime.exec.execJson() should parse JSON output", async () => {
  const result = await runtime.exec.execJson<{ hello: string }>(
    "echo",
    ['{"hello":"world"}'],
  );
  assertEquals(result.hello, "world");
});

Deno.test("runtime.exec.spawnChild() should spawn process with piped I/O", async () => {
  const child = runtime.exec.spawnChild("echo", ["hello from child"]);

  assertExists(child.pid);
  assertExists(child.status);
  assertExists(child.output);

  const { success, code, stdout } = await child.output();

  assertEquals(success, true);
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).trim(), "hello from child");
});

Deno.test("runtime.exec.spawnChild() should support piped stdin", async () => {
  // Use cat to echo back what we write to stdin
  const child = runtime.exec.spawnChild("cat", [], {
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });

  assertExists(child.stdin);

  // Write to stdin
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode("piped input test"));
  await writer.close();

  const { success, stdout } = await child.output();

  assertEquals(success, true);
  assertEquals(new TextDecoder().decode(stdout).trim(), "piped input test");
});

Deno.test("runtime.exec.spawnChild() should provide status promise", async () => {
  // Use null streams to test status without resource leak issues
  const child = runtime.exec.spawnChild("echo", ["status test"], {
    stdout: "null",
    stderr: "null",
  });

  const status = await child.status;

  assertEquals(status.success, true);
  assertEquals(status.code, 0);
});

// =============================================================================
// Factory Tests
// =============================================================================

Deno.test("createRuntime() should create Deno runtime", () => {
  const rt = createRuntime();
  assertEquals(rt.name, "deno");
  assertEquals(rt.capabilities.fs, true);
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
  assertEquals(rt.env.get("anything"), "mock");
});

// =============================================================================
// Path Polyfill Tests
// =============================================================================

Deno.test("posixPath.join() should join paths", () => {
  assertEquals(posixPath.join("a", "b", "c"), "a/b/c");
  assertEquals(posixPath.join("/a", "b", "c"), "/a/b/c");
  assertEquals(posixPath.join("a", "", "c"), "a/c");
});

Deno.test("posixPath.dirname() should return directory", () => {
  assertEquals(posixPath.dirname("/a/b/c"), "/a/b");
  assertEquals(posixPath.dirname("a/b/c"), "a/b");
  assertEquals(posixPath.dirname("file.txt"), ".");
});

Deno.test("posixPath.basename() should return filename", () => {
  assertEquals(posixPath.basename("/a/b/file.txt"), "file.txt");
  assertEquals(posixPath.basename("/a/b/file.txt", ".txt"), "file");
  assertEquals(posixPath.basename("file.txt"), "file.txt");
});

Deno.test("posixPath.extname() should return extension", () => {
  assertEquals(posixPath.extname("file.txt"), ".txt");
  assertEquals(posixPath.extname("file"), "");
  assertEquals(posixPath.extname(".gitignore"), "");
  assertEquals(posixPath.extname("file.tar.gz"), ".gz");
});

Deno.test("posixPath.normalize() should normalize paths", () => {
  assertEquals(posixPath.normalize("a/b/../c"), "a/c");
  assertEquals(posixPath.normalize("a/./b/c"), "a/b/c");
  assertEquals(posixPath.normalize("//a//b//"), "/a/b/");
});

Deno.test("posixPath.isAbsolute() should detect absolute paths", () => {
  assertEquals(posixPath.isAbsolute("/a/b"), true);
  assertEquals(posixPath.isAbsolute("a/b"), false);
  assertEquals(posixPath.isAbsolute("C:/a/b"), true);
});

Deno.test("posixPath.relative() should compute relative paths", () => {
  assertEquals(posixPath.relative("/a/b", "/a/c"), "../c");
  assertEquals(posixPath.relative("/a/b", "/a/b/c"), "c");
});

Deno.test("posixPath.parse() should parse path components", () => {
  const parsed = posixPath.parse("/home/user/file.txt");
  assertEquals(parsed.root, "/");
  assertEquals(parsed.dir, "/home/user");
  assertEquals(parsed.base, "file.txt");
  assertEquals(parsed.ext, ".txt");
  assertEquals(parsed.name, "file");
});

// =============================================================================
// Error Tests
// =============================================================================

Deno.test("RuntimeCapabilityError should have correct properties", () => {
  const error = new RuntimeCapabilityError("fs", "workerd");
  assertEquals(error.capability, "fs");
  assertEquals(error.runtimeName, "workerd");
  assertEquals(error.name, "RuntimeCapabilityError");
  assertExists(error.message);
});
