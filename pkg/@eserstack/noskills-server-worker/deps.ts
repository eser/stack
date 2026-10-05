// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Node built-in modules that the mux worker calls.
 *
 * The `no-external-import` lint rule accepts URL-style specifiers such as
 * `node:net` only in a file named `deps.ts`, so the worker imports the
 * built-ins from here.
 *
 * @module
 */

export * as net from "node:net";

// node:process declares its types with `export =`, which `export * as` cannot
// re-export; its default export is the process object.
export { default as process } from "node:process";
