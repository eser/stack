// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/functions - Higher-level workflow compositions.
 *
 * Multi-step operations, middleware pipelines, lazy computation,
 * and resource lifecycle management.
 *
 * For Result/Option types and combinators: import from @eserstack/primitives
 *
 * @example
 * ```typescript
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * const fetchUser = (id: number) => primitives.results.ok({ id, name: "Ada" });
 * const fetchPosts = (userId: number) =>
 *   primitives.results.ok([{ userId, title: "Hello" }]);
 *
 * // Monadic do-notation
 * const result = await functions.run(async function* () {
 *   const user = yield* fetchUser(1);
 *   const posts = yield* fetchPosts(user.id);
 *   return { user, posts };
 * });
 * ```
 *
 * @module
 */

// Monadic do-notation
export { run, runSync } from "./fn.ts";

// Middleware pipeline
export {
  collect,
  type CollectResult,
  type Context,
  type Middleware,
  type Pipeline,
  type State,
} from "./pipeline.ts";

// Lazy computation
export * as task from "./task.ts";

// Trigger adapters
export * as handler from "./handler.ts";

// Trigger event types
export * as triggers from "./triggers.ts";

// Resource management
export * as resources from "./resources.ts";

// The Result types that pipelines and tasks yield, re-exported so the API
// reference links them. They are the same types as in @eserstack/primitives.
export type { Fail, Ok, Result } from "@eserstack/primitives/results";
