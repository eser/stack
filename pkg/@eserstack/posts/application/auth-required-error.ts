// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AuthRequiredError — raised when an operation requires authentication but
 * no valid session is stored for the requested platform.
 * Lives in the application layer so withFreshTokens and UI adapters can both
 * import it without cross-adapter dependencies.
 */

/** Raised when no stored tokens exist for the requested platform. */
export class AuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}
