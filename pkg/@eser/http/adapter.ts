// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// HTTP Request → HttpEvent adapter for @eser/functions handler pattern

import * as results from "@eser/primitives/results";
import type { HttpEvent } from "@eser/functions/triggers";

/**
 * Converts a Web Request into an HttpEvent for use with handler.bind().
 */
export const fromRequest = async (
  req: Request,
): Promise<results.Result<HttpEvent, Error>> => {
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
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        body = await req.json();
      } else {
        body = await req.text();
      }
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
