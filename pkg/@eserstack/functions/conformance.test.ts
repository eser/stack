// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The shared cases of the function model. The Go side (`pkg/ajan/functionsfx`,
 * `conformance_test.go`) runs the same file, so a case that passes on both
 * shows that bind, createTrigger and the error kinds behave the same way in
 * both languages (ADR 0011).
 *
 * Both sides implement the same named handlers, adapters and mappers below.
 * The package does not depend on `@eserstack/standards`, so this test reads the
 * fixtures through Node's own modules, like the httpclient bridge test.
 *
 * @module
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as handler from "./handler.ts";
import * as task from "./task.ts";

type ErrorLike = { readonly _tag: string; readonly message: string };

type Want =
  | { readonly ok: unknown }
  | { readonly error: { readonly kind: string; readonly message: string } };

type BindCase = {
  readonly name: string;
  readonly handler: string;
  readonly adapter: string;
  readonly event: unknown;
  readonly want: Want;
};

type TriggerCase = {
  readonly name: string;
  readonly handler: string;
  readonly adapter: string;
  readonly mapper: string;
  readonly event: unknown;
  readonly want: unknown;
};

type Fixtures = {
  readonly bind: readonly BindCase[];
  readonly trigger: readonly TriggerCase[];
};

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "functionsfx",
  "testdata",
  "conformance",
  "handler_cases.json",
);

const fixtures = JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as Fixtures;

// --- The vocabulary both languages implement ---

const handlers: Readonly<
  Record<string, handler.Handler<unknown, unknown, ErrorLike>>
> = {
  greet: (input) => task.succeed(`Hello, ${String(input)}`),
  "require-email": (input) =>
    task.validate(
      (email: string) => email.includes("@"),
      "Invalid email address",
    )(String(input)),
  "always-abort": () =>
    task.failTask<ErrorLike>({
      _tag: "AbortError",
      message: "Operation aborted",
    }),
};

const adapters: Readonly<Record<string, handler.Adapter<unknown, unknown>>> = {
  identity: (event) => results.ok(event),
  "http-query-name": (event) => {
    const { query } = event as { readonly query: Record<string, string> };
    const name = query["name"];

    return results.ok(typeof name === "string" ? name : "world");
  },
  "http-post-body": (event) => {
    const { method, body } = event as {
      readonly method: string;
      readonly body: unknown;
    };

    return method === "POST"
      ? results.ok(body)
      : results.fail(handler.adaptError("Method not allowed"));
  },
};

const mappers: Readonly<
  Record<
    string,
    handler.ResponseMapper<unknown, ErrorLike | handler.AdaptError, unknown>
  >
> = {
  "http-response": (result) => {
    if (results.isOk(result)) {
      return { status: 200, headers: {}, body: result.value };
    }

    return {
      status: result.error._tag === "AdaptError" ? 400 : 500,
      headers: {},
      body: result.error.message,
    };
  },
};

const lookup = <T>(table: Readonly<Record<string, T>>, name: string): T => {
  const found = table[name];

  if (found === undefined) {
    throw new Error(`conformance vocabulary has no "${name}"`);
  }

  return found;
};

// --- Cases ---

nodeTest.test("the fixtures hold bind and trigger cases", () => {
  assert.assertEquals(fixtures.bind.length > 0, true);
  assert.assertEquals(fixtures.trigger.length > 0, true);
});

for (const testCase of fixtures.bind) {
  nodeTest.test(`conformance bind: ${testCase.name}`, async () => {
    const bound = handler.bind(
      lookup(handlers, testCase.handler),
      lookup(adapters, testCase.adapter),
    );

    const result = await task.runTask(bound(testCase.event));

    const outcome = results.isOk(result)
      ? { ok: result.value }
      : { error: { kind: result.error._tag, message: result.error.message } };

    assert.assertEquals(outcome, testCase.want);
  });
}

for (const testCase of fixtures.trigger) {
  nodeTest.test(`conformance trigger: ${testCase.name}`, async () => {
    const trigger = handler.createTrigger({
      handler: lookup(handlers, testCase.handler),
      adaptInput: lookup(adapters, testCase.adapter),
      adaptOutput: lookup(mappers, testCase.mapper),
    });

    const response = await trigger(testCase.event);

    assert.assertEquals(response, testCase.want);
  });
}
