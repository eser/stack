# 🌐 [@eserstack/http](./)

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/http`

HTTP utilities with security middleware for CORS, CSP, CSRF protection, and rate
limiting.

## Features

- **CORS Middleware**: Cross-Origin Resource Sharing with flexible origin
  control
- **CSP Middleware**: Content Security Policy with nonce support
- **CSRF Middleware**: Double-submit cookie pattern for CSRF protection
- **Rate Limiter**: Instance-based rate limiting with automatic cleanup
- **Handler Adapter**: Web `Request` to `HttpEvent` with a bounded request body
  (413 over the limit)

## Quick Start

Each middleware is a `MiddlewareFn`: it takes the request and a `next` function
that produces the response.

```typescript
import * as http from "@eserstack/http";

const cors = http.middlewares.cors.cors({
  origin: ["https://example.com"],
  credentials: true,
});

Deno.serve((req) => cors(req, () => new Response("OK")));
```

## Middleware Stack

```typescript
import * as http from "@eserstack/http";

// Create your middleware stack
const corsMiddleware = http.middlewares.cors.cors({
  origin: ["https://example.com"],
  credentials: true,
});

const cspMiddleware = http.middlewares.csp.csp({
  directives: {
    "default-src": "'self'",
    "script-src": ["'self'", "https://cdn.example.com"],
  },
});

const csrfMiddleware = http.middlewares.csrf.csrf({
  excludePaths: ["/api/webhooks/*"],
});

const rateLimiter = http.middlewares.rateLimiter.createRateLimiter({
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
});

// Run them outermost first; each one calls the next. The rate limiter is not a
// MiddlewareFn: call rateLimiter.check() in the handler (see Rate Limiter).
const app = (req: Request) =>
  corsMiddleware(
    req,
    () =>
      cspMiddleware(req, () => csrfMiddleware(req, () => new Response("OK"))),
  );

Deno.serve(app);
```

## CORS Middleware

```typescript
import * as http from "@eserstack/http";

// Allow all origins
const allowAll = http.middlewares.cors.cors();

// Allow specific origins
const allowList = http.middlewares.cors.cors({
  origin: ["https://example.com", "https://app.example.com"],
  credentials: true,
  maxAge: 86400,
});

// Dynamic origin check
const allowSubdomains = http.middlewares.cors.cors({
  origin: (origin) => origin.endsWith(".example.com"),
});
```

## CSP Middleware

```typescript
import * as http from "@eserstack/http";

// Use default secure policy
const defaultPolicy = http.middlewares.csp.csp();

// Custom policy with nonce for inline scripts
const noncePolicy = http.middlewares.csp.csp({
  useNonce: true,
  directives: {
    "default-src": "'self'",
    "img-src": ["'self'", "data:", "https:"],
  },
});

// Report-only mode for testing
const reportOnly = http.middlewares.csp.csp({ reportOnly: true });
```

## CSRF Middleware

```typescript
import * as http from "@eserstack/http";

// Basic usage
const csrf = http.middlewares.csrf.csrf();

// Custom configuration
const customCsrf = http.middlewares.csrf.csrf({
  cookie: "my_csrf_token",
  header: "X-My-CSRF-Token",
  excludePaths: ["/api/webhooks/*", "/health"],
});

// Client-side: read token from cookie, include in header
// fetch("/api/data", { headers: { "X-CSRF-Token": tokenFromCookie } })
```

## Rate Limiter

Instance-based rate limiting with automatic cleanup, keyed on the connection's
peer address.

```typescript
import * as http from "@eserstack/http";

// Create a rate limiter instance
const limiter = http.middlewares.rateLimiter.createRateLimiter({
  maxRequests: 100, // Max requests per window
  windowMs: 60_000, // 1 minute window
  skipPaths: ["/health", "/api/public"],
  trustProxy: true, // Read X-Forwarded-For, but only from trustedProxies
  trustedProxies: ["127.0.0.1", "::1"], // Your reverse proxy's address
});

// In your request handler (Deno.serve passes info as the second argument)
function handleRequest(request: Request, info: Deno.ServeHandlerInfo) {
  const url = new URL(request.url);
  const remote = "hostname" in info.remoteAddr ? info.remoteAddr : null;

  // Check rate limit, keyed on the connection's peer address
  const rateLimitResponse = limiter.check(request, url.pathname, remote);
  if (rateLimitResponse !== null) {
    return rateLimitResponse; // 429 Too Many Requests
  }

  // Process request...
  const response = new Response("OK");

  // Add rate limit headers to response
  const clientIp = http.middlewares.rateLimiter.getClientIp(
    request,
    true,
    remote,
  );
  const headers = limiter.getHeaders(clientIp, url.pathname);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

Deno.serve(handleRequest);

// Cleanup on server shutdown
Deno.addSignalListener("SIGTERM", () => {
  limiter.stop();
});
```

The client identity is the connection's peer address. With `trustProxy` on, a
forwarded header is used only when the peer is one of `trustedProxies`, and the
client is the right-most X-Forwarded-For hop that is not a trusted proxy. A
request with no identifiable client (no `remote` and no usable header) is not
counted, so unidentified callers never share one bucket.

### Response Headers

The rate limiter adds these headers to responses:

| Header                  | Description                        |
| ----------------------- | ---------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests per window        |
| `X-RateLimit-Remaining` | Requests remaining in window       |
| `X-RateLimit-Reset`     | Unix timestamp when window resets  |
| `Retry-After`           | Seconds until retry (when limited) |

## Handler Adapter

Bridge between Web `Request`/`Response` and `@eserstack/functions` handler
pattern (`HttpEvent`/`HttpResponse`):

```typescript
import * as http from "@eserstack/http";

const request = new Request("https://example.com/api/items?page=2");

// Convert a Web Request to an HttpEvent (a Result: ok or fail)
const eventResult = await http.adapter.fromRequest(request);

// Convert an HttpResponse back to a Web Response
const webResponse = http.response.toWebResponse({
  status: 200,
  headers: { "content-type": "application/json" },
  body: { ok: true },
});
```

### Request Body Limit

`fromRequest` reads the body into memory to parse it, so it stops at
`maxBodyBytes` (default `DEFAULT_MAX_BODY_BYTES`, 1 MiB). A `Content-Length`
over the limit fails before any byte is read; a body without one (chunked) fails
as soon as the bytes read pass the limit, and the rest is not read. Both fail
with `RequestBodyTooLargeError`, whose `status` is 413:

```typescript
import * as http from "@eserstack/http";
import * as primitives from "@eserstack/primitives";

Deno.serve(async (req) => {
  const event = await http.adapter.fromRequest(req, { maxBodyBytes: 65_536 });

  if (primitives.results.isFail(event)) {
    const status = event.error instanceof http.adapter.RequestBodyTooLargeError
      ? event.error.status // 413 Content Too Large
      : 400;
    return new Response(event.error.message, { status });
  }

  return new Response(`received ${event.value.method} ${event.value.path}`);
});
```

A `maxBodyBytes` that is not a non-negative integer throws a `RangeError`.

## API Reference

### `cors(options?)`

| Option           | Type                             | Default                                             | Description                        |
| ---------------- | -------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `origin`         | `string \| string[] \| function` | `"*"`                                               | Allowed origins                    |
| `methods`        | `string[]`                       | `["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"]` | Allowed methods                    |
| `credentials`    | `boolean`                        | `false`                                             | Allow credentials                  |
| `maxAge`         | `number`                         | -                                                   | Preflight cache duration (seconds) |
| `allowedHeaders` | `string[]`                       | `[]`                                                | Headers the request may use        |
| `exposedHeaders` | `string[]`                       | -                                                   | Headers the browser may read       |

### `csp(options?)`

| Option       | Type                                                | Default         | Description                 |
| ------------ | --------------------------------------------------- | --------------- | --------------------------- |
| `directives` | `Partial<Record<CspDirective, string \| string[]>>` | Secure defaults | CSP directives              |
| `reportOnly` | `boolean`                                           | `false`         | Use report-only mode        |
| `useNonce`   | `boolean`                                           | `false`         | Generate nonces for scripts |

### `csrf(options?)`

| Option          | Type       | Default                                                    | Description               |
| --------------- | ---------- | ---------------------------------------------------------- | ------------------------- |
| `cookie`        | `string`   | `"csrf_token"`                                             | Cookie name               |
| `header`        | `string`   | `"X-CSRF-Token"`                                           | Header name               |
| `formField`     | `string`   | `"_csrf"`                                                  | Form field name           |
| `methods`       | `string[]` | `["POST", "PUT", "PATCH", "DELETE"]`                       | Methods that need a token |
| `excludePaths`  | `string[]` | -                                                          | Paths to skip validation  |
| `cookieOptions` | `object`   | `httpOnly`, `secure`, `SameSite=Strict`, `path: "/"`, 24 h | Token cookie attributes   |

### `adapter.fromRequest(request, options?)`

| Option         | Type     | Default           | Description                 |
| -------------- | -------- | ----------------- | --------------------------- |
| `maxBodyBytes` | `number` | `1048576` (1 MiB) | Largest body read, in bytes |

### `createRateLimiter(options?)`

| Option           | Type              | Default                  | Description                                |
| ---------------- | ----------------- | ------------------------ | ------------------------------------------ |
| `maxRequests`    | `number`          | `100`                    | Maximum requests per window                |
| `windowMs`       | `number`          | `60000`                  | Time window in milliseconds                |
| `message`        | `string`          | `"Too many requests..."` | Rate limit error message                   |
| `skipPaths`      | `string[]`        | `["/health"]`            | Paths to skip rate limiting                |
| `skipIps`        | `string[]`        | `["127.0.0.1", "::1"]`   | Client addresses to skip                   |
| `trustProxy`     | `boolean`         | `false`                  | Read X-Forwarded-For/X-Real-IP             |
| `trustedProxies` | `string[]`        | `["127.0.0.1", "::1"]`   | Peers whose forwarded headers are believed |
| `keyGenerator`   | `(req) => string` | IP-based                 | Custom rate limit key generator            |

#### Rate Limiter Instance Methods

| Method                              | Description                             |
| ----------------------------------- | --------------------------------------- |
| `check(request, pathname, remote?)` | Returns 429 Response or null            |
| `getHeaders(clientIp, path)`        | Get rate limit headers for response     |
| `stop()`                            | Stop cleanup interval                   |
| `getStoreSize()`                    | Get current store size (for monitoring) |

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `adapter.fromRequest` limits bodies to 1 MiB by default. A larger body returns
  `results.fail(RequestBodyTooLargeError)` with status 413, and an invalid
  `maxBodyBytes` throws `RangeError`. Raise the limit, or stream `req.body`
  yourself for uploads:

  ```typescript
  import * as http from "@eserstack/http";

  // Before
  const request = await http.adapter.fromRequest(req);
  // After: allow 10 MiB
  const request = await http.adapter.fromRequest(req, {
    maxBodyBytes: 10 * 1024 * 1024,
  });
  ```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
