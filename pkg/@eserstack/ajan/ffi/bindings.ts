// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The binding table of eser-ajan: every name the Go dispatch registry serves
 * (bridge_registry.go and the domain files that register into it), in one
 * place for both backends.
 *
 * Each entry gives:
 * - `kind`: `call` (one request, one answer, through `lib.call`) or `stream`
 *   (opened, read until `null` and closed, through `lib.stream`).
 * - `blocking`: the name can wait on the network, a child process or the
 *   terminal. On the native backend a blocking call runs in a pool worker
 *   and a blocking stream gets a dedicated worker for its reads (offload.ts),
 *   so the main event loop stays free; every other name runs synchronously
 *   on the calling thread. A blocking call answers a promise (its `async` is
 *   true), and so does each read of a blocking stream.
 * - `cancel`: the entry an AbortSignal runs on the calling thread to end a
 *   blocking name in flight (`aiCancelRequest`, the stream's `close`, or
 *   `shellPtyKill`). The promise then rejects with the signal's reason. A
 *   blocking name without one rejects at once, and its worker stays busy
 *   until the Go call returns.
 * - `wasm`: whether the WASM fallback serves the name: `yes`, `fs` (yes, and
 *   it reads or writes files, so it needs the node:wasi preopen of the working
 *   directory) or `no` (native only; the loader refuses it without a round
 *   trip).
 * - `async`: the call or the stream open answers a promise: a blocking call
 *   or a stream that opens in its worker, or a name the WASM fallback waits
 *   on the host's fetch for (TASK-277). Await it on every backend.
 * - The request and response types, carried by the `as` type of the entry.
 *
 * codebase/ajan-ffi-parity.test.ts checks the names and kinds against the Go
 * registry and the `wasm` fields against the names the WASM build reports.
 *
 * @module
 */

/** Whether the WASM fallback serves a name. */
export type WasmSupport = "yes" | "fs" | "no";

/**
 * The entry that ends a blocking name in flight when its AbortSignal fires:
 * - `aiCancelRequest`: cancels the AI call that the request's `requestId`
 *   names (the library adds one when the request has none)
 * - `close`: closes the stream, which makes its read return
 * - `shellPtyKill`: kills the PTY's child with SIGKILL, which ends its read
 */
export type CancelEntry = "aiCancelRequest" | "close" | "shellPtyKill";

/** What every entry of the table says about its name. */
export interface BindingSpec {
  readonly kind: "call" | "stream";
  readonly blocking: boolean;
  readonly wasm: WasmSupport;
  readonly async: boolean;
  readonly cancel?: CancelEntry;
}

/** Options of a call, a stream open or a stream read. */
export interface CallOptions {
  /**
   * Ends the operation: the promise rejects with the signal's reason, and
   * the name's `cancel` entry, if it has one, stops the Go side.
   */
  readonly signal?: AbortSignal;
}

/**
 * A call name. `types` is never set at run time; it only carries the request
 * and response types.
 */
export interface CallBinding<
  Req,
  Res,
  Async extends boolean = false,
> extends BindingSpec {
  readonly kind: "call";
  readonly async: Async;
  readonly types?: { readonly request: Req; readonly response: Res };
}

/**
 * A stream name, with the types of its open request and its three answers.
 * `Blocking` streams answer each read with a promise.
 */
export interface StreamBinding<
  Req,
  Opened,
  Chunk,
  Closed,
  Async extends boolean = false,
  Blocking extends boolean = Async,
> extends BindingSpec {
  readonly kind: "stream";
  readonly async: Async;
  readonly blocking: Blocking;
  readonly types?: {
    readonly request: Req;
    readonly opened: Opened;
    readonly chunk: Chunk;
    readonly closed: Closed;
  };
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** The failure every bridge answer may carry instead of its fields. */
export interface ErrorAnswer {
  readonly error?: string;
}

/** An answer whose fields the calling package types itself. */
export interface BridgeAnswer extends ErrorAnswer {
  readonly [field: string]: unknown;
}

/** A request whose fields the calling package types itself. */
export type BridgeRequest = Readonly<Record<string, unknown>>;

/** An answer that only says whether it worked. */
export type EmptyAnswer = ErrorAnswer;

/** The answer of every call that creates a handle. */
export interface HandleAnswer extends ErrorAnswer {
  readonly handle?: string;
}

/** A request that names a handle. */
export interface HandleRequest {
  readonly handle: string;
}

/** The AI calls report a typed failure: kind and HTTP status. */
export interface AiAnswer extends BridgeAnswer {
  readonly errorKind?: string;
  readonly errorStatus?: number;
}

/** The request of the AI names that run on a model handle. */
export interface ModelRequest {
  readonly modelHandle: string;
  readonly options: BridgeRequest;
}

/** The handshake `version` answers, and the native `EserAjanVersion`. */
export interface Handshake {
  /** The library version, such as "4.5.2", or "dev" for a local build. */
  readonly version: string;
  /** The dispatcher ABI version. */
  readonly abi: number;
  /** "native" for the shared library, "wasi" for the WASM profile. */
  readonly profile: string;
  /** Every name the build serves, sorted. */
  readonly names: readonly string[];
  /** The stream names among them, sorted. */
  readonly streams: readonly string[];
}

/** A token of the parsing calls. */
export interface Token {
  readonly kind: string;
  readonly value: string;
  readonly offset: number;
  readonly length: number;
}

/** A token definition of the parsing calls. */
export interface TokenDefinition {
  readonly name: string;
  readonly pattern: string;
}

/** The answer of the calls that tokenize. */
export interface TokensAnswer extends ErrorAnswer {
  readonly tokens?: readonly Token[];
}

/** The request of httpRequest and of the httpRequestStream open. */
export interface HttpRequestRequest {
  readonly handle: string;
  readonly method?: string;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly maxResponseBytes?: number;
  /** From ffi/request-signals.ts, so the WASM fallback can abort the fetch. */
  readonly requestId?: string;
}

/** The answer of httpRequest. */
export interface HttpResponseAnswer extends ErrorAnswer {
  readonly status?: number;
  readonly statusText?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly retries?: number;
}

/**
 * A JavaScript number on the wire: JSON has no NaN or infinities, so those
 * travel as their names.
 */
export type WireNumber = number | "NaN" | "Infinity" | "-Infinity";

/**
 * The retry fields of an HttpClient or a request (httpclient's RetryConfig),
 * numbers as {@link WireNumber}; a missing field is not set.
 */
export interface HttpRetryConfigWire {
  readonly maxAttempts?: WireNumber;
  readonly initialDelay?: WireNumber;
  readonly maxDelay?: WireNumber;
  readonly factor?: WireNumber;
  readonly jitter?: boolean;
  readonly retryableStatuses?: readonly WireNumber[];
  readonly respectRetryAfter?: boolean;
}

/** The retry plan of one request; `policy` is null when retries are off. */
export interface HttpRetryPlan {
  readonly maxAttempts: WireNumber;
  readonly policy: Required<HttpRetryConfigWire> | null;
}

/**
 * One logger configuration of `@eserstack/logging` for `logResolveConfig`:
 * the sinks and filters are JavaScript functions, so only their names travel,
 * and only whether the config sets a level.
 */
export interface LogCategoryConfigWire {
  readonly category: readonly string[];
  readonly hasLevel?: boolean;
  readonly sinks?: readonly string[];
  /** "inherit" (the default) or "override". */
  readonly parentSinks?: string;
  readonly filters?: readonly string[];
}

/** The answer of a shell spawn: the stream's handle and the child's pid. */
export interface SpawnAnswer extends HandleAnswer {
  readonly pid?: number;
}

/** The answer of closing a shell stream: the child's exit code. */
export interface ExitAnswer extends ErrorAnswer {
  readonly code?: number;
}

/** A file a codebase walk reports. */
export interface FileEntryAnswer extends ErrorAnswer {
  readonly path?: string;
  readonly name?: string;
  readonly size?: number;
  readonly isSymlink?: boolean;
}

/** The answer of the kit calls that apply recipes. */
export interface RecipesAnswer extends ErrorAnswer {
  readonly recipes?: readonly unknown[];
}

/** The options of a kitExtractTarballStream open. */
export interface ExtractTarballRequest {
  readonly dir: string;
  readonly stripComponents?: number;
  readonly subpath?: string;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
}

/**
 * The answer of a tarball extraction's open, pushes and close: `done` once
 * the archive is extracted, or the error that stopped it, with the limit and
 * its value when a limit did.
 */
export interface ExtractTarballAnswer extends HandleAnswer {
  readonly done?: boolean;
  readonly limit?: "maxBytes" | "maxEntries";
  readonly max?: number;
}

/**
 * The host environment of the dotenv calls: the variables in the host's
 * order, and whether names match regardless of case (Windows). The WASM build
 * has no environment of its own.
 */
export interface ConfigEnvironRequest {
  readonly environ: ReadonlyArray<readonly [string, string]>;
  readonly envCaseInsensitive?: boolean;
}

/**
 * The failure of the config file calls: `code` is `not_found`,
 * `permission_denied`, `too_large` (with the file's size) or `parse`.
 */
export interface ConfigFailureAnswer extends ErrorAnswer {
  readonly code?: string;
  readonly fileSize?: number;
}

/**
 * The answer of the dotenv calls: the variables, each where its key first
 * appears, and the keys skipped as not identifiers.
 */
export interface ConfigDotenvAnswer extends ConfigFailureAnswer {
  readonly entries?: ReadonlyArray<readonly [string, string]>;
  readonly ignored?: readonly string[];
}

/**
 * What a reader of `formatReadCsv` keeps between chunks: the text of the
 * record still open, the header names (null until the header row is read) and
 * the count of records read, blank lines included.
 */
export interface FormatCsvState {
  readonly rest: string;
  readonly headers: readonly string[] | null;
  readonly records: number;
}

// The entry types are written once, as the `as` type of each table entry; the
// aliases below keep those lines short.
type Call<Req, Res, Async extends boolean = false> = CallBinding<
  Req,
  Res,
  Async
>;
type Stream<
  Req,
  Opened,
  Chunk,
  Closed,
  Async extends boolean = false,
  Blocking extends boolean = Async,
> = StreamBinding<Req, Opened, Chunk, Closed, Async, Blocking>;

/** A request that is the bare handle string. */
type HandleString = string;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** Every name of the Go dispatch registry. */
export const BINDINGS = {
  // Lifecycle
  version: { kind: "call", blocking: false, wasm: "yes", async: false } as Call<
    void,
    Handshake
  >,
  init: { kind: "call", blocking: false, wasm: "yes", async: false } as Call<
    void,
    EmptyAnswer
  >,
  shutdown: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<void, EmptyAnswer>,
  diResolve: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<string, unknown>,

  // AI (aifx)
  aiCreateModel: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, AiAnswer>,
  aiGenerateText: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<ModelRequest, AiAnswer, true>,
  aiTextStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Stream<
    ModelRequest,
    AiAnswer & HandleAnswer,
    AiAnswer,
    EmptyAnswer,
    true
  >,
  aiCancelRequest: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<{ readonly requestId: string }, EmptyAnswer>,
  aiCloseModel: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<HandleString, EmptyAnswer>,
  aiBatchCreate: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<BridgeRequest, AiAnswer, true>,
  aiBatchGet: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<BridgeRequest, AiAnswer, true>,
  aiBatchList: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<BridgeRequest, AiAnswer, true>,
  aiBatchDownload: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<BridgeRequest, AiAnswer, true>,
  aiBatchCancel: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
    cancel: "aiCancelRequest",
  } as Call<BridgeRequest, AiAnswer, true>,

  // Formats (formatfx)
  formatEncode: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly format: string;
      readonly data: unknown;
      readonly pretty?: boolean;
      readonly indent?: number;
      readonly isFirst?: boolean;
      readonly document?: boolean;
      /** CSV only: one character; a comma when left out. */
      readonly delimiter?: string;
    },
    ErrorAnswer & { readonly result?: string }
  >,
  formatDecode: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly format: string;
      readonly text: string;
      readonly headers?: readonly string[];
      /** CSV only: a comma when left out. */
      readonly delimiter?: string;
    },
    ErrorAnswer & { readonly items?: readonly unknown[] }
  >,
  formatList: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    void,
    ErrorAnswer & {
      readonly formats?: ReadonlyArray<{
        readonly name: string;
        readonly extensions: readonly string[];
        readonly streamable: boolean;
      }>;
    }
  >,
  formatEncodeDocument: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly format: string;
      readonly items: readonly unknown[];
      readonly pretty?: boolean;
      readonly indent?: number;
      /** CSV only: one character; a comma when left out. */
      readonly delimiter?: string;
    },
    ErrorAnswer & { readonly result?: string }
  >,
  /**
   * Reads one chunk of CSV text. The caller keeps `state` between chunks and
   * sends back the one the last answer gave; `final` ends the input.
   */
  formatReadCsv: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly chunk: string;
      readonly final: boolean;
      readonly delimiter?: string;
      readonly state: Partial<FormatCsvState>;
    },
    ErrorAnswer & {
      readonly items?: ReadonlyArray<Record<string, string>> | null;
      readonly state?: FormatCsvState;
    }
  >,

  // Logging (logfx)
  logCreate: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly scopeName?: string;
      readonly level?: string;
      readonly format?: string;
      readonly addSource?: boolean;
    },
    HandleAnswer
  >,
  logWrite: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly handle: string;
      readonly level: string;
      readonly message: string;
      readonly attrs?: Readonly<Record<string, unknown>>;
    },
    EmptyAnswer
  >,
  logClose: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<HandleString, EmptyAnswer>,
  logShouldLog: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    { readonly handle: string; readonly level: string },
    ErrorAnswer & { readonly allowed?: boolean }
  >,
  logConfigure: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<{ readonly handle: string; readonly level: string }, EmptyAnswer>,
  logResolveConfig: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      /** The category to resolve, as its segments. */
      readonly category: readonly string[];
      /** The logger configurations, their categories as segments. */
      readonly loggers?: readonly LogCategoryConfigWire[];
    },
    ErrorAnswer & {
      /** The index in `loggers` of the config whose level applies, or -1. */
      readonly levelIndex?: number;
      readonly sinks?: readonly string[];
      readonly filters?: readonly string[];
    }
  >,

  // Config (configfx)
  configLoad: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    { readonly sources: readonly string[]; readonly caseInsensitive?: boolean },
    ErrorAnswer & { readonly values?: Readonly<Record<string, unknown>> }
  >,
  configParseDotenv: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    ConfigEnvironRequest & { readonly text: string },
    ConfigDotenvAnswer
  >,
  configReadDotenvFile: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    ConfigEnvironRequest & {
      readonly path: string;
      readonly maxFileSize?: number | null;
    },
    ConfigDotenvAnswer
  >,
  configLoadDotenv: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    ConfigEnvironRequest & {
      readonly baseDir: string;
      readonly env?: string;
      readonly envVars: readonly string[];
      readonly defaultEnvValue: string;
      readonly loadProcessEnv: boolean;
      readonly maxFileSize?: number | null;
    },
    ConfigDotenvAnswer & {
      readonly envName?: string;
      readonly filepath?: string;
    }
  >,
  configLocateFile: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    {
      readonly baseDir: string;
      readonly filenames: readonly string[];
      readonly searchParents?: boolean;
    },
    ErrorAnswer & { readonly path?: string }
  >,
  configFileFormat: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    { readonly path: string; readonly windows?: boolean },
    ErrorAnswer & { readonly format?: number }
  >,
  configParseFile: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    {
      readonly path: string;
      readonly format?: number;
      readonly windows?: boolean;
    },
    ConfigFailureAnswer & {
      readonly format?: number;
      readonly content?: unknown;
      readonly text?: string;
    }
  >,

  // HTTP (httpclient)
  httpCreate: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<BridgeRequest, HandleAnswer>,
  httpRequest: {
    kind: "call",
    blocking: true,
    wasm: "yes",
    async: true,
  } as Call<HttpRequestRequest, HttpResponseAnswer, true>,
  httpRequestStream: {
    kind: "stream",
    blocking: true,
    wasm: "yes",
    async: true,
    cancel: "close",
  } as Stream<
    HttpRequestRequest,
    HandleAnswer & HttpResponseAnswer,
    ErrorAnswer & { readonly chunk?: string; readonly done?: boolean },
    EmptyAnswer,
    true
  >,
  httpClose: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<HandleString, EmptyAnswer>,
  httpRetryResolve: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly client?: HttpRetryConfigWire | false;
      readonly request?: HttpRetryConfigWire | false;
      /** A body the first attempt consumes; it gets one attempt. */
      readonly streamBody?: boolean;
    },
    ErrorAnswer & { readonly plan?: HttpRetryPlan }
  >,
  httpRetryNext: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly plan: HttpRetryPlan;
      /** The failed attempt's number, 0 for the first. */
      readonly attempt: number;
      /** The response status, 0 for a network failure. */
      readonly status: number;
      /** The response's Retry-After in milliseconds; null when it has none. */
      readonly retryAfterMs?: WireNumber | null;
      /** A number in [0, 1) for the jitter. */
      readonly random: number;
    },
    ErrorAnswer & { readonly retry?: boolean; readonly delayMs?: WireNumber }
  >,

  // Noskills (noskillsfx)
  noskillsInit: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<{ readonly root: string }, BridgeAnswer>,
  noskillsSpecNew: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  noskillsNext: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,

  // Workflows (workflowfx)
  workflowRun: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, BridgeAnswer, true>,

  // Crypto (cryptofx)
  cryptoHash: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly text?: string;
      readonly data?: string;
      readonly algorithm?: string;
      readonly length?: number;
    },
    ErrorAnswer & { readonly hash?: string }
  >,
  cryptoHashCombined: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly parts?: readonly string[];
      readonly algorithm?: string;
      readonly length?: number;
    },
    ErrorAnswer & { readonly hash?: string }
  >,

  // Cache (cachefx)
  cacheCreate: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<BridgeRequest, HandleAnswer>,
  cacheGetDir: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<HandleRequest, ErrorAnswer & { readonly dir?: string }>,
  cacheGetVersionedPath: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    HandleRequest & { readonly version: string; readonly name: string },
    ErrorAnswer & { readonly path?: string }
  >,
  cacheResolvePaths: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly host?: {
        readonly platform?: string;
        readonly home?: string;
        readonly env?: Readonly<Record<string, string>>;
      };
      readonly app?: { readonly name: string; readonly org?: string };
      readonly baseDir?: string;
      readonly version?: string;
      readonly item?: string;
    },
    ErrorAnswer & {
      readonly cacheHome?: string;
      readonly dataHome?: string;
      readonly configHome?: string;
      readonly appDir?: string;
      readonly versionedPath?: string;
    }
  >,
  cacheExists: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    HandleRequest & { readonly path: string },
    ErrorAnswer & { readonly exists?: boolean }
  >,
  cacheEnsureDir: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<HandleRequest & { readonly path: string }, EmptyAnswer>,
  cacheList: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    HandleRequest,
    ErrorAnswer & { readonly entries?: readonly unknown[] }
  >,
  cacheRemove: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<HandleRequest & { readonly path: string }, EmptyAnswer>,
  cacheClear: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<HandleRequest, EmptyAnswer>,
  cacheClose: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<HandleRequest, EmptyAnswer>,

  // ConfigMaps and Secrets (csfx)
  csGenerate: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<BridgeRequest, ErrorAnswer & { readonly result?: string }>,
  csSync: { kind: "call", blocking: false, wasm: "no", async: false } as Call<
    BridgeRequest,
    ErrorAnswer & { readonly result?: string }
  >,

  // Kit (kitfx)
  kitListRecipes: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, RecipesAnswer, true>,
  kitApplyRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, RecipesAnswer, true>,
  kitCloneRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, RecipesAnswer, true>,
  kitNewProject: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, RecipesAnswer, true>,
  kitUpdateRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, RecipesAnswer, true>,
  // Push-fed: the gzipped archive goes in through
  // kitExtractTarballStreamPush, base64-encoded, and close stops an
  // extraction that has not ended.
  kitExtractTarballStream: {
    kind: "stream",
    blocking: false,
    wasm: "no",
    async: false,
  } as Stream<
    ExtractTarballRequest,
    ExtractTarballAnswer,
    never,
    ExtractTarballAnswer
  >,
  kitExtractTarballStreamPush: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<
    HandleRequest & { readonly chunk?: string; readonly end?: boolean },
    ExtractTarballAnswer
  >,

  // Posts (postsfx)
  postsCreateService: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, HandleAnswer>,
  postsCompose: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, BridgeAnswer, true>,
  postsGetTimeline: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, BridgeAnswer, true>,
  postsSearch: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: true,
  } as Call<BridgeRequest, BridgeAnswer, true>,
  postsClose: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<HandleRequest, BridgeAnswer>,

  // Codebase (codebasefx)
  codebaseGitCurrentBranch: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<
    { readonly dir?: string },
    ErrorAnswer & { readonly branch?: string }
  >,
  codebaseGitLatestTag: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<{ readonly dir?: string }, ErrorAnswer & { readonly tag?: string }>,
  codebaseGitLog: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<
    BridgeRequest,
    ErrorAnswer & { readonly commits?: readonly unknown[] }
  >,
  codebaseValidateCommitMsg: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    BridgeRequest,
    ErrorAnswer & {
      readonly valid?: boolean;
      readonly issues?: readonly string[];
    }
  >,
  codebaseGenerateChangelog: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  codebaseBumpVersion: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<BridgeRequest, ErrorAnswer & { readonly version?: string }>,
  codebaseWalkFiles: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    BridgeRequest,
    ErrorAnswer & { readonly files?: readonly FileEntryAnswer[] }
  >,
  codebaseValidateFiles: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    BridgeRequest,
    ErrorAnswer & { readonly results?: readonly unknown[] }
  >,
  codebaseCheckCircularDeps: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<{ readonly dir?: string }, BridgeAnswer>,
  codebaseCheckExportNames: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  codebaseCheckModExports: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<{ readonly dir?: string }, BridgeAnswer>,
  codebaseCheckLarouxBoundaries: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  codebaseCheckDocs: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  codebaseWalkFilesStream: {
    kind: "stream",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Stream<BridgeRequest, HandleAnswer, FileEntryAnswer, EmptyAnswer>,
  codebaseValidateFilesStream: {
    kind: "stream",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Stream<BridgeRequest, HandleAnswer, BridgeAnswer, EmptyAnswer>,

  // Collector (collectorfx)
  collectorSpecifierToIdentifier: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    { readonly specifier: string; readonly used?: readonly string[] },
    ErrorAnswer & { readonly identifier?: string }
  >,
  collectorWalkFiles: {
    kind: "call",
    blocking: false,
    wasm: "fs",
    async: false,
  } as Call<
    { readonly dir?: string; readonly ignoreFilePattern?: string },
    ErrorAnswer & {
      readonly files?: ReadonlyArray<{
        readonly relPath: string;
        readonly absPath: string;
      }>;
    }
  >,
  collectorGenerateManifest: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      /** One per collected file: its path and the names its exports refer to. */
      readonly entries: ReadonlyArray<{
        readonly relPath: string;
        readonly exports?: readonly string[];
      }>;
    },
    ErrorAnswer & { readonly source?: string }
  >,

  // Parsing (parsingfx)
  parsingTokenize: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    {
      readonly input: string;
      readonly definitions?: readonly TokenDefinition[];
    },
    TokensAnswer
  >,
  parsingSimpleTokens: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<
    void,
    ErrorAnswer & { readonly definitions?: readonly TokenDefinition[] }
  >,
  parsingTokenizeStream: {
    kind: "stream",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Stream<
    { readonly definitions?: readonly TokenDefinition[] },
    HandleAnswer,
    never,
    TokensAnswer
  >,
  parsingTokenizeStreamPush: {
    kind: "call",
    blocking: false,
    wasm: "yes",
    async: false,
  } as Call<HandleRequest & { readonly chunk: string }, TokensAnswer>,

  // Shell (shellfx)
  shellExec: { kind: "call", blocking: true, wasm: "no", async: true } as Call<
    BridgeRequest,
    ErrorAnswer & {
      readonly stdout?: string;
      readonly stderr?: string;
      readonly code?: number;
    },
    true
  >,
  shellExecStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: false,
    cancel: "close",
  } as Stream<
    BridgeRequest,
    SpawnAnswer,
    ErrorAnswer & { readonly stream?: string; readonly chunk?: string },
    ExitAnswer,
    false,
    true
  >,
  shellExecWrite: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<HandleRequest & { readonly data: string }, EmptyAnswer>,
  shellPtyStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: false,
    cancel: "shellPtyKill",
  } as Stream<
    BridgeRequest,
    SpawnAnswer,
    ErrorAnswer & { readonly chunk?: string },
    ExitAnswer,
    false,
    true
  >,
  shellPtyWrite: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<HandleRequest & { readonly data: string }, EmptyAnswer>,
  shellPtyResize: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<
    HandleRequest & { readonly cols: number; readonly rows: number },
    EmptyAnswer
  >,
  shellPtyKill: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<HandleRequest & { readonly signal?: string }, EmptyAnswer>,
  shellTuiKeypressStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: false,
    cancel: "close",
  } as Stream<
    BridgeRequest,
    HandleAnswer,
    BridgeAnswer,
    EmptyAnswer,
    false,
    true
  >,
  shellTuiSetStdinRaw: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<{ readonly enable: boolean }, EmptyAnswer>,
  shellTuiGetSize: {
    kind: "call",
    blocking: false,
    wasm: "no",
    async: false,
  } as Call<
    BridgeRequest,
    ErrorAnswer & { readonly cols?: number; readonly rows?: number }
  >,
};

// ---------------------------------------------------------------------------
// Types derived from the table
// ---------------------------------------------------------------------------

/** The table's type. */
export type Bindings = typeof BINDINGS;

/** Every name in the table. */
export type BindingName = keyof Bindings;

/** The call names. */
export type CallName = {
  [N in BindingName]: Bindings[N] extends { readonly kind: "call" } ? N : never;
}[BindingName];

/** The stream names. */
export type StreamName = {
  [N in BindingName]: Bindings[N] extends { readonly kind: "stream" }
    ? N
    : never;
}[BindingName];

type TypesOf<N extends BindingName> = NonNullable<Bindings[N]["types"]>;

/** The request a name takes. */
export type RequestOf<N extends BindingName> = TypesOf<N>["request"];

/** The arguments after the name: none for a name that takes no request. */
export type RequestArgs<N extends BindingName> = [RequestOf<N>] extends [void]
  ? []
  : [request: RequestOf<N>];

/**
 * The arguments after the name, with the {@link CallOptions} last: none for a
 * name that takes no request.
 */
export type CallArgs<N extends BindingName> = [RequestOf<N>] extends [void]
  ? []
  : [request: RequestOf<N>, options?: CallOptions];

/** The answer of a call name. */
export type ResponseOf<N extends CallName> =
  TypesOf<N> extends {
    readonly response: infer R;
  }
    ? R
    : never;

/** What `lib.call` returns: the answer, or a promise of it for async names. */
export type CallResult<N extends CallName> = Bindings[N]["async"] extends true
  ? Promise<ResponseOf<N>>
  : ResponseOf<N>;

/** The open answer of a stream name. */
export type OpenedOf<N extends StreamName> =
  TypesOf<N> extends {
    readonly opened: infer R;
  }
    ? R
    : never;

/** A chunk of a stream name. */
export type ChunkOf<N extends StreamName> =
  TypesOf<N> extends {
    readonly chunk: infer R;
  }
    ? R
    : never;

/** The close answer of a stream name. */
export type ClosedOf<N extends StreamName> =
  TypesOf<N> extends {
    readonly closed: infer R;
  }
    ? R
    : never;

/** A promise for async names, the value itself otherwise. */
export type MaybeAsync<
  N extends BindingName,
  T,
> = Bindings[N]["async"] extends true ? Promise<T> : T;

/** What a stream read answers: a promise for async and blocking streams. */
export type ReadResult<
  N extends StreamName,
  T,
> = Bindings[N]["async"] extends true
  ? Promise<T>
  : Bindings[N]["blocking"] extends true
    ? Promise<T>
    : T;

/** The table's entry for a name, or undefined for a name it does not hold. */
export const bindingOf = (name: string): BindingSpec | undefined =>
  Object.hasOwn(BINDINGS, name)
    ? (BINDINGS as Readonly<Record<string, BindingSpec>>)[name]
    : undefined;
