// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The ids and the logger of one HTTP request.
 *
 * The server creates a context for every request it answers. Its request id
 * goes into each log record of that request and into the failure response, so a
 * user who reports a failed action can be matched to the record that has the
 * detail.
 *
 * @module
 */

/**
 * The logger calls the request handlers make. A `Logger` from
 * `@eserstack/logging` satisfies it; tests pass a fake that keeps the records.
 */
export type RequestLogger = {
  /** A logger that adds `properties` to every record it writes. */
  with(properties: Record<string, unknown>): RequestLogger;
  /** Writes an error record. */
  error(message: string): Promise<unknown>;
};

/** The ids and the logger of one request. */
export type RequestContext = {
  /** A random id that the log records and the failure response share. */
  readonly requestId: string;
  /** Writes records with `requestId`, `method` and `path` attached. */
  readonly log: RequestLogger;
};

/**
 * Create the context of `request`: a fresh request id, and a logger that
 * attaches it with the method and the path.
 *
 * Only the path is logged. The query string stays out of the log because the
 * `/mux` upgrade carries the access token in it.
 */
export const createRequestContext = (
  request: Request,
  logger: RequestLogger,
): RequestContext => {
  const requestId = crypto.randomUUID();

  return {
    requestId,
    log: logger.with({
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
    }),
  };
};
