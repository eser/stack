// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as sourceMask from "./source-mask.ts";

// Masked positions become "_", so each expectation shows what counts as code.
const codeOf = (source: string): string => {
  const mask = sourceMask.codeMask(source);

  return source.split("").map((ch, i) => mask[i] === 1 ? "_" : ch).join("");
};

const cases: ReadonlyArray<{
  readonly name: string;
  readonly source: string;
  readonly expected: string;
}> = [
  {
    name: "masks a line comment up to the newline",
    source: "a // b\nc",
    expected: "a ____\nc",
  },
  {
    name: "masks a block comment across lines",
    source: "a /* b\n */ c",
    expected: "a ________ c",
  },
  {
    name: "masks single- and double-quoted strings with escapes",
    source: `f("x\\"", 'y')`,
    expected: "f(_____, ___)",
  },
  {
    name: "ends an unterminated quoted string at the end of its line",
    source: "'a\nb",
    expected: "__\nb",
  },
  {
    name: "keeps template interpolations as code",
    source: "t(`a${b}c`)",
    expected: "t(____b___)",
  },
  {
    name: "tracks braces inside an interpolation",
    source: "`${ {a: 1}.a }`",
    expected: "___ {a: 1}.a __",
  },
  {
    name: "handles a template nested in an interpolation",
    source: "`a${`b${c}`}d`",
    expected: "________c_____",
  },
  {
    name: "does not end a template at an escaped backtick",
    source: "`a\\`b` + c",
    expected: "______ + c",
  },
];

for (const { name, source, expected } of cases) {
  Deno.test(`codeMask ${name}`, () => {
    assert.assertEquals(codeOf(source), expected);
  });
}

Deno.test("lineOf counts lines from 1", () => {
  const source = "a\nb\nc";

  assert.assertEquals(sourceMask.lineOf(source, 0), 1);
  assert.assertEquals(sourceMask.lineOf(source, source.indexOf("c")), 3);
});
