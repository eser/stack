// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import {
  AiError,
  AuthFailedError,
  BadRequestError,
  classifyWireError,
  InsufficientCreditsError,
  RateLimitedError,
  ServiceUnavailableError,
} from "./errors.ts";

// The Go half is pinned in pkg/ajan/aifx/errors_classification_test.go. These
// pin the consuming half: that the slugs Go emits rebuild the typed hierarchy a
// caller can actually branch on.

Deno.test("wire kinds rebuild the typed hierarchy", () => {
  const cases: Array<[string, typeof AiError]> = [
    ["rate_limited", RateLimitedError],
    ["auth_failed", AuthFailedError],
    ["insufficient_credits", InsufficientCreditsError],
    ["bad_request", BadRequestError],
    ["service_unavailable", ServiceUnavailableError],
  ];

  for (const [kind, Expected] of cases) {
    const err = classifyWireError("anthropic", "boom", kind, 429);

    assert(
      err instanceof Expected,
      `${kind} produced ${err.constructor.name}, want ${Expected.name}`,
    );
    assertEquals(err.provider, "anthropic");
  }
});

Deno.test("an unknown or absent kind degrades to a bare AiError", () => {
  // An agent-backed provider, a missing binary, a decode failure: none of these
  // have a classification, and inventing one would be worse than none.
  for (const kind of [undefined, "", "something_new"]) {
    const err = classifyWireError("kiro", "boom", kind);

    assertEquals(err.constructor.name, "AiError", `kind ${kind}`);
  }
});

// Go wraps a cancelled context with its service-unavailable sentinel, which is
// a RETRYABLE class. Mapping that through would tell a caller to retry the
// request they just deliberately cancelled.
Deno.test("cancellation does not become a retryable error", () => {
  const err = classifyWireError("openai", "context canceled", "cancelled");

  assert(
    !(err instanceof ServiceUnavailableError),
    "cancellation was classified as retryable",
  );
  assertEquals(err.constructor.name, "AiError");
});

// `0 ?? 429` is `0`. Forwarding a defaulted zero would make every typed error
// report statusCode 0 instead of its class default.
Deno.test("a zero or absent status never becomes a real status", () => {
  assertEquals(
    classifyWireError("x", "boom", "rate_limited", 0).statusCode,
    429,
  );
  assertEquals(
    classifyWireError("x", "boom", "rate_limited", undefined).statusCode,
    429,
  );

  // A real status still comes through.
  assertEquals(
    classifyWireError("x", "boom", "bad_request", 422).statusCode,
    422,
  );
});

// A status Go has no sentinel for still has to reach the caller.
Deno.test("an unclassified status is still reported", () => {
  const err = classifyWireError("x", "not found", undefined, 404);

  assertEquals(err.constructor.name, "AiError");
  assertEquals(err.statusCode, 404);
});
