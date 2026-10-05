// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Node built-in modules that the Node and Bun adapters call.
 *
 * The `no-external-import` lint rule accepts URL-style specifiers such as
 * `node:fs` only in a file named `deps.ts`, so the adapters import the
 * built-ins from here. The Deno adapter imports node:process by itself, so a
 * Deno program does not load the rest.
 *
 * @module
 */

export * as buffer from "node:buffer";
export * as childProcess from "node:child_process";
export * as crypto from "node:crypto";
export * as fs from "node:fs";
export * as fsPromises from "node:fs/promises";
export * as http from "node:http";
export * as os from "node:os";

// node:path and node:stream declare their types with `export =`, which
// `export * as` cannot re-export; their default export is the same module
// object.
export { default as path } from "node:path";
export { default as stream } from "node:stream";

// The process object itself rather than its namespace: setExitCode assigns
// process.exitCode, and the bindings of a namespace import are read-only.
export { default as process } from "node:process";
