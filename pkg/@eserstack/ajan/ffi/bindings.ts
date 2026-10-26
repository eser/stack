// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The binding table of eser-ajan: every name the Go dispatch registry serves
 * (bridge_registry.go and the domain files that register into it), in one
 * place for both backends.
 *
 * Each entry gives:
 * - `kind`: `call` (one request, one answer, through `lib.call`) or `stream`
 *   (opened, read until `null` and closed, through `lib.stream`).
 * - `blocking`: the call can wait on the network, a child process or the
 *   terminal. Calls run synchronously on the calling thread today; M2-T8
 *   (TASK-239) moves the blocking ones to worker threads.
 * - `wasm`: whether the WASM fallback serves the name: `yes`, `fs` (yes, and
 *   it reads or writes files, so it needs the node:wasi preopen of the working
 *   directory) or `no` (native only; the loader refuses it without a round
 *   trip).
 * - `async`: the name answers a promise, because the WASM fallback waits on
 *   the host's fetch for it (TASK-277). Await it on every backend.
 * - The request and response types, carried by the `as` type of the entry.
 *
 * codebase/ajan-ffi-parity.test.ts checks the names and kinds against the Go
 * registry and the `wasm` fields against the names the WASM build reports.
 *
 * @module
 */

/** Whether the WASM fallback serves a name. */
export type WasmSupport = "yes" | "fs" | "no";

/** What every entry of the table says about its name. */
export interface BindingSpec {
  readonly kind: "call" | "stream";
  readonly blocking: boolean;
  readonly wasm: WasmSupport;
  readonly async: boolean;
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

/** A stream name, with the types of its open request and its three answers. */
export interface StreamBinding<
  Req,
  Opened,
  Chunk,
  Closed,
  Async extends boolean = false,
> extends BindingSpec {
  readonly kind: "stream";
  readonly async: Async;
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
> = StreamBinding<Req, Opened, Chunk, Closed, Async>;

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
    async: false,
  } as Call<ModelRequest, AiAnswer>,
  aiTextStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: false,
  } as Stream<ModelRequest, AiAnswer & HandleAnswer, AiAnswer, EmptyAnswer>,
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
    async: false,
  } as Call<BridgeRequest, AiAnswer>,
  aiBatchGet: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, AiAnswer>,
  aiBatchList: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, AiAnswer>,
  aiBatchDownload: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, AiAnswer>,
  aiBatchCancel: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, AiAnswer>,

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
    },
    ErrorAnswer & { readonly result?: string }
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
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,

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
    async: false,
  } as Call<BridgeRequest, RecipesAnswer>,
  kitApplyRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, RecipesAnswer>,
  kitCloneRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, RecipesAnswer>,
  kitNewProject: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, RecipesAnswer>,
  kitUpdateRecipe: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, RecipesAnswer>,
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
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  postsGetTimeline: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
  postsSearch: {
    kind: "call",
    blocking: true,
    wasm: "no",
    async: false,
  } as Call<BridgeRequest, BridgeAnswer>,
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
  } as Call<BridgeRequest, ErrorAnswer & { readonly source?: string }>,

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
  shellExec: { kind: "call", blocking: true, wasm: "no", async: false } as Call<
    BridgeRequest,
    ErrorAnswer & {
      readonly stdout?: string;
      readonly stderr?: string;
      readonly code?: number;
    }
  >,
  shellExecStream: {
    kind: "stream",
    blocking: true,
    wasm: "no",
    async: false,
  } as Stream<
    BridgeRequest,
    SpawnAnswer,
    ErrorAnswer & { readonly stream?: string; readonly chunk?: string },
    ExitAnswer
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
  } as Stream<
    BridgeRequest,
    SpawnAnswer,
    ErrorAnswer & { readonly chunk?: string },
    ExitAnswer
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
  } as Stream<BridgeRequest, HandleAnswer, BridgeAnswer, EmptyAnswer>,
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

/** The table's entry for a name, or undefined for a name it does not hold. */
export const bindingOf = (name: string): BindingSpec | undefined =>
  Object.hasOwn(BINDINGS, name)
    ? (BINDINGS as Readonly<Record<string, BindingSpec>>)[name]
    : undefined;
