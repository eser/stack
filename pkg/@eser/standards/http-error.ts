// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTTP status codes with their standard text descriptions.
 */
const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/**
 * Valid HTTP error status codes (4xx and 5xx).
 */
export type ErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 405
  | 406
  | 408
  | 409
  | 410
  | 413
  | 415
  | 422
  | 429
  | 500
  | 501
  | 502
  | 503
  | 504;

/**
 * Custom error class for HTTP errors.
 * Extends the standard Error class with an HTTP status code.
 *
 * @example
 * ```typescript
 * throw new HttpError(404, "User not found");
 * throw new HttpError(500); // Uses default message "Internal Server Error"
 * ```
 */
export class HttpError extends Error {
  /**
   * The HTTP status code associated with this error.
   */
  readonly status: ErrorStatus;

  /**
   * Creates a new HttpError instance.
   *
   * @param status - The HTTP status code (4xx or 5xx)
   * @param message - Optional custom error message. If not provided, uses the standard status text.
   */
  constructor(status: ErrorStatus, message?: string) {
    super(message ?? STATUS_TEXT[status] ?? "Unknown Error");
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Type guard to check if an error is an HttpError.
 *
 * @param error - The error to check
 * @returns True if the error is an HttpError
 */
export const isHttpError = (error: unknown): error is HttpError => {
  return error instanceof HttpError;
};

/**
 * Creates an HttpError for a 400 Bad Request response.
 */
export const badRequest = (message?: string): HttpError =>
  new HttpError(400, message);

/**
 * Creates an HttpError for a 401 Unauthorized response.
 */
export const unauthorized = (message?: string): HttpError =>
  new HttpError(401, message);

/**
 * Creates an HttpError for a 403 Forbidden response.
 */
export const forbidden = (message?: string): HttpError =>
  new HttpError(403, message);

/**
 * Creates an HttpError for a 404 Not Found response.
 */
export const notFound = (message?: string): HttpError =>
  new HttpError(404, message);

/**
 * Creates an HttpError for a 409 Conflict response.
 */
export const conflict = (message?: string): HttpError =>
  new HttpError(409, message);

/**
 * Creates an HttpError for a 422 Unprocessable Entity response.
 */
export const unprocessableEntity = (message?: string): HttpError =>
  new HttpError(422, message);

/**
 * Creates an HttpError for a 429 Too Many Requests response.
 */
export const tooManyRequests = (message?: string): HttpError =>
  new HttpError(429, message);

/**
 * Creates an HttpError for a 500 Internal Server Error response.
 */
export const internalServerError = (message?: string): HttpError =>
  new HttpError(500, message);

/**
 * Creates an HttpError for a 503 Service Unavailable response.
 */
export const serviceUnavailable = (message?: string): HttpError =>
  new HttpError(503, message);
