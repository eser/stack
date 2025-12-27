// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * String manipulation utilities.
 *
 * Provides template interpolation and string processing functions.
 *
 * @example
 * ```typescript
 * import { interpolate, createInterpolator } from "@eser/standards/strings";
 *
 * // Simple interpolation
 * interpolate("Hello {name}!", { name: "World" });
 * // "Hello World!"
 *
 * // Create reusable interpolator
 * const greet = createInterpolator("Hello {name}!");
 * greet({ name: "Alice" }); // "Hello Alice!"
 * greet({ name: "Bob" });   // "Hello Bob!"
 * ```
 *
 * @module
 */

export * from "./interpolate.ts";
