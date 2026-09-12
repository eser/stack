// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Guards the eser-ajan C ABI, the other cross-cutting constraint in this repo
 * whose violation is silent. See ajan-ranges.test.ts for the version-range twin.
 *
 * The same ~100-symbol surface is restated by hand in six places: the cgo
 * exports in main.go, the FFILibrary interface in ffi/types.ts, the three
 * per-runtime backends, and the WASM command-mode loader. `deno check` ties the
 * backends to types.ts structurally, but nothing tied any of them to the Go
 * side -- a symbol added to main.go and forgotten in one backend, or renamed on
 * one side only, compiled cleanly and then failed at dlopen time on whichever
 * runtime the developer happened not to be using.
 *
 * These tests parse the declaration sites rather than importing them, because
 * four of the six are not loadable from a Deno test: cgo source, koffi
 * prototype strings, bun:ffi maps, and Go source.
 *
 * The extractors are deliberately loose -- essentially "an object key or
 * interface member named EserAjan*" -- so reformatting cannot break them. Each
 * extraction is floor-checked first, so a silently-empty parse reports itself
 * as a broken extractor rather than passing as a vacuous match.
 */

import { assert, assertEquals } from "@std/assert";

/** Below this, assume the extractor broke rather than that the ABI shrank. */
const EXTRACTOR_FLOOR = 50;

const read = (relative: string): Promise<string> =>
  Deno.readTextFile(new URL(relative, import.meta.url));

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

/** Names inside koffi prototype strings, e.g. `"void* EserAjanFoo(...)"`. */
const koffiPrototypes = (source: string): string[] =>
  sortedUnique(matchAll(source, /"[^"]*?\b(EserAjan\w+)\s*\(/g));

/** Dispatch keys served by the WASI switch, e.g. `case "formatList":`. */
const wasiCases = (source: string): string[] =>
  sortedUnique(matchAll(source, /^\s*case\s+"([a-zA-Z]\w*)"\s*:/gm));

/** Dispatch keys the command-mode loader sends, e.g. `call("formatList")`. */
const wasmCalls = (source: string): string[] =>
  sortedUnique(matchAll(source, /\bcall\(\s*"([a-zA-Z]\w*)"/g));

const assertExtracted = (label: string, names: string[]): void => {
  assert(
    names.length >= EXTRACTOR_FLOOR,
    `${label}: extracted only ${names.length} symbols (floor ${EXTRACTOR_FLOOR}). ` +
      `The declaration format almost certainly changed, so this test's ` +
      `extractor needs updating. Do not silence this by lowering the floor.`,
  );
};

Deno.test(
  "ajan FFI: every cgo export is declared in types.ts and all four loaders",
  async () => {
    const [main, types, deno, bun, node, wasm] = await Promise.all([
      read("../ajan/main.go"),
      read("../ajan/ffi/types.ts"),
      read("../ajan/ffi/backend-deno.ts"),
      read("../ajan/ffi/backend-bun.ts"),
      read("../ajan/ffi/backend-node.ts"),
      read("../ajan/wasm/loader-command.ts"),
    ]);

    const expected = goExports(main);
    assertExtracted("main.go //export", expected);

    const declarations: Array<[string, string[]]> = [
      ["ffi/types.ts", tsSymbolKeys(types)],
      ["ffi/backend-deno.ts", tsSymbolKeys(deno)],
      ["ffi/backend-bun.ts", tsSymbolKeys(bun)],
      ["ffi/backend-node.ts", tsSymbolKeys(node)],
      ["wasm/loader-command.ts", tsSymbolKeys(wasm)],
      ["ffi/backend-node.ts koffi prototypes", koffiPrototypes(node)],
    ];

    for (const [label, actual] of declarations) {
      assertExtracted(label, actual);
      assertEquals(
        actual,
        expected,
        `${label} does not match the cgo export list in main.go. Adding a Go ` +
          `export means declaring it in types.ts, all three native backends ` +
          `and the WASM loader; this diff shows what drifted.`,
      );
    }
  },
);

Deno.test(
  "ajan FFI: WASI dispatch names match what the command-mode loader sends",
  async () => {
    const [wasi, loader] = await Promise.all([
      read("../ajan/main_wasi.go"),
      read("../ajan/wasm/loader-command.ts"),
    ]);

    const served = wasiCases(wasi);
    const sent = wasmCalls(loader);

    assertExtracted("main_wasi.go dispatch", served);
    assertExtracted("loader-command.ts call()", sent);

    assertEquals(
      sent.filter((name) => !served.includes(name)),
      [],
      "The command-mode loader sends dispatch names that the WASI switch in " +
        'main_wasi.go does not handle. These fail at runtime with "unknown ' +
        'function", never at build time.',
    );
  },
);

Deno.test(
  {
    name:
      "ajan FFI: the loaded native library exposes exactly the declared symbols",
    sanitizeResources: false,
  },
  async () => {
    const expected = goExports(await read("../ajan/main.go"));
    assertExtracted("main.go //export", expected);

    // Native only: the WASM fallback is a hand-written object whose keys prove
    // nothing about the compiled ABI, which is the point of this check.
    const ffi = await import("@eserstack/ajan/ffi");
    const lib = await ffi.loadEserAjan({ wasm: false });

    try {
      assertEquals(
        Object.keys(lib.symbols).sort(),
        expected,
        "The symbols the active backend exposes differ from the cgo export " +
          "list. If the built library predates a Go-side change, rebuild it " +
          "with `deno run -A ./pkg/@eserstack/ajan/scripts/build.ts`.",
      );
    } finally {
      lib.close();
    }
  },
);
