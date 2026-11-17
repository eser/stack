// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";

import * as install from "./install.ts";

const errnoError = (code: string): Error =>
  Object.assign(new Error(`${code}: operation refused`), { code });

nodeTest.test("isPermissionDenied accepts the runtime's error", () => {
  assert.assertEquals(
    install.isPermissionDenied(
      new standardsCrossRuntime.PermissionDeniedError("/usr/local/bin/eser"),
    ),
    true,
  );
});

nodeTest.test("isPermissionDenied accepts a raw EACCES or EPERM", () => {
  assert.assertEquals(install.isPermissionDenied(errnoError("EACCES")), true);
  assert.assertEquals(install.isPermissionDenied(errnoError("EPERM")), true);
});

nodeTest.test("isPermissionDenied rejects other errors", () => {
  assert.assertEquals(install.isPermissionDenied(errnoError("ENOENT")), false);
  assert.assertEquals(install.isPermissionDenied(new Error("boom")), false);
  assert.assertEquals(install.isPermissionDenied("EACCES"), false);
});
