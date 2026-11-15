// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as fake from "./fake.ts";
import * as functions from "./functions.ts";

nodeTest.test("callFunction answers the output of a function", async () => {
  const seen: unknown[] = [];
  const lib = fake.createFakeLibrary({
    calls: {
      functionCall: (request) => {
        seen.push(request);

        return { output: `Hello, ${String(request.input)}` };
      },
    },
  });

  const outcome = await functions.callFunction(lib, {
    name: "greet",
    input: "Ada",
  });

  assert.assertEquals(outcome, { ok: true, output: "Hello, Ada" });
  assert.assertEquals(seen.length, 1);
  assert.assertEquals((seen[0] as { name: string }).name, "greet");
});

nodeTest.test("callFunction keeps a null output as an output", async () => {
  const lib = fake.createFakeLibrary({
    calls: { functionCall: () => ({ output: null }) },
  });

  assert.assertEquals(await functions.callFunction(lib, { name: "nothing" }), {
    ok: true,
    output: null,
  });
});

nodeTest.test("callFunction carries the kind of a Go error", async () => {
  const lib = fake.createFakeLibrary({
    calls: {
      functionCall: () => ({
        error: "Invalid email address",
        errorKind: "ValidationError",
      }),
    },
  });

  assert.assertEquals(
    await functions.callFunction(lib, { name: "require-email", input: "x" }),
    { ok: false, error: "Invalid email address", kind: "ValidationError" },
  );
});

nodeTest.test(
  "callFunction leaves the kind out of an error without one",
  async () => {
    const lib = fake.createFakeLibrary({
      calls: { functionCall: () => ({ error: "disk full" }) },
    });

    assert.assertEquals(await functions.callFunction(lib, { name: "save" }), {
      ok: false,
      error: "disk full",
    });
  },
);

nodeTest.test(
  "callFunction reports an unknown function as an outcome",
  async () => {
    const lib = fake.createFakeLibrary({
      calls: {
        functionCall: () => ({
          error: 'unknown function: "missing"',
          errorKind: "UnknownFunction",
        }),
      },
    });

    const outcome = await functions.callFunction(lib, { name: "missing" });

    assert.assertEquals(outcome.ok, false);
    assert.assertEquals(
      outcome.ok ? undefined : outcome.kind,
      "UnknownFunction",
    );
  },
);

nodeTest.test(
  "callFunction answers an AbortError outcome when the signal aborts",
  async () => {
    const lib = fake.createFakeLibrary({
      calls: { functionCall: () => new Promise(() => {}) },
    });
    const controller = new AbortController();

    const pending = functions.callFunction(lib, {
      name: "slow",
      signal: controller.signal,
    });
    controller.abort(new Error("caller gave up"));

    assert.assertEquals(await pending, {
      ok: false,
      error: "caller gave up",
      kind: "AbortError",
    });
  },
);

nodeTest.test(
  "callFunction answers an AbortError outcome for a signal that was aborted already",
  async () => {
    const lib = fake.createFakeLibrary({
      calls: { functionCall: () => ({ output: "never read" }) },
    });

    const outcome = await functions.callFunction(lib, {
      name: "slow",
      signal: AbortSignal.abort(new Error("already gone")),
    });

    assert.assertEquals(outcome.ok, false);
    assert.assertEquals(outcome.ok ? undefined : outcome.kind, "AbortError");
  },
);

nodeTest.test("listFunctions answers the descriptors", () => {
  const lib = fake.createFakeLibrary({
    calls: {
      functionList: () => ({
        functions: [
          { name: "a-first", wasm: true, triggers: ["cli"] },
          { name: "b-second", description: "the second", wasm: false },
        ],
      }),
    },
  });

  const listed = functions.listFunctions(lib);

  assert.assertEquals(
    listed.map((descriptor) => descriptor.name),
    ["a-first", "b-second"],
  );
});

nodeTest.test("listFunctions throws the error of the library", () => {
  const lib = fake.createFakeLibrary({
    calls: { functionList: () => ({ error: "registry broken" }) },
  });

  assert.assertThrows(
    () => functions.listFunctions(lib),
    Error,
    "registry broken",
  );
});

// --- streamFunction ---

type Chunk = { output?: unknown; error?: string; errorKind?: string };

// A fake library whose functionStream hands out the chunks in order, then null,
// and counts what happened to the stream.
const streamingLibrary = (
  chunks: readonly Chunk[],
  opened: object = { handle: "fnstream-1" },
) => {
  const seen = { opens: [] as unknown[], reads: 0, closes: 0 };

  const lib = fake.createFakeLibrary({
    streams: {
      functionStream: {
        open: (request) => {
          seen.opens.push(request);

          return opened;
        },
        read: () => {
          const chunk = chunks[seen.reads];
          seen.reads += 1;

          return chunk ?? null;
        },
        close: () => {
          seen.closes += 1;

          return {};
        },
      },
    },
  });

  return { lib, seen };
};

const collect = async (
  items: AsyncGenerator<functions.FunctionOutcome>,
): Promise<functions.FunctionOutcome[]> => {
  const collected: functions.FunctionOutcome[] = [];

  for await (const item of items) {
    collected.push(item);
  }

  return collected;
};

nodeTest.test(
  "streamFunction gives the items of a function as they arrive",
  async () => {
    const { lib, seen } = streamingLibrary([
      { output: 1 },
      { output: 2 },
      { output: 3 },
    ]);

    const items = await collect(
      functions.streamFunction(lib, { name: "count", input: { to: 3 } }),
    );

    assert.assertEquals(items, [
      { ok: true, output: 1 },
      { ok: true, output: 2 },
      { ok: true, output: 3 },
    ]);
    assert.assertEquals(seen.opens, [{ name: "count", input: { to: 3 } }]);
    assert.assertEquals(seen.closes, 1);
  },
);

nodeTest.test(
  "streamFunction makes a failure of the function the last item",
  async () => {
    const { lib } = streamingLibrary([
      { output: 1 },
      { error: "item failed", errorKind: "ValidationError" },
      { output: 99 },
    ]);

    assert.assertEquals(
      await collect(functions.streamFunction(lib, { name: "count" })),
      [
        { ok: true, output: 1 },
        { ok: false, error: "item failed", kind: "ValidationError" },
      ],
    );
  },
);

nodeTest.test(
  "streamFunction gives a failure to open as the only item",
  async () => {
    const { lib, seen } = streamingLibrary([], {
      handle: "",
      error: 'function "plain" does not stream',
      errorKind: "NotAStream",
    });

    assert.assertEquals(
      await collect(functions.streamFunction(lib, { name: "plain" })),
      [
        {
          ok: false,
          error: 'function "plain" does not stream',
          kind: "NotAStream",
        },
      ],
    );
    assert.assertEquals(seen.reads, 0);
  },
);

nodeTest.test(
  "streamFunction closes the stream when the loop stops early",
  async () => {
    const { lib, seen } = streamingLibrary([
      { output: 1 },
      { output: 2 },
      { output: 3 },
    ]);

    for await (const item of functions.streamFunction(lib, { name: "count" })) {
      assert.assertEquals(item, { ok: true, output: 1 });

      break;
    }

    assert.assertEquals(seen.reads, 1);
    assert.assertEquals(seen.closes, 1);
  },
);

nodeTest.test(
  "streamFunction ends with an AbortError when the signal already aborted",
  async () => {
    const { lib } = streamingLibrary([{ output: 1 }]);

    const items = await collect(
      functions.streamFunction(lib, {
        name: "count",
        signal: AbortSignal.abort(new Error("caller gave up")),
      }),
    );

    assert.assertEquals(items, [
      { ok: false, error: "caller gave up", kind: "AbortError" },
    ]);
  },
);
