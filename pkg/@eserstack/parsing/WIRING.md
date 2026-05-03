# @eserstack/parsing — FFI Wiring Contract

## 1. Input marshalling

Two FFI functions:

**Tokenize** (`EserAjanParsingTokenize`):
```ts
lib.symbols.EserAjanParsingTokenize(
  JSON.stringify({ input: string, definitions?: [{name, pattern}]? }),
);
```

Go `parsingTokenizeRequest`:
```json
{ "input": "hello world", "definitions": [{"name":"word","pattern":"\\w+"}] }
```

- `input`: UTF-8 string to tokenize
- `definitions`: optional array of `{name, pattern}` objects; if omitted, uses built-in `SimpleTokens()`

**SimpleTokens** (`EserAjanParsingSimpleTokens`):
```ts
lib.symbols.EserAjanParsingSimpleTokens(); // no arguments
```

## 2. Output marshalling

**Tokenize** success: `{ "tokens": [{"kind":"word","value":"hello","offset":0,"length":5},...] }`
**SimpleTokens** success: `{ "definitions": [{"name":"word","pattern":"\\w+"},...] }`
Error: `{ "error": "<message>" }`

Note: `offset` and `length` are JSON numbers — not string-coerced. The "all values are strings" finding from config does NOT apply to tokens (Go marshals typed fields as their native JSON types).

## 3. Error protocol

```go
type parsingTokenizeResponse struct {
    Tokens []parsingTokenJSON `json:"tokens,omitempty"`
    Error  string             `json:"error,omitempty"`
}
```

Error substrings → TS codes:
- `"invalid pattern"` or `"error parsing regexp"` → `PARSING_INVALID_PATTERN`
- anything else → `PARSING_TOKENIZE_FAILED`

## 4. Memory ownership

Same as config/crypto. Go `C.CString` heap allocation; backend copies to JS string and frees via `EserAjanFree`.

## 5. Sync vs async

Both `ffiLoader.tokenize()` and `ffiLoader.simpleTokens()` return `Promise`. Rationale same as other packages: `loadEserAjan()` is async.

## 6. Error translation

```ts
export class ParsingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParsingError";
  }
}

export const PARSING_TOKENIZE_FAILED = "PARSING_TOKENIZE_FAILED";
export const PARSING_INVALID_PATTERN = "PARSING_INVALID_PATTERN";
```

## Architectural note

`@eserstack/parsing` has two independent layers:
1. **TypeScript lexer/parser** (`lexer/`, `parser.ts`): state-machine tokenizer and combinator parser. Pure TS, no Go equivalent needed for this API shape. Not replaced.
2. **FFI tokenizer** (`adapters/ffi/loader.ts`): `ffiLoader` exposes Go's `parsingfx.Tokenize` which uses regex-based tokenization. Different API shape — `FfiToken[]` with `{kind, value, offset, length}`.

The `simpleTokens` FFI call returns the same built-in token definitions that `parsingfx.SimpleTokens()` uses in Go.

## Runtime (verified 2026-04-16)

- aarch64-darwin native: tokenize + simpleTokens confirmed via round-trip test
- Custom definitions and invalid-pattern error case verified
- Token `offset`/`length` fields confirmed as numbers (not strings)
