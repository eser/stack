// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as adapter from "./adapter.ts";

const encoder = new TextEncoder();

type TrackedStream = {
  readonly stream: ReadableStream<Uint8Array>;
  /** How many chunks the reader asked for. */
  readonly pulls: () => number;
  readonly cancelled: () => boolean;
};

/**
 * A body stream that hands out `chunks` one read at a time, or `fill` forever
 * when `chunks` is null, and records how far it was read. A highWaterMark of 0
 * keeps the stream from pulling ahead of the reader.
 */
const trackedStream = (
  chunks: readonly Uint8Array[] | null,
  fill: Uint8Array = new Uint8Array(0),
): TrackedStream => {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (chunks === null) {
        controller.enqueue(fill);
        return;
      }
      const chunk = chunks[pulls - 1];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });

  return { stream, pulls: () => pulls, cancelled: () => cancelled };
};

const post = (
  body: BodyInit,
  headers: Record<string, string> = {},
): Request =>
  new Request("http://localhost/items", { method: "POST", body, headers });

const assertTooLarge = (
  result: results.Result<unknown, Error>,
): adapter.RequestBodyTooLargeError => {
  assert.assert(results.isFail(result), "expected the body to be rejected");
  assert.assertInstanceOf(result.error, adapter.RequestBodyTooLargeError);
  assert.assertEquals(result.error.status, 413);
  return result.error;
};

Deno.test("fromRequest maps method, path, headers and query", async () => {
  const request = new Request("http://localhost/api/items?page=2&sort=name", {
    headers: { "x-request-id": "req-1" },
  });

  const result = await adapter.fromRequest(request);

  assert.assert(results.isOk(result));
  assert.assertEquals(result.value, {
    method: "GET",
    path: "/api/items",
    headers: { "x-request-id": "req-1" },
    query: { page: "2", sort: "name" },
    body: undefined,
  });
});

const withinLimitCases: ReadonlyArray<{
  readonly name: string;
  readonly request: () => Request;
  readonly maxBodyBytes: number;
  readonly expected: unknown;
}> = [
  {
    name: "parses a JSON body with Content-Length under the limit",
    request: () =>
      post('{"name":"widget"}', {
        "content-type": "application/json",
        "content-length": "17",
      }),
    maxBodyBytes: 64,
    expected: { name: "widget" },
  },
  {
    name: "reads a non-JSON body as text",
    request: () => post("plain text", { "content-type": "text/plain" }),
    maxBodyBytes: 64,
    expected: "plain text",
  },
  {
    name: "accepts a body exactly at the limit",
    request: () => post("12345", { "content-length": "5" }),
    maxBodyBytes: 5,
    expected: "12345",
  },
  {
    name: "accepts an empty body with a limit of 0",
    request: () => post("", { "content-length": "0" }),
    maxBodyBytes: 0,
    expected: "",
  },
  {
    // "é" is two bytes in UTF-8; the split puts one byte in each chunk.
    name: "joins chunks before decoding a chunked body",
    request: () => {
      const bytes = encoder.encode('{"name":"café"}');
      return post(
        trackedStream([bytes.slice(0, 13), bytes.slice(13)]).stream,
        { "content-type": "application/json" },
      );
    },
    maxBodyBytes: 64,
    expected: { name: "café" },
  },
];

for (const { name, request, maxBodyBytes, expected } of withinLimitCases) {
  Deno.test(`fromRequest ${name}`, async () => {
    const result = await adapter.fromRequest(request(), { maxBodyBytes });

    assert.assert(results.isOk(result));
    assert.assertEquals(result.value.body, expected);
  });
}

Deno.test("fromRequest rejects a Content-Length over the limit with 413 before reading", async () => {
  const body = trackedStream([encoder.encode("x".repeat(2_000))]);

  const result = await adapter.fromRequest(
    post(body.stream, { "content-length": "2000" }),
    { maxBodyBytes: 1_000 },
  );

  const error = assertTooLarge(result);
  assert.assertEquals(error.source, "content-length");
  assert.assertEquals(error.limitBytes, 1_000);
  assert.assertEquals(error.bodyBytes, 2_000);
  assert.assertEquals(body.pulls(), 0);
  assert.assert(body.cancelled());
});

Deno.test("fromRequest rejects a chunked body over the limit with 413 and stops reading", async () => {
  // An endless body: without the limit this read would never finish.
  const body = trackedStream(null, new Uint8Array(300));

  const result = await adapter.fromRequest(post(body.stream), {
    maxBodyBytes: 1_000,
  });

  const error = assertTooLarge(result);
  assert.assertEquals(error.source, "stream");
  assert.assertEquals(error.bodyBytes, 1_200);
  assert.assertEquals(body.pulls(), 4);
  assert.assert(body.cancelled());
});

Deno.test("fromRequest counts the bytes read when Content-Length understates the body", async () => {
  const body = trackedStream([new Uint8Array(30), new Uint8Array(30)]);

  const result = await adapter.fromRequest(
    post(body.stream, { "content-length": "10" }),
    { maxBodyBytes: 40 },
  );

  const error = assertTooLarge(result);
  assert.assertEquals(error.source, "stream");
  assert.assertEquals(error.bodyBytes, 60);
});

for (const contentLength of ["abc", "-1", "1e3", ""]) {
  Deno.test(`fromRequest ignores Content-Length "${contentLength}" and still enforces the limit`, async () => {
    const small = await adapter.fromRequest(
      post("ok", { "content-length": contentLength }),
      { maxBodyBytes: 10 },
    );
    assert.assert(results.isOk(small));
    assert.assertEquals(small.value.body, "ok");

    const large = await adapter.fromRequest(
      post("x".repeat(11), { "content-length": contentLength }),
      { maxBodyBytes: 10 },
    );
    assert.assertEquals(assertTooLarge(large).source, "stream");
  });
}

Deno.test("fromRequest applies DEFAULT_MAX_BODY_BYTES when no limit is given", async () => {
  const atLimit = await adapter.fromRequest(
    post("x".repeat(adapter.DEFAULT_MAX_BODY_BYTES)),
  );
  assert.assert(results.isOk(atLimit));

  const overLimit = await adapter.fromRequest(
    post("x".repeat(adapter.DEFAULT_MAX_BODY_BYTES + 1)),
  );
  const error = assertTooLarge(overLimit);
  assert.assertEquals(error.limitBytes, adapter.DEFAULT_MAX_BODY_BYTES);
});

for (const maxBodyBytes of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  Deno.test(`fromRequest throws a RangeError for maxBodyBytes ${maxBodyBytes}`, async () => {
    await assert.assertRejects(
      () => adapter.fromRequest(post("ok"), { maxBodyBytes }),
      RangeError,
      "maxBodyBytes",
    );
  });
}

Deno.test("fromRequest fails on a malformed JSON body", async () => {
  const result = await adapter.fromRequest(
    post("{not json", { "content-type": "application/json" }),
  );

  assert.assert(results.isFail(result));
  assert.assertInstanceOf(result.error, SyntaxError);
});
