// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Guards the eser-ajan ABI, the other cross-cutting constraint in this repo
 * whose violation is silent. See ajan-ranges.test.ts for the version-range twin.
 *
 * Since the dispatcher ABI (TASK-238) the library exports six functions and
 * every bridge function is a name in the Go dispatch registry. The names are
 * stated twice: by the Go domain files that register them, and by the binding
 * table in ffi/bindings.ts that types them for TypeScript. Nothing ties the
 * two together at build time -- a name registered in Go and missing from the
 * table is unreachable from TypeScript, and one in the table but not in Go
 * fails at run time with UNKNOWN_FUNCTION -- so these tests do:
 *
 * - the table against the Go registry, both directions, kind included, read
 *   from the Go sources and from the handshake of the built library;
 * - each entry's `wasm` field against the names the WASM build's handshake
 *   reports;
 * - the six cgo exports against the node:ffi prototypes, for arity and return
 *   type, because node:ffi calls through whatever a prototype declares and
 *   ignores a misspelled key silently (decision-37).
 *
 * The extractors are deliberately loose so reformatting cannot break them.
 * Each extraction is floor-checked first, so a silently-empty parse reports
 * itself as a broken extractor rather than passing as a vacuous match.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as bindings from "@eserstack/ajan/ffi/bindings";
import * as wasm from "@eserstack/ajan/wasm";

/** Below this, assume the extractor broke rather than that the ABI shrank. */
const EXTRACTOR_FLOOR = 50;

/** The six exports of the dispatcher ABI. */
const DISPATCHER_EXPORTS = [
  "EserAjanCall",
  "EserAjanFree",
  "EserAjanStreamClose",
  "EserAjanStreamOpen",
  "EserAjanStreamRead",
  "EserAjanVersion",
];

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

/** A name's kind, by name. */
type KindTable = Readonly<Record<string, "call" | "stream">>;

/**
 * Compares two kind tables and lists every difference: a name on one side
 * only, or a name whose kind differs.
 */
const compareKinds = (
  tsLabel: string,
  ts: KindTable,
  goLabel: string,
  go: KindTable,
): string[] => {
  const problems: string[] = [];

  for (const name of sortedUnique([...Object.keys(ts), ...Object.keys(go)])) {
    const tsKind = ts[name];
    const goKind = go[name];
    if (goKind === undefined) {
      problems.push(`${name}: in ${tsLabel}, not in ${goLabel}`);
    } else if (tsKind === undefined) {
      problems.push(`${name}: in ${goLabel}, not in ${tsLabel}`);
    } else if (tsKind !== goKind) {
      problems.push(
        `${name}: a ${tsKind} in ${tsLabel}, a ${goKind} in ${goLabel}`,
      );
    }
  }

  return problems;
};

/** The binding table's names and kinds. */
const tableKinds = (): KindTable =>
  Object.fromEntries(
    Object.entries(
      bindings.BINDINGS as Record<string, bindings.BindingSpec>,
    ).map(([name, spec]) => [name, spec.kind]),
  );

/**
 * The names the Go domain files register: `register("x", ...)` is a call,
 * `registerStream("x", ...)` a stream.
 */
const goRegistryKinds = (source: string): KindTable =>
  Object.fromEntries(
    [...source.matchAll(/\bregister(Stream)?\(\s*"([a-zA-Z]\w*)"/g)].map(
      (match) => [match[2] ?? "", match[1] === undefined ? "call" : "stream"],
    ),
  );

/** A handshake's names and kinds. */
const handshakeKinds = (handshake: bindings.Handshake): KindTable => {
  const streams = new Set(handshake.streams);
  return Object.fromEntries(
    handshake.names.map((name) => [
      name,
      streams.has(name) ? "stream" : "call",
    ]),
  );
};

/** The non-test Go sources of the bridge module. */
const readGoSources = async (): Promise<string> => {
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

  const sources = await Promise.all(
    goFiles.map((name) => read(`../ajan/${name}`)),
  );

  return sources.join("\n");
};

const assertExtracted = (label: string, names: readonly string[]): void => {
  assert.assert(
    names.length >= EXTRACTOR_FLOOR,
    `${label}: extracted only ${names.length} names (floor ${EXTRACTOR_FLOOR}). ` +
      `The declaration format almost certainly changed, so this test's ` +
      `extractor needs updating. Do not silence this by lowering the floor.`,
  );
};

// ---------------------------------------------------------------------------
// The comparison itself, on fixtures
// ---------------------------------------------------------------------------

nodeTest.test("compareKinds: identical tables have no differences", () => {
  assert.assertEquals(
    compareKinds("ts", { formatList: "call", walk: "stream" }, "go", {
      walk: "stream",
      formatList: "call",
    }),
    [],
  );
});

nodeTest.test("compareKinds: fails for a name only in the TS table", () => {
  assert.assertEquals(
    compareKinds("ts", { formatList: "call", formatListAll: "call" }, "go", {
      formatList: "call",
    }),
    ["formatListAll: in ts, not in go"],
  );
});

nodeTest.test("compareKinds: fails for a name only in the Go registry", () => {
  assert.assertEquals(
    compareKinds("ts", { formatList: "call" }, "go", {
      formatList: "call",
      shellExec: "call",
    }),
    ["shellExec: in go, not in ts"],
  );
});

nodeTest.test("compareKinds: fails for a kind mismatch", () => {
  assert.assertEquals(
    compareKinds("ts", { codebaseWalkFilesStream: "call" }, "go", {
      codebaseWalkFilesStream: "stream",
    }),
    ["codebaseWalkFilesStream: a call in ts, a stream in go"],
  );
});

nodeTest.test("goRegistryKinds: reads calls and streams", () => {
  assert.assertEquals(
    goRegistryKinds(
      [
        'register("formatList", func(string) string { return "{}" })',
        'registerStream("codebaseWalkFilesStream", "cbwalk", streamFuncs{',
      ].join("\n"),
    ),
    { formatList: "call", codebaseWalkFilesStream: "stream" },
  );
});

// ---------------------------------------------------------------------------
// The real table against the real registry
// ---------------------------------------------------------------------------

nodeTest.test(
  "ajan FFI: the binding table matches the Go registry, kinds included",
  async () => {
    const go = goRegistryKinds(await readGoSources());
    const ts = tableKinds();
    assertExtracted("Go register()", Object.keys(go));
    assertExtracted("ffi/bindings.ts", Object.keys(ts));

    assert.assertEquals(
      compareKinds("ffi/bindings.ts", ts, "the Go registry", go),
      [],
      "The binding table differs from the names the bridge registers in its " +
        "domain files. A name registered but not in the table is unreachable " +
        'from TypeScript; one in the table but not registered fails with "' +
        'UNKNOWN_FUNCTION"; a kind mismatch sends a call to a stream or the ' +
        "other way round.",
    );
  },
);

nodeTest.test(
  "ajan FFI: main.go exports the six dispatcher functions only",
  async () => {
    const main = await read("../ajan/main.go");

    assert.assertEquals(
      sortedUnique(matchAll(main, /^\/\/export\s+(EserAjan\w+)\s*$/gm)),
      DISPATCHER_EXPORTS,
    );
  },
);

/** The shape node:ffi needs to know of one export: argument count and return kind. */
interface ExportShape {
  readonly arity: number;
  readonly returns: "pointer" | "int32" | "void";
}

const GO_RETURNS: Readonly<Record<string, ExportShape["returns"]>> = {
  "*C.char": "pointer",
  "C.int": "int32",
  "": "void",
};

const C_RETURNS: Readonly<Record<string, ExportShape["returns"]>> = {
  "void*": "pointer",
  int: "int32",
  void: "void",
};

const countParams = (params: string): number =>
  params.trim() === "" ? 0 : params.split(",").length;

/** `func EserAjanFoo(a, b *C.char) *C.char {` -> { arity: 2, returns: "pointer" }. */
const goShapes = (source: string): Record<string, ExportShape> =>
  Object.fromEntries(
    [
      ...source.matchAll(/^func\s+(EserAjan\w+)\(([^)]*)\)\s*([^{]*?)\s*\{/gm),
    ].map((match) => [
      match[1] ?? "",
      {
        arity: countParams(match[2] ?? ""),
        returns: GO_RETURNS[(match[3] ?? "").trim()] ?? "void",
      },
    ]),
  );

/** `"void* EserAjanFoo(const char* a)"` -> { arity: 1, returns: "pointer" }. */
const cShapes = (source: string): Record<string, ExportShape> =>
  Object.fromEntries(
    [...source.matchAll(/"([^"(]*?)\s*\b(EserAjan\w+)\s*\(([^)"]*)\)"/g)].map(
      (match) => [
        match[2] ?? "",
        {
          arity: countParams(match[3] ?? ""),
          returns:
            C_RETURNS[(match[1] ?? "").replace(/\s+\*/g, "*").trim()] ?? "void",
        },
      ],
    ),
  );

nodeTest.test(
  "ajan FFI: the node:ffi prototypes match the cgo signatures",
  async () => {
    const [main, node] = await Promise.all([
      read("../ajan/main.go"),
      read("../ajan/ffi/backend-node.ts"),
    ]);

    const go = goShapes(main);
    const c = cShapes(node);
    assert.assertEquals(Object.keys(go).sort(), DISPATCHER_EXPORTS);

    assert.assertEquals(
      c,
      go,
      "A C prototype in ffi/backend-node.ts declares a different argument " +
        "count or return type than its cgo function in main.go. node:ffi " +
        "calls through whatever the prototype says, so the mismatch fails " +
        "only at run time.",
    );
  },
);

nodeTest.test(
  "ajan FFI: the built native library serves exactly the table's names",
  async () => {
    // Native only: the WASM fallback serves a subset, checked below.
    const ffi = await import("@eserstack/ajan/ffi");
    const lib = await ffi.loadEserAjan({ wasm: false });

    try {
      assert.assertEquals(
        compareKinds(
          "ffi/bindings.ts",
          tableKinds(),
          "the native handshake",
          handshakeKinds(lib.handshake),
        ),
        [],
        "The names the built library reports differ from the binding table. " +
          "If the built library predates a Go-side change, rebuild it with " +
          "`make ajan-lib`.",
      );
    } finally {
      lib.close();
    }
  },
);

nodeTest.test(
  "ajan FFI: the wasm fields match the names the WASM build serves",
  {
    skip:
      !wasm.isWasmAvailable() &&
      "the WASM build is missing; run make ajan-wasm",
  },
  async () => {
    const lib = await wasm.loadEserAjanWasm();

    try {
      const served = sortedUnique(lib.handshake.names);
      const marked = sortedUnique(
        Object.entries(
          bindings.BINDINGS as Record<string, bindings.BindingSpec>,
        )
          .filter(([, spec]) => spec.wasm !== "no")
          .map(([name]) => name),
      );

      assert.assertEquals(
        marked,
        served,
        'The names the binding table marks wasm: "yes" or "fs" differ from ' +
          "the names the WASM handshake reports. Fix the table's wasm field, " +
          "or rebuild the module with `make ajan-wasm`.",
      );
      assert.assertEquals(
        compareKinds(
          "ffi/bindings.ts",
          Object.fromEntries(
            marked.map((name) => [name, tableKinds()[name] ?? "call"]),
          ),
          "the WASM handshake",
          handshakeKinds(lib.handshake),
        ),
        [],
      );
    } finally {
      lib.close();
    }
  },
);
