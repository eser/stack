// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The validators see the same files on the WASM fallback as on the native
 * library (TASK-366). The WASM build cannot start git, so before the fix its
 * git-aware walk fell back to a plain directory walk without a word, and every
 * validator scanned gitignored build output.
 *
 * `--no-experimental-ffi` turns node:ffi off, so the loader falls back to the
 * reactor (decision-37).
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as wasm from "@eserstack/ajan/wasm";
import { runtime } from "@eserstack/standards/cross-runtime";

const FIXTURE = `${import.meta.dirname}/wasm-gitignore.fixture.ts`;

type Seen = {
  readonly backend: string | null;
  readonly walked: readonly string[];
  readonly streamed: readonly string[];
  readonly largeFiles: readonly string[];
  readonly builtinChecked: number | null;
  readonly validated: readonly string[];
};

const decoder = new TextDecoder();

const git = async (cwd: string, ...args: string[]): Promise<void> => {
  const result = await runtime.exec.spawn("git", args, { cwd });
  assert.assertEquals(result.success, true, decoder.decode(result.stderr));
};

// A repository with a committed file, an untracked one git still lists, and
// a gitignored 2 KB file under bin/ that git never lists.
const createRepo = async (): Promise<string> => {
  // The real path: the WASM preopen is the resolved working directory, and on
  // macOS the temporary directory sits behind a symlink.
  const root = await runtime.fs.realPath(
    await runtime.fs.makeTempDir({ prefix: "wasm-gitignore-" }),
  );
  await git(root, "init", "--quiet");
  await runtime.fs.writeTextFile(`${root}/.gitignore`, "bin/\n");
  await runtime.fs.mkdir(`${root}/src`, { recursive: true });
  await runtime.fs.writeTextFile(`${root}/src/tracked.ts`, "export {};\n");
  await git(root, "add", ".");
  await runtime.fs.writeTextFile(`${root}/src/untracked.ts`, "export {};\n");
  await runtime.fs.mkdir(`${root}/bin`, { recursive: true });
  await runtime.fs.writeTextFile(`${root}/bin/output.js`, "x".repeat(2048));

  return root;
};

// The fixture runs in the repository: the WASM module reaches the filesystem
// through a preopen of the working directory only.
const runFixture = async (root: string, wasm: boolean): Promise<Seen> => {
  const flags = wasm ? ["--no-experimental-ffi"] : [];
  const result = await runtime.exec.spawn(
    "node",
    [...flags, "--disable-warning=ExperimentalWarning", FIXTURE, root],
    { cwd: root },
  );
  assert.assertEquals(result.success, true, decoder.decode(result.stderr));

  return JSON.parse(decoder.decode(result.stdout).trim()) as Seen;
};

nodeTest.test(
  "the validators enumerate the same files on the WASM fallback as on the native library",
  // `make ajan-wasm` builds the module; the gate builds it before the tests.
  { skip: !wasm.isWasmAvailable() },
  async () => {
    const root = await createRepo();

    try {
      const native = await runFixture(root, false);
      const wasm = await runFixture(root, true);

      assert.assertEquals(native.backend, "native");
      assert.assertEquals(wasm.backend, "wasm");

      const listed = [".gitignore", "src/tracked.ts", "src/untracked.ts"];
      for (const seen of [native, wasm]) {
        assert.assertEquals(seen.walked, listed, seen.backend ?? "");
        assert.assertEquals(seen.streamed, listed, seen.backend ?? "");
        assert.assertEquals(seen.largeFiles, [], seen.backend ?? "");
        assert.assertEquals(seen.validated, [], seen.backend ?? "");
        assert.assertEquals(seen.builtinChecked, listed.length);
      }
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);
