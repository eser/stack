// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as csvCodec from "./csv-codec.ts";

/** Pushes `chunks` through one parser and returns every record it yields. */
const parseChunks = (
  chunks: readonly string[],
  delimiter = ",",
): string[][] => {
  const parser = csvCodec.createRecordParser(delimiter);
  const records: string[][] = [];
  for (const chunk of chunks) {
    records.push(...parser.push(chunk));
  }
  records.push(...parser.flush());

  return records;
};

bdd.describe("formatField", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly value: unknown;
    readonly expected: string;
  }> = [
    { name: "leaves a plain value as it is", value: "app", expected: "app" },
    { name: "writes a number", value: 3, expected: "3" },
    { name: "writes null as an empty field", value: null, expected: "" },
    {
      name: "writes undefined as an empty field",
      value: undefined,
      expected: "",
    },
    {
      name: "writes an object as JSON",
      value: { a: 1 },
      expected: '"{""a"":1}"',
    },
    { name: "quotes the delimiter", value: "a,b", expected: '"a,b"' },
    {
      name: "quotes and doubles a quote",
      value: 'say "hi"',
      expected: '"say ""hi"""',
    },
    { name: "quotes a line feed", value: "a\nb", expected: '"a\nb"' },
    {
      name: "quotes a carriage return",
      value: "a\rb",
      expected: '"a\rb"',
    },
    { name: "quotes a CRLF", value: "a\r\nb", expected: '"a\r\nb"' },
    { name: "leaves spaces unquoted", value: " a b ", expected: " a b " },
  ];

  for (const { name, value, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(csvCodec.formatField(value, ","), expected);
    });
  }

  bdd.it("quotes a field that holds another delimiter", () => {
    assert.assertEquals(csvCodec.formatField("a;b", ";"), '"a;b"');
    assert.assertEquals(csvCodec.formatField("a,b", ";"), "a,b");
  });
});

bdd.describe("formatRow", () => {
  bdd.it("joins the fields and ends the row with CRLF", () => {
    assert.assertEquals(
      csvCodec.formatRow(["name", 'a "b"', "c,d", 3], ","),
      'name,"a ""b""","c,d",3\r\n',
    );
  });

  for (const delimiter of ['"', "\n", "\r", ""]) {
    bdd.it(`rejects the delimiter ${JSON.stringify(delimiter)}`, () => {
      assert.assertThrows(
        () => csvCodec.formatRow(["a"], delimiter),
        TypeError,
        "delimiter",
      );
    });
  }
});

bdd.describe("createRecordParser", () => {
  bdd.it("reads LF and CRLF rows", () => {
    assert.assertEquals(parseChunks(["a,b\nc,d\r\ne,f\n"]), [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  bdd.it("reads a last row without a line ending on flush", () => {
    assert.assertEquals(parseChunks(["a,b\nc,d"]), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  bdd.it("reads empty fields", () => {
    assert.assertEquals(parseChunks([",a,,\n"]), [["", "a", "", ""]]);
  });

  bdd.it("skips blank lines", () => {
    assert.assertEquals(parseChunks(["a\n\n  \r\nb\n"]), [["a"], ["b"]]);
  });

  bdd.it("reads a quoted delimiter", () => {
    assert.assertEquals(parseChunks(['"a,b",c\n']), [["a,b", "c"]]);
  });

  bdd.it("reads doubled quotes as one quote", () => {
    assert.assertEquals(parseChunks(['"say ""hi""",x\n']), [['say "hi"', "x"]]);
  });

  bdd.it("reads an empty quoted field", () => {
    assert.assertEquals(parseChunks(['"",a\n']), [["", "a"]]);
  });

  bdd.it("reads line breaks inside a quoted field", () => {
    assert.assertEquals(parseChunks(['"line 1\nline 2\r\nline 3",b\nc,d\n']), [
      ["line 1\nline 2\r\nline 3", "b"],
      ["c", "d"],
    ]);
  });

  bdd.it("keeps a quoted field that spans chunks", () => {
    const parser = csvCodec.createRecordParser(",");

    assert.assertEquals(parser.push('id,"first\n'), []);
    // The quote at the end of a chunk may open a doubled quote.
    assert.assertEquals(parser.push('second"'), []);
    assert.assertEquals(parser.push('"",x\n'), [["id", 'first\nsecond"', "x"]]);
    assert.assertEquals(parser.push('2,"y"'), []);
    assert.assertEquals(parser.push("\n"), [["2", "y"]]);
    assert.assertEquals(parser.flush(), []);
  });

  bdd.it("waits for the LF of a CRLF split across chunks", () => {
    const parser = csvCodec.createRecordParser(",");

    assert.assertEquals(parser.push("a,b\r"), []);
    assert.assertEquals(parser.push("\nc"), [["a", "b"]]);
    assert.assertEquals(parser.flush(), [["c"]]);
  });

  bdd.it("reads every split of a row the same", () => {
    const text = 'a,"b ""q"" \r\nc",d\r\ne,f\n';
    const whole = parseChunks([text]);

    for (let cut = 0; cut <= text.length; cut += 1) {
      assert.assertEquals(
        parseChunks([text.slice(0, cut), text.slice(cut)]),
        whole,
        `split at ${cut}`,
      );
    }
  });

  bdd.it("reads a delimiter of several characters", () => {
    assert.assertEquals(parseChunks(["a::b::", '"c::d"::e\n'], "::"), [
      ["a", "b", "c::d", "e"],
    ]);
  });

  bdd.it("reads a different delimiter", () => {
    assert.assertEquals(parseChunks(["a;b,c\n"], ";"), [["a", "b,c"]]);
  });

  bdd.it("reads back what formatRow writes", () => {
    const fields = ["plain", 'a "q"', "x,y", "line\nbreak", "cr\rlf", ""];

    assert.assertEquals(parseChunks([csvCodec.formatRow(fields, ",")]), [
      fields,
    ]);
  });

  bdd.it("rejects a quote inside an unquoted field", () => {
    assert.assertThrows(
      () => parseChunks(['ab"c,d\n']),
      csvCodec.CsvParseError,
      "record 1",
    );
  });

  bdd.it("rejects text after a closing quote", () => {
    assert.assertThrows(
      () => parseChunks(['a\n"b"c,d\n']),
      csvCodec.CsvParseError,
      "record 2",
    );
  });

  bdd.it("rejects a quoted field left open at the end", () => {
    assert.assertThrows(
      () => parseChunks(['a,"b\n']),
      csvCodec.CsvParseError,
      "unterminated quoted field",
    );
  });
});
