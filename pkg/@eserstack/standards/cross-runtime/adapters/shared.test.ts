// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as shared from "./shared.ts";
import * as types from "../types.ts";

Deno.test("getPlatform returns valid platform", () => {
  const result = shared.getPlatform();

  assert.assert(
    result === "darwin" || result === "linux" || result === "windows",
    `Expected platform to be darwin, linux, or windows, got: ${result}`,
  );
});

Deno.test("getArch returns valid architecture", () => {
  const result = shared.getArch();

  assert.assert(
    result === "amd64" || result === "arm64",
    `Expected arch to be amd64 or arm64, got: ${result}`,
  );
});

Deno.test("getHomedir returns non-empty string", () => {
  const result = shared.getHomedir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Home directory should not be empty");
});

Deno.test("getTmpdir returns non-empty string", () => {
  const result = shared.getTmpdir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Temp directory should not be empty");
});

Deno.test("getPlatformInfo returns complete info", () => {
  const result = shared.getPlatformInfo();

  assert.assertExists(result.platform);
  assert.assertExists(result.arch);
  assert.assertExists(result.homedir);
  assert.assertExists(result.tmpdir);

  // Verify types match expected values
  assert.assert(
    result.platform === "darwin" || result.platform === "linux" ||
      result.platform === "windows",
  );
  assert.assert(result.arch === "amd64" || result.arch === "arm64");
});

Deno.test("getPlatformInfo platform matches getPlatform", () => {
  const info = shared.getPlatformInfo();
  const directPlatform = shared.getPlatform();

  assert.assertEquals(info.platform, directPlatform);
});

Deno.test("getPlatformInfo arch matches getArch", () => {
  const info = shared.getPlatformInfo();
  const directArch = shared.getArch();

  assert.assertEquals(info.arch, directArch);
});

Deno.test("getPlatformInfo homedir matches getHomedir", () => {
  const info = shared.getPlatformInfo();
  const directHomedir = shared.getHomedir();

  assert.assertEquals(info.homedir, directHomedir);
});

Deno.test("getPlatformInfo tmpdir matches getTmpdir", () => {
  const info = shared.getPlatformInfo();
  const directTmpdir = shared.getTmpdir();

  assert.assertEquals(info.tmpdir, directTmpdir);
});

Deno.test("toNodeProcessInfo keeps the string platform and arch", () => {
  const result = shared.toNodeProcessInfo({
    platform: "linux",
    arch: "x64",
    env: {},
  });

  assert.assertEquals(result, { platform: "linux", arch: "x64" });
});

Deno.test("toNodeProcessInfo drops fields that are missing or not strings", () => {
  // A bundler's browser shim of process often carries only env.
  assert.assertEquals(shared.toNodeProcessInfo({ env: {} }), {
    platform: undefined,
    arch: undefined,
  });
  assert.assertEquals(shared.toNodeProcessInfo({ platform: 42, arch: null }), {
    platform: undefined,
    arch: undefined,
  });
});

Deno.test("toNodeProcessInfo returns null for a value that is not an object", () => {
  assert.assertEquals(shared.toNodeProcessInfo(undefined), null);
  assert.assertEquals(shared.toNodeProcessInfo(null), null);
  assert.assertEquals(shared.toNodeProcessInfo("linux"), null);
});

Deno.test("toNavigatorInfo keeps a string userAgent", () => {
  const result = shared.toNavigatorInfo({ userAgent: "Mozilla/5.0 (X11)" });

  assert.assertEquals(result, { userAgent: "Mozilla/5.0 (X11)" });
});

Deno.test("toNavigatorInfo drops a userAgent that is not a string", () => {
  assert.assertEquals(shared.toNavigatorInfo({ userAgent: 1 }), {
    userAgent: undefined,
  });
});

Deno.test("toNavigatorInfo returns null for a value that is not an object", () => {
  assert.assertEquals(shared.toNavigatorInfo(undefined), null);
  assert.assertEquals(shared.toNavigatorInfo(0), null);
});

Deno.test("getProcess reads the platform and arch of the process global", () => {
  // Deno 2 defines the Node-compatible process global.
  const result = shared.getProcess();

  assert.assertNotEquals(result, null);
  assert.assertEquals(typeof result?.platform, "string");
  assert.assertEquals(typeof result?.arch, "string");
});

Deno.test("getNavigator reads the userAgent of the navigator global", () => {
  const result = shared.getNavigator();

  assert.assertEquals(result?.userAgent, navigator.userAgent);
});

Deno.test("createSafeHandler passes the handler's response through", async () => {
  const respond = shared.createSafeHandler(() => new Response("fine"));

  const response = await respond(new Request("http://127.0.0.1/"));

  assert.assertEquals(response.status, 200);
  assert.assertEquals(await response.text(), "fine");
});

Deno.test("createSafeHandler turns a thrown error into a 500 response", async () => {
  const respond = shared.createSafeHandler(() => {
    throw new Error("the handler fails on purpose");
  });

  const response = await respond(new Request("http://127.0.0.1/?token=x"));

  assert.assertEquals(response.status, 500);
  assert.assertEquals(await response.text(), "Internal Server Error");
});

Deno.test("createStubHttp throws a capability error for every call", () => {
  const http = shared.createStubHttp("workerd");

  for (
    const call of [
      () => http.serve({ port: 0 }, () => new Response()),
      () => http.upgradeWebSocket(new Request("http://127.0.0.1/")),
    ]
  ) {
    const error = assert.assertThrows(call, types.RuntimeCapabilityError);
    assert.assertEquals(error.capability, "http");
    assert.assertEquals(error.runtimeName, "workerd");
  }
});

Deno.test("createFallbackRuntime has no http capability", () => {
  const runtime = shared.createFallbackRuntime("unknown");

  assert.assertEquals(runtime.capabilities.http, false);
  assert.assertThrows(
    () => runtime.process.addSignalListener("SIGINT", () => {}),
    types.RuntimeCapabilityError,
  );
});
