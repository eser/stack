// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as path from "@std/path";
import * as crossRuntime from "./mod.ts";

// =============================================================================
// Detection Tests
// =============================================================================

nodeTest.test("detectRuntime() should detect Deno runtime", () => {
  assert.assertEquals(crossRuntime.detectRuntime(), "deno");
});

nodeTest.test("getRuntimeVersion() should return Deno version", () => {
  const version = crossRuntime.getRuntimeVersion();
  assert.assertExists(version);
  assert.assertEquals(version, Deno.version.deno);
});

nodeTest.test("isRuntime() should return true in Deno", () => {
  assert.assertEquals(crossRuntime.isRuntime("deno"), true);
});

nodeTest.test("isRuntime() should return false in Deno", () => {
  assert.assertEquals(crossRuntime.isRuntime("node"), false);
});

nodeTest.test("isBrowser() should return false in Deno", () => {
  assert.assertEquals(crossRuntime.isBrowser(), false);
});

nodeTest.test("isServer() should return true in Deno", () => {
  assert.assertEquals(crossRuntime.isServer(), true);
});

// =============================================================================
// Runtime Singleton Tests
// =============================================================================

nodeTest.test("current singleton should be Deno runtime", () => {
  assert.assertEquals(crossRuntime.runtime.name, "deno");
  assert.assertExists(crossRuntime.runtime.version);
  assert.assertEquals(crossRuntime.runtime.capabilities.fs, true);
  assert.assertEquals(crossRuntime.runtime.capabilities.exec, true);
});

nodeTest.test("runtime.path should work", () => {
  // runtime.path is the platform-native path API (@std/path), so the
  // separator is "/" on POSIX and "\" on Windows. Derive the expected value
  // with the same API instead of hardcoding "/" to stay cross-platform.
  const joined = crossRuntime.runtime.path.join("src", "lib", "utils.ts");
  assert.assertEquals(joined, path.join("src", "lib", "utils.ts"));

  const dir = crossRuntime.runtime.path.dirname("/home/user/file.txt");
  assert.assertEquals(dir, "/home/user");

  const base = crossRuntime.runtime.path.basename("/home/user/file.txt");
  assert.assertEquals(base, "file.txt");

  const ext = crossRuntime.runtime.path.extname("file.txt");
  assert.assertEquals(ext, ".txt");
});

nodeTest.test("runtime.env should work", () => {
  // Set a test env var
  crossRuntime.runtime.env.set("TEST_VAR", "test_value");
  assert.assertEquals(crossRuntime.runtime.env.get("TEST_VAR"), "test_value");
  assert.assertEquals(crossRuntime.runtime.env.has("TEST_VAR"), true);

  // Delete it
  crossRuntime.runtime.env.delete("TEST_VAR");
  assert.assertEquals(crossRuntime.runtime.env.get("TEST_VAR"), undefined);
  assert.assertEquals(crossRuntime.runtime.env.has("TEST_VAR"), false);
});

// =============================================================================
// Filesystem Tests
// =============================================================================

nodeTest.test("runtime.fs.exists() should check file existence", async () => {
  const exists = await crossRuntime.runtime.fs.exists("deno.json");
  assert.assertEquals(exists, true);

  const notExists = await crossRuntime.runtime.fs.exists(
    "nonexistent-file.xyz",
  );
  assert.assertEquals(notExists, false);
});

nodeTest.test("runtime.fs.readTextFile() should read files", async () => {
  const content = await crossRuntime.runtime.fs.readTextFile(
    "pkg/@eserstack/standards/package.json",
  );
  assert.assertExists(content);
  assert.assertEquals(content.includes("@eserstack/standards"), true);
});

nodeTest.test("runtime.fs.stat() should return file info", async () => {
  const stat = await crossRuntime.runtime.fs.stat("deno.json");
  assert.assertEquals(stat.isFile, true);
  assert.assertEquals(stat.isDirectory, false);
});

// =============================================================================
// Exec Tests
// =============================================================================

nodeTest.test("runtime.exec.exec() should execute commands", async () => {
  const result = await crossRuntime.runtime.exec.exec("echo", ["hello"]);
  assert.assertEquals(result, "hello");
});

nodeTest.test("runtime.exec.spawn() should return process output", async () => {
  const result = await crossRuntime.runtime.exec.spawn("echo", ["world"]);
  assert.assertEquals(result.success, true);
  assert.assertEquals(result.code, 0);
  assert.assertEquals(new TextDecoder().decode(result.stdout).trim(), "world");
});

nodeTest.test("runtime.exec.execJson() should parse JSON output", async () => {
  const result = await crossRuntime.runtime.exec.execJson<{ hello: string }>(
    "echo",
    ['{"hello":"world"}'],
  );
  assert.assertEquals(result.hello, "world");
});

nodeTest.test(
  "runtime.exec.spawnChild() should spawn process with piped I/O",
  async () => {
    const child = crossRuntime.runtime.exec.spawnChild("echo", [
      "hello from child",
    ]);

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
  },
);

nodeTest.test(
  "runtime.exec.spawnChild() should support piped stdin",
  async () => {
    // Use cat to echo back what we write to stdin
    const child = crossRuntime.runtime.exec.spawnChild("cat", [], {
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
  },
);

nodeTest.test(
  "runtime.exec.spawnChild() should provide status promise",
  async () => {
    // Use null streams to test status without resource leak issues
    const child = crossRuntime.runtime.exec.spawnChild(
      "echo",
      ["status test"],
      {
        stdout: "null",
        stderr: "null",
      },
    );

    const status = await child.status;

    assert.assertEquals(status.success, true);
    assert.assertEquals(status.code, 0);
  },
);

// =============================================================================
// Factory Tests
// =============================================================================

nodeTest.test("createRuntime() should create Deno runtime", async () => {
  const rt = await crossRuntime.createRuntime();
  assert.assertEquals(rt.name, "deno");
  assert.assertEquals(rt.capabilities.fs, true);
});

nodeTest.test("createRuntime() with overrides should merge", async () => {
  const mockEnv = {
    get: () => "mock",
    set: () => {},
    delete: () => {},
    has: () => true,
    toObject: () => ({ MOCK: "value" }),
  };

  const rt = await crossRuntime.createRuntime({ env: mockEnv });
  assert.assertEquals(rt.env.get("anything"), "mock");
});

nodeTest.test(
  "createRuntime() with an http override serves through it",
  async () => {
    const served: number[] = [];
    const mockHttp: crossRuntime.RuntimeHttp = {
      serve: (options) => {
        served.push(options.port);
        return Promise.resolve({
          hostname: "127.0.0.1",
          port: options.port,
          finished: Promise.resolve(),
        });
      },
      upgradeWebSocket: () => {
        throw new TypeError("the mock accepts no WebSocket");
      },
    };

    const rt = await crossRuntime.createRuntime({ http: mockHttp });
    const server = await rt.http.serve({ port: 8123 }, () => new Response());

    assert.assertEquals(served, [8123]);
    assert.assertEquals(server.port, 8123);
    assert.assertEquals(rt.name, "deno");
  },
);

// =============================================================================
// Path Polyfill Tests
// =============================================================================

nodeTest.test("posixPath.join() should join paths", () => {
  assert.assertEquals(crossRuntime.posixPath.join("a", "b", "c"), "a/b/c");
  assert.assertEquals(crossRuntime.posixPath.join("/a", "b", "c"), "/a/b/c");
  assert.assertEquals(crossRuntime.posixPath.join("a", "", "c"), "a/c");
});

nodeTest.test("posixPath.dirname() should return directory", () => {
  assert.assertEquals(crossRuntime.posixPath.dirname("/a/b/c"), "/a/b");
  assert.assertEquals(crossRuntime.posixPath.dirname("a/b/c"), "a/b");
  assert.assertEquals(crossRuntime.posixPath.dirname("file.txt"), ".");
});

nodeTest.test("posixPath.basename() should return filename", () => {
  assert.assertEquals(
    crossRuntime.posixPath.basename("/a/b/file.txt"),
    "file.txt",
  );
  assert.assertEquals(
    crossRuntime.posixPath.basename("/a/b/file.txt", ".txt"),
    "file",
  );
  assert.assertEquals(crossRuntime.posixPath.basename("file.txt"), "file.txt");
});

nodeTest.test("posixPath.extname() should return extension", () => {
  assert.assertEquals(crossRuntime.posixPath.extname("file.txt"), ".txt");
  assert.assertEquals(crossRuntime.posixPath.extname("file"), "");
  assert.assertEquals(crossRuntime.posixPath.extname(".gitignore"), "");
  assert.assertEquals(crossRuntime.posixPath.extname("file.tar.gz"), ".gz");
});

nodeTest.test("posixPath.normalize() should normalize paths", () => {
  assert.assertEquals(crossRuntime.posixPath.normalize("a/b/../c"), "a/c");
  assert.assertEquals(crossRuntime.posixPath.normalize("a/./b/c"), "a/b/c");
  assert.assertEquals(crossRuntime.posixPath.normalize("//a//b//"), "/a/b/");
});

nodeTest.test("posixPath.isAbsolute() should detect absolute paths", () => {
  assert.assertEquals(crossRuntime.posixPath.isAbsolute("/a/b"), true);
  assert.assertEquals(crossRuntime.posixPath.isAbsolute("a/b"), false);
  assert.assertEquals(crossRuntime.posixPath.isAbsolute("C:/a/b"), true);
});

nodeTest.test("posixPath.relative() should compute relative paths", () => {
  assert.assertEquals(crossRuntime.posixPath.relative("/a/b", "/a/c"), "../c");
  assert.assertEquals(crossRuntime.posixPath.relative("/a/b", "/a/b/c"), "c");
});

nodeTest.test("posixPath.parse() should parse path components", () => {
  const parsed = crossRuntime.posixPath.parse("/home/user/file.txt");
  assert.assertEquals(parsed.root, "/");
  assert.assertEquals(parsed.dir, "/home/user");
  assert.assertEquals(parsed.base, "file.txt");
  assert.assertEquals(parsed.ext, ".txt");
  assert.assertEquals(parsed.name, "file");
});

// =============================================================================
// Error Tests
// =============================================================================

nodeTest.test("RuntimeCapabilityError should have correct properties", () => {
  const error = new crossRuntime.RuntimeCapabilityError("fs", "workerd");
  assert.assertEquals(error.capability, "fs");
  assert.assertEquals(error.runtimeName, "workerd");
  assert.assertEquals(error.name, "RuntimeCapabilityError");
  assert.assertExists(error.message);
});

// =============================================================================
// toPosix Tests
// =============================================================================

nodeTest.test("toPosix() should convert backslashes to forward slashes", () => {
  assert.assertEquals(
    crossRuntime.toPosix("src\\components\\Button.tsx"),
    "src/components/Button.tsx",
  );
  assert.assertEquals(crossRuntime.toPosix("a\\b\\c\\d"), "a/b/c/d");
});

nodeTest.test("toPosix() should normalize redundant slashes", () => {
  assert.assertEquals(
    crossRuntime.toPosix("src//components///Button.tsx"),
    "src/components/Button.tsx",
  );
  assert.assertEquals(crossRuntime.toPosix("./src//utils/"), "./src/utils/");
});

nodeTest.test("toPosix() should handle mixed separators", () => {
  assert.assertEquals(
    crossRuntime.toPosix("src\\components//Button.tsx"),
    "src/components/Button.tsx",
  );
});

nodeTest.test("toPosix() should preserve relative paths", () => {
  assert.assertEquals(crossRuntime.toPosix("./utils.ts"), "./utils.ts");
  assert.assertEquals(
    crossRuntime.toPosix("../lib/index.ts"),
    "../lib/index.ts",
  );
});

nodeTest.test("toPosix() should handle empty string", () => {
  assert.assertEquals(crossRuntime.toPosix(""), "");
});

nodeTest.test("toPosix() should handle paths already in POSIX format", () => {
  assert.assertEquals(
    crossRuntime.toPosix("src/components/Button.tsx"),
    "src/components/Button.tsx",
  );
  assert.assertEquals(crossRuntime.toPosix("/absolute/path"), "/absolute/path");
});
