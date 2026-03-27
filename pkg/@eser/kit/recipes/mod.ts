// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eser/registry — Recipe registry for eser stack.
 *
 * Provides a forkable distribution protocol inspired by shadcn's registry
 * model. Recipes are code templates at three scales (project, structure,
 * utility) that can be fetched from any registry and applied to existing
 * projects.
 *
 * This is a RECIPE registry — not to be confused with
 * `@eser/standards/collections` which is a generic immutable data structure.
 *
 * @module
 */

export * as schema from "./registry-schema.ts";
export * as fetcher from "./registry-fetcher.ts";
export * as applier from "./recipe-applier.ts";
export * as resolver from "./dependency-resolver.ts";
export * as requires from "./requires-resolver.ts";
export * as variables from "./variable-processor.ts";
