// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The shared cases of `collect` in `pipeline.ts`. The Go side
 * (`pkg/ajan/functionsfx`, `conformance_pipeline_test.go`) runs the same file
 * with its `Pipeline`, so a case that passes on both shows the two chains behave
 * the same way (ADR 0011). A middleware is written as data, a list of actions,
 * which each language plays with its own pipeline.
 *
 * @module
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as pipeline from "./pipeline.ts";

type ErrorSpec = { readonly kind: string; readonly message: string };

type Action = {
  readonly emit?: unknown;
  readonly fail?: ErrorSpec;
  readonly next?: boolean;
  readonly setState?: { readonly key: string; readonly value: unknown };
  readonly emitState?: string;
  readonly emitArg?: number;
};

type Outcome = { readonly ok?: unknown; readonly error?: ErrorSpec };

type Case = {
  readonly name: string;
  readonly middleware: ReadonlyArray<readonly Action[]>;
  readonly method: string;
  readonly mapError?: string;
  readonly recover?: string;
  readonly args?: readonly unknown[];
  readonly runs?: number;
  readonly want: Outcome & { readonly items?: readonly Outcome[] };
};

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "functionsfx",
  "testdata",
  "conformance",
  "pipeline_cases.json",
);

const cases = (
  JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as {
    readonly pipeline: readonly Case[];
  }
).pipeline;

// A fixture with a kind is a tagged error; one without is a plain Error.
const errorOf = (spec: ErrorSpec): unknown =>
  spec.kind === ""
    ? new Error(spec.message)
    : { _tag: spec.kind, message: spec.message };

const tagOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "_tag" in error
    ? String(error._tag)
    : "";

const messageOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);

const errorOutcome = (error: unknown): Outcome => ({
  error: { kind: tagOf(error), message: messageOf(error) },
});

const outcomeOf = (result: results.Result<unknown, unknown>): Outcome =>
  results.isOk(result) ? { ok: result.value } : errorOutcome(result.error);

// Plays a list of actions as a middleware.
const middlewareOf = (
  actions: readonly Action[],
): pipeline.Middleware<unknown, unknown> =>
  async function* (ctx, ...args) {
    for (const action of actions) {
      if (action.emit !== undefined) {
        yield results.ok(action.emit);
      } else if (action.fail !== undefined) {
        yield results.fail(errorOf(action.fail));
      } else if (action.next === true) {
        yield* ctx.next();
      } else if (action.setState !== undefined) {
        ctx.state[action.setState.key] = action.setState.value;
      } else if (action.emitState !== undefined) {
        // A key nobody wrote reads as null, which is what the fixture means.
        yield results.ok(ctx.state[action.emitState] ?? null);
      } else if (action.emitArg !== undefined) {
        yield results.ok(args[action.emitArg]);
      }
    }
  };

// Runs the chain the way the case says. A second next() throws in TypeScript,
// where the Go side emits a failure; either way the run ends with that error.
const play = async (
  chain: pipeline.Pipeline<unknown, unknown>,
  method: string,
  args: readonly unknown[],
): Promise<Outcome | readonly Outcome[]> => {
  try {
    switch (method) {
      case "run":
        return outcomeOf(await chain.run(...args));
      case "runFirst":
        return outcomeOf(await chain.runFirst(...args));
      case "runLast":
        return outcomeOf(await chain.runLast(...args));
      case "iterate": {
        const items: Outcome[] = [];

        for await (const item of chain.iterate(...args)) {
          items.push(outcomeOf(item));
        }

        return items;
      }
      default:
        throw new Error(`no method "${method}"`);
    }
  } catch (error: unknown) {
    return errorOutcome(error);
  }
};

nodeTest.test("the fixtures hold pipeline cases", () => {
  assert.assertEquals(cases.length > 0, true);
});

for (const testCase of cases) {
  nodeTest.test(`conformance pipeline: ${testCase.name}`, async () => {
    const chain = pipeline.collect<unknown, unknown>(
      ...testCase.middleware.map(middlewareOf),
    );

    if (testCase.mapError === "to-abort") {
      chain.mapError((error) => ({
        _tag: "AbortError",
        message: `mapped: ${messageOf(error)}`,
      }));
    }

    if (testCase.recover === "fallback") {
      chain.recover(() => results.ok("fallback"));
    }

    const args = testCase.args ?? [];

    for (let run = 0; run < Math.max(testCase.runs ?? 1, 1); run += 1) {
      // Each run starts after the last one ended: the case checks that the state
      // of one run does not reach the next.
      // oxlint-disable-next-line no-await-in-loop
      const outcome = await play(chain, testCase.method, args);

      if (testCase.method === "iterate") {
        assert.assertEquals(outcome, [...(testCase.want.items ?? [])]);
      } else {
        const { items: _items, ...want } = testCase.want;

        assert.assertEquals(outcome, want);
      }
    }
  });
}
