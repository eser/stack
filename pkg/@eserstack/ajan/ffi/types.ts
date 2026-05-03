// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared types for the FFI abstraction layer.
 *
 * Defines the unified interface that all runtime backends (Deno, Bun, Node)
 * must implement when loading the eser-ajan C-shared library.
 *
 * @module
 */

/**
 * The unified interface returned by every backend after opening a shared library.
 * Symbol methods mirror the C ABI exports from eser-ajan's main.go.
 */
export interface FFILibrary {
  symbols: {
    /** Returns the eser-ajan version string. Caller must free the result. */
    EserAjanVersion: () => string;
    /** Initializes the Go runtime bridge. Returns 0 on success. */
    EserAjanInit: () => number;
    /** Shuts down the Go runtime bridge. */
    EserAjanShutdown: () => void;
    /** Frees a C string previously allocated by Go. */
    EserAjanFree: (ptr: unknown) => void;
    /**
     * Loads configuration from the specified sources.
     * Accepts JSON: { sources: string[], caseInsensitive?: boolean }
     * Returns JSON: { values: Record<string, unknown> } | { error: string }
     */
    EserAjanConfigLoad: (optionsJSON: string) => string;
    /** Resolves a named dependency. Returns JSON string. */
    EserAjanDIResolve: (name: string) => string;
    /**
     * Creates a language model from a JSON config.
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanAiCreateModel: (configJSON: string) => string;
    /**
     * Performs a blocking text generation.
     * Returns JSON: { content, stopReason, usage, modelId } | { error: string }
     */
    EserAjanAiGenerateText: (
      modelHandle: string,
      optionsJSON: string,
    ) => string;
    /**
     * Starts a streaming text generation. Returns JSON: { handle: string } | { error: string }
     * Poll the stream with EserAjanAiStreamRead until it returns "null".
     */
    EserAjanAiStreamText: (modelHandle: string, optionsJSON: string) => string;
    /**
     * Reads the next event from a stream.
     * Returns JSON event object or "null" when stream is complete.
     */
    EserAjanAiStreamRead: (streamHandle: string) => string;
    /** Closes a model handle and releases resources. Returns JSON: {} | { error: string } */
    EserAjanAiCloseModel: (modelHandle: string) => string;
    /** Cancels a stream and releases resources. Returns JSON: {} */
    EserAjanAiFreeStream: (streamHandle: string) => string;
    /**
     * Submits a batch of AI requests for async processing.
     * Accepts JSON: { modelHandle, requests: Array<{customId, options}> }
     * Returns JSON: { job: BatchJob } | { error: string }
     */
    EserAjanAiBatchCreate: (requestJSON: string) => string;
    /**
     * Gets the status of a batch job.
     * Accepts JSON: { modelHandle, jobId }
     * Returns JSON: { job: BatchJob } | { error: string }
     */
    EserAjanAiBatchGet: (requestJSON: string) => string;
    /**
     * Lists batch jobs for a model.
     * Accepts JSON: { modelHandle, limit?, afterId? }
     * Returns JSON: { jobs: BatchJob[] } | { error: string }
     */
    EserAjanAiBatchList: (requestJSON: string) => string;
    /**
     * Downloads results for a completed batch job.
     * Accepts JSON: { modelHandle, job: BatchJob }
     * Returns JSON: { results: BatchResultItem[] } | { error: string }
     */
    EserAjanAiBatchDownload: (requestJSON: string) => string;
    /**
     * Cancels a pending batch job.
     * Accepts JSON: { modelHandle, jobId }
     * Returns JSON: { job: BatchJob } | { error: string }
     */
    EserAjanAiBatchCancel: (requestJSON: string) => string;
    /**
     * Serializes a JSON value to the named format (json, yaml, toml, csv, jsonl).
     * Accepts JSON: { format: string, data: unknown, pretty?: bool, indent?: int, isFirst?: bool }
     * Returns JSON: { result: string } | { error: string }
     */
    EserAjanFormatEncode: (requestJSON: string) => string;
    /**
     * Parses text in the named format and returns all decoded items.
     * Accepts JSON: { format: string, text: string }
     * Returns JSON: { items: unknown[] } | { error: string }
     */
    EserAjanFormatDecode: (requestJSON: string) => string;
    /**
     * Lists all registered built-in formats with their names, extensions, and streamable flag.
     * Returns JSON: { formats: Array<{ name, extensions, streamable }> }
     */
    EserAjanFormatList: () => string;
    /**
     * Serializes an array of JSON values to the named format as a complete document
     * (calls WriteStart / WriteItem per item / WriteEnd internally).
     * Accepts JSON: { format: string, items: unknown[], pretty?: bool, indent?: int }
     * Returns JSON: { result: string } | { error: string }
     */
    EserAjanFormatEncodeDocument: (requestJSON: string) => string;
    /**
     * Creates a structured logger writing JSON to stderr.
     * Accepts JSON: { scopeName?: string, level?: string, format?: string, addSource?: bool }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanLogCreate: (configJSON: string) => string;
    /**
     * Writes a log entry via a logger handle.
     * Accepts JSON: { handle: string, level: string, message: string, attrs?: Record<string, unknown> }
     * Returns JSON: {} | { error: string }
     */
    EserAjanLogWrite: (requestJSON: string) => string;
    /** Closes a logger handle and releases resources. Returns JSON: {} | { error: string } */
    EserAjanLogClose: (handle: string) => string;
    /** Checks if a logger would emit at the given level. Returns JSON: { allowed: bool } | { error: string } */
    EserAjanLogShouldLog: (requestJSON: string) => string;
    /** Updates the minimum level of a logger handle. Returns JSON: {} | { error: string } */
    EserAjanLogConfigure: (requestJSON: string) => string;
    /**
     * Creates an HTTP client from a JSON config.
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanHttpCreate: (configJSON: string) => string;
    /**
     * Performs an HTTP request via a client handle.
     * Returns JSON: { status, statusText, headers, body, retries } | { error: string }
     */
    EserAjanHttpRequest: (requestJSON: string) => string;
    /** Closes an HTTP client handle and releases resources. Returns JSON: {} | { error: string } */
    EserAjanHttpClose: (handle: string) => string;
    /**
     * Starts a streaming HTTP request via a client handle.
     * Returns JSON: { handle: string, status: number, statusText: string, headers: Record<string,string> } | { error: string }
     */
    EserAjanHttpRequestStream: (requestJSON: string) => string;
    /**
     * Reads the next chunk from a stream handle.
     * Returns JSON: { chunk: string (base64), done: boolean } | { error: string }
     */
    EserAjanHttpStreamRead: (handle: string) => string;
    /** Closes and disposes a stream handle. Returns JSON: {} | { error: string } */
    EserAjanHttpStreamClose: (handle: string) => string;
    /**
     * Initializes the noskills .eser/ directory in the given project root.
     * Accepts JSON: { root: string }
     * Returns JSON: { root: string } | { error: string }
     */
    EserAjanNoskillsInit: (requestJSON: string) => string;
    /**
     * Creates a new spec, auto-slugging the description if needed.
     * Accepts JSON: { root: string, description?: string, specName?: string, planPath?: string }
     * Returns JSON: { specName: string, specFile: string } | { error: string }
     */
    EserAjanNoskillsSpecNew: (requestJSON: string) => string;
    /**
     * Gets the next instruction for a spec, optionally applying an answer first.
     * Accepts JSON: { root: string, specName?: string, answer?: string }
     * Returns JSON: NextOutput | { error: string }
     */
    EserAjanNoskillsNext: (requestJSON: string) => string;
    /**
     * Runs all workflows matching the given event using an inline workflow definition.
     * Steps must use name "shell" with options: { command: "..." }.
     * Accepts JSON: { root?: string, event: string, fix?: bool, only?: string, timeoutMs?: int, changedFiles?: string[], workflows: WorkflowDef[] }
     * Returns JSON: { results: WorkflowResult[] } | { error: string }
     */
    EserAjanWorkflowRun: (requestJSON: string) => string;
    /**
     * Hashes a value using the specified algorithm.
     * Accepts JSON: { text?: string, data?: string (base64), algorithm?: "SHA-1"|"SHA-256"|"SHA-384"|"SHA-512", length?: number }
     * Returns JSON: { hash: string } | { error: string }
     */
    EserAjanCryptoHash: (requestJSON: string) => string;
    /**
     * Creates a cache manager scoped to an application.
     * Accepts JSON: { name: string, org?: string, baseDir?: string }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanCacheCreate: (requestJSON: string) => string;
    /**
     * Returns the absolute path of the cache directory for a handle.
     * Accepts JSON: { handle: string }
     * Returns JSON: { dir: string } | { error: string }
     */
    EserAjanCacheGetDir: (requestJSON: string) => string;
    /**
     * Returns the path for a versioned artefact under the cache handle.
     * Accepts JSON: { handle: string, version: string, name: string }
     * Returns JSON: { path: string } | { error: string }
     */
    EserAjanCacheGetVersionedPath: (requestJSON: string) => string;
    /**
     * Lists all top-level entries in the cache directory.
     * Accepts JSON: { handle: string }
     * Returns JSON: { entries: CacheEntry[] } | { error: string }
     */
    EserAjanCacheList: (requestJSON: string) => string;
    /**
     * Removes a specific path from the cache (file or directory tree).
     * Accepts JSON: { handle: string, path: string }
     * Returns JSON: {} | { error: string }
     */
    EserAjanCacheRemove: (requestJSON: string) => string;
    /**
     * Clears the entire application cache directory.
     * Accepts JSON: { handle: string }
     * Returns JSON: {} | { error: string }
     */
    EserAjanCacheClear: (requestJSON: string) => string;
    /**
     * Releases a cache handle.
     * Accepts JSON: { handle: string }
     * Returns JSON: {} | { error: string }
     */
    EserAjanCacheClose: (requestJSON: string) => string;
    /**
     * Generates a Kubernetes ConfigMap or Secret manifest from a .env file.
     * Accepts JSON: { resource: { type: "configmap"|"secret", name, namespace? }, envFile?, format?: "yaml"|"json", namespace? }
     * Returns JSON: { result: string } | { error: string }
     */
    EserAjanCsGenerate: (requestJSON: string) => string;
    /**
     * Generates a kubectl patch command to sync a .env file into an existing K8s resource.
     * Accepts JSON: { resource: { type, name, namespace? }, envFile?, format?: "json"|"yaml", stringOnly?: bool }
     * Returns JSON: { result: string } | { error: string }
     */
    EserAjanCsSync: (requestJSON: string) => string;
    /**
     * Lists all recipes in a registry manifest.
     * Accepts JSON: { registryUrl?: string, cwd?: string }
     * Returns JSON: { recipes: Recipe[] } | { error: string }
     */
    EserAjanKitListRecipes: (requestJSON: string) => string;
    /**
     * Resolves and applies a recipe dependency chain to the project directory.
     * Accepts JSON: { recipeName, registryUrl?, cwd?, force?, skipExisting?, dryRun?, verbose?, variables?: {[k]: v} }
     * Returns JSON: { recipes: NamedApplyResult[] } | { error: string }
     */
    EserAjanKitApplyRecipe: (requestJSON: string) => string;
    /**
     * Clones a recipe from a GitHub repo specifier to cwd.
     * Accepts JSON: { specifier, cwd?, projectName?, dryRun?, force?, skipExisting?, verbose?, variables?: {[k]: v} }
     * Returns JSON: { recipes: NamedApplyResult[] } | { error: string }
     */
    EserAjanKitCloneRecipe: (requestJSON: string) => string;
    /**
     * Scaffolds a new project from a registry template.
     * Accepts JSON: { templateName, projectName, targetDir, registrySource?, variables?: {[k]: v} }
     * Returns JSON: { recipes: NamedApplyResult[] } | { error: string }
     */
    EserAjanKitNewProject: (requestJSON: string) => string;
    /**
     * Re-applies a recipe chain to an existing project (force mode).
     * Accepts JSON: { recipeName, cwd?, registrySource?, dryRun?, verbose? }
     * Returns JSON: { recipes: NamedApplyResult[] } | { error: string }
     */
    EserAjanKitUpdateRecipe: (requestJSON: string) => string;
    /**
     * Creates a PostService backed by the given platform credentials.
     * Accepts JSON: { twitter?: { accessToken }, bluesky?: { accessJwt, did } }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanPostsCreateService: (requestJSON: string) => string;
    /**
     * Composes a post using the given service handle.
     * Accepts JSON: { handle, platform?, text }
     * Returns JSON: { post: { id, text, platform, authorHandle? } } | { error: string }
     */
    EserAjanPostsCompose: (requestJSON: string) => string;
    /**
     * Fetches the timeline using the given service handle.
     * Accepts JSON: { handle, platform?, maxResults? }
     * Returns JSON: { posts: Post[] } | { error: string }
     */
    EserAjanPostsGetTimeline: (requestJSON: string) => string;
    /**
     * Searches posts using the given service handle.
     * Accepts JSON: { handle, platform?, query, maxResults? }
     * Returns JSON: { posts: Post[] } | { error: string }
     */
    EserAjanPostsSearch: (requestJSON: string) => string;
    /**
     * Releases a service handle created by EserAjanPostsCreateService.
     * Accepts JSON: { handle }
     * Returns JSON: { handle: string }
     */
    EserAjanPostsClose: (requestJSON: string) => string;
    /**
     * Returns the current git branch in the given directory.
     * Accepts JSON: { dir? }
     * Returns JSON: { branch: string } | { error: string }
     */
    EserAjanCodebaseGitCurrentBranch: (requestJSON: string) => string;
    /**
     * Returns the most recent git tag reachable from HEAD.
     * Accepts JSON: { dir? }
     * Returns JSON: { tag: string } | { error: string }
     */
    EserAjanCodebaseGitLatestTag: (requestJSON: string) => string;
    /**
     * Returns commits between two refs or since a date.
     * Accepts JSON: { dir?, start?, end?, since? }
     * Returns JSON: { commits: Commit[] } | { error: string }
     */
    EserAjanCodebaseGitLog: (requestJSON: string) => string;
    /**
     * Validates a commit message against the conventional commit spec.
     * Accepts JSON: { message, allowAsterisk?, allowMultipleScopes?, forceScope?, types? }
     * Returns JSON: { valid: boolean, issues?: string[] } | { error: string }
     */
    EserAjanCodebaseValidateCommitMsg: (requestJSON: string) => string;
    /**
     * Generates a changelog section from git history (writes CHANGELOG.md unless dryRun).
     * Accepts JSON: { dir?, dryRun? }
     * Returns JSON: { version, commitCount, entryCount, content, dryRun } | { error: string }
     */
    EserAjanCodebaseGenerateChangelog: (requestJSON: string) => string;
    /**
     * Bumps a semver version string.
     * Accepts JSON: { current, command: "patch"|"minor"|"major"|"explicit"|"sync", explicit? }
     * Returns JSON: { version: string } | { error: string }
     */
    EserAjanCodebaseBumpVersion: (requestJSON: string) => string;
    /**
     * Walks source files under a directory (git-aware when gitAware=true).
     * Accepts JSON: { dir?, extensions?, exclude?, gitAware? }
     * Returns JSON: { files: FileEntry[] } | { error: string }
     */
    EserAjanCodebaseWalkFiles: (requestJSON: string) => string;
    /**
     * Runs language-agnostic file validators over a directory.
     * Accepts JSON: { dir?, validators?, extensions?, validatorOptions?, gitAware? }
     * Returns JSON: { results: ValidatorResult[] } | { error: string }
     */
    EserAjanCodebaseValidateFiles: (requestJSON: string) => string;
    /**
     * Detects circular dependencies between workspace packages.
     * Accepts JSON: { dir? }
     * Returns JSON: { hasCycles, cycles, packagesChecked } | { error: string }
     */
    EserAjanCodebaseCheckCircularDeps: (requestJSON: string) => string;
    /**
     * Validates deno.json export path naming conventions.
     * Accepts JSON: { dir?, ignoreWords? }
     * Returns JSON: { isValid, violations, packagesChecked } | { error: string }
     */
    EserAjanCodebaseCheckExportNames: (requestJSON: string) => string;
    /**
     * Validates that mod.ts exports all public .ts files.
     * Accepts JSON: { dir? }
     * Returns JSON: { isComplete, missingExports, packagesChecked } | { error: string }
     */
    EserAjanCodebaseCheckModExports: (requestJSON: string) => string;
    /**
     * Validates deno.json / package.json field consistency.
     * Accepts JSON: { dir? }
     * Returns JSON: { isConsistent, inconsistencies, dependencyInconsistencies, packagesChecked } | { error: string }
     */
    EserAjanCodebaseCheckPackageConfigs: (requestJSON: string) => string;
    /**
     * Validates JSDoc documentation on exported symbols.
     * Accepts JSON: { dir?, requireExamples? }
     * Returns JSON: { isValid, issues, filesChecked, symbolsChecked } | { error: string }
     */
    EserAjanCodebaseCheckDocs: (requestJSON: string) => string;
    /**
     * Creates a streaming file walk and returns a handle.
     * Accepts JSON: { dir?, extensions?, exclude?, gitAware? }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string) => string;
    /**
     * Reads the next file entry from a walk stream.
     * Accepts: handle string
     * Returns JSON: { path, name, size, isSymlink? } | { error: string } | "null" (done)
     */
    EserAjanCodebaseWalkFilesStreamRead: (handle: string) => string;
    /**
     * Cancels and releases a walk stream handle.
     * Accepts: handle string
     * Returns JSON: {}
     */
    EserAjanCodebaseWalkFilesStreamClose: (handle: string) => string;
    /**
     * Creates a streaming validator run and returns a handle.
     * Accepts JSON: { dir?, validators?, extensions?, validatorOptions?, gitAware? }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanCodebaseValidateFilesStreamCreate: (requestJSON: string) => string;
    /**
     * Reads the next validator result from a validate stream.
     * Accepts: handle string
     * Returns JSON: { name, passed, issues?, filesChecked } | { error: string } | "null" (done)
     */
    EserAjanCodebaseValidateFilesStreamRead: (handle: string) => string;
    /**
     * Cancels and releases a validate stream handle.
     * Accepts: handle string
     * Returns JSON: {}
     */
    EserAjanCodebaseValidateFilesStreamClose: (handle: string) => string;
    /**
     * Converts a file-path specifier to a valid, unique JS identifier.
     * Accepts JSON: { specifier: string, used?: string[] }
     * Returns JSON: { identifier: string } | { error: string }
     */
    EserAjanCollectorSpecifierToIdentifier: (requestJSON: string) => string;
    /**
     * Walks a directory for collectible JS/TS source files.
     * Accepts JSON: { dir?, ignoreFilePattern? }
     * Returns JSON: { files: { relPath, absPath }[] } | { error: string }
     */
    EserAjanCollectorWalkFiles: (requestJSON: string) => string;
    /**
     * Generates a TypeScript manifest source string from collected export entries.
     * Accepts JSON: { entries: { relPath, exports?: string[] }[] }
     * Returns JSON: { source: string } | { error: string }
     */
    EserAjanCollectorGenerateManifest: (requestJSON: string) => string;
    /**
     * Tokenizes an input string using the provided or built-in token definitions.
     * Accepts JSON: { input: string, definitions?: { name, pattern }[] }
     * Returns JSON: { tokens: { kind, value, offset, length }[] } | { error: string }
     */
    EserAjanParsingTokenize: (requestJSON: string) => string;
    /**
     * Returns the built-in SimpleTokens definitions for common lexical categories.
     * Returns JSON: { definitions: { name, pattern }[] }
     */
    EserAjanParsingSimpleTokens: () => string;
    /**
     * Creates a streaming tokenizer handle for incremental tokenization.
     * Accepts JSON: { definitions?: { name, pattern }[] }
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanParsingTokenizeStreamCreate: (requestJSON: string) => string;
    /**
     * Pushes a chunk into the streaming tokenizer and returns matched tokens.
     * Accepts JSON: { handle: string, chunk: string }
     * Returns JSON: { tokens: { kind, value, offset, length }[] } | { error: string }
     */
    EserAjanParsingTokenizeStreamPush: (requestJSON: string) => string;
    /**
     * Flushes remaining buffer and releases the streaming tokenizer handle.
     * Accepts JSON: { handle: string }
     * Returns JSON: { tokens: { kind, value, offset, length }[] } | { error: string }
     */
    EserAjanParsingTokenizeStreamClose: (requestJSON: string) => string;
    /**
     * Executes a shell command and returns stdout, stderr, and exit code.
     * Accepts JSON: { command, args?, cwd?, env?, stdin?, timeout? }
     * Returns JSON: { stdout, stderr, code } | { error: string }
     */
    EserAjanShellExec: (requestJSON: string) => string;
    /**
     * Creates a keypress reader from os.Stdin and returns a handle.
     * Accepts JSON: {} (no options required)
     * Returns JSON: { handle: string } | { error: string }
     */
    EserAjanShellTuiKeypressCreate: (requestJSON: string) => string;
    /**
     * Reads the next keypress event from a handle (blocks until available).
     * Accepts: handle string
     * Returns JSON: { name, char?, ctrl, meta, shift, raw?, cols?, rows? }
     *   | { error: string } | "null" (reader closed)
     */
    EserAjanShellTuiKeypressRead: (handle: string) => string;
    /**
     * Cancels and releases a keypress handle.
     * Accepts: handle string
     * Returns JSON: {} | { error: string }
     */
    EserAjanShellTuiKeypressClose: (handle: string) => string;
    /**
     * Enables or disables raw mode on os.Stdin.
     * Accepts JSON: { enable: boolean }
     * Returns JSON: {} | { error: string }
     */
    EserAjanShellTuiSetStdinRaw: (requestJSON: string) => string;
    /**
     * Returns the current terminal dimensions.
     * Accepts JSON: {} (no options required)
     * Returns JSON: { cols: number, rows: number } | { error: string }
     */
    EserAjanShellTuiGetSize: (requestJSON: string) => string;
    /**
     * Spawns a child process and returns a streaming handle (§20).
     * Accepts JSON: { command: string, args?: string[], cwd?: string, env?: string[] }
     * Returns JSON: { handle: string, pid: number } | { error: string }
     */
    EserAjanShellExecSpawn: (requestJSON: string) => string;
    /**
     * Reads the next output chunk from the child process.
     * Accepts: handle string
     * Returns JSON: { stream: "stdout"|"stderr", chunk: string } | "null" (§20 done) | { error: string }
     */
    EserAjanShellExecRead: (handle: string) => string;
    /**
     * Writes base64-encoded data to the child process stdin.
     * Accepts JSON: { handle: string, data: string }
     * Returns: {} on success | { error: string }
     */
    EserAjanShellExecWrite: (requestJSON: string) => string;
    /**
     * Terminates the child process and removes the handle.
     * Accepts: handle string
     * Returns JSON: { code: number } | { error: string }
     */
    EserAjanShellExecClose: (handle: string) => string;
  };
  /** Closes the shared library handle and releases resources. */
  close: () => void;
}

/**
 * A backend that knows how to open a shared library using a specific runtime's
 * FFI mechanism.
 */
export interface FFIBackend {
  /** Human-readable backend name (e.g. "deno", "bun", "node"). */
  name: string;
  /** Returns true if this backend can be used in the current runtime. */
  available: () => boolean;
  /** Opens the shared library at `libraryPath` and returns a unified handle. */
  open: (libraryPath: string) => Promise<FFILibrary>;
}

/** Supported runtime identifiers. */
export type RuntimeId = "deno" | "bun" | "node" | "unknown";

/** Platform-specific shared library file extensions. */
export type LibraryExtension = ".so" | ".dylib" | ".dll";
