// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Functions that run in Go, called from TypeScript (ADR 0011).
 *
 * `fromNative` turns a function registered in `pkg/ajan/functionsfx` into a
 * `Handler`, so it composes like any handler: with `flatMapW`, with `bind` and
 * with `collect`. The call itself goes through a {@link NativeCaller}, a port
 * this package defines and does not implement. `@eserstack/ajan/ffi/functions`
 * implements it on the bridge (`functionCaller()`), and a test passes a fake.
 * This module therefore imports no native library, and a package that never
 * calls `fromNative` loads none.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * // In an application: import { functionCaller } from "@eserstack/ajan/ffi/functions";
 * const caller: functions.native.NativeCaller = (call) =>
 *   Promise.resolve({ ok: true, output: `Hello, ${String(call.input)}` });
 *
 * const greet = functions.native.fromNative<string, string>(caller, "greet");
 * const result = await functions.task.runTask(greet("Ada"), {
 *   signal: new AbortController().signal,
 * });
 * ```
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as handler from "./handler.ts";
import * as task from "./task.ts";

// --- The port ---

/** One call of a native function. */
export type NativeCall = {
  /** The registered name of the function. */
  readonly name: string;
  /** The JSON-compatible input. */
  readonly input: unknown;
  /** Stops the Go function through its context when it aborts. */
  readonly signal: AbortSignal;
};

/**
 * What a call comes to: the output, or an error. `kind` is the kind of the Go
 * error: `ValidationError`, `AbortError`, `AdaptError`, one of the bridge's
 * `UnknownFunction`, `NotAStream`, `StreamOnly` and `TooManyStreams`, a code
 * another Go package defined, or absent for an error the function raised
 * itself.
 */
export type NativeOutcome =
  | { readonly ok: true; readonly output: unknown }
  | { readonly ok: false; readonly error: string; readonly kind?: string };

/**
 * Calls a native function. It rejects only when no function ran: the library
 * could not load, or the dispatcher refused the request. A function that ran
 * and failed answers an outcome with `ok: false`.
 *
 * `functionCaller()` of `@eserstack/ajan/ffi/functions` is one.
 */
export type NativeCaller = (call: NativeCall) => Promise<NativeOutcome>;

/**
 * Opens a native function that streams and gives its outcomes as they arrive:
 * `ok: true` for an item, and, if the function fails, one last outcome with
 * `ok: false`. It rejects only when no function ran, like {@link NativeCaller}.
 *
 * `functionStreamCaller()` of `@eserstack/ajan/ffi/functions` is one. A loop that
 * stops early stops the Go function.
 */
export type NativeStreamCaller = (
  call: NativeCall,
) => AsyncIterable<NativeOutcome>;

// --- Errors ---

/** The named function is not registered in the native library. */
export type UnknownFunctionError = {
  readonly _tag: "UnknownFunction";
  readonly message: string;
};

/**
 * Any other native failure: an error the function raised itself, an error kind
 * this package has no type for (`kind` keeps it), or a call that could not
 * reach the library (`source` keeps the cause).
 */
export type NativeFailure = {
  readonly _tag: "NativeError";
  readonly message: string;
  readonly kind?: string;
  readonly source?: unknown;
};

/**
 * The errors of a native function. The first three are the types of the same
 * names in `task` and `handler`, so code that matches on `_tag` handles a
 * native function like a TypeScript one.
 */
export type NativeError =
  | task.ValidationError
  | task.AbortError
  | handler.AdaptError
  | UnknownFunctionError
  | NativeFailure;

/**
 * Maps the kind and message of a Go error to a {@link NativeError}.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * const error = functions.native.toNativeError("ValidationError", "Bad input");
 * // { _tag: "ValidationError", message: "Bad input" }
 * ```
 */
export const toNativeError = (
  kind: string | undefined,
  message: string,
): NativeError => {
  switch (kind) {
    case "ValidationError":
      return { _tag: "ValidationError", message };
    case "AbortError":
      return { _tag: "AbortError", message };
    case "AdaptError":
      return { _tag: "AdaptError", message };
    case "UnknownFunction":
      return { _tag: "UnknownFunction", message };
    case undefined:
      return { _tag: "NativeError", message };
    default:
      return { _tag: "NativeError", message, kind };
  }
};

// --- Constructor ---

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Turn a function registered in Go into a `Handler`.
 *
 * The handler needs a `Cancellable` context: its `signal` ends the Go function
 * through its context, and a signal that already aborted fails with an
 * `AbortError` without calling Go. The output is not checked: its type `O` is
 * what the caller says, and it comes from the types generated for the Go
 * function.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * const caller: functions.native.NativeCaller = () =>
 *   Promise.resolve({
 *     ok: false,
 *     error: "Invalid email address",
 *     kind: "ValidationError",
 *   });
 *
 * const requireEmail = functions.native.fromNative<string, string>(
 *   caller,
 *   "require-email",
 * );
 * const result = await functions.task.runTask(requireEmail("nope"), {
 *   signal: new AbortController().signal,
 * });
 * // fail({ _tag: "ValidationError", message: "Invalid email address" })
 * ```
 *
 * @param caller - The port that reaches the native library
 * @param name - The registered name of the Go function
 */
export const fromNative =
  <I, O>(
    caller: NativeCaller,
    name: string,
  ): handler.Handler<I, O, NativeError, task.Cancellable> =>
  (input) =>
    task.task<O, NativeError, task.Cancellable>(async ({ signal }) => {
      if (signal.aborted) {
        return results.fail<NativeError>({
          _tag: "AbortError",
          message: "Operation was already aborted",
        });
      }

      let outcome: NativeOutcome;

      try {
        outcome = await caller({ name, input, signal });
      } catch (cause: unknown) {
        // A rejection means no function ran. An abort is reported as one, a
        // library that cannot load as a native failure.
        if (signal.aborted) {
          return results.fail<NativeError>({
            _tag: "AbortError",
            message: causeMessage(signal.reason),
          });
        }

        return results.fail<NativeError>({
          _tag: "NativeError",
          message: causeMessage(cause),
          source: cause,
        });
      }

      return outcome.ok
        ? results.ok(outcome.output as O)
        : results.fail(toNativeError(outcome.kind, outcome.error));
    });

/**
 * Turn a function registered in Go that streams into a function of its input
 * that gives its items as `Result`s, as they arrive.
 *
 * What it gives is what a `collect` middleware yields, so a native stream feeds
 * a pipeline with `yield*`. The context carries the `signal` that stops the Go
 * function, like {@link fromNative}'s: a signal that already aborted gives one
 * `AbortError` without calling Go, and a loop that stops early stops the Go
 * function. A failure of the function is the last item.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * const caller: functions.native.NativeStreamCaller = async function* () {
 *   yield { ok: true, output: 1 };
 *   yield { ok: true, output: 2 };
 * };
 *
 * const countUp = functions.native.fromNativeStream<{ to: number }, number>(
 *   caller,
 *   "count",
 * );
 *
 * const pipeline = functions
 *   .collect<number, functions.native.NativeError>()
 *   .use(async function* () {
 *     yield* countUp({ to: 2 }, { signal: new AbortController().signal });
 *   });
 *
 * const result = await pipeline.run();
 * // ok([1, 2])
 * ```
 *
 * @param caller - The port that reaches the native library
 * @param name - The registered name of the Go function
 */
export const fromNativeStream = <I, O>(
  caller: NativeStreamCaller,
  name: string,
) =>
  async function* (
    input: I,
    { signal }: task.Cancellable,
  ): AsyncGenerator<results.Result<O, NativeError>> {
    if (signal.aborted) {
      yield results.fail<NativeError>({
        _tag: "AbortError",
        message: "Operation was already aborted",
      });

      return;
    }

    try {
      for await (const outcome of caller({ name, input, signal })) {
        yield outcome.ok
          ? results.ok(outcome.output as O)
          : results.fail(toNativeError(outcome.kind, outcome.error));
      }
    } catch (cause: unknown) {
      // A rejection means no function ran, or the stream broke: an abort is
      // reported as one, anything else as a native failure.
      yield signal.aborted
        ? results.fail<NativeError>({
            _tag: "AbortError",
            message: causeMessage(signal.reason),
          })
        : results.fail<NativeError>({
            _tag: "NativeError",
            message: causeMessage(cause),
            source: cause,
          });
    }
  };

// --- Typed by the generated map ---

/**
 * The shape of the `NativeFunctions` map that `eser codebase native-types`
 * generates into the package that owns the functions: a name for each function,
 * with its `input` and `output`, and `stream: true` for one that streams.
 */
export type NativeFunctionMap = {
  readonly [name: string]: {
    readonly input: unknown;
    readonly output: unknown;
    readonly stream?: true;
  };
};

/** The names in the map of the functions that answer once. */
export type NativeCallNames<M extends NativeFunctionMap> = {
  [K in keyof M & string]: M[K] extends { readonly stream: true } ? never : K;
}[keyof M & string];

/** The names in the map of the functions that stream. */
export type NativeStreamNames<M extends NativeFunctionMap> = {
  [K in keyof M & string]: M[K] extends { readonly stream: true } ? K : never;
}[keyof M & string];

/**
 * {@link fromNative} with its input and output read from the generated map, so
 * a call is checked against the Go function: a name the map lacks, a name of a
 * function that streams, and an input of the wrong shape fail to compile.
 *
 * The map comes first because a type argument cannot be given in part:
 * `fromNativeOf<NativeFunctions>(caller)` fixes it, and the name that follows is
 * checked and inferred.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * // Generated into the package that owns the functions.
 * type NativeFunctions = {
 *   readonly greet: { readonly input: string; readonly output: string };
 * };
 *
 * const caller: functions.native.NativeCaller = (call) =>
 *   Promise.resolve({ ok: true, output: `Hello, ${String(call.input)}` });
 *
 * const greet = functions.native.fromNativeOf<NativeFunctions>(caller)("greet");
 * const result = await functions.task.runTask(greet("Ada"), {
 *   signal: new AbortController().signal,
 * });
 * // ok("Hello, Ada")
 * ```
 *
 * @param caller - The port that reaches the native library
 */
export const fromNativeOf =
  <M extends NativeFunctionMap>(caller: NativeCaller) =>
  <N extends NativeCallNames<M>>(
    name: N,
  ): handler.Handler<
    M[N]["input"],
    M[N]["output"],
    NativeError,
    task.Cancellable
  > =>
    fromNative<M[N]["input"], M[N]["output"]>(caller, name);

/**
 * {@link fromNativeStream} with its input and item type read from the generated
 * map. Only the names of functions that stream are accepted.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 *
 * type NativeFunctions = {
 *   readonly count: {
 *     readonly input: { readonly to: number };
 *     readonly output: number;
 *     readonly stream: true;
 *   };
 * };
 *
 * const caller: functions.native.NativeStreamCaller = async function* () {
 *   yield { ok: true, output: 1 };
 * };
 *
 * const count =
 *   functions.native.fromNativeStreamOf<NativeFunctions>(caller)("count");
 * ```
 *
 * @param caller - The port that reaches the native library
 */
export const fromNativeStreamOf =
  <M extends NativeFunctionMap>(caller: NativeStreamCaller) =>
  <N extends NativeStreamNames<M>>(
    name: N,
  ): ((
    input: M[N]["input"],
    context: task.Cancellable,
  ) => AsyncGenerator<results.Result<M[N]["output"], NativeError>>) =>
    fromNativeStream<M[N]["input"], M[N]["output"]>(caller, name);
