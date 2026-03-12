// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eser/primitives/results";

/**
 * Resource management utilities for safe acquire-use-release patterns.
 */

// Types
export type Finalizer = () => Promise<void> | void;

export type Scope = {
  readonly addFinalizer: (finalizer: Finalizer) => void;
  readonly close: () => Promise<void>;
  readonly use: <T, E>(
    fn: () => Promise<results.Result<T, E>>,
  ) => Promise<results.Result<T, E>>;
};

/**
 * Bracket pattern: acquire -> use -> release
 * Release is guaranteed to run even if use throws.
 */
export const bracket = async <R, T, E>(
  acquire: () => Promise<results.Result<R, E>> | results.Result<R, E>,
  use: (resource: R) => Promise<results.Result<T, E>> | results.Result<T, E>,
  release: (resource: R) => Promise<void> | void,
): Promise<results.Result<T, E>> => {
  const acquired = await acquire();
  if (!results.isOk(acquired)) return acquired;

  try {
    return await use(acquired.value);
  } finally {
    await release(acquired.value);
  }
};

/**
 * Using pattern: simplified bracket for sync release.
 */
export const using = <R, T, E>(
  acquire: () => Promise<results.Result<R, E>> | results.Result<R, E>,
  use: (resource: R) => Promise<results.Result<T, E>> | results.Result<T, E>,
  release: (resource: R) => void,
): Promise<results.Result<T, E>> => bracket(acquire, use, release);

/**
 * Bracket with error capture in release.
 * If release fails, the error is captured and can be handled.
 */
export const bracketWithReleaseError = async <R, T, E>(
  acquire: () => Promise<results.Result<R, E>> | results.Result<R, E>,
  use: (resource: R) => Promise<results.Result<T, E>> | results.Result<T, E>,
  release: (
    resource: R,
  ) => Promise<results.Result<void, E>> | results.Result<void, E>,
): Promise<results.Result<T, E>> => {
  const acquired = await acquire();
  if (!results.isOk(acquired)) return acquired;

  let useResult: results.Result<T, E>;
  try {
    useResult = await use(acquired.value);
  } catch (error) {
    await release(acquired.value);
    throw error;
  }

  const releaseResult = await release(acquired.value);
  if (!results.isOk(releaseResult)) {
    return releaseResult as unknown as results.Result<T, E>;
  }

  return useResult;
};

/**
 * Create a scope for managing multiple resources.
 * Finalizers execute in reverse order (LIFO).
 */
export const createScope = (): Scope => {
  const finalizers: Finalizer[] = [];
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;

    const errors: unknown[] = [];
    for (const finalizer of finalizers.reverse()) {
      try {
        await finalizer();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Scope close encountered errors");
    }
  };

  return {
    addFinalizer: (finalizer: Finalizer) => {
      if (closed) {
        throw new Error("Cannot add finalizer to closed scope");
      }
      finalizers.push(finalizer);
    },

    close,

    use: async <T, E>(
      fn: () => Promise<results.Result<T, E>>,
    ): Promise<results.Result<T, E>> => {
      try {
        return await fn();
      } finally {
        await close();
      }
    },
  };
};

/**
 * Run a function within a scope, automatically closing when done.
 */
export const scoped = async <T, E>(
  fn: (scope: Scope) => Promise<results.Result<T, E>>,
): Promise<results.Result<T, E>> => {
  const scope = createScope();
  try {
    return await fn(scope);
  } finally {
    await scope.close();
  }
};

/**
 * Acquire a resource and register its release with a scope.
 */
export const acquireRelease = async <R, E>(
  scope: Scope,
  acquire: () => Promise<results.Result<R, E>> | results.Result<R, E>,
  release: (resource: R) => Promise<void> | void,
): Promise<results.Result<R, E>> => {
  const acquired = await acquire();
  if (results.isOk(acquired)) {
    scope.addFinalizer(() => release(acquired.value));
  }
  return acquired;
};

/**
 * Ensure a finalizer runs regardless of success or failure.
 */
export const ensure = async <T, E>(
  fn: () => Promise<results.Result<T, E>> | results.Result<T, E>,
  finalizer: Finalizer,
): Promise<results.Result<T, E>> => {
  try {
    return await fn();
  } finally {
    await finalizer();
  }
};

/**
 * Retry a function with specified attempts.
 */
export const retry = async <T, E>(
  fn: () => Promise<results.Result<T, E>>,
  attempts: number,
  delay = 0,
): Promise<results.Result<T, E>> => {
  let lastResult: results.Result<T, E> = results.fail(
    new Error("No attempts made") as E,
  );

  for (let attempt = 0; attempt < attempts; attempt++) {
    lastResult = await fn();
    if (results.isOk(lastResult)) return lastResult;

    if (attempt < attempts - 1 && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastResult;
};

/**
 * Retry with exponential backoff.
 */
export const retryWithBackoff = async <T, E>(
  fn: () => Promise<results.Result<T, E>>,
  options: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay?: number;
    factor?: number;
  },
): Promise<results.Result<T, E>> => {
  const { maxAttempts, initialDelay, maxDelay = Infinity, factor = 2 } =
    options;
  let lastResult: results.Result<T, E> = results.fail(
    new Error("No attempts made") as E,
  );
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = await fn();
    if (results.isOk(lastResult)) return lastResult;

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * factor, maxDelay);
    }
  }

  return lastResult;
};

/**
 * Timeout wrapper for async operations.
 */
export const withTimeout = async <T, E>(
  fn: () => Promise<results.Result<T, E>>,
  timeoutMs: number,
  timeoutError: E,
): Promise<results.Result<T, E>> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<results.Result<T, E>>((resolve) => {
    timeoutId = setTimeout(
      () => resolve(results.fail(timeoutError)),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};
