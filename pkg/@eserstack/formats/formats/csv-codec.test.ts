// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as csvCodec from "./csv-codec.ts";

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
