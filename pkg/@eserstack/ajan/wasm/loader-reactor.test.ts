// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as reactor from "./loader-reactor.ts";
import * as resolve from "./resolve.ts";

// The module is built by `make ajan-wasm` (the precommit build step runs it).
const wasmPath = ((): string | null => {
  try {
    return resolve.resolveWasmPath(import.meta.dirname);
  } catch {
    return null;
  }
})();

const reactorTest = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: wasmPath === null, fn });

/**
 * The 52 names of the wasi profile (TASK-272, logging from TASK-278, HTTP from
 * TASK-277; the noskills names left it with TASK-258).
 */
const PROFILE_NAMES = [
  "cacheClear",
  "cacheClose",
  "cacheCreate",
  "cacheGetDir",
  "cacheGetVersionedPath",
  "cacheList",
  "cacheRemove",
  "codebaseBumpVersion",
  "codebaseCheckCircularDeps",
  "codebaseCheckDocs",
  "codebaseCheckExportNames",
  "codebaseCheckModExports",
  "codebaseCheckPackageConfigs",
  "codebaseValidateCommitMsg",
  "codebaseValidateFiles",
  "codebaseValidateFilesStreamClose",
  "codebaseValidateFilesStreamCreate",
  "codebaseValidateFilesStreamRead",
  "codebaseWalkFiles",
  "codebaseWalkFilesStreamClose",
  "codebaseWalkFilesStreamCreate",
  "codebaseWalkFilesStreamRead",
  "collectorGenerateManifest",
  "collectorSpecifierToIdentifier",
  "collectorWalkFiles",
  "configLoad",
  "cryptoHash",
  "csGenerate",
  "diResolve",
  "formatDecode",
  "formatEncode",
  "formatEncodeDocument",
  "formatList",
  "httpClose",
  "httpCreate",
  "httpRequest",
  "httpRequestStream",
  "httpStreamClose",
  "httpStreamRead",
  "init",
  "logClose",
  "logConfigure",
  "logCreate",
  "logShouldLog",
  "logWrite",
  "parsingSimpleTokens",
  "parsingTokenize",
  "parsingTokenizeStreamClose",
  "parsingTokenizeStreamCreate",
  "parsingTokenizeStreamPush",
  "shutdown",
  "version",
];

reactorTest(
  "the handshake names the ABI, the profile and its 52 names",
  async () => {
    const host = await reactor.createReactorHost(wasmPath!);

    assert.assertEquals(host.handshake.abi, reactor.REACTOR_ABI_VERSION);
    assert.assertEquals(host.handshake.profile, "wasi");
    assert.assertEquals([...host.handshake.names], PROFILE_NAMES);
    assert.assertStringIncludes(host.handshake.version, "eser-ajan version");
  },
);

Deno.test("checkHandshake refuses a module with another ABI version", () => {
  const error = assert.assertThrows(() =>
    reactor.checkHandshake({ ok: true, abi: 99, result: "x" }, "/m.wasm"),
  );
  assert.assertStringIncludes(
    (error as Error).message,
    `speaks reactor ABI 99, but this loader speaks ABI ${reactor.REACTOR_ABI_VERSION}`,
  );
});

reactorTest("warm calls cost microseconds on one instance", async () => {
  const started = performance.now();
  const host = await reactor.createReactorHost(wasmPath!);
  const loadMs = performance.now() - started;

  const request = JSON.stringify({ data: { a: 1, b: [1, 2] }, format: "json" });
  for (let i = 0; i < 50; i++) {
    host.callEnvelope("formatEncode", request);
  }

  const timings: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    host.callEnvelope("formatEncode", request);
    timings.push(performance.now() - t0);
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(timings.length / 2)]!;
  const p99 = timings[Math.floor(timings.length * 0.99)]!;

  // deno-lint-ignore no-console
  console.log(
    `reactor load ${loadMs.toFixed(1)} ms; formatEncode median ${(
      median * 1000
    ).toFixed(1)} us, p99 ${(p99 * 1000).toFixed(1)} us`,
  );
  assert.assert(median < 0.1, `median ${median} ms is over 0.1 ms`);
  assert.assert(p99 < 10, `p99 ${p99} ms is over 10 ms`);
});

reactorTest(
  "a trapped instance is replaced and the next call succeeds",
  async () => {
    let failNext = false;
    let instances = 0;
    const host = await reactor.createReactorHost(wasmPath!, {
      wrapExports: (exports) => {
        instances++;
        return {
          ...exports,
          memory: exports.memory,
          eser_ajan_call: (...args) => {
            if (failNext) {
              failNext = false;
              throw new WebAssembly.RuntimeError("unreachable");
            }
            return exports.eser_ajan_call(...args);
          },
        };
      },
    });

    failNext = true;
    assert.assertThrows(
      () => host.callEnvelope("formatList"),
      Error,
      "the instance was replaced",
    );

    const after = host.callEnvelope("formatList");
    assert.assertEquals(after.ok, true);
    assert.assertEquals(instances, 2);
  },
);

reactorTest("a parsing stream lives across calls on one instance", async () => {
  const host = await reactor.createReactorHost(wasmPath!);

  const created = host.callEnvelope("parsingTokenizeStreamCreate", "{}");
  assert.assertEquals(created.ok, true, created.error);
  const { handle } = JSON.parse(created.result!) as { handle: string };

  const pushed = host.callEnvelope(
    "parsingTokenizeStreamPush",
    JSON.stringify({ handle, chunk: "a + b" }),
  );
  assert.assertEquals(pushed.ok, true, pushed.error);

  const closed = host.callEnvelope(
    "parsingTokenizeStreamClose",
    JSON.stringify({ handle }),
  );
  assert.assertEquals(closed.ok, true, closed.error);
});

reactorTest(
  "an answer with an error fails the envelope: codebaseValidateFiles on a missing root",
  async () => {
    const host = await reactor.createReactorHost(wasmPath!);

    const envelope = host.callEnvelope(
      "codebaseValidateFiles",
      JSON.stringify({ dir: "/no/such/root/for/the/test" }),
    );

    assert.assertEquals(envelope.ok, false);
    assert.assertStringIncludes(
      envelope.error ?? "",
      "walk root cannot be read",
    );
  },
);

reactorTest(
  "with node:wasi the working directory is preopened for the filesystem names",
  async () => {
    const fixtureDir = await runtime.fs.makeTempDir({
      dir: runtime.process.cwd(),
      prefix: ".ajan-wasm-fixture-",
    });
    try {
      await runtime.fs.writeTextFile(
        `${fixtureDir}/a.ts`,
        "export const a = 1;\n",
      );
      await runtime.fs.writeTextFile(
        `${fixtureDir}/b.ts`,
        "export const b = 2;\n",
      );

      const host = await reactor.createReactorHost(wasmPath!);
      const envelope = host.callEnvelope(
        "codebaseWalkFiles",
        JSON.stringify({ dir: fixtureDir, extensions: [".ts"] }),
      );

      assert.assertEquals(envelope.ok, true, envelope.error);
      const { files } = JSON.parse(envelope.result!) as {
        files: Array<{ name: string }>;
      };
      assert.assertEquals(files.map((f) => f.name).sort(), ["a.ts", "b.ts"]);
    } finally {
      await runtime.fs.remove(fixtureDir, { recursive: true });
    }
  },
);

reactorTest(
  "a name outside the profile throws UnsupportedInWasmError",
  async () => {
    const lib = await reactor.loadReactorWasm(wasmPath!);

    const error = assert.assertThrows(
      () => lib.symbols.EserAjanShellExec("{}"),
      reactor.UnsupportedInWasmError,
    );
    assert.assertEquals(
      (error as reactor.UnsupportedInWasmError).code,
      "UNSUPPORTED_IN_WASM",
    );
    assert.assertStringIncludes(
      lib.symbols.EserAjanVersion(),
      "eser-ajan version",
    );
  },
);

reactorTest(
  "10,000 levels of nesting get error JSON and the instance keeps serving",
  async () => {
    const host = await reactor.createReactorHost(wasmPath!);
    const deep = "[".repeat(10_000) + "]".repeat(10_000);

    const decoded = host.callEnvelope(
      "formatDecode",
      JSON.stringify({ text: deep, format: "json" }),
    );
    assert.assertEquals(decoded.ok, false);
    assert.assertStringIncludes(decoded.error ?? "", "more than 1000 levels");

    const encoded = host.callEnvelope(
      "formatEncode",
      `{"format":"json","data":${deep}}`,
    );
    assert.assertEquals(encoded.ok, false);
    assert.assertStringIncludes(encoded.error ?? "", "more than 1000 levels");

    assert.assertEquals(host.callEnvelope("formatList").ok, true);
  },
);
