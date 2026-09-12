// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertThrows } from "@std/assert";
import { exec, parseCommand } from "./mod.ts";

/** Builds the tagged-template arguments for a single interpolated value. */
const interpolate = (value: unknown): [string, string[]] => {
  const strings = Object.assign(["echo ", ""], {
    raw: ["echo ", ""],
  }) as unknown as TemplateStringsArray;

  return parseCommand(strings, [value]);
};

Deno.test("exec: an interpolated value is exactly one argv entry", () => {
  // Quoting and re-tokenizing have to be inverses. They were not: a backslash
  // was treated as an escape inside single quotes, so an interpolated Windows
  // path or regex lost characters, and a value carrying a quote could break out
  // of its own quoting and appear as additional argv entries.
  const cases = [
    "a\\b",
    "C:\\Users\\x",
    "\\d+",
    "hello world",
    "a' --evil x",
    "a\\' --evil x",
    '"quoted"',
    "$(whoami)",
    "`backtick`",
    "semi;colon",
    "pipe|bar",
    "amp&ersand",
    "tab\there",
    "",
  ];

  for (const value of cases) {
    const [cmd, args] = interpolate(value);

    assertEquals(cmd, "echo", `command changed for ${JSON.stringify(value)}`);
    assertEquals(
      args,
      [value],
      `value did not survive as one argv entry: ${JSON.stringify(value)}`,
    );
  }
});

Deno.test("exec: an empty interpolation still occupies an argv slot", () => {
  // Dropping it shifted every later argument down one position, so a flag was
  // silently consumed as the previous option's value.
  const strings = Object.assign(["cmd -p ", " --flag"], {
    raw: ["cmd -p ", " --flag"],
  }) as unknown as TemplateStringsArray;

  assertEquals(parseCommand(strings, [""]), ["cmd", ["-p", "", "--flag"]]);
});

Deno.test("exec: pipe() refuses rather than returning a wrong answer", () => {
  // It used to run each command and throw away every output but the last,
  // never writing anything to the next child's stdin - so it reported success
  // while answering a question nobody asked.
  assertThrows(
    () => exec`cat file.txt`.pipe(exec`grep pattern`),
    Error,
    "not implemented",
  );
});
