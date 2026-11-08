// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The collector logic that lives in Go (`pkg/ajan/collectorfx`), reached
 * through the bridge's dispatcher (`EserAjanCall`) and through the public
 * functions. The cases are the fixture files that the Go tests of collectorfx
 * read, written from the answers of the TypeScript implementation before it
 * moved, so both sides check the same behavior.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as collector from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const FIXTURES = runtime.path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "collectorfx",
  "testdata",
);

interface SpecifierIdentifierCase {
  readonly name: string;
  readonly used: readonly string[];
  readonly specifiers: readonly string[];
  readonly identifiers: readonly string[];
}

interface ManifestCase {
  readonly name: string;
  readonly entries: ReadonlyArray<{
    readonly relPath: string;
    readonly exports: readonly string[];
  }>;
  readonly source: string;
}

const readFixture = async <T>(name: string): Promise<T[]> =>
  JSON.parse(
    await runtime.fs.readTextFile(runtime.path.join(FIXTURES, name)),
  ) as T[];

/** A collection whose export values carry the fixture's reference names. */
const collectionOf = (
  tc: ManifestCase,
): Array<[string, Array<[string, unknown]>]> =>
  tc.entries.map(({ relPath, exports }) => [
    relPath,
    exports.map((name, i): [string, unknown] => [`export${i}`, { name }]),
  ]);

nodeTest.test(
  "collectorSpecifierToIdentifier answers the cases of specifier_identifiers.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readFixture<SpecifierIdentifierCase>(
      "specifier_identifiers.json",
    )) {
      const used = [...tc.used];
      const identifiers = tc.specifiers.map((specifier) => {
        const answer = lib.call("collectorSpecifierToIdentifier", {
          specifier,
          used,
        });
        assert.assertEquals(answer.error, undefined, tc.name);
        used.push(answer.identifier!);

        return answer.identifier;
      });

      assert.assertEquals(identifiers, [...tc.identifiers], tc.name);
    }
  },
);

nodeTest.test(
  "specifierToIdentifier answers the cases of specifier_identifiers.json and fills the used set",
  async () => {
    for (const tc of await readFixture<SpecifierIdentifierCase>(
      "specifier_identifiers.json",
    )) {
      const used = new Set(tc.used);

      assert.assertEquals(
        tc.specifiers.map((specifier) =>
          collector.specifierToIdentifier(specifier, used),
        ),
        tc.identifiers,
        tc.name,
      );
      assert.assertEquals(
        used,
        new Set([...tc.used, ...tc.identifiers]),
        tc.name,
      );
    }
  },
);

nodeTest.test(
  "collectorGenerateManifest answers the cases of manifests.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readFixture<ManifestCase>("manifests.json")) {
      assert.assertEquals(
        lib.call("collectorGenerateManifest", { entries: tc.entries }),
        { source: tc.source },
        tc.name,
      );
    }
  },
);

nodeTest.test(
  "writeManifestToString answers the cases of manifests.json",
  async () => {
    for (const tc of await readFixture<ManifestCase>("manifests.json")) {
      assert.assertEquals(
        // Sequential: the cases share one bridge and stay readable in order.
        // oxlint-disable-next-line no-await-in-loop
        await collector.writeManifestToString(collectionOf(tc)),
        tc.source,
        tc.name,
      );
    }
  },
);

nodeTest.test(
  "writeManifestToString refers to an export by the name of its value",
  async () => {
    const handler = function handler() {};
    const source = await collector.writeManifestToString([
      [
        "routes/index.ts",
        [
          ["default", handler],
          ["config", { enabled: true }],
        ],
      ],
    ]);

    assert.assertStringIncludes(
      source,
      'import * as $$routes_index from "./routes/index.ts";',
    );
    assert.assertStringIncludes(
      source,
      "    $$routes_index.handler,\n    $$routes_index.undefined\n",
    );
  },
);

nodeTest.test(
  "buildManifestFile writes the manifest of the modules it collects",
  async () => {
    const dir = await runtime.fs.makeTempDir({ prefix: "collector-manifest-" });
    try {
      await runtime.fs.ensureDir(runtime.path.join(dir, "routes"));
      await runtime.fs.writeTextFile(
        runtime.path.join(dir, "routes", "page10.js"),
        "export function ten() {}\n",
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(dir, "routes", "page2.js"),
        "export function Two() {}\nexport function two() {}\n",
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(dir, "routes", "page2.test.js"),
        "export function skipped() {}\n",
      );

      const target = runtime.path.join(dir, "manifest.gen.ts");
      await collector.buildManifestFile(target, { baseDir: dir });

      assert.assertEquals(
        await runtime.fs.readTextFile(target),
        `// This file is generated by @eserstack/collector. Your changes might be overwritten.

import * as $$routes_page2 from "./routes/page2.js";
import * as $$routes_page10 from "./routes/page10.js";

export const manifest = {
  "exports": [
    $$routes_page2.two,
    $$routes_page2.Two,
    $$routes_page10.ten
  ]
};
`,
      );
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test(
  "with ESER_AJAN=disabled the manifest functions throw the bridge's load error and collecting still walks in TypeScript",
  async () => {
    const dir = await runtime.fs.makeTempDir({ prefix: "collector-disabled-" });
    try {
      await runtime.fs.writeTextFile(
        runtime.path.join(dir, "a.js"),
        "export function a() {}\n",
      );

      const script = `
        import * as collector from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
        const baseDir = ${JSON.stringify(dir)};
        const out = { failures: [], collected: null };
        const describe = (error) => ({ message: error.message, cause: error.cause?.message ?? null });
        try {
          collector.specifierToIdentifier("a.ts", new Set());
          out.failures.push(null);
        } catch (error) {
          out.failures.push(describe(error));
        }
        for (const run of [
          () => collector.writeManifestToString([["a.ts", []]]),
          () => collector.buildManifestFile(baseDir + "/manifest.gen.ts", { baseDir }),
          () => collector.buildManifest(new WritableStream(), { baseDir }),
        ]) {
          try {
            await run();
            out.failures.push(null);
          } catch (error) {
            out.failures.push(describe(error));
          }
        }
        const collected = await collector.collectExports({ baseDir });
        out.collected = collected.map(([file, exports]) => [file, exports.map(([name]) => name)]);
        process.stdout.write(JSON.stringify(out));
      `;
      const output = await runtime.exec.spawn(
        runtime.process.execPath(),
        ["--input-type=module", "--eval", script],
        { env: { ESER_AJAN: "disabled" }, stdout: "piped", stderr: "piped" },
      );

      assert.assertEquals(
        output.code,
        0,
        new TextDecoder().decode(output.stderr),
      );

      const result = JSON.parse(new TextDecoder().decode(output.stdout)) as {
        failures: Array<{ message: string; cause: string | null } | null>;
        collected: Array<[string, string[]]>;
      };

      assert.assertEquals(result.failures.length, 4);
      for (const failure of result.failures) {
        assert.assertExists(failure);
        assert.assertStringIncludes(
          failure.message,
          "eser-ajan native library unavailable",
        );
        assert.assertStringIncludes(failure.cause ?? "", "ESER_AJAN=disabled");
      }
      assert.assertEquals(result.collected, [["a.js", ["a"]]]);
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);
