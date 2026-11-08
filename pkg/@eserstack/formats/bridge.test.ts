// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The CSV reader that lives in Go (`formatfx.ReadCSV` in `pkg/ajan/formatfx`),
 * reached through the bridge's dispatcher (`EserAjanCall`) and through the
 * public reader. The cases are the fixture file that the Go tests of formatfx
 * read, written from the answers of the TypeScript reader before it moved, so
 * both sides check the same behavior.
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
import * as streams from "@eserstack/streams";
import * as formats from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "formatfx",
  "testdata",
);

type CsvReadCall =
  | { readonly items: ReadonlyArray<Record<string, string>> }
  | { readonly error: string };

interface CsvReadCase {
  readonly name: string;
  readonly delimiter?: string;
  readonly headers?: readonly string[];
  readonly chunks: readonly string[];
  readonly calls: readonly CsvReadCall[];
}

const readCsvReadCases = async (): Promise<CsvReadCase[]> =>
  JSON.parse(
    await fs.readFile(path.join(FIXTURES, "csv_read_cases.json"), "utf8"),
  ) as CsvReadCase[];

/** Checks values, prototypes and key order of the items against a call. */
const assertItems = (
  got: readonly unknown[],
  want: ReadonlyArray<Record<string, string>>,
  message: string,
): void => {
  assert.assertEquals(got, want, message);
  assert.assertEquals(
    got.map((item) => Object.keys(item as object)),
    want.map((item) => Object.keys(item)),
    `${message}: key order`,
  );
};

nodeTest.test(
  "formatReadCsv answers the cases of csv_read_cases.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readCsvReadCases()) {
      let state: {
        rest: string;
        headers: readonly string[] | null;
        records: number;
      } = { rest: "", headers: tc.headers ?? null, records: 0 };
      const steps = [...tc.chunks, ""];

      for (const [index, call] of tc.calls.entries()) {
        const answer = lib.call("formatReadCsv", {
          chunk: steps[index]!,
          final: index === steps.length - 1,
          delimiter: tc.delimiter ?? ",",
          state,
        });

        if ("error" in call) {
          assert.assertEquals(answer.error, call.error, tc.name);
          break;
        }

        assert.assertEquals(answer.error, undefined, tc.name);
        assertItems(
          answer.items ?? [],
          call.items,
          `${tc.name}, call ${index}`,
        );
        state = { ...answer.state! };
      }
    }
  },
);

nodeTest.test(
  "csvFormat.createReader answers the cases of csv_read_cases.json",
  async () => {
    for (const tc of await readCsvReadCases()) {
      const options: formats.FormatOptions = {};
      if (tc.delimiter !== undefined) options.delimiter = tc.delimiter;
      if (tc.headers !== undefined) options.headers = [...tc.headers];

      const reader = formats.csvFormat.createReader(options);
      const steps: Array<readonly [string, () => unknown[]]> = [
        ...tc.chunks.map(
          (chunk) => ["CSV row", () => reader.push(chunk)] as const,
        ),
        ["CSV", () => reader.flush()] as const,
      ];

      for (const [index, call] of tc.calls.entries()) {
        const [label, step] = steps[index]!;

        if ("error" in call) {
          const error = assert.assertThrows(step, formats.DeserializationError);
          assert.assertEquals(
            error.message,
            `Failed to deserialize ${label}: ${call.error}`,
            tc.name,
          );
          assert.assertEquals(error.format, "csv");
          assert.assertEquals(error.cause?.message, call.error);
          break;
        }

        assertItems(step(), call.items, `${tc.name}, call ${index}`);
      }
    }
  },
);

nodeTest.test("csvFormat reads back the rows its writer writes", () => {
  const rows = [
    {
      plain: "plain",
      quote: 'a "q"',
      comma: "x,y",
      lf: "line\nbreak",
      cr: "cr\rlf",
      empty: "",
    },
    {
      plain: "2",
      quote: "",
      comma: "",
      lf: "",
      cr: "",
      empty: "ş",
    },
  ];
  const text = rows
    .map((row, index) =>
      formats.csvFormat.writeItem(row, {
        _inArray: true,
        _isFirst: index === 0,
      }),
    )
    .join("");
  const reader = formats.csvFormat.createReader();

  assertItems([...reader.push(text), ...reader.flush()], rows, "round trip");
});

nodeTest.test("readerLayer reads CSV chunks through the bridge", async () => {
  formats.registerFormat(formats.csvFormat);

  const items = await streams
    .pipeline()
    .from(streams.sources.values("name,notes\napp1,", '"a\n', 'b"\napp2,c'))
    .through(formats.streamLayers.readerLayer("csv"))
    .collect<unknown>();

  assertItems(
    items,
    [
      { name: "app1", notes: "a\nb" },
      { name: "app2", notes: "c" },
    ],
    "reader layer",
  );
});

nodeTest.test(
  "with ESER_AJAN=disabled reading CSV throws the bridge's load error and the TypeScript codecs still work",
  async () => {
    const script = `
      import * as formats from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      formats.registerBuiltinFormats();
      const describe = (error) => ({ message: error.message, cause: error.cause?.message ?? null });
      const out = { failures: [], codecs: {} };
      for (const run of [
        () => formats.csvFormat.createReader().push("a\\n1\\n"),
        () => formats.csvFormat.createReader().flush(),
        () => formats.deserialize("a\\n1\\n", "csv"),
      ]) {
        try {
          await run();
          out.failures.push(null);
        } catch (error) {
          out.failures.push(describe(error));
        }
      }
      const data = [{ name: "app", replicas: 3 }];
      for (const format of ["json", "jsonl", "yaml", "toml"]) {
        const text = await formats.serialize(data, format);
        out.codecs[format] = await formats.deserialize(text, format);
      }
      out.codecs.csv = await formats.serialize(data, "csv");
      process.stdout.write(JSON.stringify(out));
    `;

    // execFile rejects when the child exits with a non-zero code.
    const { stdout } = await util.promisify(childProcess.execFile)(
      nodeProcess.execPath,
      ["--input-type=module", "--eval", script],
      { env: { ...nodeProcess.env, ESER_AJAN: "disabled" } },
    );

    const result = JSON.parse(stdout) as {
      failures: Array<{ message: string; cause: string | null } | null>;
      codecs: Record<string, unknown>;
    };

    assert.assertEquals(result.failures.length, 3);
    for (const failure of result.failures) {
      assert.assertExists(failure);
      assert.assertStringIncludes(
        failure.message,
        "eser-ajan native library unavailable",
      );
      assert.assertStringIncludes(failure.cause ?? "", "ESER_AJAN=disabled");
    }

    for (const format of ["json", "jsonl", "yaml", "toml"]) {
      assert.assertEquals(
        result.codecs[format],
        [{ name: "app", replicas: 3 }],
        format,
      );
    }
    assert.assertEquals(result.codecs["csv"], "name,replicas\r\napp,3\r\n");
  },
);
