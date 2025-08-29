# Security Policy

## Supported Versions

We take security seriously and provide security updates for the following
versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| 0.7.x   | :white_check_mark: |
| < 0.7   | :x:                |

## Reporting a Vulnerability

We greatly appreciate security research and responsible disclosure of
vulnerabilities. If you discover a security vulnerability in eserstack, please
report it to us promptly.

### How to Report

Please **DO NOT** report security vulnerabilities through public GitHub issues.
Instead, use one of the following methods:

1. **GitHub Security Advisories** (Preferred): Use GitHub's private
   vulnerability reporting feature
2. **Email**: Send details to
   [eser@acikyazilim.com](mailto:eser@acikyazilim.com)

### What to Include

When reporting a vulnerability, please provide:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested mitigations or fixes
- Your contact information for follow-up

### Response Timeline

- **Initial Response**: We will acknowledge receipt within 48 hours
- **Status Update**: We will provide a status update within 7 days
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Security Best Practices

When using eserstack, please follow these security best practices:

#### Dependency Injection

- Validate all service factory functions
- Avoid registering sensitive data directly as singleton services
- Use proper error handling in service factories
- Don't expose internal services through public APIs

#### Configuration Management

- Never commit sensitive configuration data to version control
- Use environment variables for secrets and credentials
- Validate all configuration inputs
- Use secure defaults for configuration options

#### Parsing and Input Handling

- Always validate input data before processing
- Use proper error boundaries to prevent information leakage
- Sanitize user-provided data before parsing
- Be cautious with dynamic imports and code execution

#### File System Operations

- Validate file paths to prevent directory traversal attacks
- Use proper permissions and access controls
- Avoid processing untrusted file contents without validation
- Implement resource limits for file operations

## Security Features

eserstack includes several security features:

- **Input Validation**: Built-in validation for service tokens and configuration
- **Error Boundaries**: Proper error handling to prevent information disclosure
- **Type Safety**: Strong TypeScript typing to prevent common vulnerabilities
- **Secure Defaults**: Conservative default configurations
- **Dependency Isolation**: Controlled dependency injection to prevent
  unauthorized access

## Known Security Considerations

### Dynamic Imports

The collector module uses dynamic imports which could potentially be exploited
if file paths are not properly validated. Always validate module paths before
using the collector.

### Configuration Loading

Configuration files are loaded and parsed dynamically. Ensure configuration
files come from trusted sources and validate their contents.

### Service Factory Functions

Service factory functions in the DI container execute arbitrary code. Only
register trusted factory functions.

## Updates and Patches

Security updates will be:

- Released as patch versions for supported major versions
- Announced through GitHub Security Advisories
- Documented in the CHANGELOG.md with security impact noted
- Tagged with appropriate CVE numbers when applicable

## Contact

For general security questions or to report non-critical security concerns, you
can:

- Open a GitHub Discussion in the Security category
- Contact the maintainers through the issue tracker
- Email us at [eser@acikyazilim.com](mailto:eser@acikyazilim.com)

Thank you for helping keep eserstack and its users safe!
