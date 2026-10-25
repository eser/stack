// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as shared from "./shared.ts";
import * as types from "../types.ts";

nodeTest.test("getPlatform returns valid platform", () => {
  const result = shared.getPlatform();

  assert.assert(
    result === "darwin" || result === "linux" || result === "windows",
    `Expected platform to be darwin, linux, or windows, got: ${result}`,
  );
});

nodeTest.test("getArch returns valid architecture", () => {
  const result = shared.getArch();

  assert.assert(
    result === "amd64" || result === "arm64",
    `Expected arch to be amd64 or arm64, got: ${result}`,
  );
});

nodeTest.test("getHomedir returns non-empty string", () => {
  const result = shared.getHomedir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Home directory should not be empty");
});

nodeTest.test("getTmpdir returns non-empty string", () => {
  const result = shared.getTmpdir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Temp directory should not be empty");
});

nodeTest.test("getPlatformInfo returns complete info", () => {
  const result = shared.getPlatformInfo();

  assert.assertExists(result.platform);
  assert.assertExists(result.arch);
  assert.assertExists(result.homedir);
  assert.assertExists(result.tmpdir);

  // Verify types match expected values
  assert.assert(
    result.platform === "darwin" ||
      result.platform === "linux" ||
      result.platform === "windows",
  );
  assert.assert(result.arch === "amd64" || result.arch === "arm64");
});

nodeTest.test("getPlatformInfo platform matches getPlatform", () => {
  const info = shared.getPlatformInfo();
  const directPlatform = shared.getPlatform();

  assert.assertEquals(info.platform, directPlatform);
});

nodeTest.test("getPlatformInfo arch matches getArch", () => {
  const info = shared.getPlatformInfo();
  const directArch = shared.getArch();

  assert.assertEquals(info.arch, directArch);
});

nodeTest.test("getPlatformInfo homedir matches getHomedir", () => {
  const info = shared.getPlatformInfo();
  const directHomedir = shared.getHomedir();

  assert.assertEquals(info.homedir, directHomedir);
});

nodeTest.test("getPlatformInfo tmpdir matches getTmpdir", () => {
  const info = shared.getPlatformInfo();
  const directTmpdir = shared.getTmpdir();

  assert.assertEquals(info.tmpdir, directTmpdir);
});

nodeTest.test("toNodeProcessInfo keeps the string platform and arch", () => {
  const result = shared.toNodeProcessInfo({
    platform: "linux",
    arch: "x64",
    env: {},
  });

  assert.assertEquals(result, { platform: "linux", arch: "x64" });
});

nodeTest.test(
  "toNodeProcessInfo drops fields that are missing or not strings",
  () => {
    // A bundler's browser shim of process often carries only env.
    assert.assertEquals(shared.toNodeProcessInfo({ env: {} }), {
      platform: undefined,
      arch: undefined,
    });
    assert.assertEquals(
      shared.toNodeProcessInfo({ platform: 42, arch: null }),
      {
        platform: undefined,
        arch: undefined,
      },
    );
  },
);

nodeTest.test(
  "toNodeProcessInfo returns null for a value that is not an object",
  () => {
    assert.assertEquals(shared.toNodeProcessInfo(undefined), null);
    assert.assertEquals(shared.toNodeProcessInfo(null), null);
    assert.assertEquals(shared.toNodeProcessInfo("linux"), null);
  },
);

nodeTest.test("toNavigatorInfo keeps a string userAgent", () => {
  const result = shared.toNavigatorInfo({ userAgent: "Mozilla/5.0 (X11)" });

  assert.assertEquals(result, { userAgent: "Mozilla/5.0 (X11)" });
});

nodeTest.test("toNavigatorInfo drops a userAgent that is not a string", () => {
  assert.assertEquals(shared.toNavigatorInfo({ userAgent: 1 }), {
    userAgent: undefined,
  });
});

nodeTest.test(
  "toNavigatorInfo returns null for a value that is not an object",
  () => {
    assert.assertEquals(shared.toNavigatorInfo(undefined), null);
    assert.assertEquals(shared.toNavigatorInfo(0), null);
  },
);

nodeTest.test(
  "getProcess reads the platform and arch of the process global",
  () => {
    // Deno 2 defines the Node-compatible process global.
    const result = shared.getProcess();

    assert.assertNotEquals(result, null);
    assert.assertEquals(typeof result?.platform, "string");
    assert.assertEquals(typeof result?.arch, "string");
  },
);

nodeTest.test(
  "getNavigator reads the userAgent of the navigator global",
  () => {
    const result = shared.getNavigator();

    assert.assertEquals(result?.userAgent, navigator.userAgent);
  },
);

/** Handler info for a request whose peer is unknown. */
const NO_PEER = { remoteAddr: null };

nodeTest.test(
  "createSafeHandler passes the handler's response through",
  async () => {
    const respond = shared.createSafeHandler(() => new Response("fine"));

    const response = await respond(new Request("http://127.0.0.1/"), NO_PEER);

    assert.assertEquals(response.status, 200);
    assert.assertEquals(await response.text(), "fine");
  },
);

nodeTest.test("createSafeHandler passes the handler info through", async () => {
  const info = { remoteAddr: { hostname: "10.0.0.7", port: 5123 } };
  const respond = shared.createSafeHandler((_request, received) =>
    Response.json(received),
  );

  const response = await respond(new Request("http://127.0.0.1/"), info);

  assert.assertEquals(await response.json(), info);
});

nodeTest.test(
  "createSafeHandler turns a thrown error into a 500 response",
  async () => {
    const respond = shared.createSafeHandler(() => {
      throw new Error("the handler fails on purpose");
    });

    const response = await respond(
      new Request("http://127.0.0.1/?token=x"),
      NO_PEER,
    );

    assert.assertEquals(response.status, 500);
    assert.assertEquals(await response.text(), "Internal Server Error");
  },
);

nodeTest.test("createStubHttp throws a capability error for every call", () => {
  const http = shared.createStubHttp("workerd");

  for (const call of [
    () => http.serve({ port: 0 }, () => new Response()),
    () => http.upgradeWebSocket(new Request("http://127.0.0.1/")),
  ]) {
    const error = assert.assertThrows(call, types.RuntimeCapabilityError);
    assert.assertEquals(error.capability, "http");
    assert.assertEquals(error.runtimeName, "workerd");
  }
});

nodeTest.test("createFallbackRuntime has no http capability", () => {
  const runtime = shared.createFallbackRuntime("unknown");

  assert.assertEquals(runtime.capabilities.http, false);
  assert.assertThrows(
    () => runtime.process.addSignalListener("SIGINT", () => {}),
    types.RuntimeCapabilityError,
  );
});
