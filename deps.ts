/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

if (globalThis.Deno === undefined) {
  throw new Error("Deno is not defined");
}

export const deno = globalThis.Deno;

export * as assert from "https://deno.land/std@0.203.0/assert/mod.ts";
export * as async from "https://deno.land/std@0.203.0/async/mod.ts";
export * as bdd from "https://deno.land/std@0.203.0/testing/bdd.ts";
export * as crypto from "https://deno.land/std@0.203.0/crypto/mod.ts";
export * as datetime from "https://deno.land/std@0.203.0/datetime/mod.ts";
export * as dotenv from "https://deno.land/std@0.203.0/dotenv/mod.ts";
export * as flags from "https://deno.land/std@0.203.0/flags/mod.ts";
export * as fs from "https://deno.land/std@0.203.0/fs/mod.ts";
export * as http from "https://deno.land/std@0.203.0/http/mod.ts";
export * as jsonc from "https://deno.land/std@0.203.0/jsonc/mod.ts";
export * as mock from "https://deno.land/std@0.203.0/testing/mock.ts";
export * as path from "https://deno.land/std@0.203.0/path/mod.ts";
export * as pathPosix from "https://deno.land/std@0.203.0/path/posix.ts";
export * as regexp from "https://deno.land/std@0.203.0/regexp/mod.ts";
export * as semver from "https://deno.land/std@0.203.0/semver/mod.ts";
