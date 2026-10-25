// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as serialize from "./serialize.ts";

class ManifestFetchError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(
    url: string,
    status: number,
    options?: ErrorOptions,
  ) {
    super(`fetch manifest ${url}: HTTP ${status}`, options);
    this.url = url;
    this.status = status;
    this.name = "ManifestFetchError";
  }
}

const parse = (value: unknown): Record<string, unknown> => {
  const text = serialize.toJson(value);
  assert.assertNotEquals(text, null);

  return JSON.parse(text!) as Record<string, unknown>;
};

Deno.test("toJson writes an Error attribute with its name, message, stack and cause chain", () => {
  const root = new TypeError("socket closed");
  const outer = new ManifestFetchError("https://example.com/m.json", 502, {
    cause: root,
  });

  const { error } = parse({ error: outer, requestId: "req-1" }) as {
    error: Record<string, unknown>;
  };

  assert.assertEquals(error["name"], "ManifestFetchError");
  assert.assertEquals(
    error["message"],
    "fetch manifest https://example.com/m.json: HTTP 502",
  );
  assert.assertEquals(error["url"], "https://example.com/m.json");
  assert.assertEquals(error["status"], 502);
  assert.assertStringIncludes(String(error["stack"]), "ManifestFetchError");

  const cause = error["cause"] as Record<string, unknown>;
  assert.assertEquals(cause["name"], "TypeError");
  assert.assertEquals(cause["message"], "socket closed");
  assert.assertStringIncludes(String(cause["stack"]), "socket closed");
  assert.assertEquals(cause["cause"], undefined);
});

const causeCases = [
  {
    name: "keeps a non-Error cause as it is",
    cause: { code: "ENOENT" },
    expected: { code: "ENOENT" },
  },
  {
    name: "keeps a string cause as it is",
    cause: "disk full",
    expected: "disk full",
  },
];

for (const { name, cause, expected } of causeCases) {
  Deno.test(`serializeError ${name}`, () => {
    const json = serialize.serializeError(new Error("write", { cause }));
    assert.assertEquals(json["cause"], expected);
  });
}

Deno.test("serializeError leaves out a cause that was never set", () => {
  const json = serialize.serializeError(new Error("no cause"));
  assert.assertEquals("cause" in json, false);
});

Deno.test("serializeError stops a cyclic cause chain", () => {
  const first = new Error("first");
  const second = new Error("second", { cause: first });
  first.cause = second;

  const { error } = parse({ error: first }) as {
    error: { cause: { message: string; cause: unknown } };
  };

  assert.assertEquals(error.cause.message, "second");
  assert.assertEquals(error.cause.cause, serialize.CIRCULAR_CAUSE);
});

Deno.test("serializeError writes a field that points back to the error as the marker", () => {
  const error = new Error("self") as Error & { self?: Error };
  error.self = error;

  const json = parse(error);
  assert.assertEquals(json["self"], serialize.CIRCULAR_CAUSE);
});

Deno.test("serializeError stops errors whose fields point at each other", () => {
  const first = new Error("first") as Error & { peer?: Error };
  const second = new Error("second") as Error & { peer?: Error };
  first.peer = second;
  second.peer = first;

  const json = parse(first) as { peer: { message: string; peer: unknown } };

  assert.assertEquals(json.peer.message, "second");
  assert.assertEquals(json.peer.peer, serialize.CIRCULAR_CAUSE);
});

Deno.test("serializeError writes an error that appears twice without a cycle in full both times", () => {
  const shared = new Error("shared");
  const outer = new Error("outer", { cause: shared }) as Error & {
    last?: Error;
  };
  outer.last = shared;

  const json = parse(outer) as {
    last: { message: string };
    cause: { message: string };
  };

  assert.assertEquals(json.last.message, "shared");
  assert.assertEquals(json.cause.message, "shared");
});

Deno.test("serializeError keeps the errors of an AggregateError", () => {
  const aggregate = new AggregateError(
    [new Error("one"), new RangeError("two")],
    "both failed",
  );

  const json = parse(aggregate) as {
    message: string;
    errors: { name: string; message: string }[];
  };

  assert.assertEquals(json.message, "both failed");
  assert.assertEquals(
    json.errors.map((entry) => [entry.name, entry.message]),
    [["Error", "one"], ["RangeError", "two"]],
  );
});

Deno.test("toJson converts Error values nested in arrays", () => {
  const json = parse({ args: [new Error("in args")] }) as {
    args: { message: string }[];
  };

  assert.assertEquals(json.args[0]?.message, "in args");
});

Deno.test("toJson returns null for a value JSON cannot hold", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic["self"] = cyclic;

  assert.assertEquals(serialize.toJson(cyclic), null);
  assert.assertEquals(serialize.toJson({ big: 1n }), null);
});
