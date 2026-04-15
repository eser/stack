// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * PostsCtx — dependency context threaded through all post-handling Tasks.
 *
 * Handlers declare `PostsCtx` as their requirements type parameter (`R`).
 * The concrete implementation is provided at the call site (TUI, CLI, HTTP),
 * keeping business logic free of infrastructure details.
 *
 * tokenStore and auths are optional: contexts that do not need the
 * withFreshTokens bracket (e.g., a pre-authenticated CLI invocation) can
 * omit them. Handlers that call withFreshTokens degrade gracefully when
 * these are absent — the bracket is skipped and the operation runs with
 * whatever tokens are currently installed in the auth provider.
 *
 * @module
 */

import type { Platform } from "../domain/values/platform.ts";
import type { AuthProvider } from "./auth-provider.ts";
import type { InboundPostService } from "./post-service.ts";
import type { TokenStore } from "./token-store.ts";

/** Execution context required by all PostService handlers. */
export type PostsCtx = {
  readonly postService: InboundPostService;
  /** Token store for persisting OAuth credentials across sessions. */
  readonly tokenStore?: TokenStore;
  /**
   * Per-platform auth providers used by withFreshTokens to refresh and
   * install tokens into the underlying HTTP client before each API call.
   */
  readonly auths?: ReadonlyMap<Platform, AuthProvider>;
};
