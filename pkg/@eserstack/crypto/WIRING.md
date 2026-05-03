# @eserstack/crypto — FFI Wiring Contract

## 1. Input marshalling

Single JSON string to `EserAjanCryptoHash`:

```ts
lib.symbols.EserAjanCryptoHash(
  JSON.stringify({ text?, data?, algorithm?, length? }),
);
```

Go `cryptoHashRequest`:
```json
{ "text": "hello", "algorithm": "SHA-256", "length": 64 }
// or binary input:
{ "data": "<base64>", "algorithm": "SHA-512" }
```

- `text`: UTF-8 string input (mutually exclusive with `data`)
- `data`: base64-encoded binary input
- `algorithm`: `"SHA-1" | "SHA-256" | "SHA-384" | "SHA-512"` (default: `"SHA-256"`)
- `length`: truncate hex output to this many chars (0 = full digest)
- Empty input (neither `text` nor `data`): hashes zero bytes

## 2. Output marshalling

```ts
const result = JSON.parse(raw) as { hash?: string; error?: string };
```

Success: `{ "hash": "2cf24dba..." }`
Error:   `{ "error": "unknown hash algorithm: \"MD5\"" }`

Note: values are NOT string-coerced here — `hash` is a hex string by nature, not an artifact of the wire protocol.

## 3. Error protocol

Go never returns null or empty string. Error field present on failure.

```go
type cryptoHashResponse struct {
    Hash  string `json:"hash,omitempty"`
    Error string `json:"error,omitempty"`
}
```

Error substrings → TS codes:
- `"unknown hash algorithm"` → `CRYPTO_UNKNOWN_ALGORITHM`
- anything else → `CRYPTO_HASH_FAILED`

## 4. Memory ownership

Same as config pilot. Go allocates with `C.CString`; backend copies to JS string and calls `EserAjanFree`. TS never calls `EserAjanFree` directly.

## 5. Sync vs async

`ffiLoader.hash()` returns `Promise<string>` even though the underlying FFI call is synchronous. Rationale: `loadEserAjan()` is async, and `ensureLib()` requires `await`.

The existing `hash.ts` public functions (`computeHash`, `computeStringHash`, `computeCombinedHash`) retain their own Web Crypto fallback for environments without native FFI. The `ffiLoader` throws `CryptoError` when the library is unavailable — no fallback in the adapter layer.

## 6. Error translation

```ts
export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

export const CRYPTO_HASH_FAILED       = "CRYPTO_HASH_FAILED";
export const CRYPTO_UNKNOWN_ALGORITHM = "CRYPTO_UNKNOWN_ALGORITHM";
```

## Architectural note

`@eserstack/crypto` has two layers:
1. **Public API** (`hash.ts`): `computeHash`, `computeStringHash`, `computeCombinedHash` — these call FFI first, fall back to Web Crypto. Not replaced.
2. **FFI adapter** (`adapters/ffi/loader.ts`): `ffiLoader` — pure wire marshalling, throws `CryptoError` if library unavailable. Used by tests and consumers who want explicit FFI semantics.

## Runtime (verified 2026-04-16)

- aarch64-darwin native: hash text and bytes confirmed via round-trip test
- WASM mode: `computeHash`/`computeStringHash` fall back to Web Crypto; `ffiLoader` would throw (library unavailable)
