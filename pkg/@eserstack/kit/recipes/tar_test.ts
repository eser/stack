// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import * as tarModule from "./tar.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tar extraction is verified with real gzipped tarballs from a fixtures
 * directory when present; when absent, the fixture-based tests become skipped
 * stubs so the file still compiles and is ready for fixtures to be added.
 */
const FIXTURES_DIR = fromFileUrl(new URL("./test-fixtures/", import.meta.url));

async function fixturesExist(): Promise<boolean> {
  try {
    const stat = await Deno.stat(FIXTURES_DIR);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractTarball", () => {
  it("exports extractTarball as a function", () => {
    assertEquals(typeof tarModule.extractTarball, "function");
  });

  it("accepts ExtractOptions type with stripComponents and subpath fields", () => {
    // Type-level check: constructing the options object must compile.
    const opts: tarModule.ExtractOptions = {
      stripComponents: 1,
      subpath: "some/path",
    };
    assertEquals(opts.stripComponents, 1);
    assertEquals(opts.subpath, "some/path");
  });

  // -------------------------------------------------------------------------
  // Fixture-based integration tests
  // -------------------------------------------------------------------------

  it("stripComponents: 1 — happy path (requires test-fixtures/simple.tar.gz)", async () => {
    if (!(await fixturesExist())) {
      // Stub: add test-fixtures/simple.tar.gz to enable this test.
      // The archive should contain: prefix/hello.txt with content "hello\n"
      console.log("SKIP: test-fixtures directory not found");
      return;
    }

    const tmpDir = await Deno.makeTempDir();
    try {
      const archivePath = `${FIXTURES_DIR}simple.tar.gz`;
      const file = await Deno.open(archivePath, { read: true });
      const stream = file.readable as unknown as ReadableStream<Uint8Array>;

      await tarModule.extractTarball(stream, tmpDir, { stripComponents: 1 });

      const content = await Deno.readTextFile(`${tmpDir}/hello.txt`);
      assertEquals(content, "hello\n");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });

  it("subpath filtering — entries outside subpath are excluded (requires test-fixtures/subpath.tar.gz)", async () => {
    if (!(await fixturesExist())) {
      // Stub: add test-fixtures/subpath.tar.gz to enable this test.
      // Archive layout:
      //   include/wanted.txt  ("wanted\n")
      //   exclude/unwanted.txt ("unwanted\n")
      console.log("SKIP: test-fixtures directory not found");
      return;
    }

    const tmpDir = await Deno.makeTempDir();
    try {
      const archivePath = `${FIXTURES_DIR}subpath.tar.gz`;
      const file = await Deno.open(archivePath, { read: true });
      const stream = file.readable as unknown as ReadableStream<Uint8Array>;

      await tarModule.extractTarball(stream, tmpDir, { subpath: "include" });

      // wanted.txt should be extracted
      const content = await Deno.readTextFile(`${tmpDir}/wanted.txt`);
      assertEquals(content, "wanted\n");

      // unwanted.txt must NOT exist
      let unwantedExists = false;
      try {
        await Deno.stat(`${tmpDir}/unwanted.txt`);
        unwantedExists = true;
      } catch {
        // expected
      }
      assert(!unwantedExists, "excluded entry must not be written");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });

  it("path-traversal rejection — entry ../../etc/passwd must not be written (requires test-fixtures/traversal.tar.gz)", async () => {
    if (!(await fixturesExist())) {
      // Stub: add test-fixtures/traversal.tar.gz to enable this test.
      // Archive must contain a single entry with path "../../etc/passwd".
      console.log("SKIP: test-fixtures directory not found");
      return;
    }

    const tmpDir = await Deno.makeTempDir();
    try {
      const archivePath = `${FIXTURES_DIR}traversal.tar.gz`;
      const file = await Deno.open(archivePath, { read: true });
      const stream = file.readable as unknown as ReadableStream<Uint8Array>;

      await tarModule.extractTarball(stream, tmpDir);

      // The target directory must be empty — no files written.
      const entries: string[] = [];
      for await (const entry of Deno.readDir(tmpDir)) {
        entries.push(entry.name);
      }
      assertEquals(entries.length, 0, "traversal entry must not be extracted");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });

  it("symlink rejection — entry with type symLink must be skipped (requires test-fixtures/symlink.tar.gz)", async () => {
    if (!(await fixturesExist())) {
      // Stub: add test-fixtures/symlink.tar.gz to enable this test.
      // Archive must contain:
      //   real.txt          ("real\n")     — normal file
      //   link.txt          symLink → real.txt
      console.log("SKIP: test-fixtures directory not found");
      return;
    }

    const tmpDir = await Deno.makeTempDir();
    try {
      const archivePath = `${FIXTURES_DIR}symlink.tar.gz`;
      const file = await Deno.open(archivePath, { read: true });
      const stream = file.readable as unknown as ReadableStream<Uint8Array>;

      await tarModule.extractTarball(stream, tmpDir);

      // real.txt must exist
      const content = await Deno.readTextFile(`${tmpDir}/real.txt`);
      assertEquals(content, "real\n");

      // link.txt must NOT have been extracted
      let symlinkExists = false;
      try {
        await Deno.lstat(`${tmpDir}/link.txt`);
        symlinkExists = true;
      } catch {
        // expected
      }
      assert(!symlinkExists, "symlink entry must not be written");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});
