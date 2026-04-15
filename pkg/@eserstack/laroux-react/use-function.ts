// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * React integration for @eserstack/functions — run handlers inside
 * React Server Components with proper context injection.
 *
 * @example
 * ```tsx
 * import { runFunction } from "@eserstack/laroux-react/use-function";
 * import { listRecipes } from "@eserstack/registry/handlers/list-recipes";
 *
 * export default async function RecipesPage({ params }) {
 *   const { recipes } = await runFunction(listRecipes({ language: params.lang }));
 *   return <div>{recipes.map(r => <p>{r.name}</p>)}</div>;
 * }
 * ```
 *
 * @module
 */

import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal context for handlers running inside React.
 * Uses plain renderer + buffer sink — React components handle their own
 * rendering via SpanView, not through the Output stream.
 */
type FunctionContext = {
  readonly out: streams.Output;
};

type RunFunctionOptions = {
  /** Additional context properties to merge */
  readonly context?: Readonly<Record<string, unknown>>;
};

// =============================================================================
// Core
// =============================================================================

/**
 * Run an @eserstack/functions Task inside a React Server Component.
 *
 * Creates a buffer-based Output context so handlers can write to
 * `ctx.out` without side effects. The handler's return value is
 * extracted and returned — if the Task fails, an error is thrown
 * (React Server Components handle errors via Error Boundaries).
 *
 * @param t - A Task from an @eserstack/functions handler
 * @param options - Optional additional context
 * @returns The handler's success value
 * @throws Error if the Task fails
 */
const runFunction = async <T, E>(
  t: task.Task<T, E, FunctionContext>,
  options?: RunFunctionOptions,
): Promise<T> => {
  const buf = streams.sinks.buffer();
  const out = streams.output({
    renderer: streams.renderers.plain(),
    sink: buf,
  });

  const ctx: FunctionContext = { out, ...options?.context };

  const result = await task.runTask(t, ctx);
  await out.close();

  if (results.isOk(result)) {
    return result.value;
  }

  // React Server Components use Error Boundaries for error handling
  const error = result.error;
  const message = typeof error === "object" && error !== null &&
      "message" in error
    ? String((error as Record<string, unknown>)["message"])
    : String(error);

  throw new Error(message);
};

export { runFunction };

export type { FunctionContext, RunFunctionOptions };
