// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/webtransport — WebTransport client for browser and Node.
 *
 * Parallel to @eserstack/httpclient: same factory pattern, same config shape,
 * same options naming. Use createWebTransportClient for bidi streams and
 * datagrams; use createHttpClient for REST requests.
 *
 * @module
 */

export * from "./client.ts";
export * from "./types.ts";
