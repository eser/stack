// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * String manipulation utilities.
 *
 * Provides template interpolation and string processing functions.
 *
 * @example
 * ```typescript
 * import * as standards from "@eserstack/standards";
 *
 * // Simple interpolation
 * standards.strings.interpolate("Hello {name}!", { name: "World" });
 * // "Hello World!"
 *
 * // Create reusable interpolator
 * const greet = standards.strings.createInterpolator("Hello {name}!");
 * greet({ name: "Alice" }); // "Hello Alice!"
 * greet({ name: "Bob" });   // "Hello Bob!"
 * ```
 *
 * @module
 */

export {
  createInterpolator,
  extractPlaceholders,
  interpolate,
} from "./interpolate.ts";
