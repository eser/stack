// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/testing
 *
 * Testing utilities for the eser stack.
 * Provides mock implementations and helpers for unit and integration testing.
 *
 * @example
 * ```typescript
 * import * as testing from "@eser/testing";
 *
 * // Mock HTTP server for testing handlers
 * const server = new testing.fakeServer.FakeServer((req) => new Response("OK"));
 * const response = await server.get("/api/test");
 *
 * // Mock filesystem for testing file operations
 * const fs = testing.fakeServer.createFakeFs({
 *   "/app/config.json": '{"port": 3000}',
 * });
 * const config = await fs.readTextFile("/app/config.json");
 *
 * // Temporary directory with auto-cleanup
 * import { runtime } from "@eser/standards/runtime";
 * await using temp = await testing.tempDir.withTmpDir();
 * await runtime.fs.writeTextFile(`${temp.dir}/test.txt`, "hello");
 * ```
 */

export * as fakeFs from "./fake-fs.ts";
export * as fakeServer from "./fake-server.ts";
export * as tempDir from "./temp-dir.ts";
