# @eserstack/crypto — FFI Wiring Contract

Verified: 2026-11-08 (TASK-267)

This page is for people who change `@eserstack/crypto` or the crypto names of
the bridge. It lists where each export runs, then the wire contract of the
names that `pkg/@eserstack/ajan/bridge_crypto.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/cryptofx`), and TS means it stays in
TypeScript, for the reason given.

| Export                     | Where | Reason or Go entry                                                                      |
| -------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `HashAlgorithm`            | TS    | Type                                                                                    |
| `computeHash`              | Go    | `cryptoHash` (`HashHex`)                                                                |
| `computeStringHash`        | Go    | `cryptoHash` (`HashString`)                                                             |
| `computeCombinedHash`      | moved | `cryptoHashCombined` (`HashCombined`); it concatenated the parts in TypeScript before   |
| `HashInput`                | TS    | Type                                                                                    |
| `HashOptions`              | TS    | Type                                                                                    |
| `Loader`                   | TS    | Type                                                                                    |
| `hashWith`                 | TS    | Thin adapter: calls the loader it is given                                              |
| `ffiLoader`                | Go    | `cryptoHash`; the TypeScript part builds the request and maps errors to `CryptoError`   |
| `CryptoError`              | TS    | Thin adapter: the error type `ffiLoader` throws                                         |
| `CRYPTO_HASH_FAILED`       | TS    | Thin adapter: an error code of `CryptoError`                                            |
| `CRYPTO_UNKNOWN_ALGORITHM` | TS    | Thin adapter: an error code of `CryptoError`, chosen from Go's `unknown hash algorithm` |

`mod.ts` exports all of them; the `./hash`, `./business` and `./adapters/ffi`
sub-paths export subsets of the same list.

### Kept fallbacks

None. Nothing in the repository imports `@eserstack/crypto`: no browser code,
no laroux client code and no laroux server code, so nothing here needs to run
without the bridge, and laroux's build does not reach this package. `hash.ts`
had no Web Crypto path before TASK-267 either (this page claimed one until
then). No Web Crypto fallback was added: a host without `node:ffi` loads the
WASM build (decision-45), which serves both crypto names, so a Web Crypto copy
would duplicate a Go path.

With `ESER_AJAN=disabled`, `computeHash`, `computeStringHash` and
`computeCombinedHash` reject with the bridge's load error
(`eser-ajan native library unavailable: ...`, with the load failure as
`cause`), and `ffiLoader.hash` (and `hashWith(ffiLoader, ...)`) rejects with a
`CryptoError` of code `CRYPTO_HASH_FAILED` that carries the load failure as
`cause`. `bridge.test.ts` checks this in a child process.

### Fixtures

`pkg/ajan/cryptofx/testdata/combined_hashes.json` holds the cases both sides
run: `fixtures_test.go` in Go, and `bridge.test.ts` here, through
`EserAjanCall` directly and through `computeCombinedHash`.
`pkg/@eserstack/ajan/wasm/profile-parity.test.ts` calls both crypto names on
the WASM reactor and on the native library and compares the answers.

## 1. Input marshalling

One request object per call through the ajan dispatcher ABI (TASK-238); the
library encodes it as JSON for `EserAjanCall`. The request and answer types
are in the ajan binding table (`ffi/bindings.ts`).

**Hash** (`computeHash`, `computeStringHash`, `ffiLoader.hash`):

```ts
lib.call("cryptoHash", { text, data, algorithm, length });
```

```json
{ "text": "hello", "algorithm": "SHA-256", "length": 64 }
```

- `text`: UTF-8 string input; it wins over `data` when both are set
- `data`: base64-encoded binary input
- `algorithm`: `"SHA-1" | "SHA-256" | "SHA-384" | "SHA-512"` (default:
  `"SHA-256"`)
- `length`: truncate the hex output to this many characters (0 or less, or
  more than the digest has, gives the full digest)
- Empty input (neither `text` nor `data`): hashes zero bytes

**Combined hash** (`computeCombinedHash`):

```ts
lib.call("cryptoHashCombined", { parts, algorithm, length });
```

```json
{ "parts": ["AQI=", "AwQ="], "algorithm": "SHA-256", "length": 16 }
```

- `parts`: base64-encoded pieces, hashed in order as one input; no parts hash
  zero bytes
- `algorithm` and `length`: as for `cryptoHash`

`hash.ts` sends the package's own defaults (`"SHA-256"`, length 16);
`ffiLoader` sends `length` only when it is above 0, so its default is the full
digest.

## 2. Output marshalling

Both names answer the same shape:

```ts
const result = lib.call("cryptoHash", request); // { hash?, error? }
```

Success: `{ "hash": "2cf24dba..." }`. Error:
`{ "error": "unknown hash algorithm: \"MD5\"" }`, or
`{ "error": "invalid base64 in parts[1]: ..." }` for a part that is not base64.

## 3. Error protocol

Go never answers null or an empty string; an error answer has an `error` field
and no `hash`.

`hash.ts` throws an `Error` with Go's message. `ffiLoader` throws a
`CryptoError` and picks its code from the message:

- `"unknown hash algorithm"` → `CRYPTO_UNKNOWN_ALGORITHM`
- anything else → `CRYPTO_HASH_FAILED`

When the bridge does not load, `hash.ts` rejects with the error of
`ffiClient.requireLib()` (`eser-ajan native library unavailable: <reason>`,
with the load failure as `cause`), and `ffiLoader` with
`CryptoError("native library unavailable", CRYPTO_HASH_FAILED)` carrying the
load failure as `cause`.

## 4. Memory ownership

Go allocates each answer with `C.CString`; the ajan library copies it to a JS
string and frees it with `EserAjanFree` itself. TS never sees a C string.

## 5. Sync vs async

Every export returns a `Promise`: the bridge call itself is synchronous, but
the first call awaits the bridge's load (`requireLib()`, or `ensureLib()`
inside `callJson`). There is no synchronous export, so nothing here uses
`requireLibSync()`.

## 6. WASM

`bridge_crypto.go` builds with `!wasip1 || eserajan_wasi`, so `cryptoHash` and
`cryptoHashCombined` are in the wasi profile (`wasm: "yes"`): they read no
files and use only `crypto/sha1`, `crypto/sha256` and `crypto/sha512`.

## Behavioral divergences

Before TASK-267, `computeCombinedHash` concatenated its parts into one buffer
in TypeScript and sent it as `data`; Go now hashes the parts in order
(`HashCombined`), which gives the same digest.

When the bridge did not load, the three `hash.ts` functions threw
`Error("native library unavailable")` with no `cause`. They now throw the
bridge's load error, whose message is
`eser-ajan native library unavailable: <reason>` (it still contains the old
text) and whose `cause` is the load failure. `ffiLoader`'s `CryptoError` keeps
its message and code and gains the load failure as `cause`.
