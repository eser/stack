// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

if (globalThis.Deno === undefined) {
  throw new Error("Deno is not defined");
}

export const deno = globalThis.Deno;

export * as assert from "$std/assert/mod.ts";
export * as async from "$std/async/mod.ts";
export * as bdd from "$std/testing/bdd.ts";
export * as crypto from "$std/crypto/mod.ts";
export * as datetime from "$std/datetime/mod.ts";
export * as dotenv from "$std/dotenv/mod.ts";
export * as flags from "$std/flags/mod.ts";
export * as fs from "$std/fs/mod.ts";
export * as http from "$std/http/mod.ts";
export * as jsonc from "$std/jsonc/mod.ts";
export * as mock from "$std/testing/mock.ts";
export * as path from "$std/path/mod.ts";
export * as posix from "$std/path/posix/mod.ts";
export * as regexp from "$std/regexp/mod.ts";
export * as semver from "$std/semver/mod.ts";
