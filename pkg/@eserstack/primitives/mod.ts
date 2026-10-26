// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The type foundation of eserstack: the `Result` and `Option` types with their
 * constructors, type guards and combinators, runtime type guards, and
 * type-level helpers. Each module is a namespace of this entry point.
 *
 * @example
 * ```typescript
 * import * as primitives from "@eserstack/primitives";
 *
 * const result = primitives.results.tryCatch(() => JSON.parse("{}"));
 * const config = primitives.results.getOrElse(result, {});
 * ```
 *
 * @module
 */

export * as functions from "./functions.ts";
export * as options from "./options.ts";
export * as promises from "./promises.ts";
export * as results from "./results.ts";
export * as typeGuards from "./type-guards.ts";
export * as typeSlices from "./type-slices.ts";
