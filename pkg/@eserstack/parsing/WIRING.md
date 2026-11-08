# @eserstack/parsing: FFI Wiring Contract

Verified: 2026-11-09 (TASK-267)

This page is for people who change `@eserstack/parsing` or the parsing names of
the bridge. It lists where each export runs and why the lexer and the parser
combinators stay in TypeScript, then the wire contract of the names that
`pkg/@eserstack/ajan/bridge_parsing.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/parsingfx`), and TS means it stays in
TypeScript, for the reason given. No export moved.

| Export                  | Where | Reason or Go entry                                                                                                                                                   |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tokenizer`             | TS    | Its definitions are JavaScript callbacks (`PatternFunction`), which cannot cross the bridge; see "Why the lexer stays in TypeScript"                                 |
| `createTokenizerState`  | TS    | Thin adapter: returns the plain state object the `Tokenizer` mutates                                                                                                 |
| `simpleTokens`          | TS    | A table of literals and three `PatternFunction`s that the `Tokenizer` calls; callers spread it into their own tables                                                 |
| `token`                 | TS    | Takes a JavaScript `Iterator<Token>` and returns a `Parser` function; it pulls one token and compares its kind, so a bridge call would cost more than the comparison |
| `sequence`              | TS    | Composes caller-supplied `Parser` functions, which cannot cross the bridge                                                                                           |
| `ffiLoader`             | Go    | `parsingTokenize` and `parsingSimpleTokens` (`parsingfx.Tokenize`, `parsingfx.SimpleTokens`)                                                                         |
| `tokenizeWith`          | TS    | Thin adapter: calls `loader.tokenize`                                                                                                                                |
| `simpleTokensWith`      | TS    | Thin adapter: calls `loader.simpleTokens`                                                                                                                            |
| `ParsingError`          | TS    | Thin adapter: the error `ffiLoader` throws                                                                                                                           |
| `PARSING_*` constants   | TS    | Thin adapter: the codes of `ParsingError`                                                                                                                            |
| `Token`                 | TS    | Type                                                                                                                                                                 |
| `TokenizerState`        | TS    | Type                                                                                                                                                                 |
| `TokenDefinitions`      | TS    | Type                                                                                                                                                                 |
| `PatternFunction`       | TS    | Type                                                                                                                                                                 |
| `PatternFunctionResult` | TS    | Type                                                                                                                                                                 |
| `ASTNode`               | TS    | Type                                                                                                                                                                 |
| `Parser`                | TS    | Type                                                                                                                                                                 |
| `FfiToken`              | TS    | Type                                                                                                                                                                 |
| `FfiTokenDefinition`    | TS    | Type                                                                                                                                                                 |
| `TokenizeInput`         | TS    | Type                                                                                                                                                                 |
| `SimpleTokensResult`    | TS    | Type                                                                                                                                                                 |
| `Loader`                | TS    | Type                                                                                                                                                                 |

The entry points are `.` (`mod.ts`, every export above), `./business` (the
`Loader` types, `tokenizeWith`, `simpleTokensWith`, `ParsingError` and the
codes) and `./adapters/ffi` (`ffiLoader`).

### Kept fallbacks

None. The lexer and the parser combinators are not fallbacks of a Go path: Go
cannot serve them (below), so they are the only implementation. `ffiLoader` has
no TypeScript fallback.

Nothing in the repository imports `@eserstack/parsing`: no laroux package, no
browser code and no other library (formats, codebase and config included). The
package is not on laroux's path.

With `ESER_AJAN=disabled`, `ffiLoader.tokenize`, `ffiLoader.simpleTokens`,
`tokenizeWith(ffiLoader, ...)` and `simpleTokensWith(ffiLoader)` reject with a
`ParsingError` whose code is `PARSING_TOKENIZE_FAILED` and whose `cause` is the
bridge's load error, while the `Tokenizer`, `token` and `sequence` keep
working. `parsing.ffi.test.ts` checks both in a child process.

### Why the lexer stays in TypeScript

TASK-267 planned to move the lexer and `parser.ts` onto the Go tokenizer and
combinators. They stay, for these reasons:

- `TokenDefinitions` maps each kind to a literal string or a
  `PatternFunction`, a JavaScript function the `Tokenizer` calls at every
  position, in table order. Callers write their own (the type is exported), and
  `simpleTokens` itself holds three. The bridge carries JSON, so Go cannot call
  them, and a Go engine would need a round trip per position for each table
  that has one.
- A Go path for tables of literals and the three built-in checks only would
  sit next to the TypeScript engine, which every table with a caller's function
  still needs. That adds a second engine with the same rules instead of
  removing one, and makes `simpleTokens` need the native library while a table
  with one custom function would not.
- Such a Go path would also have to copy JavaScript regular-expression
  behavior that Go's RE2 lacks: `\p{Emoji_Modifier_Base}`,
  `\p{Emoji_Presentation}` and `\p{Extended_Pictographic}` in the alphanumeric
  check, and JavaScript's `\s` (it includes `\v`, U+00A0 and the other Unicode
  spaces) in the whitespace check. Lengths count UTF-16 units, and an
  unmatched astral character becomes two `T_UNKNOWN` tokens, each a lone
  surrogate, which Go's JSON encoder would turn into U+FFFD.
- `Tokenizer.state` is public and mutable, and `_tokenizeChunk` is a
  synchronous generator that keeps a partial token in `state.buffer` when a
  pattern function says its match could continue. The Go streaming tokenizer
  (`parsingTokenizeStream`) holds the unmatched rest instead, so its chunk
  boundaries give other tokens.
- `token` and `sequence` read a lazy JavaScript iterator one token at a time,
  and a failed `token` has already consumed its token. parsingfx's `Kind` and
  `Sequence` work on a slice and give back the tokens of a failed match, so the
  two answer differently for the same grammar.

`Tokenizer` never calls Go: it once did whenever another package had loaded the
library, and then returned Go's token kinds (`identifier`, `integer`) instead of
`T_ALPHANUMERIC` and `T_NUMERIC`, read string patterns as regular expressions,
and left out `T_END`. `lexer/lexer.test.ts` checks that loading the library
does not change the tokens.

## 1. Input marshalling

Two names of the ajan dispatcher ABI (TASK-238), reached with
`lib.call(name, request)`. The request is an object, which the library encodes
as JSON for `EserAjanCall`; the request and answer types are in the ajan
binding table (`ffi/bindings.ts`).

**Tokenize** (`parsingTokenize`):

```ts
lib.call("parsingTokenize", { input: string, definitions?: [{name, pattern}] });
```

Go `parsingTokenizeRequest`:

```json
{
  "input": "hello world",
  "definitions": [{ "name": "word", "pattern": "\\w+" }]
}
```

- `input`: UTF-8 string to tokenize
- `definitions`: optional array of `{name, pattern}` objects; if omitted, uses
  built-in `SimpleTokens()`

**SimpleTokens** (`parsingSimpleTokens`):

```ts
lib.call("parsingSimpleTokens"); // no request
```

The bridge also serves an incremental tokenizer this package does not use yet:
`lib.stream("parsingTokenizeStream", { definitions? })` opens it, the
`parsingTokenizeStreamPush` call (`{ handle, chunk }`) answers the tokens of
each chunk, and the stream's `close()` answers the flushed rest.

All four names are in the wasi profile, and
`pkg/@eserstack/ajan/wasm/profile-parity.test.ts` compares their answers on the
WASM reactor and the native library.

## 2. Output marshalling

`lib.call` answers the parsed JSON, error answers included.

**Tokenize** success:
`{ "tokens": [{"kind":"word","value":"hello","offset":0,"length":5},...] }`
**SimpleTokens** success:
`{ "definitions": [{"name":"word","pattern":"\\w+"},...] }` Error:
`{ "error": "<message>" }`

`offset` and `length` are JSON numbers, not strings: Go marshals typed fields as
their native JSON types.

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

Same as config/crypto. Go allocates each answer with `C.CString`; the ajan
library copies it to a JS string and frees it with `EserAjanFree` itself.

## 5. Sync vs async

Both `ffiLoader.tokenize()` and `ffiLoader.simpleTokens()` return `Promise` and
load the bridge through `ensureLib()`. The `Tokenizer` and the combinators are
synchronous and do not touch the bridge.

## 6. Error translation

```ts
export class ParsingError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
}

export const PARSING_TOKENIZE_FAILED = "PARSING_TOKENIZE_FAILED";
export const PARSING_INVALID_PATTERN = "PARSING_INVALID_PATTERN";
```

When the bridge does not load, `ffiLoader` throws
`ParsingError("native library unavailable", PARSING_TOKENIZE_FAILED)` with the
bridge's load error (`getLoadError()`) as `cause`. Before TASK-267 the `cause`
was `undefined`; the message and code are unchanged.
