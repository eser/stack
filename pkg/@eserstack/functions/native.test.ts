// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fs from "node:fs";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as functions from "./mod.ts";
import * as native from "./native.ts";
import * as handler from "./handler.ts";
import * as pipeline from "./pipeline.ts";
import * as task from "./task.ts";

const live = (): task.Cancellable => ({
  signal: new AbortController().signal,
});

// A Result is compared by what it holds: its objects are not plain data.
const okOf = <T, E>(
  result: results.Result<T, E>,
): { readonly ok: T } | { readonly error: E } =>
  results.isOk(result) ? { ok: result.value } : { error: result.error };

type Seen = { name: string; input: unknown; signal: AbortSignal };

const recording = (
  outcome: native.NativeOutcome,
): { caller: native.NativeCaller; seen: Seen[] } => {
  const seen: Seen[] = [];

  return {
    seen,
    caller: (call) => {
      seen.push({ name: call.name, input: call.input, signal: call.signal });

      return Promise.resolve(outcome);
    },
  };
};

// === Success ===

nodeTest.test("fromNative answers the output of the Go function", async () => {
  const { caller, seen } = recording({ ok: true, output: "Hello, Ada" });
  const greet = native.fromNative<string, string>(caller, "greet");
  const context = live();

  const result = await task.runTask(greet("Ada"), context);

  assert.assertEquals(okOf(result), { ok: "Hello, Ada" });
  assert.assertEquals(seen.length, 1);
  assert.assertEquals(seen[0]?.name, "greet");
  assert.assertEquals(seen[0]?.input, "Ada");
  assert.assertEquals(seen[0]?.signal, context.signal);
});

nodeTest.test("fromNative keeps a null output as an output", async () => {
  const { caller } = recording({ ok: true, output: null });
  const nothing = native.fromNative<string, null>(caller, "nothing");

  assert.assertEquals(okOf(await task.runTask(nothing("x"), live())), {
    ok: null,
  });
});

nodeTest.test(
  "fromNative is lazy: the caller runs when the task runs",
  async () => {
    const { caller, seen } = recording({ ok: true, output: 1 });
    const lazy = native.fromNative<string, number>(caller, "count")("x");

    assert.assertEquals(seen.length, 0);

    await task.runTask(lazy, live());

    assert.assertEquals(seen.length, 1);
  },
);

// === Failure kinds ===

const failureOf = async (
  outcome: native.NativeOutcome,
): Promise<native.NativeError> => {
  const { caller } = recording(outcome);
  const result = await task.runTask(
    native.fromNative<string, string>(caller, "any")("x"),
    live(),
  );

  if (results.isOk(result)) {
    throw new Error("expected a failure");
  }

  return result.error;
};

nodeTest.test(
  "fromNative maps the kinds of Go errors to the tags of TypeScript errors",
  async () => {
    const kinds = [
      "ValidationError",
      "AbortError",
      "AdaptError",
      "UnknownFunction",
    ];

    const errors = await Promise.all(
      kinds.map((kind) => failureOf({ ok: false, error: "went wrong", kind })),
    );

    assert.assertEquals(
      errors.map((error) => [error._tag, error.message]),
      kinds.map((kind) => [kind, "went wrong"]),
    );
  },
);

nodeTest.test("fromNative keeps a kind it has no type for", async () => {
  assert.assertEquals(
    await failureOf({ ok: false, error: "no such order", kind: "NotFound" }),
    { _tag: "NativeError", message: "no such order", kind: "NotFound" },
  );
});

nodeTest.test(
  "fromNative leaves the kind out of an error the function raised itself",
  async () => {
    assert.assertEquals(await failureOf({ ok: false, error: "disk full" }), {
      _tag: "NativeError",
      message: "disk full",
    });
  },
);

nodeTest.test(
  "fromNative answers an unknown function as a failure",
  async () => {
    const error = await failureOf({
      ok: false,
      error: 'unknown function: "missing"',
      kind: "UnknownFunction",
    });

    assert.assertEquals(error._tag, "UnknownFunction");
  },
);

nodeTest.test(
  "fromNative reports a caller that could not reach the library",
  async () => {
    const cause = new Error("eser-ajan library not found");
    const caller: native.NativeCaller = () => Promise.reject(cause);

    const result = await task.runTask(
      native.fromNative<string, string>(caller, "greet")("x"),
      live(),
    );

    assert.assertEquals(results.isFail(result) ? result.error : undefined, {
      _tag: "NativeError",
      message: "eser-ajan library not found",
      source: cause,
    });
  },
);

nodeTest.test("toNativeError covers every kind", () => {
  assert.assertEquals(native.toNativeError("ValidationError", "m"), {
    _tag: "ValidationError",
    message: "m",
  });
  assert.assertEquals(native.toNativeError(undefined, "m"), {
    _tag: "NativeError",
    message: "m",
  });
  assert.assertEquals(native.toNativeError("Other", "m"), {
    _tag: "NativeError",
    message: "m",
    kind: "Other",
  });
});

// === Cancellation ===

nodeTest.test(
  "fromNative fails with an AbortError without calling Go when the signal already aborted",
  async () => {
    const { caller, seen } = recording({ ok: true, output: "never" });

    const result = await task.runTask(
      native.fromNative<string, string>(caller, "greet")("x"),
      { signal: AbortSignal.abort() },
    );

    assert.assertEquals(
      results.isFail(result) ? result.error._tag : undefined,
      "AbortError",
    );
    assert.assertEquals(seen.length, 0);
  },
);

nodeTest.test(
  "fromNative hands the signal to the caller, which stops the Go function",
  async () => {
    const controller = new AbortController();
    let stopped = false;

    // Stands in for functionCaller(): it ends the Go call when the signal fires
    // and answers the AbortError outcome the real one answers.
    const caller: native.NativeCaller = (call) =>
      new Promise((resolve) => {
        call.signal.addEventListener(
          "abort",
          () => {
            stopped = true;
            resolve({ ok: false, error: "caller gave up", kind: "AbortError" });
          },
          { once: true },
        );
      });

    const pending = task.runTask(
      native.fromNative<string, string>(caller, "slow")("x"),
      { signal: controller.signal },
    );
    controller.abort(new Error("caller gave up"));

    const result = await pending;

    assert.assertEquals(stopped, true);
    assert.assertEquals(results.isFail(result) ? result.error : undefined, {
      _tag: "AbortError",
      message: "caller gave up",
    });
  },
);

nodeTest.test(
  "fromNative reports an abort when the caller rejects after the signal fired",
  async () => {
    const controller = new AbortController();
    const caller: native.NativeCaller = (call) =>
      new Promise((_resolve, reject) => {
        call.signal.addEventListener(
          "abort",
          () => reject(new Error("rejected by the library")),
          { once: true },
        );
      });

    const pending = task.runTask(
      native.fromNative<string, string>(caller, "slow")("x"),
      { signal: controller.signal },
    );
    controller.abort(new Error("stop now"));

    const result = await pending;

    assert.assertEquals(results.isFail(result) ? result.error : undefined, {
      _tag: "AbortError",
      message: "stop now",
    });
  },
);

// === Composition ===

nodeTest.test(
  "fromNative composes with task.flatMapW and widens the error",
  async () => {
    const { caller } = recording({ ok: true, output: "ada@example.com" });
    const requireEmail = native.fromNative<string, string>(
      caller,
      "require-email",
    );
    const shout = (email: string) =>
      task.task<string, { readonly _tag: "ShoutError" }, task.Cancellable>(() =>
        Promise.resolve(results.ok(email.toUpperCase())),
      );

    const both = task.flatMapW(requireEmail("ada@example.com"), shout);

    assert.assertEquals(okOf(await task.runTask(both, live())), {
      ok: "ADA@EXAMPLE.COM",
    });
  },
);

nodeTest.test("fromNative composes with handler.bind", async () => {
  const { caller, seen } = recording({ ok: true, output: "Hello, Ada" });
  const greet = native.fromNative<string, string>(caller, "greet");
  const fromCli = (event: functions.triggers.CliEvent) =>
    results.ok(event.args[0] ?? "world");

  const cliGreet = handler.bind(greet, fromCli);
  const result = await task.runTask(
    cliGreet({ command: "greet", args: ["Ada"], flags: {} }),
    live(),
  );

  assert.assertEquals(okOf(result), { ok: "Hello, Ada" });
  assert.assertEquals(seen[0]?.input, "Ada");
});

nodeTest.test("fromNative composes with handler.createTrigger", async () => {
  const { caller } = recording({
    ok: false,
    error: "Invalid email address",
    kind: "ValidationError",
  });

  const trigger = handler.createTrigger({
    handler: native.fromNative<string, string>(caller, "require-email"),
    adaptInput: (event: functions.triggers.CliEvent) =>
      results.ok(event.args[0] ?? ""),
    adaptOutput: (result) =>
      results.isOk(result)
        ? { exit: 0 }
        : { exit: 1, message: result.error.message },
  });

  assert.assertEquals(
    await trigger({ command: "signup", args: ["nope"], flags: {} }, live()),
    { exit: 1, message: "Invalid email address" },
  );
});

nodeTest.test("fromNative composes with collect", async () => {
  const outputs = new Map<string, string>([
    ["greet", "Hello, Ada"],
    ["farewell", "Bye, Ada"],
  ]);
  const caller: native.NativeCaller = (call) =>
    Promise.resolve({ ok: true, output: outputs.get(call.name) });

  const greet = native.fromNative<string, string>(caller, "greet");
  const farewell = native.fromNative<string, string>(caller, "farewell");

  const run = pipeline
    .collect<string, native.NativeError>()
    .use(async function* (ctx) {
      yield await task.runTask(greet("Ada"), live());
      yield* ctx.next();
    })
    .use(() => task.runTask(farewell("Ada"), live()));

  assert.assertEquals(okOf(await run.run()), {
    ok: ["Hello, Ada", "Bye, Ada"],
  });
});

nodeTest.test("fromNative composes with task.withAbort", async () => {
  const { caller } = recording({ ok: true, output: "Hello, Ada" });
  const guarded = task.withAbort(
    native.fromNative<string, string>(caller, "greet")("Ada"),
    1000,
  );

  assert.assertEquals(okOf(await task.runTask(guarded, live())), {
    ok: "Hello, Ada",
  });
});

// === The native library stays out ===

const here = import.meta.dirname ?? ".";

nodeTest.test(
  "the package exposes native through the root and a sub-path",
  () => {
    assert.assertEquals(typeof functions.native.fromNative, "function");

    const manifest = JSON.parse(
      fs.readFileSync(path.join(here, "package.json"), "utf8"),
    ) as { exports: Record<string, string> };

    assert.assertEquals(manifest.exports["./native"], "./native.ts");
  },
);

nodeTest.test(
  "native.ts imports no native library and the package gains no dependency",
  () => {
    const source = fs.readFileSync(path.join(here, "native.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(
      (match) => match[1],
    );

    assert.assertEquals(imports.toSorted(), [
      "./handler.ts",
      "./task.ts",
      "@eserstack/primitives/results",
    ]);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(here, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    assert.assertEquals(Object.keys(manifest.dependencies), [
      "@eserstack/primitives",
    ]);
  },
);

// === fromNativeStream ===

const streamOf = (
  outcomes: readonly native.NativeOutcome[],
): native.NativeStreamCaller =>
  async function* () {
    yield* outcomes;
  };

const collectItems = async <T, E>(
  items: AsyncGenerator<results.Result<T, E>>,
): Promise<Array<{ readonly ok: T } | { readonly error: E }>> => {
  const collected: Array<{ readonly ok: T } | { readonly error: E }> = [];

  for await (const item of items) {
    collected.push(okOf(item));
  }

  return collected;
};

nodeTest.test(
  "fromNativeStream gives the items of a Go function as results",
  async () => {
    const count = native.fromNativeStream<{ to: number }, number>(
      streamOf([
        { ok: true, output: 1 },
        { ok: true, output: 2 },
      ]),
      "count",
    );

    assert.assertEquals(await collectItems(count({ to: 2 }, live())), [
      { ok: 1 },
      { ok: 2 },
    ]);
  },
);

nodeTest.test(
  "fromNativeStream makes a failure of the function the last item, with its tag",
  async () => {
    const count = native.fromNativeStream<unknown, number>(
      streamOf([
        { ok: true, output: 1 },
        { ok: false, error: "item failed", kind: "ValidationError" },
      ]),
      "count",
    );

    assert.assertEquals(await collectItems(count({}, live())), [
      { ok: 1 },
      { error: { _tag: "ValidationError", message: "item failed" } },
    ]);
  },
);

nodeTest.test(
  "fromNativeStream hands the caller its name, input and signal",
  async () => {
    const seen: native.NativeCall[] = [];
    const caller: native.NativeStreamCaller = async function* (call) {
      seen.push(call);

      yield await Promise.resolve({ ok: true as const, output: "x" });
    };
    const context = live();

    await collectItems(
      native.fromNativeStream<string, string>(caller, "echo")("hi", context),
    );

    assert.assertEquals(seen.length, 1);
    assert.assertEquals(seen[0]?.name, "echo");
    assert.assertEquals(seen[0]?.input, "hi");
    assert.assertEquals(seen[0]?.signal, context.signal);
  },
);

nodeTest.test(
  "fromNativeStream gives one AbortError without calling Go when the signal already aborted",
  async () => {
    let called = false;
    const caller: native.NativeStreamCaller = async function* () {
      called = true;

      yield await Promise.resolve({ ok: true as const, output: 1 });
    };

    const items = await collectItems(
      native.fromNativeStream<unknown, number>(caller, "count")(
        {},
        { signal: AbortSignal.abort() },
      ),
    );

    assert.assertEquals(
      items.map((item) => ("error" in item ? item.error._tag : "ok")),
      ["AbortError"],
    );
    assert.assertEquals(called, false);
  },
);

nodeTest.test(
  "fromNativeStream reports a caller that breaks as a native failure, or an abort",
  async () => {
    const cause = new Error("eser-ajan library not found");
    const broken: native.NativeStreamCaller = async function* () {
      yield* [];

      throw await Promise.resolve(cause);
    };

    assert.assertEquals(
      await collectItems(
        native.fromNativeStream<unknown, number>(broken, "count")({}, live()),
      ),
      [
        {
          error: {
            _tag: "NativeError",
            message: "eser-ajan library not found",
            source: cause,
          },
        },
      ],
    );

    const controller = new AbortController();
    const aborting: native.NativeStreamCaller = async function* (call) {
      yield* [];

      controller.abort(new Error("stop now"));

      throw await Promise.resolve(new Error(`rejected: ${call.name}`));
    };

    assert.assertEquals(
      await collectItems(
        native.fromNativeStream<unknown, number>(aborting, "count")(
          {},
          { signal: controller.signal },
        ),
      ),
      [{ error: { _tag: "AbortError", message: "stop now" } }],
    );
  },
);

nodeTest.test(
  "fromNativeStream stops the Go function when the loop stops early",
  async () => {
    let stopped = false;
    const caller: native.NativeStreamCaller = async function* () {
      try {
        for (let value = 1; ; value += 1) {
          // An endless stream: each item is awaited as the loop asks for it.
          // oxlint-disable-next-line no-await-in-loop
          yield await Promise.resolve({ ok: true as const, output: value });
        }
      } finally {
        stopped = true;
      }
    };

    for await (const item of native.fromNativeStream<unknown, number>(
      caller,
      "forever",
    )({}, live())) {
      assert.assertEquals(okOf(item), { ok: 1 });

      break;
    }

    assert.assertEquals(stopped, true);
  },
);

nodeTest.test("fromNativeStream feeds a collect pipeline", async () => {
  const count = native.fromNativeStream<{ to: number }, number>(
    streamOf([
      { ok: true, output: 1 },
      { ok: true, output: 2 },
    ]),
    "count",
  );

  const chain = pipeline
    .collect<number, native.NativeError>()
    .use(async function* () {
      yield* count({ to: 2 }, live());
    });

  assert.assertEquals(okOf(await chain.run()), { ok: [1, 2] });
});

// --- Typed by the generated map ---

// The shape tsgen writes: one function that answers once, one that streams.
type Generated = {
  readonly "add-up": {
    readonly input: { readonly numbers: readonly number[] };
    readonly output: { readonly total: number };
  };
  readonly "count-to": {
    readonly input: { readonly to: number };
    readonly output: number;
    readonly stream: true;
  };
};

nodeTest.test(
  "fromNativeOf reads the input and output from the map",
  async () => {
    const { caller, seen } = recording({ ok: true, output: { total: 6 } });

    const addUp = native.fromNativeOf<Generated>(caller)("add-up");
    const result = await task.runTask(addUp({ numbers: [1, 2, 3] }), live());

    assert.assertEquals(okOf(result), { ok: { total: 6 } });
    assert.assertEquals(seen[0]?.name, "add-up");
    assert.assertEquals(seen[0]?.input, { numbers: [1, 2, 3] });

    // The output is typed: this line fails to compile if it is not a number.
    const total: number | undefined = results.isOk(result)
      ? result.value.total
      : undefined;

    assert.assertEquals(total, 6);
  },
);

nodeTest.test("fromNativeOf refuses what the map does not allow", () => {
  const { caller } = recording({ ok: true, output: null });
  const of = native.fromNativeOf<Generated>(caller);

  // A name the map lacks.
  // @ts-expect-error "missing" is not a function of Generated
  of("missing");

  // A function that streams is opened with fromNativeStreamOf.
  // @ts-expect-error "count-to" streams
  of("count-to");

  // An input of the wrong shape.
  // @ts-expect-error numbers is a list of numbers
  of("add-up")({ numbers: "1,2,3" });

  assert.assertEquals(typeof of("add-up"), "function");
});

nodeTest.test(
  "fromNativeStreamOf reads the item type from the map",
  async () => {
    const caller: native.NativeStreamCaller = async function* (call) {
      const to = (call.input as { to: number }).to;

      for (let index = 1; index <= to; index += 1) {
        yield { ok: true, output: index };
      }
    };

    const countTo = native.fromNativeStreamOf<Generated>(caller)("count-to");
    const items: number[] = [];

    for await (const item of countTo({ to: 3 }, live())) {
      if (results.isOk(item)) {
        // Each item is a number, by the map.
        items.push(item.value);
      }
    }

    assert.assertEquals(items, [1, 2, 3]);

    const of = native.fromNativeStreamOf<Generated>(caller);

    // @ts-expect-error "add-up" answers once
    of("add-up");
    // @ts-expect-error "missing" is not a function of Generated
    of("missing");
  },
);
