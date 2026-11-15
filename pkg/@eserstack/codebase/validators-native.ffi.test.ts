// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A validator runs from TypeScript as a native function and gives the result
 * the Go workflow engine gives (ADR 0011, TASK-395).
 *
 * The validators of `pkg/ajan/codebasefx/validatortools` are registered as
 * functions on the bridge. `functions.native.fromNativeOf` turns one into a
 * `Handler` whose input and output come from the generated `NativeFunctions`, with `callFunction` of `@eserstack/ajan/ffi/functions` as its
 * port, and the workflow engine runs the same tool through `workflowRun`. Both
 * read the same tree, so their issues must be the same.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffi from "@eserstack/ajan/ffi";
import * as nativeFunctions from "@eserstack/ajan/ffi/functions";
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";
import type * as validators from "./native-functions.ts";

type Issue = {
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
};

type ToolOutput = {
  readonly passed: boolean;
  readonly issues?: readonly Issue[];
  readonly stats?: Record<string, unknown>;
};

type WorkflowAnswer = {
  readonly error?: string;
  readonly results?: ReadonlyArray<{
    readonly steps: ReadonlyArray<ToolOutput & { readonly name: string }>;
  }>;
};

let library: ffi.FFILibrary | undefined;

nodeTest.before(async () => {
  library = await ffi.loadEserAjan({ wasm: false });
});

nodeTest.after(() => {
  library?.close();
});

const lib = (): ffi.FFILibrary => {
  if (library === undefined) {
    throw new Error("the native library did not load");
  }

  return library;
};

// The port of fromNative, as an application writes it with the loaded library.
// That this assigns is the check that FunctionCaller of @eserstack/ajan and
// NativeCaller of @eserstack/functions have the same shape.
const caller: functions.native.NativeCaller = (call) =>
  nativeFunctions.callFunction(lib(), call);

const live = (): functions.task.Cancellable => ({
  signal: new AbortController().signal,
});

const withTree = async (
  files: Readonly<Record<string, string>>,
  body: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "validators-native-" });

  try {
    for (const [name, content] of Object.entries(files)) {
      // Files are written one after another into the same tree.
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.writeTextFile(runtime.path.join(root, name), content);
    }

    await body(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

const MANIFEST = [
  "workflows:",
  "  - id: check",
  "    on: [check]",
  "    steps:",
  "      - validate-eof",
  "",
].join("\n");

nodeTest.test("the bridge lists the validators with their schemas", () => {
  const answer = lib().call("functionList");
  const descriptors = nativeFunctions.listFunctions(lib());

  assert.assertEquals(answer.error, undefined);

  const eof = descriptors.find(
    (descriptor) => descriptor.name === "validate-eof",
  );

  assert.assertEquals(eof?.wasm, false);
  assert.assertEquals(eof?.triggers, ["workflow"]);
  assert.assertEquals(
    (eof?.inputSchema as { type?: string } | undefined)?.type,
    "object",
  );
  assert.assertEquals(
    (eof?.outputSchema as { type?: string } | undefined)?.type,
    "object",
  );
});

nodeTest.test(
  "a validator called with fromNative gives the issues of the Go engine",
  async () => {
    await withTree(
      { "a.txt": "no newline at the end", "b.txt": "fine\n" },
      async (root) => {
        const validateEof =
          functions.native.fromNativeOf<validators.NativeFunctions>(caller)(
            "validate-eof",
          );

        const result = await functions.task.runTask(
          validateEof({ root }),
          live(),
        );

        assert.assertEquals(results.isOk(result), true);

        const fromFunction = results.isOk(result) ? result.value : undefined;

        const run = (await lib().call("workflowRun", {
          manifest: MANIFEST,
          event: "check",
          root,
        })) as WorkflowAnswer;

        assert.assertEquals(run.error, undefined);

        const fromEngine = run.results?.[0]?.steps[0];

        assert.assertEquals(fromFunction?.passed, false);
        assert.assertEquals(fromFunction?.passed, fromEngine?.passed);
        assert.assertEquals(fromFunction?.issues?.length, 1);
        assert.assertEquals(
          fromFunction?.issues?.map((issue) => issue.message),
          fromEngine?.issues?.map((issue) => issue.message),
        );
        assert.assertEquals(
          fromFunction?.stats?.["filesChecked"],
          fromEngine?.stats?.["filesChecked"],
        );
        assert.assertEquals(
          fromFunction?.issues?.[0]?.message.endsWith(
            "a.txt: file does not end with a newline",
          ),
          true,
        );
      },
    );
  },
);

nodeTest.test("a validator that finds nothing passes", async () => {
  await withTree({ "ok.txt": "fine\n" }, async (root) => {
    const validateEof =
      functions.native.fromNativeOf<validators.NativeFunctions>(caller)(
        "validate-eof",
      );

    const result = await functions.task.runTask(validateEof({ root }), live());

    assert.assertEquals(
      results.isOk(result) ? result.value.passed : undefined,
      true,
    );
  });
});

nodeTest.test(
  "an input the schema refuses fails with a ValidationError",
  async () => {
    const validateLargeFiles =
      functions.native.fromNativeOf<validators.NativeFunctions>(caller)(
        "validate-large-files",
      );

    // The generated type says maxKb is a number, so a caller of the types cannot
    // write this. The cast reaches the check the schema still makes at run
    // time, for a caller without the types.
    const result = await functions.task.runTask(
      validateLargeFiles({
        maxKb: "big",
      } as unknown as validators.ValidateLargeFilesInput),
      live(),
    );

    assert.assertEquals(
      results.isFail(result) ? result.error._tag : undefined,
      "ValidationError",
    );
  },
);

nodeTest.test(
  "a name the library does not serve fails with an UnknownFunction",
  async () => {
    const missing = functions.native.fromNative<
      null,
      validators.ValidateEofOutput
    >(caller, "validate-nothing-of-the-kind");

    const result = await functions.task.runTask(missing(null), live());

    assert.assertEquals(
      results.isFail(result) ? result.error._tag : undefined,
      "UnknownFunction",
    );
  },
);

// The port of fromNativeStream, as an application writes it. That this assigns
// is the check that FunctionStreamCaller of @eserstack/ajan and
// NativeStreamCaller of @eserstack/functions have the same shape.
const streamCaller: functions.native.NativeStreamCaller = (call) =>
  nativeFunctions.streamFunction(lib(), call);

const firstOf = async <T, E>(
  items: AsyncGenerator<results.Result<T, E>>,
): Promise<results.Result<T, E> | undefined> => {
  for await (const item of items) {
    return item;
  }

  return undefined;
};

nodeTest.test(
  "the only function the bridge lists as a stream is workflow-steps",
  () => {
    const streaming = nativeFunctions
      .listFunctions(lib())
      .filter((descriptor) => descriptor.stream === true)
      .map((descriptor) => descriptor.name);

    // The validators answer once. workflow-steps is the first stream
    // (workflows-native.ffi.test.ts reads it end to end).
    assert.assertEquals(streaming, ["workflow-steps"]);
  },
);

nodeTest.test(
  "fromNativeStream on a function that does not stream fails with the kind the bridge gives",
  async () => {
    const validateEof = functions.native.fromNativeStream<
      validators.ValidateEofInput,
      validators.ValidateEofOutput
    >(streamCaller, "validate-eof");

    const first = await firstOf(validateEof({}, live()));

    assert.assertEquals(
      first !== undefined && results.isFail(first)
        ? first.error.message.includes("does not stream")
        : undefined,
      true,
    );
  },
);

nodeTest.test(
  "fromNativeStream on a name the library does not serve fails with an UnknownFunction",
  async () => {
    const missing = functions.native.fromNativeStream<null, unknown>(
      streamCaller,
      "no-such-stream",
    );

    const first = await firstOf(missing(null, live()));

    assert.assertEquals(
      first !== undefined && results.isFail(first)
        ? first.error._tag
        : undefined,
      "UnknownFunction",
    );
  },
);
