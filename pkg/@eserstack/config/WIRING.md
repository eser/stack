# @eserstack/config — FFI Wiring Contract

Verified: 2026-11-09 (TASK-267)

This page is for people who change `@eserstack/config` or the config names of
the bridge. It lists where each export runs, then the wire contract of the
config names that `pkg/@eserstack/ajan/bridge_config.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/configfx`), and TS means it stays in
TypeScript, for the reason given. Each entry point is listed once; `./business`
and `./adapters/ffi` re-export rows of `.`.

`.` (`mod.ts`), `./business`, `./adapters/ffi`:

| Export                                                                                                                   | Where | Reason or Go entry                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------- |
| `load`                                                                                                                   | Go    | `configLoad`, through `ffiLoader`                                       |
| `ffiLoader`                                                                                                              | Go    | `configLoad` (`ConfigManager.LoadMap`)                                  |
| `loadWith`                                                                                                               | TS    | Thin adapter: calls the loader it is given                              |
| `ConfigError`                                                                                                            | TS    | Thin adapter: the error class the `configLoad` answers map to           |
| `CONFIG_LOAD_FAILED`, `CONFIG_PARSE_ENV_FILE_FAILED`, `CONFIG_PARSE_JSON_FILE_FAILED`, `CONFIG_PARSE_JSON_STRING_FAILED` | TS    | Thin adapter: the codes `ConfigError` carries                           |
| `ConfigOptions`, `ConfigSource`, `ConfigValues`, `Loader`                                                                | TS    | Type                                                                    |
| `Config`, `createConfigState`, `ConfigState`                                                                             | TS    | Type: holds key metadata in memory; `setKeyMeta` only assigns           |
| `DotenvSource`, `createDotenvSourceState`, `DotenvSourceState`                                                           | TS    | Type: a source stub whose methods resolve to the default they are given |
| `ConfigItem`, `ConfigItemMeta`, `ContainerReadable`, `Provider`, `RequestContext`, `Source`, `SourceState`               | TS    | Type                                                                    |

`./dotenv`:

| Export                                                                       | Where | Reason or Go entry                                                              |
| ---------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `parseEnvString`                                                             | moved | `configParseDotenv` (`envparser.ParseDotenv`), synchronously                    |
| `parseEnvFromFile`                                                           | moved | `configReadDotenvFile` (`envparser.ReadDotenvFile`)                             |
| `load`                                                                       | moved | `configLoadDotenv` (`envparser.LoadDotenv`)                                     |
| `configure`                                                                  | TS    | Thin adapter: runs `load()`, then the caller's callback with a reader           |
| `createEnvReader`, `EnvReader`                                               | TS    | Thin adapter: typed reads over the loaded `Map`, one key at a time              |
| `EnvFileTooLargeError`                                                       | TS    | Thin adapter: the error class the `too_large` answer maps to                    |
| `DEFAULT_MAX_FILE_SIZE`                                                      | TS    | Type: the default limit the loader sends (`envparser.DefaultDotenvMaxFileSize`) |
| `env`, `envVars`, `defaultEnvValue`                                          | TS    | Type: the `EnvMap` key and the defaults the loader sends                        |
| `EnvMap`, `LoaderOptions`, `BaseEnvVariables`, `EnvVariables`, `ConfigureFn` | TS    | Type                                                                            |

`./file`:

| Export                                                                    | Where | Reason or Go entry                                                                                       |
| ------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `locate`                                                                  | moved | `configLocateFile` (`configfx.LocateFile`)                                                               |
| `getFileFormat`                                                           | moved | `configFileFormat` (`configfx.FileFormatOf`), synchronously                                              |
| `parse`                                                                   | moved | `configParseFile` (`configfx.ParseFile`): the read, the format, JSON and JSONC; YAML and TOML: see below |
| `load`                                                                    | moved | `locate`, then `parse`, both in Go                                                                       |
| `ConfigParseError`                                                        | TS    | Thin adapter: the error class the `parse` answer maps to                                                 |
| `resolvePath`                                                             | TS    | Thin adapter over the WHATWG URL resolution of `new URL`                                                 |
| `FileFormats`, `FileFormat`, `FileFormatKey`, `LoadResult`, `ParseResult` | TS    | Type; `configfx.FileFormat` numbers the formats the same way                                             |

`./manifest`:

| Export               | Where | Reason or Go entry                                                 |
| -------------------- | ----- | ------------------------------------------------------------------ |
| `loadManifest`       | TS    | Fidelity: decodes YAML with `yaml`; see YAML and TOML stay in TS   |
| `getManifestPath`    | TS    | Thin adapter: stats the names `loadManifest` tries, kept beside it |
| `MANIFEST_FILENAMES` | TS    | Type: the names both functions try                                 |

The internal modules `dotenv/parser.ts` (the `.env` dialect) and
`file/file-search.ts` (the directory walk) are deleted: Go owns both. Neither
was exported from an entry point.

### YAML and TOML stay in TS

`file/loader.ts` decodes YAML with `yaml` and TOML with `smol-toml`, and
`manifest.ts` decodes YAML. These rows stay in TypeScript for fidelity, the
reason the formats step of TASK-267 gives for `yamlFormat` and `tomlFormat`
(formats WIRING.md, "Why the other codecs stay in TypeScript"). Go's codecs
(`formatfx` over `yaml.v3` and `BurntSushi/toml`) decode into Go maps, which
lose the key order of the document, smol-toml's `TomlDate` values and its
null-prototype tables, and they accept a different YAML schema; the bridge's
JSON cannot carry the NaN and Infinity both libraries return. Moving the decode
would change what `parse()` and `loadManifest()` return.

### Kept fallbacks

None. The package has no browser code, and laroux is not on its import path:
laroux-server and laroux-bundler import `@eserstack/codebase/directive-analysis`
and `@eserstack/codebase/cli-support` only, and neither imports
`@eserstack/config`. The importers are `@eserstack/posts` and `@eserstack/cs`
(`./dotenv`), `@eserstack/workflows`, `@eserstack/cli` and
`@eserstack/codebase` (`./manifest`), and `codebase/package/loader.ts`
(`parse` of `./file`). With `ESER_AJAN=disabled`, every moved row throws (the
synchronous ones) or rejects with the bridge's load error (`eser-ajan native
library unavailable: ...`, with the load failure as `cause`); `load` of `.`
keeps its `ConfigError` with `CONFIG_LOAD_FAILED`. `bridge.test.ts` checks
these in a child process, and that the TS rows still work there.

### Synchronous exports

`parseEnvString` and `getFileFormat` return synchronously. They reach the
bridge through `requireLibSync()` of `@eserstack/ajan/ffi/client`, which loads
the library with `loadEserAjanSync()` on first use: native first, then the
WASM build, which compiles on the calling thread (the ajan README gives the
timings).

### Fixtures

The cases were written from what the TypeScript code answered before the move,
then Go was made to pass them:

- `pkg/ajan/configfx/envparser/testdata/dotenv_cases.json`: 60 parse cases
  (quotes, escapes, comments, the `export` prefix, multiline values, CRLF,
  interpolation with defaults, self references, ignored keys). Go runs them in
  `dotenv_fixtures_test.go`; `bridge.test.ts` runs them through
  `configParseDotenv` and `parseEnvString`. `dialect.json`, shared since
  TASK-319, still runs in `dialect.test.ts`.
- `pkg/ajan/configfx/envparser/testdata/dotenv_load.json`: the files and 11
  load cases (the environment name, `.env.local` skipped for `test`, the
  process environment, the size limit). Both sides write the files to a
  temporary directory, because `.gitignore` ignores `.env.local`.
- `pkg/ajan/configfx/testdata/file_cases.json`: the formats of 21 paths, 8
  locate cases and 15 parse cases. Both sides write the files to a temporary
  directory, because the broken ones would fail the repository's JSON, TOML
  and BOM validators.

`pkg/@eserstack/ajan/wasm/profile-parity.test.ts` calls the six names on the
WASM reactor and on the native library and compares the answers.

### Behavior changes

- The moved functions need the bridge; before TASK-267 they ran in TypeScript
  only. On the WASM build, the names that read files reach only paths under the
  working directory (its preopen), as every `fs` name does.
- JSON and JSONC syntax errors carry Go's text with the line and byte column,
  such as
  `syntax error: line 3, column 3: invalid character '"' after object value (expecting ',' or '}')`,
  where they carried V8's `JSON.parse` text or jsonc-parser's code
  (`CommaExpected at line 3, column 3`, in UTF-16 columns). The error is still
  a `ConfigParseError` with a `SyntaxError` cause and the same `format` and
  `filepath`.
- A `__proto__` key in a JSONC file is an own property, as `JSON.parse` makes
  it; jsonc-parser assigned it, which set the object's prototype.
- In a `.env` file, a reference to a name that the file does not set and that
  is a member of `Object.prototype` (`$constructor`, `$toString`) expanded to
  that function's source text; it now resolves like any other name (the
  environment, the default, then empty).
- A `.env` read that fails for a reason other than a missing file, the size
  limit or a permission (a directory named `.env`, say) rejects with an `Error`
  carrying Go's message instead of Node's system error. A permission failure is
  still a `PermissionDeniedError`, and `parse()` still throws `NotFoundError`
  for a missing file; their `cause` is now an `Error` with Go's message.
- `ReadDotenvFile` reads at most `maxFileSize + 1` bytes, so a file that grows
  past the limit between the size check and the read is refused instead of
  read whole.

## 1. Input marshalling

Every call goes through the dispatcher ABI of `@eserstack/ajan` (TASK-238):
`lib.call(name, request)` with a request object, which the library encodes as
JSON for `EserAjanCall`. The names and their request and answer types are in
the ajan binding table (`ffi/bindings.ts`).

**configLoad** (`ffiLoader`):

```ts
lib.call("configLoad", { sources, ...(opts ?? {}) });
```

Valid source specifiers:

- `"system_env"`: all OS environment variables
- `"env_file"`: `.env` (resolved by `APP_ENV`)
- `"env_file:<filename>"`: a named dotenv file
- `"json_file"`: `config.json` (resolved by `APP_ENV`)
- `"json_file:<filename>"`: a named JSON config file
- `"json_string:<json>"`: an inline JSON string

`configLoad` reads `.env` files in the Go loader's own dialect
(`envparser.ParseBytes`: dotted keys, a colon separator, a `#` that starts a
comment only after a space), which configfx uses to fill structs. The dotenv
names below use the dialect of `@eserstack/config/dotenv`
(`envparser.ParseDotenv`).

**Host environment.** The WASM build has no environment of its own, so the
three dotenv names take it in the request (`adapters/ffi/dotenv.ts` reads it):

```json
{ "environ": [["HOME", "/home/user"]], "envCaseInsensitive": false }
```

`environ` keeps the host's order, which `configLoadDotenv` keeps in its
answer. `envCaseInsensitive` is set on Windows, which looks variables up
regardless of case; it applies to the references a file expands, not to the
environment name, which the TypeScript loader read from a plain object.

**Dotenv names:**

```ts
lib.call("configParseDotenv", { text, environ, envCaseInsensitive });
lib.call("configReadDotenvFile", {
  path,
  maxFileSize,
  environ,
  envCaseInsensitive,
});
lib.call("configLoadDotenv", {
  baseDir,
  env,
  envVars,
  defaultEnvValue,
  loadProcessEnv,
  maxFileSize,
  environ,
  envCaseInsensitive,
});
```

`maxFileSize` is `null` for no limit (`Infinity` and `NaN` in TypeScript;
JSON has neither). `configLoadDotenv` joins `baseDir + "/.env"` and so on as
text, as the template strings did, and takes the environment name from `env`
when it is set, else from the first `envVars` variable of `environ` that is
set and not empty, else `defaultEnvValue`.

**File names:**

```ts
lib.call("configLocateFile", { baseDir, filenames, searchParents });
lib.call("configFileFormat", { path, windows });
lib.call("configParseFile", { path, format, windows });
```

`windows` makes the extension follow `path.win32` (backslash separators and a
drive letter), as `node:path` does on Windows. `format` overrides the format
picked from the extension.

## 2. Output marshalling

Go answers a JSON string inside the dispatcher's envelope; `lib.call` returns
it parsed.

- `configLoad`: `{ values }`, every leaf a string (`configfx.LoadMap` coerces
  JSON values to strings), or `{ error }`.
- `configParseDotenv`, `configReadDotenvFile`: `{ entries, ignored? }`.
  `entries` are `[key, value]` pairs, each where its key first appears;
  `ignored` are the keys skipped as not identifiers, which the library warns
  about with the words of @std/dotenv. The library builds a null-prototype
  record from the pairs, as the TypeScript parser did.
- `configLoadDotenv`: `{ envName, entries, ignored? }`; the library builds the
  `EnvMap` with the name under the `env` symbol first.
- `configLocateFile`: `{ path }`, or `{}` when nothing is found.
- `configFileFormat`: `{ format }`, numbered as `FileFormats`.
- `configParseFile`: `{ format, content }` for JSON and JSONC, where `content`
  is the document with its keys in file order (Go checks it and passes the
  text on instead of decoding it into maps); `{ format, text }` for YAML and
  TOML, which `file/loader.ts` decodes; `{ format: 0 }` for an environment file
  or an unknown extension.

## 3. Error protocol

Always-valid-JSON model: Go never returns null or empty. The `error` field is
present and non-empty on failure.

`configLoad` has no structured codes; TypeScript maps substrings:

- `"failed to parse env file"` → `CONFIG_PARSE_ENV_FILE_FAILED`
- `"failed to parse JSON file"` → `CONFIG_PARSE_JSON_FILE_FAILED`
- `"failed to parse JSON string"` → `CONFIG_PARSE_JSON_STRING_FAILED`
- anything else → `CONFIG_LOAD_FAILED`

The dotenv and file names add a `code`:

| `code`              | Answer fields                 | TypeScript error                                        |
| ------------------- | ----------------------------- | ------------------------------------------------------- |
| `too_large`         | `fileSize`, `filepath` (load) | `EnvFileTooLargeError(filepath, fileSize, maxFileSize)` |
| `permission_denied` |                               | `PermissionDeniedError(path)` of cross-runtime          |
| `not_found`         |                               | `NotFoundError(path)` of cross-runtime (`parse`)        |
| `parse`             | `format`                      | `ConfigParseError(path, format, SyntaxError)`           |
| none                |                               | `Error(message)`                                        |

A missing `.env` file is not an error: it reads as empty. The dotenv answers
carry `ignored` on failure too, so the warnings for the files read before the
failure still print.

## 4. Memory ownership

Go allocates the return string with `C.CString` (heap). The FFI backend
(`node:ffi` on Node.js) copies the C string to a JS string and then calls
`EserAjanFree` itself; TS calling code never sees a C string. The WASM reactor
copies the answer out of its memory the same way.

## 5. Sync vs async

`load`, `ffiLoader.load`, `parseEnvFromFile`, `locate`, `parse` and both
`load`s of the entry points return promises: `requireLib()` awaits the
asynchronous loader once. The names are not blocking (`blocking: false`), so
the calls run on the calling thread. `parseEnvString` and `getFileFormat` are
synchronous (see Synchronous exports).

## 6. WASM

`bridge_config.go` builds into the wasi profile (`!wasip1 || eserajan_wasi`).
`configParseDotenv` and `configFileFormat` read no files (`wasm: "yes"`); the
others need the loader's preopen of the working directory (`wasm: "fs"`), and
relative paths resolve against it because the loader sets `PWD`. None of them
pulls in `net`, `crypto/tls`, `os/exec` or the OTel SDK; `make ajan-wasm-check`
enforces that and the size budget.

## Behavioral divergences

### configfx.reflectSetField — float32 panic

- **Status**: RESOLVED
- **Location**: `pkg/ajan/configfx/manager.go` function `reflectSetField`, the
  `reflect.TypeFor[float32]()` case
- **Fix**: Added `float32(floatValue)` cast on `manager.go` line 475 —
  `finalValue = reflect.ValueOf(float32(floatValue))`. One-line change.
- **Tests**: `pkg/ajan/configfx/configfx_float_test.go` — four tests covering
  valid float32, negative/zero, malformed input (silent zero), and overflow
  (+Inf).
- **Discovered**: 2026-04-17 during Phase F-prereq coverage push. Silent fix
  applied and reverted per Rule 2. Applied as approved separate task.
- **Root cause**: `strconv.ParseFloat(v, 32)` returns `float64` by design
  (bitSize controls precision, not return type); `reflect.Value.Set` requires
  exact type identity, so `float64 → float32` field assignment panicked.
