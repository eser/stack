// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The wasi profile answers like the native library (TASK-272): every one of
 * its 44 names is called on both, with the same fixtures, and the answers are
 * compared after handle ids are normalized (the two builds number their
 * handles independently).
 *
 * init and shutdown run on the WASM instance only: the native library is one
 * process-wide instance that other test files share, and shutting it down
 * would close their handles.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as workerThreads from "node:worker_threads";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffiClient from "../ffi/client.ts";
import * as library from "../ffi/library.ts";
import * as reactor from "./loader-reactor.ts";
import * as resolve from "./resolve.ts";

// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();
const native = ffiClient.getLib();

const wasmPath = ((): string | null => {
  try {
    return resolve.resolveWasmPath(import.meta.dirname);
  } catch {
    return null;
  }
})();

/** Replaces handle ids such as "cache-12" with their prefix. */
const normalize = (answer: string): string =>
  answer.replace(/"([a-z]+(?:-[a-z]+)*)-\d+"/g, '"$1-N"');

/**
 * Puts answers whose order comes from a Go map into a fixed order, and keeps
 * of the handshake what both builds share. formatList lists the formats in
 * the iteration order of the format registry's map, which differs between
 * builds; the handshake's profile and names differ by design.
 */
const canonical = (fn: string, answer: string): string => {
  if (fn === "version") {
    const { version, abi } = JSON.parse(answer) as {
      version: string;
      abi: number;
    };
    return JSON.stringify({ version, abi });
  }
  if (fn !== "formatList") {
    return answer;
  }
  const parsed = JSON.parse(answer) as { formats: Array<{ name: string }> };
  parsed.formats.sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(parsed);
};

type Call = readonly [fn: string, request?: string];

nodeTest.test(
  "every wasi profile name answers like the native library",
  { skip: native === null || wasmPath === null },
  async () => {
    const fixture = await runtime.fs.makeTempDir({
      dir: runtime.process.cwd(),
      prefix: ".ajan-parity-",
    });
    try {
      const pkg = `${fixture}/pkg/@scope/one`;
      await runtime.fs.ensureDir(pkg);
      await runtime.fs.writeTextFile(
        `${fixture}/package.json`,
        JSON.stringify({ name: "root", workspaces: ["pkg/@scope/*"] }),
      );
      await runtime.fs.writeTextFile(
        `${pkg}/package.json`,
        JSON.stringify({
          name: "@scope/one",
          version: "1.0.0",
          exports: { ".": "./mod.ts" },
        }),
      );
      await runtime.fs.writeTextFile(
        `${pkg}/mod.ts`,
        "/** Adds one. */\nexport const addOne = (n: number) => n + 1;\n",
      );
      await runtime.fs.writeTextFile(`${pkg}/README.md`, "# one\n");
      await runtime.fs.writeTextFile(`${fixture}/config.json`, '{"port":8080}');
      await runtime.fs.writeTextFile(`${fixture}/.env`, "KEY=value\n");

      const req = (value: unknown) => JSON.stringify(value);
      const calls: Call[] = [
        ["version"],
        ["diResolve", "logger"],
        ["formatList"],
        ["formatEncode", req({ data: { a: 1, b: [1, 2] }, format: "json" })],
        ["formatEncode", req({ data: { a: 1, b: [1, 2] }, format: "yaml" })],
        ["formatEncode", req({ data: { a: 1, b: "x" }, format: "toml" })],
        ["formatDecode", req({ text: "a: 1\nb: [2, 3]\n", format: "yaml" })],
        [
          "formatEncodeDocument",
          req({ items: [{ a: 1 }, { a: 2 }], format: "jsonl" }),
        ],
        ["cryptoHash", req({ text: "abc", algorithm: "SHA-256" })],
        ["parsingTokenize", req({ input: "a + 12 * b" })],
        ["parsingSimpleTokens"],
        ["collectorSpecifierToIdentifier", req({ specifier: "./a/b-c.ts" })],
        ["collectorWalkFiles", req({ dir: fixture })],
        [
          "collectorGenerateManifest",
          req({ entries: [{ path: "./a.ts", exports: ["x"] }] }),
        ],
        ["configLoad", req({ sources: [`json_file:${fixture}/config.json`] })],
        ["codebaseValidateCommitMsg", req({ message: "feat(x): add y" })],
        ["codebaseValidateCommitMsg", req({ message: "nope" })],
        ["codebaseBumpVersion", req({ current: "1.2.3", command: "minor" })],
        ["codebaseWalkFiles", req({ dir: fixture, extensions: [".ts"] })],
        ["codebaseValidateFiles", req({ dir: fixture })],
        ["codebaseCheckCircularDeps", req({ dir: fixture })],
        ["codebaseCheckExportNames", req({ dir: fixture })],
        ["codebaseCheckModExports", req({ dir: fixture })],
        ["codebaseCheckDocs", req({ dir: fixture })],
        [
          "csGenerate",
          req({
            resource: { type: "configmap", name: "app" },
            envFile: `${fixture}/.env`,
            cwd: fixture,
          }),
        ],
      ];

      const host = await reactor.createReactorHost(wasmPath!);
      const wasm = library.createLibrary({
        backend: "wasm",
        handshake: host.handshake,
        transport: reactor.createReactorTransport(host),
      });

      // Both sides go through the typed library, with the request strings
      // above decoded back (a bare handle stays a string) and each answer
      // encoded again for the comparison.
      type Lib = typeof wasm;
      type AnyCall = (fn: string, request?: unknown) => unknown;
      type AnyStream = (
        fn: string,
        request?: unknown,
      ) => {
        readonly opened: unknown;
        readonly read: () => unknown;
        readonly close: () => unknown;
      };
      const decode = (request: string | undefined): unknown => {
        if (request === undefined) {
          return undefined;
        }
        try {
          return JSON.parse(request);
        } catch {
          return request;
        }
      };
      const answerOf = (run: () => unknown): string => {
        try {
          return JSON.stringify(run());
        } catch (error) {
          return `no result: ${(error as Error).message}`;
        }
      };
      const caller =
        (lib: Lib) =>
        (fn: string, request?: string): string =>
          answerOf(() => (lib.call as AnyCall)(fn, decode(request)));
      const wasmCall = caller(wasm);
      const nativeCall = caller(native!);

      const covered = new Set<string>();
      const mismatches: string[] = [];
      const compare = (
        fn: string,
        wasmAnswer: string,
        nativeAnswer: string,
      ) => {
        covered.add(fn);
        const w = canonical(fn, normalize(wasmAnswer));
        const n = canonical(fn, normalize(nativeAnswer));
        if (w !== n) {
          mismatches.push(`${fn}\n  wasm:   ${w}\n  native: ${n}`);
        }
      };

      for (const [fn, ...args] of calls) {
        compare(fn, wasmCall(fn, ...args), nativeCall(fn, ...args));
      }

      // Handle-based names run as a sequence on each side.
      const sequence = (lib: Lib) => {
        const call = caller(lib);
        const stream = lib.stream as AnyStream;
        const out: Array<[string, string]> = [];
        const cache = call(
          "cacheCreate",
          req({ app: { name: "parity" }, baseDir: `${fixture}/cache` }),
        );
        out.push(["cacheCreate", cache]);
        const cacheHandle = (JSON.parse(cache) as { handle: string }).handle;
        out.push([
          "cacheGetDir",
          call("cacheGetDir", req({ handle: cacheHandle })),
        ]);
        out.push([
          "cacheGetVersionedPath",
          call(
            "cacheGetVersionedPath",
            req({ handle: cacheHandle, version: "1.0.0", name: "f" }),
          ),
        ]);
        out.push([
          "cacheList",
          call("cacheList", req({ handle: cacheHandle })),
        ]);
        out.push([
          "cacheRemove",
          call("cacheRemove", req({ handle: cacheHandle, path: "missing" })),
        ]);
        out.push([
          "cacheClear",
          call("cacheClear", req({ handle: cacheHandle })),
        ]);
        out.push([
          "cacheClose",
          call("cacheClose", req({ handle: cacheHandle })),
        ]);

        const tokenizer = stream("parsingTokenizeStream", {});
        const tokHandle = (tokenizer.opened as { handle: string }).handle;
        out.push([
          "parsingTokenizeStreamPush",
          call(
            "parsingTokenizeStreamPush",
            req({ handle: tokHandle, chunk: "a + b" }),
          ),
        ]);
        out.push([
          "parsingTokenizeStream",
          `${JSON.stringify(tokenizer.opened)}\n${answerOf(tokenizer.close)}`,
        ]);

        for (const name of [
          "codebaseWalkFilesStream",
          "codebaseValidateFilesStream",
        ]) {
          const opened = stream(name, { dir: fixture, extensions: [".ts"] });
          const items: string[] = [JSON.stringify(opened.opened)];
          for (let i = 0; i < 50; i++) {
            const item = answerOf(opened.read);
            items.push(item);
            if (item === "null") {
              break;
            }
          }
          items.push(answerOf(opened.close));
          out.push([name, items.join("\n")]);
        }
        return out;
      };

      const wasmSeq = sequence(wasm);
      const nativeSeq = sequence(native!);
      wasmSeq.forEach(([fn, answer], i) =>
        compare(fn, answer, nativeSeq[i]![1]),
      );

      // Logging: the writes are below the logger's level, so neither side
      // prints; node-reactor-log.test.ts covers the output.
      const logging = (call: (fn: string, request?: string) => string) => {
        const created = call(
          "logCreate",
          req({ scopeName: "parity", level: "WARN" }),
        );
        const { handle } = JSON.parse(created) as { handle: string };
        const out: Array<[string, string]> = [["logCreate", created]];
        out.push([
          "logShouldLog",
          call("logShouldLog", req({ handle, level: "INFO" })),
        ]);
        out.push([
          "logWrite",
          call("logWrite", req({ handle, level: "INFO", message: "quiet" })),
        ]);
        out.push([
          "logConfigure",
          call("logConfigure", req({ handle, level: "ERROR" })),
        ]);
        out.push(["logClose", call("logClose", handle)]);
        return out;
      };
      const wasmLogging = logging(wasmCall);
      const nativeLogging = logging(nativeCall);
      wasmLogging.forEach(([fn, answer], i) =>
        compare(fn, answer, nativeLogging[i]![1]),
      );

      // HTTP against a local server (TASK-277). The reactor's requests wait on
      // the host's fetch, so the library awaits them. The Date header is the
      // only part of an answer that may differ.
      const worker = new workerThreads.Worker(
        new URL("./profile-parity-server.worker.ts", import.meta.url),
      );
      const port = await new Promise<number>((resolve, reject) => {
        worker.once("message", (message: { port: number }) =>
          resolve(message.port),
        );
        worker.once("error", reject);
      });
      try {
        const base = `http://127.0.0.1:${port}`;
        const dropDate = (answer: string): string =>
          answer.replace(/"Date":"[^"]*",?/, "").replace(",}", "}");
        const http = async (lib: Lib): Promise<Array<[string, string]>> => {
          const out: Array<[string, string]> = [];
          const created = lib.call("httpCreate", {
            baseUrl: base,
            timeoutMs: 5000,
          });
          out.push(["httpCreate", JSON.stringify(created)]);
          const handle = created.handle ?? "";
          out.push([
            "httpRequest",
            dropDate(
              JSON.stringify(
                await lib.call("httpRequest", {
                  handle,
                  method: "POST",
                  url: "/echo",
                  body: "hi",
                }),
              ),
            ),
          ]);
          out.push([
            "httpRequest",
            dropDate(
              JSON.stringify(
                await lib.call("httpRequest", { handle, url: "/missing" }),
              ),
            ),
          ]);
          const opened = await lib.stream("httpRequestStream", {
            handle,
            url: "/stream",
          });
          let body = "";
          for (let i = 0; i < 20; i++) {
            // Each read follows the one before it on the same stream.
            // oxlint-disable-next-line no-await-in-loop
            const chunk = await opened.read();
            body += chunk?.chunk === undefined ? "" : atob(chunk.chunk);
            if (chunk === null || chunk.done === true) {
              break;
            }
          }
          // Chunk sizes come from each side's reader; the bytes must match.
          out.push([
            "httpRequestStream",
            `${dropDate(JSON.stringify(opened.opened))}\n${body}\n${JSON.stringify(
              opened.close(),
            )}`,
          ]);
          out.push([
            "httpClose",
            JSON.stringify(lib.call("httpClose", handle)),
          ]);
          return out;
        };
        const wasmHttp = await http(wasm);
        const nativeHttp = await http(native!);
        wasmHttp.forEach(([fn, answer], i) =>
          compare(fn, answer, nativeHttp[i]![1]),
        );
      } finally {
        worker.postMessage("stop");
        await worker.terminate();
      }

      // init and shutdown, on the WASM instance only (see the module doc).
      covered.add("init");
      assert.assertEquals(wasmCall("init"), "{}");
      covered.add("shutdown");
      assert.assertEquals(wasmCall("shutdown"), "{}");

      assert.assertEquals(mismatches, [], mismatches.join("\n"));
      assert.assertEquals(
        [...covered].sort(),
        [...host.handshake.names],
        "every profile name is covered",
      );
    } finally {
      await runtime.fs.remove(fixture, { recursive: true });
    }
  },
);
