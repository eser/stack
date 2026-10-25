// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as ask from "./ask.ts";

// TASK-157: `ai ask` takes --effort with the five levels of
// GenerateTextOptions.effort and rejects any other value before it chooses a
// provider. A flag without its value, or a --max-tokens that is not a positive
// whole number, fails the same way instead of being dropped or sent as NaN.

for (const level of ["low", "medium", "high", "xhigh", "max"] as const) {
  Deno.test(`parseAskArgs accepts --effort ${level}`, () => {
    const parsed = ask.parseAskArgs(["hello", "--effort", level]);

    assert.assert(results.isOk(parsed), "parseAskArgs failed");
    assert.assertEquals(parsed.value.effort, level);
  });
}

Deno.test("parseAskArgs reads every flag and joins the prompt", () => {
  const parsed = ask.parseAskArgs([
    "explain",
    "-p",
    "ant",
    "-m",
    "claude-x",
    "--max-tokens",
    "512",
    "--effort",
    "low",
    "--json",
    "-v",
    "closures",
  ]);

  assert.assert(results.isOk(parsed), "parseAskArgs failed");
  assert.assertEquals(parsed.value, {
    provider: "ant",
    model: "claude-x",
    maxTokens: 512,
    effort: "low",
    json: true,
    verbose: true,
    prompt: "explain closures",
  });
});

Deno.test("parseAskArgs leaves every flag unset when none is given", () => {
  const parsed = ask.parseAskArgs(["hello"]);

  assert.assert(results.isOk(parsed), "parseAskArgs failed");
  assert.assertEquals(parsed.value, {
    provider: null,
    model: null,
    maxTokens: null,
    effort: null,
    json: false,
    verbose: false,
    prompt: "hello",
  });
});

const rejected: ReadonlyArray<{
  readonly name: string;
  readonly args: readonly string[];
  readonly message: string;
}> = [
  {
    name: "an unknown effort level",
    args: ["hi", "--effort", "huge"],
    message:
      '--effort "huge" is not an effort level; use low, medium, high, xhigh or max',
  },
  {
    name: "an effort level in upper case",
    args: ["hi", "--effort", "LOW"],
    message: '--effort "LOW" is not an effort level',
  },
  {
    name: "--effort without a level",
    args: ["hi", "--effort"],
    message: "--effort needs a value",
  },
  {
    name: "-p without a provider",
    args: ["hi", "-p"],
    message: "-p needs a value",
  },
  {
    name: "a --max-tokens that is not a number",
    args: ["hi", "--max-tokens", "lots"],
    message: '--max-tokens "lots" is not a positive whole number',
  },
  {
    name: "a --max-tokens of zero",
    args: ["hi", "--max-tokens", "0"],
    message: '--max-tokens "0" is not a positive whole number',
  },
  {
    name: "a fractional --max-tokens",
    args: ["hi", "--max-tokens", "1.5"],
    message: '--max-tokens "1.5" is not a positive whole number',
  },
  {
    name: "no prompt",
    args: ["--effort", "low"],
    message: 'Usage: ai ask "your prompt"',
  },
];

for (const tc of rejected) {
  Deno.test(`parseAskArgs rejects ${tc.name}`, () => {
    const parsed = ask.parseAskArgs(tc.args);

    assert.assert(results.isFail(parsed), "parseAskArgs succeeded");
    assert.assertStringIncludes(parsed.error, tc.message);
  });
}

Deno.test("main rejects an unknown effort level before it chooses a provider", async () => {
  const result = await ask.main(["hi", "--effort", "huge"]);

  assert.assert(results.isFail(result), "main succeeded");
  assert.assertEquals(result.error.exitCode, 1);
  assert.assertStringIncludes(
    result.error.message ?? "",
    "use low, medium, high, xhigh or max",
  );
});

// The alias and display-name tables are looked up with the -p value. On plain
// objects "constructor" resolved to the Object function, and the error named
// "function Object() { [native code] }" instead of the provider asked for.
Deno.test("main reports a provider named like an Object.prototype member as unknown", async () => {
  const result = await ask.main(["hi", "-p", "constructor"]);

  assert.assert(results.isFail(result), "main succeeded");
  assert.assertEquals(result.error.exitCode, 1);
  assert.assertEquals(result.error.message, "Unknown provider: constructor");
});
