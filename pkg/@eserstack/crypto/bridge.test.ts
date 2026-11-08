// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The crypto logic that lives in Go (`pkg/ajan/cryptofx`), reached through the
 * bridge's dispatcher (`EserAjanCall`). The cases are the fixture files that
 * the Go tests of cryptofx read, so both sides check the same behavior.
 *
 * The package does not depend on `@eserstack/standards`, so this test reads
 * the fixtures and starts its child process through Node's own modules.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as nodeProcess from "node:process";
import * as nodeTest from "node:test";
import * as util from "node:util";
import * as assert from "@eserstack/test-kit/assert";
import * as crypto from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "cryptofx",
  "testdata",
);

interface CombinedHashCase {
  readonly name: string;
  readonly parts: readonly string[];
  readonly algorithm: string;
  readonly length: number;
  readonly hash?: string;
  readonly error?: string;
}

const readCombinedHashes = async (): Promise<CombinedHashCase[]> =>
  JSON.parse(
    await fs.readFile(path.join(FIXTURES, "combined_hashes.json"), "utf8"),
  ) as CombinedHashCase[];

const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));

nodeTest.test(
  "cryptoHashCombined answers the cases of combined_hashes.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readCombinedHashes()) {
      const answer = lib.call("cryptoHashCombined", {
        parts: tc.parts,
        algorithm: tc.algorithm,
        length: tc.length,
      });

      if (tc.error !== undefined) {
        assert.assertStringIncludes(answer.error ?? "", tc.error, tc.name);
        continue;
      }

      assert.assertEquals(answer, { hash: tc.hash }, tc.name);
    }
  },
);

nodeTest.test(
  "computeCombinedHash answers the cases of combined_hashes.json",
  async () => {
    // The cases are independent, so they run at once.
    await Promise.all(
      (await readCombinedHashes()).map(async (tc) => {
        const run = () =>
          crypto.computeCombinedHash(
            tc.parts.map((part) => fromBase64(part)),
            tc.algorithm as crypto.HashAlgorithm,
            tc.length,
          );

        if (tc.error !== undefined) {
          await assert.assertRejects(run, Error, tc.error, tc.name);
          return;
        }

        assert.assertEquals(await run(), tc.hash, tc.name);
      }),
    );
  },
);

nodeTest.test(
  "computeCombinedHash hashes like computeHash of the concatenation",
  async () => {
    const parts = [
      new Uint8Array([1, 2]),
      new Uint8Array(0),
      new Uint8Array([3, 255]),
    ];

    assert.assertEquals(
      await crypto.computeCombinedHash(parts, "SHA-512", 0),
      await crypto.computeHash(new Uint8Array([1, 2, 3, 255]), "SHA-512", 0),
    );
  },
);

nodeTest.test(
  "with ESER_AJAN=disabled every export that hashes rejects with the bridge's load error",
  async () => {
    const script = `
      import * as crypto from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      const out = { plain: [], crypto: [] };
      for (const run of [
        () => crypto.computeHash(new Uint8Array([1])),
        () => crypto.computeStringHash("x"),
        () => crypto.computeCombinedHash([new Uint8Array([1])]),
      ]) {
        try {
          await run();
          out.plain.push(null);
        } catch (error) {
          out.plain.push({ message: error.message, cause: error.cause?.message ?? null });
        }
      }
      for (const run of [
        () => crypto.ffiLoader.hash({ text: "x" }),
        () => crypto.hashWith(crypto.ffiLoader, { data: new Uint8Array([1]) }),
      ]) {
        try {
          await run();
          out.crypto.push(null);
        } catch (error) {
          out.crypto.push({
            isCryptoError: error instanceof crypto.CryptoError,
            code: error.code,
            cause: error.cause?.message ?? null,
          });
        }
      }
      process.stdout.write(JSON.stringify(out));
    `;
    // execFile rejects when the child exits with a non-zero code.
    const { stdout } = await util.promisify(childProcess.execFile)(
      nodeProcess.execPath,
      ["--input-type=module", "--eval", script],
      { env: { ...nodeProcess.env, ESER_AJAN: "disabled" } },
    );

    const result = JSON.parse(stdout) as {
      plain: Array<{ message: string; cause: string | null } | null>;
      crypto: Array<{
        isCryptoError: boolean;
        code: string;
        cause: string | null;
      } | null>;
    };

    assert.assertEquals(result.plain.length, 3);
    for (const rejection of result.plain) {
      assert.assertExists(rejection);
      assert.assertStringIncludes(
        rejection.message,
        "eser-ajan native library unavailable",
      );
      assert.assertStringIncludes(rejection.cause ?? "", "ESER_AJAN=disabled");
    }

    assert.assertEquals(result.crypto.length, 2);
    for (const rejection of result.crypto) {
      assert.assertExists(rejection);
      assert.assertEquals(rejection.isCryptoError, true);
      assert.assertEquals(rejection.code, crypto.CRYPTO_HASH_FAILED);
      assert.assertStringIncludes(rejection.cause ?? "", "ESER_AJAN=disabled");
    }
  },
);
