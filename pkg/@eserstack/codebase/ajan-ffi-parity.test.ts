// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Guards the eser-ajan C ABI, the other cross-cutting constraint in this repo
 * whose violation is silent. See ajan-ranges.test.ts for the version-range twin.
 *
 * The same ~100-symbol surface is restated by hand in six places: the cgo
 * exports in main.go, the FFILibrary interface in ffi/types.ts, the three
 * per-runtime backends, and the WASM reactor loader. `deno check` ties the
 * backends to types.ts structurally, but nothing tied any of them to the Go
 * side -- a symbol added to main.go and forgotten in one backend, or renamed on
 * one side only, compiled cleanly and then failed at dlopen time on whichever
 * runtime the developer happened not to be using.
 *
 * These tests parse the declaration sites rather than importing them, because
 * four of the six are not loadable from a Deno test: cgo source, the node:ffi
 * backend's C prototype strings, bun:ffi maps, and Go source.
 *
 * The extractors are deliberately loose -- essentially "an object key or
 * interface member named EserAjan*" -- so reformatting cannot break them. Each
 * extraction is floor-checked first, so a silently-empty parse reports itself
 * as a broken extractor rather than passing as a vacuous match.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

/** Below this, assume the extractor broke rather than that the ABI shrank. */
const EXTRACTOR_FLOOR = 50;

// The sources under test are read relative to this file, so the result does
// not depend on the working directory the suite runs from.
const testDir = import.meta.dirname;
if (testDir === undefined) {
  throw new Error(
    "ajan-ffi-parity.test.ts must run from a local file: it reads the ajan " +
      "sources relative to its own directory.",
  );
}

const read = (relative: string): Promise<string> =>
  runtime.fs.readTextFile(runtime.path.join(testDir, relative));

const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const matchAll = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] ?? "");

/** Names exported to C from the cgo entry point: `//export EserAjanFoo`. */
const goExports = (source: string): string[] =>
  sortedUnique(matchAll(source, /^\/\/export\s+(EserAjan\w+)\s*$/gm));

/**
 * Names declared as an object key or interface member, e.g. `EserAjanFoo: {` or
 * `EserAjanFoo: (x: string) => string;`. Indentation-agnostic on purpose.
 */
const tsSymbolKeys = (source: string): string[] =>
  sortedUnique(matchAll(source, /^\s*(EserAjan\w+)\s*:/gm));

/** Names inside C prototype strings, e.g. `"void* EserAjanFoo(...)"`. */
const cPrototypes = (source: string): string[] =>
  sortedUnique(matchAll(source, /"[^"]*?\b(EserAjan\w+)\s*\(/g));

/** Dispatch names the bridge registers, e.g. `register("formatList", ...)`. */
const registeredNames = (source: string): string[] =>
  sortedUnique(matchAll(source, /\bregister\(\s*"([a-zA-Z]\w*)"/g));

/** Dispatch names the WASM loader sends: `call("formatList")`, `callAsync(...)`. */
const wasmCalls = (source: string): string[] =>
  sortedUnique(matchAll(source, /\bcall(?:Async)?\(\s*"([a-zA-Z]\w*)"/g));

const assertExtracted = (label: string, names: string[]): void => {
  assert.assert(
    names.length >= EXTRACTOR_FLOOR,
    `${label}: extracted only ${names.length} symbols (floor ${EXTRACTOR_FLOOR}). ` +
      `The declaration format almost certainly changed, so this test's ` +
      `extractor needs updating. Do not silence this by lowering the floor.`,
  );
};

nodeTest.test(
  "ajan FFI: every cgo export is declared in types.ts and all four loaders",
  async () => {
    const [main, types, deno, bun, node, wasm] = await Promise.all([
      read("../ajan/main.go"),
      read("../ajan/ffi/types.ts"),
      read("../ajan/ffi/backend-deno.ts"),
      read("../ajan/ffi/backend-bun.ts"),
      read("../ajan/ffi/backend-node.ts"),
      read("../ajan/wasm/loader-reactor.ts"),
    ]);

    const expected = goExports(main);
    assertExtracted("main.go //export", expected);

    const declarations: Array<[string, string[]]> = [
      ["ffi/types.ts", tsSymbolKeys(types)],
      ["ffi/backend-deno.ts", tsSymbolKeys(deno)],
      ["ffi/backend-bun.ts", tsSymbolKeys(bun)],
      ["ffi/backend-node.ts", tsSymbolKeys(node)],
      ["wasm/loader-reactor.ts", tsSymbolKeys(wasm)],
      ["ffi/backend-node.ts C prototypes", cPrototypes(node)],
    ];

    for (const [label, actual] of declarations) {
      assertExtracted(label, actual);
      assert.assertEquals(
        actual,
        expected,
        `${label} does not match the cgo export list in main.go. Adding a Go ` +
          `export means declaring it in types.ts, all three native backends ` +
          `and the WASM loader; this diff shows what drifted.`,
      );
    }
  },
);

nodeTest.test(
  "ajan FFI: the dispatch names the WASM loader sends are registered in Go",
  async () => {
    const ajanDir = runtime.path.join(testDir, "../ajan");
    const goFiles: string[] = [];
    for await (const entry of runtime.fs.readDir(ajanDir)) {
      if (
        entry.isFile &&
        entry.name.endsWith(".go") &&
        !entry.name.endsWith("_test.go")
      ) {
        goFiles.push(entry.name);
      }
    }
    const [goSources, loader] = await Promise.all([
      Promise.all(goFiles.map((name) => read(`../ajan/${name}`))),
      read("../ajan/wasm/loader-reactor.ts"),
    ]);

    const served = registeredNames(goSources.join("\n"));
    const sent = wasmCalls(loader);

    assertExtracted("bridge register()", served);
    assertExtracted("loader-reactor.ts call()", sent);

    assert.assertEquals(
      sent,
      served,
      "The WASM loader's dispatch names differ from the names the bridge " +
        "registers in its domain files. A name sent but not registered fails " +
        'at runtime with "unknown function"; a name registered but not sent ' +
        "is unreachable from TypeScript.",
    );
  },
);

nodeTest.test(
  "ajan FFI: the loaded native library exposes exactly the declared symbols",
  async () => {
    const expected = goExports(await read("../ajan/main.go"));
    assertExtracted("main.go //export", expected);

    // Native only: the WASM fallback is a hand-written object whose keys prove
    // nothing about the compiled ABI, which is the point of this check.
    const ffi = await import("@eserstack/ajan/ffi");
    const lib = await ffi.loadEserAjan({ wasm: false });

    try {
      assert.assertEquals(
        Object.keys(lib.symbols).sort(),
        expected,
        "The symbols the active backend exposes differ from the cgo export " +
          "list. If the built library predates a Go-side change, rebuild it " +
          "with `make ajan-lib`.",
      );
    } finally {
      lib.close();
    }
  },
);
