---
name: security-practices
description: Security practices including secrets management, input validation, SSRF prevention, and production hardening. Use for security-sensitive code.
---

# security-practices

## Quick Start

1. All secrets in environment variables (never in config files)
2. Validate inputs at system boundaries
3. Sanitize error responses (no stack traces in production)
4. Use HTTPS for all external connections

## Key Principles

- Environment variables for all secrets
- SSRF prevention (block internal IP ranges)
- Development vs Production mode separation
- Rigorous input validation

## References

See [rules.md](references/rules.md) for complete conventions.
