# 📨 [@eserstack/httpclient](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/httpclient` is
> published on npm under the same name (`pnpm add @eserstack/httpclient`); the
> JSR versions stay available but get no updates.

`@eserstack/httpclient` is an HTTP client for services and CLIs that talk to
remote APIs. It wraps `fetch` with a base URL, a timeout on every request,
retries with exponential backoff, rate-limit headers, request and response
interceptors, and a typed error for each way a request can fail. Every method
comes in two styles: one that throws, and one that returns a `Result` for
`@eserstack/functions` pipelines.

Install it with `pnpm add jsr:@eserstack/httpclient`.

## Quick Start

Create a client once and call it with paths relative to its base URL:

```typescript
import * as httpclient from "@eserstack/httpclient";

type User = { id: number; name: string };

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
  headers: { Authorization: "Bearer your_access_token" },
});

const response = await client.get<User>("/users/1");
console.log(response.status, response.data.name);
```

`response.data` is the parsed body: JSON when the response is JSON (or its text
parses as JSON), the text otherwise, and `undefined` for 204, 304 and empty
responses. The response also carries `headers`, `retries`, the sent `request`,
the `raw` `Response` and, when the server sent rate-limit headers, `rateLimit`.

## Requests

`get`, `post`, `put`, `patch` and `delete` take a path and options;
`request(method, path, options)` takes the method as well.

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
});

const created = await client.post<{ id: number }>("/users", {
  body: { name: "Ada" },
  params: { notify: "true" },
  timeout: 5_000,
});
```

A plain object or array `body` is sent as JSON with
`Content-Type: application/json` unless you set that header yourself. Strings,
`FormData`, `Blob`, `URLSearchParams`, buffers and streams are sent as they are.

| Option    | Description                                          |
| --------- | ---------------------------------------------------- |
| `headers` | Headers for this request, merged over the client's   |
| `body`    | Request body (see above)                             |
| `params`  | Query string parameters                              |
| `timeout` | Timeout in milliseconds for this request             |
| `retry`   | Retry policy for this request, or `false` to disable |
| `signal`  | `AbortSignal` that cancels the request               |

`client.withDefaults(overrides)` returns a new client with merged configuration
and leaves the original unchanged.

## Timeouts and Retries

Every request has a timeout, 30 seconds unless `timeout` says otherwise. Failed
requests are retried with exponential backoff:

| `RetryConfig` field | Default                          | Description                                  |
| ------------------- | -------------------------------- | -------------------------------------------- |
| `maxAttempts`       | `3`                              | Attempts in total, including the first       |
| `initialDelay`      | `1000`                           | First backoff delay in milliseconds          |
| `maxDelay`          | `30000`                          | Upper bound for one delay in milliseconds    |
| `factor`            | `2`                              | Multiplier applied to the delay each attempt |
| `jitter`            | `true`                           | Randomize delays to spread out retries       |
| `retryableStatuses` | `[408, 429, 500, 502, 503, 504]` | Status codes that trigger a retry            |
| `respectRetryAfter` | `true`                           | Wait for the `Retry-After` header on a 429   |

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
  timeout: 10_000,
  retry: { maxAttempts: 5, initialDelay: 500 },
});

// Turn retries off for one call
const health = await client.get("/health", { retry: false });
```

A request whose body is a `ReadableStream` is sent once and never retried,
because the first attempt consumes the stream.

## Errors

A failed request throws an `HttpClientError` subclass. Each one has
`statusCode`, `body` (the parsed error body), `retryAfter` (seconds), `request`
and `response` (or `null` when not known), and a `code`:

| Class                | `code`           | Raised when                               |
| -------------------- | ---------------- | ----------------------------------------- |
| `HttpResponseError`  | `RESPONSE_ERROR` | The server answered with a non-2xx status |
| `HttpRateLimitError` | `RATE_LIMITED`   | The server answered 429 Too Many Requests |
| `HttpTimeoutError`   | `TIMEOUT`        | The timeout elapsed                       |
| `HttpAbortError`     | `ABORT_ERROR`    | Your `signal` aborted the request         |
| `HttpNetworkError`   | `NETWORK_ERROR`  | DNS or the connection failed, no response |

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
});

try {
  await client.get("/users/1");
} catch (error) {
  if (error instanceof httpclient.HttpRateLimitError) {
    console.log(`Rate limited, retry after ${error.retryAfter} seconds`);
  } else if (error instanceof httpclient.HttpResponseError) {
    console.log(`HTTP ${error.statusCode}`, error.body);
  } else {
    throw error;
  }
}
```

`classifyError(error, response?)` and `classifyHttpStatus(status)` map a native
error or a status code to these classes for code that calls `fetch` itself.

## Result Style

Each method has a `Result` twin (`getResult`, `postResult`, `putResult`,
`patchResult`, `deleteResult`, `requestResult`) that never throws and returns
`Result<HttpResponse<T>, HttpClientError>`:

```typescript
import * as httpclient from "@eserstack/httpclient";
import * as primitives from "@eserstack/primitives";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
});

const result = await client.getResult<{ id: number }>("/users/1");

if (primitives.results.isOk(result)) {
  console.log(result.value.data.id);
} else {
  console.log(result.error.statusCode);
}
```

## Streaming

`requestStream(method, path, options)` and `postStream(path, options)` return
the body as a `ReadableStream` without reading it, for server-sent events and
NDJSON. Retries and the timeout apply to opening the connection only (on the
native transport the timeout covers the whole stream; see Native Client), and
response interceptors do not run. You own the stream and must read it to the end
or cancel it.

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
});

const stream = await client.postStream("/completions", {
  body: { prompt: "Hello", stream: true },
});

const decoder = new TextDecoder();
for await (const chunk of stream.body) {
  console.log(decoder.decode(chunk, { stream: true }));
}
```

`requestStreamResult` and `postStreamResult` are the `Result` forms.

## Interceptors

Request interceptors receive the `Request` before it is sent; response
interceptors receive the `HttpResponse` after it is parsed. Each runs in order
and passes its output to the next.

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
  interceptors: {
    request: [{
      name: "request-id",
      intercept: (request) => {
        const headers = new Headers(request.headers);
        headers.set("X-Request-Id", crypto.randomUUID());
        return new Request(request, { headers });
      },
    }],
  },
});
```

`InterceptorChain` is an ordered list you can add to and remove from by name,
and `applyRequestInterceptors` and `applyResponseInterceptors` run a list
outside the client.

## Native Client

By default every request goes through `fetch`, or through `fetchFn` when you
pass one. Set `transport: "native"` to send the requests through the Go HTTP
client of `@eserstack/ajan` instead:

```typescript
import * as httpclient from "@eserstack/httpclient";

const client = httpclient.createHttpClient({
  baseUrl: "https://api.example.com",
  transport: "native",
});

try {
  const response = await client.get<{ id: number }>("/users/1");
  console.log(response.data.id);
} finally {
  client.close();
}
```

Every method behaves the same on both transports: the request is built the same
way, interceptors run, the retry policy applies, and failures throw the same
errors. Only the exchange itself differs:

- With the native library, a call into the Go client blocks the JavaScript
  thread until it returns. The client's `timeout` bounds the call and covers
  reading the response body too, so a `requestStream` body is cut off once
  `timeout` has passed. A per-request `timeout` or `signal` is checked before
  each attempt but cannot stop one that is already in the Go client. On the WASM
  fallback (no native library for the platform), the requests wait on the
  runtime's `fetch` without blocking, and a `signal` stops one in flight; see
  the `@eserstack/ajan` README, "Network on the WASM fallback".
- Request bodies must be text: a string, `URLSearchParams`, or an object sent as
  JSON. A binary, `FormData`, `Blob` or stream body throws an `HttpClientError`;
  send those with the default transport.
- The response body of a non-streaming request arrives as UTF-8 text of at most
  32 MiB, so a binary body is not kept byte for byte. `requestStream` passes the
  bytes through unchanged.
- When the native library cannot be loaded, every request throws an
  `HttpClientError` whose `cause` says why.
- `transport: "native"` cannot be combined with `fetchFn`.

Call `client.close()` to release the Go client when you are done with a client.
The `@eserstack/httpclient/go-client` module calls the Go client directly; its
options use the Go bridge's field names, such as `timeoutMs`, `retryEnabled` and
`maxAttempts`.

For tests, pass `fetchFn` to replace `fetch`.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `request()` and `requestStream()` use `fetch` like the other methods instead
  of switching to the Go client when `@eserstack/ajan` loads. Pass
  `transport: "native"` in `HttpClientConfig` to use the Go client; passing it
  together with `fetchFn` throws `TypeError`.
- A request whose body is a `ReadableStream` is not retried. Buffer the body
  yourself if you need retries.

## 🔗 Links

- [JSR package](https://jsr.io/@eserstack/httpclient): the API reference
  generated from source
- [eser/stack on GitHub](https://github.com/eser/stack)
