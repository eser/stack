// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Lazy computation type for deferred, composable async operations.
 *
 * `Task<T, E, R>` wraps a `(ctx: R) => Promise<Result<T, E>>` — the computation
 * doesn't execute until you call `runTask()`.
 *
 * The third type parameter `R` (Requirements) enables **context threading** —
 * the FP pattern known as the **Reader monad**. Instead of passing dependencies
 * through every function call, you declare what a task *needs* in its type,
 * and the type system ensures all requirements are satisfied before execution.
 *
 * ### Basic Task (no context)
 * ```ts
 * import * as task from "@eser/functions/task";
 * import * as results from "@eser/primitives/results";
 *
 * const double = task.task(async () =>
 *   results.ok(42 * 2)
 * );
 *
 * const result = await task.runTask(double);
 * ```
 *
 * ### Task with Context (Reader pattern)
 * ```ts
 * type DbContext = { readonly db: Database };
 *
 * const getUser = (id: string): task.Task<User, DbError, DbContext> =>
 *   task.task(async (ctx) => {
 *     const user = await ctx.db.users.find(id);
 *     return user ? results.ok(user) : results.fail(new DbError("not found"));
 *   });
 *
 * // Context is provided at the call site — not threaded manually
 * const result = await task.runTask(getUser("123"), { db: postgres });
 * ```
 *
 * ### Composing Tasks Widens Requirements
 * ```ts
 * type AuthContext = { readonly auth: AuthService };
 * type DbContext = { readonly db: Database };
 *
 * // Composed task needs AuthContext & DbContext (automatically widened)
 * const getProfile = task.flatMapW(
 *   authenticate(token),
 *   (userId) => loadProfile(userId),
 * );
 * // Type: Task<Profile, AuthError | DbError, AuthContext & DbContext>
 * ```
 *
 * ### FP References
 *
 * The Reader monad pattern originates from:
 * - Wadler, P. (1992) "Monads for functional programming"
 * - `ReaderT` transformer in Haskell's `mtl` library
 * - Effect.ts `Effect<A, E, R>` — same three-parameter design with
 *   R-widening via `Effect.provideService()`
 *
 * Our implementation achieves similar ergonomics with zero runtime overhead:
 * - `R = void` default preserves backward compatibility
 * - `MergeContext<R1, R2>` handles void in intersections
 * - `provideContext()` is analogous to Effect's `Layer.provide()`
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import { retry, withTimeout as resourceWithTimeout } from "./resources.ts";

// --- Helper Types ---

/**
 * Merges two context types, treating `void` as the identity element.
 *
 * - `MergeContext<void, void>` → `void`
 * - `MergeContext<void, R>` → `R`
 * - `MergeContext<R, void>` → `R`
 * - `MergeContext<R1, R2>` → `R1 & R2`
 */
export type MergeContext<R1, R2> = R1 extends void ? R2
  : R2 extends void ? R1
  : R1 & R2;

/**
 * Context type requiring an `AbortSignal` for cancellation support.
 *
 * ```ts
 * const fetchData = task<Data, FetchError, Cancellable>(async (ctx) => {
 *   const resp = await fetch("/api/data", { signal: ctx.signal });
 *   return results.ok(await resp.json());
 * });
 * ```
 */
export type Cancellable = { readonly signal: AbortSignal };

/**
 * Minimal structured logger interface for observability.
 */
export type Logger = {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
};

/**
 * Context type requiring a `Logger` for observability.
 *
 * ```ts
 * const processOrder = task<Receipt, OrderError, Observable>(async (ctx) => {
 *   ctx.logger.info("Processing order");
 *   return results.ok(receipt);
 * });
 * ```
 */
export type Observable = { readonly logger: Logger };

/**
 * Error type for validation failures.
 */
export type ValidationError = {
  readonly _tag: "ValidationError";
  readonly message: string;
};

/**
 * Error type for abort/timeout via AbortSignal.
 */
export type AbortError = {
  readonly _tag: "AbortError";
  readonly message: string;
};

// --- Core Type ---

/**
 * Lazy computation type for deferred, composable async operations.
 *
 * @template T - Success value type
 * @template E - Error type (default: Error)
 * @template R - Requirements/context type (default: void — no context needed)
 */
export type Task<T, E = Error, R = void> = {
  readonly _tag: "Task";
  readonly execute: (ctx: R) => Promise<results.Result<T, E>>;
};

// --- Constructors ---

/**
 * Create a Task from an async function that returns a Result.
 *
 * @param execute - Async function receiving context and returning Result
 * @returns A new Task wrapping the computation
 */
export const task = <T, E = Error, R = void>(
  execute: (ctx: R) => Promise<results.Result<T, E>>,
): Task<T, E, R> => ({ _tag: "Task", execute });

/**
 * Create a Task that immediately succeeds with the given value.
 */
export const succeed = <T>(value: T): Task<T, never> =>
  task(() => Promise.resolve(results.ok(value)));

/**
 * Create a Task that immediately fails with the given error.
 */
export const failTask = <E>(error: E): Task<never, E> =>
  task(() => Promise.resolve(results.fail(error)));

/**
 * Create a Task from a Promise-returning function, catching exceptions.
 */
export const fromPromise = <T, E = Error>(
  promise: () => Promise<T>,
  onError: (error: unknown) => E = (e) => e as E,
): Task<T, E> =>
  task(async () => {
    try {
      return results.ok(await promise());
    } catch (error) {
      return results.fail(onError(error));
    }
  });

// --- Combinators ---

/**
 * Transform the success value of a Task.
 * Context R is propagated unchanged.
 */
export const map = <T, U, E, R = void>(
  t: Task<T, E, R>,
  f: (value: T) => U,
): Task<U, E, R> =>
  task<U, E, R>(async (ctx) => {
    const result = await t.execute(ctx);
    return results.isOk(result) ? results.ok(f(result.value)) : result;
  });

/**
 * Chain a Task with a function that returns another Task.
 * Both tasks share the same error type E.
 * Context widens via `MergeContext<R1, R2>`.
 *
 * @see {@link flatMapW} for error-widening variant
 */
export const flatMap = <T, U, E, R1 = void, R2 = void>(
  t: Task<T, E, R1>,
  f: (value: T) => Task<U, E, R2>,
): Task<U, E, MergeContext<R1, R2>> =>
  // Cast is safe: MergeContext<R1, R2> always satisfies both R1 and R2
  task<U, E, MergeContext<R1, R2>>(async (ctx) => {
    const result = await t.execute(ctx as unknown as R1);
    if (results.isFail(result)) return result;
    return f(result.value).execute(ctx as unknown as R2);
  });

/**
 * Chain a Task with error type widening.
 * Error widens to `E1 | E2`, context widens via `MergeContext<R1, R2>`.
 *
 * @see {@link flatMap} for same-error variant
 */
export const flatMapW = <T, U, E1, E2, R1 = void, R2 = void>(
  t: Task<T, E1, R1>,
  f: (value: T) => Task<U, E2, R2>,
): Task<U, E1 | E2, MergeContext<R1, R2>> =>
  // Cast is safe: MergeContext<R1, R2> always satisfies both R1 and R2
  task<U, E1 | E2, MergeContext<R1, R2>>(async (ctx) => {
    const result = await t.execute(ctx as unknown as R1);
    if (results.isFail(result)) return result;
    return f(result.value).execute(ctx as unknown as R2);
  });

// --- Execution ---

/**
 * Execute a Task and return its Result.
 *
 * For context-free tasks (`R = void`), call without context:
 * ```ts
 * const result = await runTask(myTask);
 * ```
 *
 * For context-aware tasks, provide the required context:
 * ```ts
 * const result = await runTask(myTask, { db: postgres });
 * ```
 */
export const runTask = <T, E, R = void>(
  t: Task<T, E, R>,
  ...args: R extends void ? [] : [ctx: R]
): Promise<results.Result<T, E>> => t.execute(args[0] as R);

// --- Context Management ---

/**
 * Satisfy all requirements of a Task, returning a context-free Task.
 *
 * Analogous to Haskell's `runReaderT` or Effect.ts's `Effect.provideService()`.
 * It "eliminates" the R parameter by closing over the environment.
 *
 * ```ts
 * const ready = provideContext(getUser("123"), { db: postgres });
 * const result = await runTask(ready); // no context needed
 * ```
 */
export const provideContext = <T, E, R>(
  t: Task<T, E, R>,
  ctx: R,
): Task<T, E> => task(() => t.execute(ctx));

// --- Cancellation ---

/**
 * Wrap a Task with AbortSignal-based cancellation and timeout.
 *
 * Adds `Cancellable` to the context requirements. The caller must provide
 * an `AbortSignal` via the context.
 *
 * ```ts
 * const cancellable = withAbort(fetchData, 5000);
 * const controller = new AbortController();
 * const result = await runTask(cancellable, { signal: controller.signal });
 * ```
 *
 * @param t - Task to wrap
 * @param timeoutMs - Timeout in milliseconds (0 = no auto-timeout, signal-only)
 * @returns Task that requires `Cancellable` context
 */
export const withAbort = <T, E, R = void>(
  t: Task<T, E, R>,
  timeoutMs: number,
): Task<T, E | AbortError, MergeContext<R, Cancellable>> =>
  task<T, E | AbortError, MergeContext<R, Cancellable>>(async (ctx) => {
    const { signal } = ctx as unknown as Cancellable;
    const innerCtx = ctx as unknown as R;

    if (signal.aborted) {
      return results.fail<AbortError>({
        _tag: "AbortError",
        message: "Operation was already aborted",
      });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const abortPromise = new Promise<results.Result<T, E | AbortError>>(
        (resolve) => {
          signal.addEventListener(
            "abort",
            () =>
              resolve(
                results.fail({
                  _tag: "AbortError" as const,
                  message: "Operation aborted",
                }),
              ),
            { once: true },
          );

          if (timeoutMs > 0) {
            timeoutId = setTimeout(
              () =>
                resolve(
                  results.fail({
                    _tag: "AbortError" as const,
                    message: `Operation timed out after ${timeoutMs}ms`,
                  }),
                ),
              timeoutMs,
            );
          }
        },
      );

      return await Promise.race([t.execute(innerCtx), abortPromise]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  });

// --- Observability ---

/**
 * Wrap a Task with structured logging.
 * Logs start and completion/failure with the given label.
 *
 * Adds `Observable` to the context requirements. The caller must provide
 * a `Logger` via the context.
 *
 * ```ts
 * const traced = withLogging(fetchData, "fetch-data");
 * // Logs: "[fetch-data] started" then "[fetch-data] completed" or "[fetch-data] failed"
 * ```
 *
 * @param t - Task to wrap
 * @param label - Label for log messages
 * @returns Task that requires `Observable` context
 */
export const withLogging = <T, E, R = void>(
  t: Task<T, E, R>,
  label: string,
): Task<T, E, MergeContext<R, Observable>> =>
  task<T, E, MergeContext<R, Observable>>(async (ctx) => {
    const { logger } = ctx as unknown as Observable;
    const innerCtx = ctx as unknown as R;

    logger.info(`[${label}] started`);

    const result = await t.execute(innerCtx);

    if (results.isOk(result)) {
      logger.info(`[${label}] completed`);
    } else {
      logger.error(`[${label}] failed`, { error: result.error });
    }

    return result;
  });

// --- Validation ---

/**
 * Create a validation step that returns a Task.
 *
 * ```ts
 * const validateEmail = validate(
 *   (email: string) => email.includes("@"),
 *   "Invalid email address",
 * );
 *
 * const processUser = flatMapW(
 *   validateEmail(input),
 *   (email) => createUser(email),
 * );
 * ```
 *
 * @param predicate - Validation function returning true if valid
 * @param message - Error message on failure
 * @returns A function that takes a value and returns a Task
 */
export const validate = <T>(
  predicate: (value: T) => boolean,
  message: string,
): (value: T) => Task<T, ValidationError> =>
(value: T) =>
  predicate(value)
    ? (succeed(value) as Task<T, ValidationError>)
    : failTask<ValidationError>({ _tag: "ValidationError", message });

// --- Collection ---

/**
 * Run tasks sequentially, collecting all success values.
 * Fails fast on the first error. Context R is propagated.
 */
export const all = <T, E, R = void>(
  tasks: ReadonlyArray<Task<T, E, R>>,
): Task<T[], E, R> =>
  task<T[], E, R>(async (ctx) => {
    const values: T[] = [];
    for (const t of tasks) {
      const result = await t.execute(ctx);
      if (results.isFail(result)) return result;
      values.push(result.value);
    }
    return results.ok(values);
  });

/**
 * Run tasks in parallel, collecting all success values.
 * Fails if any task fails. Context R is propagated.
 */
export const allPar = <T, E, R = void>(
  tasks: ReadonlyArray<Task<T, E, R>>,
): Task<T[], E, R> =>
  task<T[], E, R>(async (ctx) => {
    const taskResults = await Promise.all(tasks.map((t) => t.execute(ctx)));
    const values: T[] = [];
    for (const result of taskResults) {
      if (results.isFail(result)) return result;
      values.push(result.value);
    }
    return results.ok(values);
  });

// --- Bridges to resources.ts ---

/**
 * Retry a Task with specified attempts.
 * Context R is propagated.
 */
export const withRetry = <T, E, R = void>(
  t: Task<T, E, R>,
  attempts: number,
  delay = 0,
): Task<T, E, R> =>
  task<T, E, R>((ctx) => retry(() => t.execute(ctx), attempts, delay));

/**
 * Add a timeout to a Task using resources.ts timeout.
 * Context R is propagated.
 */
export const withTimeout = <T, E, R = void>(
  t: Task<T, E, R>,
  timeoutMs: number,
  timeoutError: E,
): Task<T, E, R> =>
  task<T, E, R>((ctx) =>
    resourceWithTimeout(() => t.execute(ctx), timeoutMs, timeoutError)
  );
