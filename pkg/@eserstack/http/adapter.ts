// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// HTTP Request → HttpEvent adapter for @eserstack/functions handler pattern

import * as results from "@eserstack/primitives/results";
import type { HttpEvent } from "@eserstack/functions/triggers";

/**
 * The body limit fromRequest applies when no `maxBodyBytes` is given: 1 MiB.
 * fromRequest holds the whole body in memory to parse it, so the limit bounds
 * the memory one request can take. 1 MiB fits JSON and form payloads; uploads
 * larger than that should read `req.body` as a stream instead.
 */
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

// 413 Content Too Large (RFC 9110, section 15.5.14).
const STATUS_CONTENT_TOO_LARGE = 413;

/** Options for {@link fromRequest}. */
export type FromRequestOptions = {
  /**
   * The largest body, in bytes, that fromRequest reads. A larger body fails
   * with {@link RequestBodyTooLargeError}. A non-negative integer; defaults to
   * {@link DEFAULT_MAX_BODY_BYTES}.
   */
  readonly maxBodyBytes?: number;
};

/** How fromRequest found that a body is over the limit. */
export type BodyLimitSource = "content-length" | "stream";

/**
 * The request body is over the limit. `status` is 413 (Content Too Large), the
 * status to answer such a request with.
 *
 * `source` says which check found it. With `"content-length"` the declared
 * size was over the limit and no body byte was read, and `bodyBytes` is that
 * declared size. With `"stream"` reading stopped at the first chunk that passed
 * the limit, and `bodyBytes` is the count read until then.
 */
export class RequestBodyTooLargeError extends Error {
  readonly status: number = STATUS_CONTENT_TOO_LARGE;

  readonly limitBytes: number;
  readonly bodyBytes: number;
  readonly source: BodyLimitSource;

  constructor(
    limitBytes: number,
    bodyBytes: number,
    source: BodyLimitSource,
  ) {
    const found = source === "content-length"
      ? `Content-Length declares ${bodyBytes} bytes`
      : `${bodyBytes} bytes arrived before reading stopped`;
    super(
      `request body is over the ${limitBytes}-byte limit (${found}); send a body of at most ${limitBytes} bytes`,
    );
    this.limitBytes = limitBytes;
    this.bodyBytes = bodyBytes;
    this.source = source;
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Converts a Web Request into an HttpEvent for use with handler.bind().
 *
 * The body is read for every method except GET and HEAD, up to
 * `options.maxBodyBytes`, and parsed as JSON when the content type says so,
 * as text otherwise. A body over the limit is rejected before it is parsed: a
 * Content-Length over the limit fails before any byte is read, and a body
 * without one (chunked) fails as soon as the bytes read pass the limit. Both
 * fail with {@link RequestBodyTooLargeError}, whose `status` is 413.
 *
 * Throws a RangeError when `options.maxBodyBytes` is not a non-negative
 * integer, since that is a programming error rather than a bad request.
 *
 * @example
 * ```typescript
 * import * as http from "@eserstack/http";
 * import * as primitives from "@eserstack/primitives";
 *
 * const handle = async (req: Request): Promise<Response> => {
 *   const event = await http.adapter.fromRequest(req, { maxBodyBytes: 65_536 });
 *   if (primitives.results.isFail(event)) {
 *     const status = event.error instanceof http.adapter.RequestBodyTooLargeError
 *       ? event.error.status
 *       : 400;
 *     return new Response(event.error.message, { status });
 *   }
 *   return new Response(`received ${event.value.method} ${event.value.path}`);
 * };
 * ```
 */
export const fromRequest = async (
  req: Request,
  options: FromRequestOptions = {},
): Promise<results.Result<HttpEvent, Error>> => {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) {
    throw new RangeError(
      `fromRequest: maxBodyBytes ${maxBodyBytes} is not a byte count; pass a non-negative integer such as ${DEFAULT_MAX_BODY_BYTES}`,
    );
  }

  try {
    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    let body: unknown = undefined;
    if (req.body !== null && req.method !== "GET" && req.method !== "HEAD") {
      const bytes = await readBoundedBody(req.headers, req.body, maxBodyBytes);
      if (results.isFail(bytes)) {
        return bytes;
      }

      const text = new TextDecoder().decode(bytes.value);
      const contentType = req.headers.get("content-type") ?? "";
      body = contentType.includes("application/json") ? JSON.parse(text) : text;
    }

    return results.ok({
      method: req.method,
      path: url.pathname,
      headers,
      query,
      body,
    });
  } catch (error) {
    return results.fail(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};

/**
 * Reads `body` into one buffer, or fails once it is known to be over
 * `limitBytes`. A body over the limit is cancelled, so the sender stops and
 * nothing past the limit is held in memory.
 */
const readBoundedBody = async (
  headers: Headers,
  body: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<results.Result<Uint8Array, RequestBodyTooLargeError>> => {
  const declaredBytes = parseContentLength(headers.get("content-length"));
  if (declaredBytes !== null && declaredBytes > limitBytes) {
    const error = new RequestBodyTooLargeError(
      limitBytes,
      declaredBytes,
      "content-length",
    );
    await body.cancel(error);
    return results.fail(error);
  }

  // Content-Length can be missing (chunked) or wrong, so the count of bytes
  // actually read is what enforces the limit.
  const chunks: Uint8Array[] = [];
  let readBytes = 0;
  for await (const chunk of body) {
    readBytes += chunk.byteLength;
    if (readBytes > limitBytes) {
      // Leaving the loop early cancels the stream.
      return results.fail(
        new RequestBodyTooLargeError(limitBytes, readBytes, "stream"),
      );
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(readBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return results.ok(bytes);
};

/**
 * The size a Content-Length header declares, or null when the header is
 * missing or not a byte count. A null only skips the early check; the bytes
 * read are still counted against the limit.
 */
const parseContentLength = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};
