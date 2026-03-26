// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// HttpResponse → Web Response conversion

import type { HttpResponse } from "@eser/functions/triggers";

/**
 * Converts an HttpResponse from a handler into a Web Response.
 */
export const toWebResponse = (httpResponse: HttpResponse): Response => {
  const headers = new Headers(httpResponse.headers ?? {});

  let body: BodyInit | null = null;
  if (httpResponse.body !== undefined && httpResponse.body !== null) {
    if (typeof httpResponse.body === "string") {
      body = httpResponse.body;
    } else {
      body = JSON.stringify(httpResponse.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Response(body, {
    status: httpResponse.status,
    headers,
  });
};
