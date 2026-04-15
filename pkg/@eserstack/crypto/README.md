# 🔑 [@eserstack/crypto](./)

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/crypto`

Cryptographic utilities for hashing, encoding, and related operations. Built on
the Web Crypto API for cross-runtime compatibility.

## 🚀 Quick Start

```typescript
import * as crypto from "@eserstack/crypto";

// Hash a string
const hash = await crypto.computeStringHash("hello world");
console.log(hash); // "b94d27b9934d3e08"

// Hash binary content
const data = new Uint8Array([1, 2, 3]);
const binaryHash = await crypto.computeHash(data);
console.log(binaryHash); // "039058c6f2c0cb49"
```

## 🛠 Features

- **String Hashing** — Compute cryptographic hashes from string content
- **Binary Hashing** — Hash raw `Uint8Array` data
- **Combined Hashing** — Hash multiple content pieces together
- **Multiple Algorithms** — Supports SHA-256, SHA-384, SHA-512, and SHA-1
- **Configurable Length** — Control hash output length in hex characters
- **Web Crypto API** — Uses the standard Web Crypto API for portability

## 🔌 API Reference

### `computeStringHash(content, algorithm?, length?)`

Compute a hash for string content.

```typescript
import * as crypto from "@eserstack/crypto";

const hash = await crypto.computeStringHash("hello world");
// "b94d27b9934d3e08"

// With custom algorithm and length
const sha512 = await crypto.computeStringHash("hello", "SHA-512", 32);
```

| Parameter   | Type            | Default     | Description                     |
| ----------- | --------------- | ----------- | ------------------------------- |
| `content`   | `string`        | —           | String content to hash          |
| `algorithm` | `HashAlgorithm` | `"SHA-256"` | Hash algorithm to use           |
| `length`    | `number`        | `16`        | Hash output length in hex chars |

### `computeHash(content, algorithm?, length?)`

Compute a hash for binary content.

```typescript
import * as crypto from "@eserstack/crypto";

const data = new TextEncoder().encode("hello world");
const hash = await crypto.computeHash(data);
```

| Parameter   | Type            | Default     | Description                     |
| ----------- | --------------- | ----------- | ------------------------------- |
| `content`   | `Uint8Array`    | —           | Binary content to hash          |
| `algorithm` | `HashAlgorithm` | `"SHA-256"` | Hash algorithm to use           |
| `length`    | `number`        | `16`        | Hash output length in hex chars |

### `computeCombinedHash(contents, algorithm?, length?)`

Compute a hash for multiple pieces of content concatenated together.

```typescript
import * as crypto from "@eserstack/crypto";

const hash = await crypto.computeCombinedHash([
  new Uint8Array([1, 2]),
  new Uint8Array([3, 4]),
]);
```

| Parameter   | Type                    | Default     | Description                       |
| ----------- | ----------------------- | ----------- | --------------------------------- |
| `contents`  | `readonly Uint8Array[]` | —           | Array of content to hash together |
| `algorithm` | `HashAlgorithm`         | `"SHA-256"` | Hash algorithm to use             |
| `length`    | `number`                | `16`        | Hash output length in hex chars   |

### `HashAlgorithm`

Supported hash algorithms: `"SHA-256"` | `"SHA-384"` | `"SHA-512"` | `"SHA-1"`

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
