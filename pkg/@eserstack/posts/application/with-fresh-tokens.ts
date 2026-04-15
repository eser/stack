// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * withFreshTokens — bracket-based OAuth token lifecycle for API handlers.
 *
 * acquire: Load tokens from the store. If expired, refresh via the auth provider.
 * use:     Install tokens into the auth provider HTTP client, then run the operation.
 * release: Always save tokens back to the store — even if the operation fails.
 *
 * This guarantees that a freshly-refreshed access token is never lost due to
 * an API error that occurs after the refresh succeeds.
 *
 * If ctx.tokenStore or ctx.auths[platform] are absent (e.g., a CLI invocation
 * without full auth wiring), the operation runs directly without bracket.
 *
 * @module
 */

import * as resources from "@eserstack/functions/resources";
import * as results from "@eserstack/primitives/results";
import type { OAuthTokens } from "../domain/entities/user.ts";
import type { Platform } from "../domain/values/platform.ts";
import { AuthRequiredError } from "./auth-required-error.ts";
import type { PostsCtx } from "./context.ts";
import { isTokenExpired } from "./token-utils.ts";

/**
 * Wrap an API operation with proactive token refresh and guaranteed persistence.
 *
 * The operation callback receives no tokens — they are installed into the
 * underlying HTTP client via `auth.setTokens()` before the operation runs.
 */
export function withFreshTokens<T>(
  ctx: PostsCtx,
  platform: Platform,
  operation: () => Promise<results.Result<T, Error>>,
): Promise<results.Result<T, Error>> {
  const tokenStore = ctx.tokenStore;
  const auth = ctx.auths?.get(platform);

  if (tokenStore === undefined || auth === undefined) {
    // No token lifecycle management configured for this context.
    // Tokens were already installed at startup (restoreSavedTokens / loginFlow).
    return operation();
  }

  return resources.bracket(
    // acquire: load tokens; refresh if expired
    async (): Promise<results.Result<OAuthTokens, Error>> => {
      const tokens = await tokenStore.load(platform);
      if (tokens === null) {
        return results.fail(
          new AuthRequiredError(`Not authenticated on ${platform}`),
        );
      }
      if (isTokenExpired(tokens)) {
        if (tokens.refreshToken === undefined) {
          return results.fail(
            new AuthRequiredError(
              `No refresh token available for ${platform}`,
            ),
          );
        }
        try {
          const refreshed = await auth.refreshToken(tokens.refreshToken);
          return results.ok(refreshed);
        } catch (err) {
          return results.fail(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
      return results.ok(tokens);
    },
    // use: install tokens, then run the operation
    (tokens): Promise<results.Result<T, Error>> => {
      auth.setTokens(tokens);
      return operation();
    },
    // release: always persist (even if the operation failed)
    async (tokens): Promise<void> => {
      try {
        await tokenStore.save(platform, tokens);
      } catch {
        // Best-effort — never mask the operation result
      }
    },
  );
}
