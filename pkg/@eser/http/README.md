# 🌐 [@eser/http](./)

HTTP utilities with security middleware for CORS, CSP, CSRF protection, and rate
limiting.

## Features

- **CORS Middleware**: Cross-Origin Resource Sharing with flexible origin
  control
- **CSP Middleware**: Content Security Policy with nonce support
- **CSRF Middleware**: Double-submit cookie pattern for CSRF protection
- **Rate Limiter**: Instance-based rate limiting with automatic cleanup

## Quick Start

```typescript
import { middlewares } from "@eser/http";

// Create your middleware stack
const corsMiddleware = middlewares.cors({
  origin: ["https://example.com"],
  credentials: true,
});

const cspMiddleware = middlewares.csp({
  directives: {
    "default-src": "'self'",
    "script-src": ["'self'", "https://cdn.example.com"],
  },
});

const csrfMiddleware = middlewares.csrf({
  excludePaths: ["/api/webhooks/*"],
});

const rateLimiter = middlewares.createRateLimiter({
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
});
```

## CORS Middleware

```typescript
import { middlewares } from "@eser/http";

// Allow all origins
const cors = middlewares.cors();

// Allow specific origins
const cors = middlewares.cors({
  origin: ["https://example.com", "https://app.example.com"],
  credentials: true,
  maxAge: 86400,
});

// Dynamic origin check
const cors = middlewares.cors({
  origin: (origin) => origin.endsWith(".example.com"),
});
```

## CSP Middleware

```typescript
import { middlewares } from "@eser/http";

// Use default secure policy
const csp = middlewares.csp();

// Custom policy with nonce for inline scripts
const csp = middlewares.csp({
  useNonce: true,
  directives: {
    "default-src": "'self'",
    "img-src": ["'self'", "data:", "https:"],
  },
});

// Report-only mode for testing
const csp = middlewares.csp({ reportOnly: true });
```

## CSRF Middleware

```typescript
import { middlewares } from "@eser/http";

// Basic usage
const csrf = middlewares.csrf();

// Custom configuration
const csrf = middlewares.csrf({
  cookie: "my_csrf_token",
  header: "X-My-CSRF-Token",
  excludePaths: ["/api/webhooks/*", "/health"],
});

// Client-side: read token from cookie, include in header
// fetch("/api/data", { headers: { "X-CSRF-Token": tokenFromCookie } })
```

## Rate Limiter

Instance-based rate limiting with automatic cleanup and SSRF protection.

```typescript
import { middlewares } from "@eser/http";

// Create a rate limiter instance
const limiter = middlewares.createRateLimiter({
  maxRequests: 100, // Max requests per window
  windowMs: 60_000, // 1 minute window
  skipPaths: ["/health", "/api/public"],
  trustProxy: true, // Trust X-Forwarded-For header
});

// In your request handler
function handleRequest(request: Request) {
  const url = new URL(request.url);

  // Check rate limit
  const rateLimitResponse = limiter.check(request, url.pathname);
  if (rateLimitResponse) {
    return rateLimitResponse; // 429 Too Many Requests
  }

  // Process request...
  const response = new Response("OK");

  // Add rate limit headers to response
  const clientIp = middlewares.getClientIp(request, true);
  const headers = limiter.getHeaders(clientIp, url.pathname);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

// Cleanup on server shutdown
process.on("SIGTERM", () => {
  limiter.stop();
});
```

### Response Headers

The rate limiter adds these headers to responses:

| Header                  | Description                        |
| ----------------------- | ---------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests per window        |
| `X-RateLimit-Remaining` | Requests remaining in window       |
| `X-RateLimit-Reset`     | Unix timestamp when window resets  |
| `Retry-After`           | Seconds until retry (when limited) |

## API Reference

### `cors(options?)`

| Option        | Type                             | Default                                             | Description                        |
| ------------- | -------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `origin`      | `string \| string[] \| function` | `"*"`                                               | Allowed origins                    |
| `methods`     | `string[]`                       | `["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"]` | Allowed methods                    |
| `credentials` | `boolean`                        | `false`                                             | Allow credentials                  |
| `maxAge`      | `number`                         | -                                                   | Preflight cache duration (seconds) |

### `csp(options?)`

| Option       | Type                                 | Default         | Description                 |
| ------------ | ------------------------------------ | --------------- | --------------------------- |
| `directives` | `Record<string, string \| string[]>` | Secure defaults | CSP directives              |
| `reportOnly` | `boolean`                            | `false`         | Use report-only mode        |
| `useNonce`   | `boolean`                            | `false`         | Generate nonces for scripts |

### `csrf(options?)`

| Option         | Type       | Default          | Description              |
| -------------- | ---------- | ---------------- | ------------------------ |
| `cookie`       | `string`   | `"csrf_token"`   | Cookie name              |
| `header`       | `string`   | `"X-CSRF-Token"` | Header name              |
| `excludePaths` | `string[]` | -                | Paths to skip validation |

### `createRateLimiter(options?)`

| Option         | Type                        | Default                  | Description                     |
| -------------- | --------------------------- | ------------------------ | ------------------------------- |
| `maxRequests`  | `number`                    | `100`                    | Maximum requests per window     |
| `windowMs`     | `number`                    | `60000`                  | Time window in milliseconds     |
| `message`      | `string`                    | `"Too many requests..."` | Rate limit error message        |
| `skipPaths`    | `string[]`                  | `[]`                     | Paths to skip rate limiting     |
| `skipIps`      | `string[]`                  | `["127.0.0.1", "::1"]`   | IPs to skip rate limiting       |
| `trustProxy`   | `boolean`                   | `false`                  | Trust X-Forwarded-For header    |
| `keyGenerator` | `(req, pathname) => string` | IP-based                 | Custom rate limit key generator |

#### Rate Limiter Instance Methods

| Method                       | Description                             |
| ---------------------------- | --------------------------------------- |
| `check(request, pathname)`   | Returns 429 Response or null            |
| `getHeaders(clientIp, path)` | Get rate limit headers for response     |
| `stop()`                     | Stop cleanup interval                   |
| `getStoreSize()`             | Get current store size (for monitoring) |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
