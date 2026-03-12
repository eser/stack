// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eser/functions - Higher-level workflow compositions.
 *
 * Multi-step operations, middleware pipelines, lazy computation,
 * and resource lifecycle management.
 *
 * For Result/Option types and combinators: import from @eser/primitives
 *
 * @example
 * ```typescript
 * import { run } from "@eser/functions";
 * import * as results from "@eser/primitives/results";
 *
 * // Monadic do-notation
 * const result = await run(async function* () {
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

// Resource management
export * as resources from "./resources.ts";
