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
