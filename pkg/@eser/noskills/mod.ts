// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * NoSkills — not disclosed yet.
 *
 * @example
 * ```typescript
 * import * as noskills from "@eser/noskills";
 * ```
 *
 * @module
 */

export { moduleDef } from "./module.ts";

// CLI-facing modules are accessed via their own entry points in deno.json exports,
// not through this barrel. Each exports a `main` function which would collide.
// Import directly: @eser/noskills/init, etc.
