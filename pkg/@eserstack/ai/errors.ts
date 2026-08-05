// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Base Error
// =============================================================================

export type AiErrorOptions = {
  readonly provider?: string;
  readonly statusCode?: number;
  readonly cause?: Error;
};

export class AiError extends Error {
  readonly provider: string | null;
  readonly statusCode: number | null;

  constructor(message: string, options?: AiErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "AiError";
    this.provider = options?.provider ?? null;
    this.statusCode = options?.statusCode ?? null;
  }
}

// =============================================================================
// Classified Errors (Provider-Agnostic)
// =============================================================================

export class RateLimitedError extends AiError {
  constructor(message: string, options?: AiErrorOptions) {
    super(message, { ...options, statusCode: options?.statusCode ?? 429 });
    this.name = "RateLimitedError";
  }
}

export class AuthFailedError extends AiError {
  constructor(message: string, options?: AiErrorOptions) {
    super(message, { ...options, statusCode: options?.statusCode ?? 401 });
    this.name = "AuthFailedError";
  }
}

export class InsufficientCreditsError extends AiError {
  constructor(message: string, options?: AiErrorOptions) {
    super(message, { ...options, statusCode: options?.statusCode ?? 402 });
    this.name = "InsufficientCreditsError";
  }
}

export class BadRequestError extends AiError {
  constructor(message: string, options?: AiErrorOptions) {
    super(message, { ...options, statusCode: options?.statusCode ?? 400 });
    this.name = "BadRequestError";
  }
}

export class ServiceUnavailableError extends AiError {
  constructor(message: string, options?: AiErrorOptions) {
    super(message, { ...options, statusCode: options?.statusCode ?? 503 });
    this.name = "ServiceUnavailableError";
  }
}

// =============================================================================
// Registry Errors
// =============================================================================

export class ModelNotFoundError extends AiError {
  constructor(modelName: string) {
    super(`Model "${modelName}" not found in registry`);
    this.name = "ModelNotFoundError";
  }
}

export class ModelAlreadyExistsError extends AiError {
  constructor(modelName: string) {
    super(`Model "${modelName}" already exists in registry`);
    this.name = "ModelAlreadyExistsError";
  }
}

export class UnsupportedProviderError extends AiError {
  constructor(providerName: string) {
    super(`No factory registered for provider "${providerName}"`);
    this.name = "UnsupportedProviderError";
  }
}

// =============================================================================
// Classification Utilities
// =============================================================================

export const classifyStatusCode = (
  statusCode: number,
): typeof AiError | null => {
  if (statusCode === 429) {
    return RateLimitedError;
  }
  if (statusCode === 401) {
    return AuthFailedError;
  }
  if (statusCode === 402) {
    return InsufficientCreditsError;
  }
  if (statusCode === 400) {
    return BadRequestError;
  }
  if (statusCode === 500 || statusCode === 503 || statusCode === 529) {
    return ServiceUnavailableError;
  }

  return null;
};

export const classifyAndWrap = (
  provider: string,
  statusCode: number,
  original: Error,
): AiError => {
  const ErrorClass = classifyStatusCode(statusCode);

  if (ErrorClass !== null) {
    return new ErrorClass(original.message, {
      provider,
      statusCode,
      cause: original,
    });
  }

  return new AiError(original.message, {
    provider,
    statusCode,
    cause: original,
  });
};

// =============================================================================
// Wire Classification (FFI bridge)
// =============================================================================

/**
 * Classification slugs emitted by `pkg/ajan/aifx`'s `ErrorKind`.
 *
 * These are wire values shared with Go. Renaming one here without changing
 * `ErrorKind` in lockstep silently drops every error of that class back to a
 * bare {@link AiError} — the exact failure this classification exists to fix,
 * and one nothing would report.
 */
export type AiErrorKind =
  | "rate_limited"
  | "auth_failed"
  | "insufficient_credits"
  | "bad_request"
  | "service_unavailable"
  | "cancelled";

const WIRE_KINDS: Record<string, typeof AiError> = {
  rate_limited: RateLimitedError,
  auth_failed: AuthFailedError,
  insufficient_credits: InsufficientCreditsError,
  bad_request: BadRequestError,
  service_unavailable: ServiceUnavailableError,
};

/**
 * Rebuild the typed error described by a bridge response.
 *
 * `kind` is preferred over `statusCode`: Go classifies once, and a status with
 * no sentinel (404, 408, 413, 422) must not be re-derived into the wrong class
 * here. When there is no kind, the status is still carried on a bare
 * {@link AiError} so a caller can see it.
 *
 * `cancelled` is deliberately NOT mapped to a subclass. Go wraps a cancelled
 * context with its service-unavailable sentinel, which is a *retryable* class —
 * telling a caller to retry the request they just deliberately cancelled.
 *
 * A zero or absent status yields `undefined`, never `0`: `0 ?? 429` is `0`, so
 * forwarding a defaulted zero would make every typed error report statusCode 0
 * instead of its class default.
 */
export const classifyWireError = (
  provider: string,
  message: string,
  kind?: string,
  statusCode?: number,
): AiError => {
  const status = statusCode !== undefined && statusCode > 0
    ? statusCode
    : undefined;

  const ErrorClass = kind === undefined ? undefined : WIRE_KINDS[kind];

  if (ErrorClass === undefined) {
    return new AiError(message, { provider, statusCode: status });
  }

  return new ErrorClass(message, { provider, statusCode: status });
};
