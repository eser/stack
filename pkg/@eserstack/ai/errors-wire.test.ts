// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as errors from "./errors.ts";
import type { AiError } from "./errors.ts";

// The Go half is pinned in pkg/ajan/aifx/errors_classification_test.go. These
// pin the consuming half: that the slugs Go emits rebuild the typed hierarchy a
// caller can actually branch on.

nodeTest.test("wire kinds rebuild the typed hierarchy", () => {
  const cases: Array<[string, typeof AiError]> = [
    ["rate_limited", errors.RateLimitedError],
    ["auth_failed", errors.AuthFailedError],
    ["insufficient_credits", errors.InsufficientCreditsError],
    ["bad_request", errors.BadRequestError],
    ["service_unavailable", errors.ServiceUnavailableError],
  ];

  for (const [kind, Expected] of cases) {
    const err = errors.classifyWireError("anthropic", "boom", kind, 429);

    assert.assert(
      err instanceof Expected,
      `${kind} produced ${err.constructor.name}, want ${Expected.name}`,
    );
    assert.assertEquals(err.provider, "anthropic");
  }
});

nodeTest.test("an unknown or absent kind degrades to a bare AiError", () => {
  // An agent-backed provider, a missing binary, a decode failure: none of these
  // have a classification, and inventing one would be worse than none.
  for (const kind of [undefined, "", "something_new"]) {
    const err = errors.classifyWireError("kiro", "boom", kind);

    assert.assertEquals(err.constructor.name, "AiError", `kind ${kind}`);
  }
});

// The kind comes from the wire. Looked up on a plain object, "constructor"
// found Object and `new Object(message)` returned a String wrapper, while
// "toString" and "__proto__" threw a TypeError instead of returning an error.
nodeTest.test(
  "a kind named after an Object.prototype member is a bare AiError",
  () => {
    const kinds = [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
    ];

    for (const kind of kinds) {
      const err = errors.classifyWireError("openai", "boom", kind, 502);

      assert.assertInstanceOf(err, errors.AiError, `kind ${kind}`);
      assert.assertEquals(err.constructor.name, "AiError", `kind ${kind}`);
      assert.assertEquals(err.message, "boom");
      assert.assertEquals(err.provider, "openai");
      assert.assertEquals(err.statusCode, 502);
    }
  },
);

// Go wraps a cancelled context with its service-unavailable sentinel, which is
// a RETRYABLE class. Mapping that through would tell a caller to retry the
// request they just deliberately cancelled.
nodeTest.test("cancellation does not become a retryable error", () => {
  const err = errors.classifyWireError(
    "openai",
    "context canceled",
    "cancelled",
  );

  assert.assert(
    !(err instanceof errors.ServiceUnavailableError),
    "cancellation was classified as retryable",
  );
  assert.assertEquals(err.constructor.name, "AiError");
});

// `0 ?? 429` is `0`. Forwarding a defaulted zero would make every typed error
// report statusCode 0 instead of its class default.
nodeTest.test("a zero or absent status never becomes a real status", () => {
  assert.assertEquals(
    errors.classifyWireError("x", "boom", "rate_limited", 0).statusCode,
    429,
  );
  assert.assertEquals(
    errors.classifyWireError("x", "boom", "rate_limited", undefined).statusCode,
    429,
  );

  // A real status still comes through.
  assert.assertEquals(
    errors.classifyWireError("x", "boom", "bad_request", 422).statusCode,
    422,
  );
});

// A status Go has no sentinel for still has to reach the caller.
nodeTest.test("an unclassified status is still reported", () => {
  const err = errors.classifyWireError("x", "not found", undefined, 404);

  assert.assertEquals(err.constructor.name, "AiError");
  assert.assertEquals(err.statusCode, 404);
});
