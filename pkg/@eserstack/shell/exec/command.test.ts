// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as exec from "./mod.ts";

/** Builds the tagged-template arguments for a single interpolated value. */
const interpolate = (value: unknown): [string, string[]] => {
  const strings = Object.assign(["echo ", ""], {
    raw: ["echo ", ""],
  }) as unknown as TemplateStringsArray;

  return exec.parseCommand(strings, [value]);
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

    assert.assertEquals(
      cmd,
      "echo",
      `command changed for ${JSON.stringify(value)}`,
    );
    assert.assertEquals(
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

  assert.assertEquals(exec.parseCommand(strings, [""]), [
    "cmd",
    ["-p", "", "--flag"],
  ]);
});

Deno.test("exec: pipe() refuses rather than returning a wrong answer", () => {
  // It used to run each command and throw away every output but the last,
  // never writing anything to the next child's stdin - so it reported success
  // while answering a question nobody asked.
  assert.assertThrows(
    () => exec.exec`cat file.txt`.pipe(exec.exec`grep pattern`),
    Error,
    "not implemented",
  );
});

Deno.test("exec: timeout() rejects values that are not a usable limit", () => {
  // 0 went out as "0ms", which the bridge rejects, and there is no "no limit"
  // value; past 2^31 - 1 ms a timer fires at once.
  for (const ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
    assert.assertThrows(
      () => exec.exec`true`.timeout(ms),
      RangeError,
      "is out of range",
      `timeout(${ms}) was accepted`,
    );
  }
});

Deno.test("exec: the constructor checks a timeout passed as an option", () => {
  assert.assertThrows(
    () => new exec.CommandBuilder("true", [], { timeout: 0 }),
    RangeError,
    "is out of range",
  );
});

Deno.test("exec: the runtime path stops a command at its timeout", async () => {
  // Piped stdin always takes the runtime spawn. Its timeout surfaces the same
  // CommandRunError as the bridge's, even with noThrow(), rather than the exit
  // code of the killed process.
  const command = new exec.CommandBuilder("sleep", ["5"])
    .stdinText("")
    .timeout(200)
    .noThrow();

  await assert.assertRejects(
    () => command.spawn(),
    exec.CommandRunError,
    "ran past its 200 ms timeout",
  );
});

Deno.test("exec: the runtime path reports a missing program as CommandRunError", async () => {
  // The bridge reports a missing program as CommandRunError, so the runtime
  // spawn does too; noThrow() cannot apply, since there is no exit code.
  const command = new exec.CommandBuilder("eserstack-no-such-program")
    .stdinText("")
    .noThrow();

  const error = await assert.assertRejects(
    () => command.spawn(),
    exec.CommandRunError,
    "eserstack-no-such-program",
  );
  assert.assertEquals(error.command, "eserstack-no-such-program");
  assert.assertInstanceOf(error.cause, Error);
});

Deno.test("exec: the runtime path reports a missing cwd as CommandRunError", async () => {
  const command = new exec.CommandBuilder("true")
    .cwd("/eserstack-no-such-directory")
    .stdinText("");

  await assert.assertRejects(() => command.spawn(), exec.CommandRunError);
});
