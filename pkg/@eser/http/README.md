# 🌐 [@eser/http](./)

HTTP utilities with security middleware for CORS, CSP, and CSRF protection.

## Features

- **CORS Middleware**: Cross-Origin Resource Sharing with flexible origin
  control
- **CSP Middleware**: Content Security Policy with nonce support
- **CSRF Middleware**: Double-submit cookie pattern for CSRF protection

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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
