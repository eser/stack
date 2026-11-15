// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The shared cases of the combinators of `task.ts` and the helpers of
 * `resources.ts`. The Go side (`pkg/ajan/functionsfx`,
 * `conformance_tasks_test.go`) runs the same file, so a case that passes on
 * both shows the two behave the same way (ADR 0011). A case where they differ
 * on purpose says so in its name and gives an expectation for each language.
 *
 * @module
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as resources from "./resources.ts";
import * as task from "./task.ts";

type ErrorSpec = { readonly kind: string; readonly message: string };
type Want = { readonly ok?: unknown; readonly error?: ErrorSpec };
type TaskSpec = { readonly ok?: unknown; readonly error?: ErrorSpec };

type Cases = {
  readonly validate: ReadonlyArray<{
    readonly name: string;
    readonly predicate: string;
    readonly message: string;
    readonly input: unknown;
    readonly want: Want;
  }>;
  readonly map: ReadonlyArray<{
    readonly name: string;
    readonly task: TaskSpec;
    readonly want: Want;
    readonly mapped: boolean;
  }>;
  readonly then: ReadonlyArray<{
    readonly name: string;
    readonly first: TaskSpec;
    readonly next: string;
    readonly want: Want;
    readonly ranNext: boolean;
  }>;
  readonly all: ReadonlyArray<{
    readonly name: string;
    readonly tasks: readonly TaskSpec[];
    readonly want: Want;
    readonly ran: readonly number[];
  }>;
  readonly allPar: ReadonlyArray<{
    readonly name: string;
    readonly tasks: readonly TaskSpec[];
    readonly want: Want;
  }>;
  readonly retry: ReadonlyArray<{
    readonly name: string;
    readonly attempts: number;
    readonly delayMs: number;
    readonly failures: number;
    readonly want: Want;
    readonly calls: number;
    readonly delays: readonly number[];
  }>;
  readonly retryWithBackoff: ReadonlyArray<{
    readonly name: string;
    readonly backoff: {
      readonly maxAttempts: number;
      readonly initialDelay: number;
      readonly maxDelay?: number;
      readonly factor?: number;
    };
    readonly failures: number;
    readonly want: Want;
    readonly calls: number;
    readonly delays?: readonly number[];
    readonly delaysByLanguage?: { readonly ts: readonly number[] };
  }>;
  readonly scope: ReadonlyArray<{
    readonly name: string;
    readonly finalizers: ReadonlyArray<{
      readonly name: string;
      readonly fails?: boolean;
    }>;
    readonly closeTwice?: boolean;
    readonly addAfterClose?: boolean;
    readonly want: {
      readonly order: readonly string[];
      readonly closeFails: boolean;
      readonly addAfterCloseFails?: boolean;
    };
  }>;
  readonly bracket: ReadonlyArray<{
    readonly name: string;
    readonly variant: string;
    readonly acquire: string;
    readonly use: string;
    readonly release: string;
    readonly want: {
      readonly outcome: Want;
      readonly events: readonly string[];
    };
  }>;
  readonly ensure: ReadonlyArray<{
    readonly name: string;
    readonly task: TaskSpec;
    readonly want: {
      readonly outcome: Want;
      readonly events: readonly string[];
    };
  }>;
};

const FIXTURES = path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "functionsfx",
  "testdata",
  "conformance",
  "task_cases.json",
);

const cases = JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as Cases;

// --- What both languages build from a fixture ---

type Failure = { readonly _tag: string; readonly message: string };

// A fixture with a kind is a tagged error; one without is a plain Error, the
// kind of failure a function raises itself.
const errorOf = (spec: ErrorSpec): Failure | Error =>
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

const outcomeOf = (result: results.Result<unknown, unknown>): Want =>
  results.isOk(result)
    ? { ok: result.value }
    : {
        error: { kind: tagOf(result.error), message: messageOf(result.error) },
      };

const resultOf = (spec: TaskSpec): results.Result<unknown, unknown> =>
  spec.error === undefined
    ? results.ok(spec.ok)
    : results.fail(errorOf(spec.error));

const taskOf = (
  spec: TaskSpec,
  onRun: () => void,
): task.Task<unknown, unknown> =>
  task.task<unknown, unknown>(() => {
    onRun();

    return Promise.resolve(resultOf(spec));
  });

// resources.ts sleeps with setTimeout. This runs the body with a setTimeout
// that records its delay and fires at once, so the delays can be compared.
const withRecordedTimeouts = async <T>(
  body: () => Promise<T>,
): Promise<{ readonly value: T; readonly delays: readonly number[] }> => {
  const delays: number[] = [];
  const original = globalThis.setTimeout;

  globalThis.setTimeout = ((handler: () => void, delay?: number) => {
    delays.push(delay ?? 0);
    handler();

    return 0;
  }) as unknown as typeof setTimeout;

  try {
    return { value: await body(), delays };
  } finally {
    globalThis.setTimeout = original;
  }
};

// Fails its first `failures` calls with "flaky N", then answers "done".
const flaky = (failures: number) => {
  const state = { calls: 0 };

  return {
    state,
    run: (): Promise<results.Result<unknown, Error>> => {
      state.calls += 1;

      return Promise.resolve(
        state.calls <= failures
          ? results.fail(new Error(`flaky ${state.calls}`))
          : results.ok("done"),
      );
    },
  };
};

// --- Cases ---

const predicates: Readonly<Record<string, (value: unknown) => boolean>> = {
  "contains-at": (value) => typeof value === "string" && value.includes("@"),
};

for (const testCase of cases.validate) {
  nodeTest.test(`conformance validate: ${testCase.name}`, async () => {
    const predicate = predicates[testCase.predicate];

    if (predicate === undefined) {
      throw new Error(`no predicate "${testCase.predicate}"`);
    }

    const result = await task.runTask(
      task.validate(predicate, testCase.message)(testCase.input),
    );

    assert.assertEquals(outcomeOf(result), testCase.want);
  });
}

for (const testCase of cases.map) {
  nodeTest.test(`conformance map: ${testCase.name}`, async () => {
    let mapped = false;

    const result = await task.runTask(
      task.map(
        taskOf(testCase.task, () => {}),
        (value) => {
          mapped = true;

          return (value as number) * 2;
        },
      ),
    );

    assert.assertEquals(outcomeOf(result), testCase.want);
    assert.assertEquals(mapped, testCase.mapped);
  });
}

for (const testCase of cases.then) {
  nodeTest.test(`conformance then: ${testCase.name}`, async () => {
    let ranNext = false;

    const result = await task.runTask(
      task.flatMapW(
        taskOf(testCase.first, () => {}),
        (value) => {
          ranNext = true;

          return testCase.next === "too-big"
            ? task.failTask<unknown>({
                _tag: "ValidationError",
                message: "too big",
              })
            : task.succeed((value as number) + 10);
        },
      ),
    );

    assert.assertEquals(outcomeOf(result), testCase.want);
    assert.assertEquals(ranNext, testCase.ranNext);
  });
}

for (const testCase of cases.all) {
  nodeTest.test(`conformance all: ${testCase.name}`, async () => {
    const ran: number[] = [];

    const result = await task.runTask(
      task.all(
        testCase.tasks.map((spec, index) =>
          taskOf(spec, () => {
            ran.push(index);
          }),
        ),
      ),
    );

    assert.assertEquals(outcomeOf(result), testCase.want);
    assert.assertEquals(ran, [...testCase.ran]);
  });
}

for (const testCase of cases.allPar) {
  nodeTest.test(`conformance allPar: ${testCase.name}`, async () => {
    const result = await task.runTask(
      task.allPar(testCase.tasks.map((spec) => taskOf(spec, () => {}))),
    );

    assert.assertEquals(outcomeOf(result), testCase.want);
  });
}

for (const testCase of cases.retry) {
  nodeTest.test(`conformance retry: ${testCase.name}`, async () => {
    const subject = flaky(testCase.failures);

    const { value, delays } = await withRecordedTimeouts(() =>
      resources.retry(subject.run, testCase.attempts, testCase.delayMs),
    );

    assert.assertEquals(outcomeOf(value), testCase.want);
    assert.assertEquals(subject.state.calls, testCase.calls);
    assert.assertEquals([...delays], [...testCase.delays]);
  });
}

for (const testCase of cases.retryWithBackoff) {
  nodeTest.test(`conformance retryWithBackoff: ${testCase.name}`, async () => {
    const subject = flaky(testCase.failures);
    // A case that differs between the languages gives the TypeScript delays apart.
    const expected = testCase.delaysByLanguage?.ts ?? testCase.delays ?? [];

    const { value, delays } = await withRecordedTimeouts(() =>
      resources.retryWithBackoff(subject.run, testCase.backoff),
    );

    assert.assertEquals(outcomeOf(value), testCase.want);
    assert.assertEquals(subject.state.calls, testCase.calls);
    assert.assertEquals([...delays], [...expected]);
  });
}

for (const testCase of cases.scope) {
  nodeTest.test(`conformance scope: ${testCase.name}`, async () => {
    const scope = resources.createScope();
    const order: string[] = [];

    for (const finalizer of testCase.finalizers) {
      scope.addFinalizer(() => {
        order.push(finalizer.name);

        if (finalizer.fails === true) {
          throw new Error("finalizer failed");
        }
      });
    }

    let closeFails = false;

    try {
      await scope.close();
    } catch {
      closeFails = true;
    }

    if (testCase.closeTwice === true) {
      // A second close does nothing and does not throw.
      await scope.close();
    }

    assert.assertEquals(closeFails, testCase.want.closeFails);
    assert.assertEquals(order, [...testCase.want.order]);

    if (testCase.addAfterClose === true) {
      let addFails = false;

      try {
        scope.addFinalizer(() => {});
      } catch {
        addFails = true;
      }

      assert.assertEquals(addFails, testCase.want.addAfterCloseFails);
    }
  });
}

for (const testCase of cases.bracket) {
  nodeTest.test(`conformance bracket: ${testCase.name}`, async () => {
    const events: string[] = [];

    const step = (
      name: string,
      mode: string,
      message: string,
      value: unknown,
    ): Promise<results.Result<unknown, Failure>> => {
      events.push(name);

      return Promise.resolve(
        mode === "fail"
          ? results.fail({ _tag: "ValidationError", message })
          : results.ok(value),
      );
    };

    const acquire = () =>
      step("acquire", testCase.acquire, "acquire failed", "resource");
    const use = () => step("use", testCase.use, "use failed", "used");

    const result =
      testCase.variant === "bracket"
        ? await resources.bracket(acquire, use, () => {
            events.push("release");
          })
        : await resources.bracketWithReleaseError(acquire, use, () =>
            step("release", testCase.release, "release failed", undefined).then(
              (released) =>
                results.isOk(released) ? results.ok(undefined) : released,
            ),
          );

    assert.assertEquals(outcomeOf(result), testCase.want.outcome);
    assert.assertEquals(events, [...testCase.want.events]);
  });
}

for (const testCase of cases.ensure) {
  nodeTest.test(`conformance ensure: ${testCase.name}`, async () => {
    const events: string[] = [];

    const result = await resources.ensure(
      () => {
        events.push("task");

        return resultOf(testCase.task);
      },
      () => {
        events.push("finalizer");
      },
    );

    assert.assertEquals(outcomeOf(result), testCase.want.outcome);
    assert.assertEquals(events, [...testCase.want.events]);
  });
}
