# Security Practices - Detailed Rules

## Environment Variables for Secrets

Scope: All secrets and sensitive configuration

Rule: All secrets MUST be in
environment variables, never in config files or code.

**Required Environment Variables:**

- `JWT_SECRET` - Required for authentication (validated on startup)
- `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY` - Provider API keys
- `DATABASE_URL` - Database connection string
- Other sensitive credentials

Correct:

```typescript
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
```

```go
jwtSecret := os.Getenv("JWT_SECRET")
if jwtSecret == "" {
    log.Fatal("JWT_SECRET environment variable is required")
}
```

Incorrect:

```typescript
const jwtSecret = "my-super-secret-key";  // Hardcoded secret

// config.json with secrets
{
  "jwtSecret": "my-super-secret-key"  // Never commit secrets
}
```

---

## Production Deployment Checklist

Scope: Production deployments

Rule: Ensure all security settings are properly
configured for production.

**Checklist:**

- [ ] Set `APP_ENV=production` to enable strict security mode
- [ ] Ensure all API keys are from environment variables, not config files
- [ ] Never commit `config.json` with secrets
- [ ] Use TLS for all external connections
- [ ] Configure rate limiting appropriately (`RATE_LIMIT_REQUESTS`)
- [ ] Set request size limits (`MAX_REQUEST_SIZE_MB`)
- [ ] Disable debugging endpoints and verbose logging

Correct:

```bash
APP_ENV=production
JWT_SECRET=<from-secrets-manager>
RATE_LIMIT_REQUESTS=100
MAX_REQUEST_SIZE_MB=10
EXPOSE_INTERNAL_ERRORS=false
```

Incorrect:

```bash
APP_ENV=development  # Wrong mode for production
EXPOSE_INTERNAL_ERRORS=true  # Leaks internal details
```

---

## SSRF Prevention

Scope: All outbound HTTP requests (webhooks, callbacks, etc.)

Rule: Validate
URLs before making requests. Block internal IP ranges.

**Blocked IP Ranges:**

- `10.x.x.x` - Private network
- `172.16.x.x` - `172.31.x.x` - Private network
- `192.168.x.x` - Private network
- `127.x.x.x` - Localhost
- `169.254.x.x` - Link-local
- `::1`, `fc00::/7` - IPv6 private

Correct:

```typescript
function isInternalIP(ip: string): boolean {
  const parts = ip.split(".");
  if (parts[0] === "10") return true;
  if (
    parts[0] === "172" && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31
  ) return true;
  if (parts[0] === "192" && parts[1] === "168") return true;
  if (parts[0] === "127") return true;
  return false;
}

async function sendWebhook(url: string, payload: unknown) {
  const hostname = new URL(url).hostname;
  const resolved = await dns.resolve(hostname);

  if (resolved.some(isInternalIP)) {
    throw new Error("Webhook URL resolves to internal IP");
  }

  // In production, require HTTPS
  if (process.env.APP_ENV === "production" && !url.startsWith("https://")) {
    throw new Error("HTTPS required for webhooks in production");
  }

  await fetch(url, { method: "POST", body: JSON.stringify(payload) });
}
```

Incorrect:

```typescript
async function sendWebhook(url: string, payload: unknown) {
  await fetch(url, { method: "POST", body: JSON.stringify(payload) }); // No validation
}
```

---

## Error Sanitization

Scope: API error responses

Rule: Sanitize error responses in production. Never
expose stack traces or internal details.

Correct:

```typescript
function handleError(error: Error, env: string): ErrorResponse {
  // Log full error internally
  logger.error("Request failed", {
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  });

  // Return sanitized response
  if (env === "production") {
    return {
      error: "An error occurred",
      code: "INTERNAL_ERROR",
    };
  }

  // Development: include details for debugging
  return {
    error: error.message,
    stack: error.stack,
  };
}
```

Incorrect:

```typescript
app.use((error, req, res, next) => {
  res.status(500).json({
    error: error.message,
    stack: error.stack, // Never in production
    query: req.query, // Never expose request details
  });
});
```

---

## Development vs Production Modes

Scope: Environment-specific behavior

Rule: Clearly separate development and
production configurations.

**Development Mode (`APP_ENV=development`):**

- Enables profiling endpoints
- Allows HTTP webhooks
- Detailed error messages
- Verbose logging

**Production Mode (`APP_ENV=production`):**

- Strict TLS requirements
- No profiling endpoints
- Sanitized error messages
- Minimal logging

Correct:

```typescript
const config = {
  isProduction: process.env.APP_ENV === "production",
  enableProfiling: process.env.APP_ENV === "development",
  requireHttps: process.env.APP_ENV === "production",
  exposeInternalErrors: process.env.APP_ENV === "development",
};
```

---

## Input Validation

Scope: All external inputs (API requests, user input, file uploads) Rule:
Validate at system boundaries. Fail fast on invalid input.

Correct:

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150),
});

function createUser(input: unknown) {
  const validated = CreateUserSchema.parse(input); // Throws on invalid
  return userRepository.create(validated);
}
```

```go
func CreateUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    if !isValidEmail(req.Email) {
        http.Error(w, "Invalid email", http.StatusBadRequest)
        return
    }

    // Proceed with validated input
}
```

Incorrect:

```typescript
function createUser(input: any) {
  return userRepository.create(input); // No validation
}
```

---

## Secure Defaults

Scope: Security configuration

Rule: Use secure defaults. Require explicit
opt-out for less secure options.

**Cookie Settings:**

```typescript
const cookieOptions = {
  httpOnly: true, // Prevent XSS access
  secure: true, // HTTPS only
  sameSite: "strict", // CSRF protection
  maxAge: 3600000, // 1 hour
};
```

**JWT Settings:**

```typescript
const jwtOptions = {
  algorithm: "RS256", // Asymmetric for production
  expiresIn: "1h", // Short-lived tokens
  issuer: "your-app",
  audience: "your-app",
};
```

**CORS Settings:**

```typescript
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || [],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
};
```
