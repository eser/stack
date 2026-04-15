// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/posts — Twitter/X client with hexagonal architecture.
 *
 * Public API: domain types, application port interfaces, and PostService.
 * Adapters are intentionally excluded — wire them at the composition root.
 */

export * from "./application/mod.ts";
export * from "./domain/mod.ts";
export { loadPostsConfig } from "./config.ts";
export type { PostsConfig } from "./config.ts";
export { validateConfig } from "./config-validation.ts";
export type { ConfigValidationError } from "./config-validation.ts";
