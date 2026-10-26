// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The test doubles the repository's tests use, in one place (decision-3).
 * Tests import this module instead of `node:test`'s `mock`.
 *
 * Each export keeps the name and the shape of the `@std/testing/mock` export
 * the tests used before, and runs on `node:test`: `spy` records calls with
 * `mock.fn`, `stub` replaces a method with `mock.method`, and `assertSpyCalls`
 * reads the mock's `callCount()`. A spy or stub is a wrapper around the
 * `node:test` mock that adds the `calls`, `original`, `restored` and
 * `restore()` members of `@std/testing/mock`, and `Symbol.dispose`, so
 * `using` restores a stub at the end of its block.
 *
 * @example
 * ```typescript
 * import * as mock from "@eserstack/test-kit/mock";
 *
 * const onSave = mock.spy((value: number) => value * 2);
 * onSave(21);
 * mock.assertSpyCalls(onSave, 1);
 * ```
 *
 * @module
 */

import * as nodeAssert from "node:assert/strict";
import * as nodeTest from "node:test";

/** One recorded call of a spy. */
export type SpyCall<
  Self = unknown,
  Args extends unknown[] = unknown[],
  Return = unknown,
> = {
  /** The arguments of the call. */
  args: Args;
  /** The value the call returned, when it did not throw. */
  returned?: Return;
  /** The error the call threw. */
  error?: Error;
  /** The `this` of the call, when it had one. */
  self?: Self;
};

/** A function that records its calls. */
export type Spy<
  Self = unknown,
  Args extends unknown[] = unknown[],
  Return = unknown,
> = {
  (this: Self, ...args: Args): Return;
  /** The function the spy wraps, or the method a stub replaced. */
  readonly original: (this: Self, ...args: Args) => Return;
  /** The calls so far, oldest first. */
  readonly calls: SpyCall<Self, Args, Return>[];
  /** Whether `restore()` has run. */
  readonly restored: boolean;
  /** Puts the original method back; a spy of a plain function has none. */
  restore(): void;
  [Symbol.dispose](): void;
};

/** A spy that replaced a method of an object until it is restored. */
export type Stub<
  Self = unknown,
  Args extends unknown[] = unknown[],
  Return = unknown,
> = Spy<Self, Args, Return> & {
  /** The function that runs in place of the method. */
  readonly fake: (this: Self, ...args: Args) => Return;
};

type NodeMock = ReturnType<typeof nodeTest.mock.fn>;

/** The `node:test` mock behind each spy, read by `assertSpyCalls`. */
const trackers = new WeakMap<object, NodeMock>();

const toSpyCall = <Self, Args extends unknown[], Return>(call: {
  readonly arguments: unknown[];
  readonly error: unknown;
  readonly result: unknown;
  readonly this: unknown;
}): SpyCall<Self, Args, Return> => {
  const recorded: SpyCall<Self, Args, Return> = {
    args: call.arguments as Args,
  };

  if (call.this !== undefined && call.this !== null) {
    recorded.self = call.this as Self;
  }

  if (call.error !== undefined) {
    recorded.error = call.error as Error;
  } else {
    recorded.returned = call.result as Return;
  }

  return recorded;
};

const wrap = <Self, Args extends unknown[], Return>(
  tracked: NodeMock,
  original: (this: Self, ...args: Args) => Return,
  restoreOriginal: (() => void) | null,
): Spy<Self, Args, Return> => {
  let restored = false;
  const restore = (): void => {
    if (restoreOriginal === null) {
      throw new Error("Cannot restore: the spy wraps a plain function");
    }

    if (restored) {
      throw new Error("Cannot restore: the stub is already restored");
    }

    restoreOriginal();
    restored = true;
  };

  const spyFn = function (this: Self, ...args: Args): Return {
    return Reflect.apply(tracked, this, args) as Return;
  };

  Object.defineProperties(spyFn, {
    original: { enumerable: true, value: original },
    calls: {
      enumerable: true,
      get: (): SpyCall<Self, Args, Return>[] =>
        tracked.mock.calls.map((call) => toSpyCall<Self, Args, Return>(call)),
    },
    restored: { enumerable: true, get: (): boolean => restored },
    restore: { enumerable: true, value: restore },
    [Symbol.dispose]: { value: restore },
  });
  trackers.set(spyFn, tracked);

  return spyFn as Spy<Self, Args, Return>;
};

/**
 * Creates a spy that records its calls and returns `undefined`.
 *
 * @returns The spy
 */
export function spy<
  Self = unknown,
  Args extends unknown[] = unknown[],
  Return = undefined,
>(): Spy<Self, Args, Return>;
/**
 * Creates a spy that records its calls and runs `func`.
 *
 * @param func - The function each call runs
 * @returns The spy
 */
export function spy<Self, Args extends unknown[], Return>(
  func: (this: Self, ...args: Args) => Return,
): Spy<Self, Args, Return>;
export function spy<Self, Args extends unknown[], Return>(
  func?: (this: Self, ...args: Args) => Return,
): Spy<Self, Args, Return> {
  const original =
    func ??
    ((() => undefined) as unknown as (this: Self, ...args: Args) => Return);

  return wrap(nodeTest.mock.fn(original), original, null);
}

/** The parameters of the method `Prop` of `Self`. */
export type GetParametersFromProp<
  Self,
  Prop extends keyof Self,
> = Self[Prop] extends (...args: infer Args) => unknown ? Args : unknown[];

/** The return type of the method `Prop` of `Self`. */
export type GetReturnFromProp<
  Self,
  Prop extends keyof Self,
> = Self[Prop] extends (...args: never) => infer Return ? Return : unknown;

/**
 * Replaces the method `property` of `self` with `func`, or with a function
 * that returns `undefined`, until the stub is restored. `node:test` can only
 * replace a property that holds a function.
 *
 * @param self - The object that owns the method
 * @param property - The method to replace
 * @param func - The function that runs in its place
 * @returns The stub; `restore()` or `using` puts the method back
 */
export function stub<Self, Prop extends keyof Self>(
  self: Self,
  property: Prop,
  func?: (
    this: Self,
    ...args: GetParametersFromProp<Self, Prop>
  ) => GetReturnFromProp<Self, Prop>,
): Stub<
  Self,
  GetParametersFromProp<Self, Prop>,
  GetReturnFromProp<Self, Prop>
> {
  type Args = GetParametersFromProp<Self, Prop>;
  type Return = GetReturnFromProp<Self, Prop>;
  type Method = (this: Self, ...args: Args) => Return;

  const target = self as Record<PropertyKey, Method>;
  const name = property as PropertyKey;
  const original = target[name] as Method;
  const fake = func ?? ((() => undefined) as unknown as Method);
  const tracked = nodeTest.mock.method(target, name, fake);
  const wrapped = wrap<Self, Args, Return>(tracked, original, () =>
    tracked.mock.restore(),
  );

  Object.defineProperty(wrapped, "fake", { enumerable: true, value: fake });

  return wrapped as Stub<Self, Args, Return>;
}

/**
 * Fails unless the spy was called exactly `expectedCalls` times.
 *
 * @param spyFn - The spy or stub to check
 * @param expectedCalls - The number of calls it must have recorded
 */
export function assertSpyCalls<Self, Args extends unknown[], Return>(
  spyFn: Spy<Self, Args, Return>,
  expectedCalls: number,
): void {
  const actualCalls =
    trackers.get(spyFn)?.mock.callCount() ?? spyFn.calls.length;

  if (actualCalls === expectedCalls) {
    return;
  }

  throw new nodeAssert.AssertionError({
    message: `${
      actualCalls < expectedCalls
        ? "Spy not called as much as expected"
        : "Spy called more than expected"
    }: expected ${expectedCalls} calls, got ${actualCalls}`,
    actual: actualCalls,
    expected: expectedCalls,
    operator: "assertSpyCalls",
  });
}
