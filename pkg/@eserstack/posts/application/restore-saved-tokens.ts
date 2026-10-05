// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * restoreSavedTokens: resume saved sessions at start-up by installing each
 * platform's saved tokens into its auth provider.
 *
 * The terminal menu calls it when it starts, and `eser posts status` calls it
 * before it reports which platforms are logged in. API calls do not depend on
 * it: withFreshTokens loads, refreshes and installs the tokens of the platform
 * each call runs on.
 *
 * @module
 */

import type { OAuthTokens } from "../domain/entities/user.ts";
import type { Platform } from "../domain/values/platform.ts";
import type { AuthProvider } from "./auth-provider.ts";
import type { TokenStore } from "./token-store.ts";

/** A platform whose saved tokens could not be loaded. */
export type TokenRestoreFailure = {
  readonly platform: Platform;
  readonly error: Error;
};

/** What restoreSavedTokens found for the platforms it was given. */
export type RestoredTokens = {
  /** Platforms whose saved tokens are installed, with those tokens. */
  readonly restored: ReadonlyMap<Platform, OAuthTokens>;
  /** Platforms whose token store read failed; they stay logged out. */
  readonly failures: readonly TokenRestoreFailure[];
};

/**
 * Install each platform's saved tokens into its auth provider.
 *
 * A platform without saved tokens is skipped, and one whose saved tokens the
 * provider cannot use (a Bluesky session without its DID) is left out of
 * `restored`. Expired tokens are installed as they are; withFreshTokens
 * refreshes them before the next API call.
 */
export async function restoreSavedTokens(
  tokenStore: TokenStore,
  auths: ReadonlyMap<Platform, AuthProvider>,
): Promise<RestoredTokens> {
  // Each platform's saved tokens load independently, so the reads run
  // concurrently; the results keep the platform order of auths.
  const loads = await Promise.all(
    Array.from(auths, async ([platform, auth]) => {
      try {
        const saved = await tokenStore.load(platform);
        return { platform, auth, saved, error: null };
      } catch (err) {
        const error = err instanceof Error
          ? err
          : new Error(`load saved ${platform} tokens: ${String(err)}`);
        return { platform, auth, saved: null, error };
      }
    }),
  );

  const restored = new Map<Platform, OAuthTokens>();
  const failures: TokenRestoreFailure[] = [];

  for (const { platform, auth, saved, error } of loads) {
    if (error !== null) {
      failures.push({ platform, error });
      continue;
    }
    if (saved === null) continue;

    auth.setTokens(saved);
    if (auth.isAuthenticated()) restored.set(platform, saved);
  }

  return { restored, failures };
}
