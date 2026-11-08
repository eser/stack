// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js FFI backend using `node:ffi` (decision-37).
 *
 * node:ffi ships with Node and is on by default since 26.9 (no flag; under
 * `--permission` it needs `--allow-ffi`). The library exports the dispatcher
 * ABI and nothing else (main.go): {@link SIGNATURES} declares its six
 * functions for one `dlopen` call. Right after it, the `EserAjanVersion`
 * handshake is checked, and a library with another dispatcher ABI is closed
 * again and refused. Each returned C string is read with `ffi.toString` and
 * released with `EserAjanFree`, as the M0-T2 spike (TASK-175) measured.
 * When node:ffi cannot load, `open` throws and the loader falls back to the
 * WASM build.
 *
 * node:ffi is imported dynamically, or taken through
 * `process.getBuiltinModule` by the synchronous loader: a static import would
 * fail this module, and with it the loader in `mod.ts`, under
 * `--no-experimental-ffi`, before the WASM fallback could run.
 *
 * @module
 */

import type * as nodeFfi from "node:ffi";
import * as library from "./library.ts";
import * as offload from "./offload.ts";
import * as resolve from "./resolve.ts";
import type * as types from "./types.ts";

/** A node:ffi function definition. */
type FfiDefinition = { arguments: string[]; return: string };

const FFI_TYPES: Readonly<Record<string, string>> = {
  "void*": "pointer",
  "const char*": "string",
  int: "int32",
  void: "void",
};

/**
 * The C prototypes of the six exports in main.go. node:ffi calls through
 * whatever these declare and ignores a misspelled key silently, so
 * codebase/ajan-ffi-parity.test.ts checks them against the cgo signatures.
 */
export const SIGNATURES: readonly string[] = [
  "void* EserAjanVersion()",
  "void* EserAjanCall(const char* name, const char* request)",
  "void* EserAjanStreamOpen(const char* name, const char* request)",
  "void* EserAjanStreamRead(const char* handle)",
  "void* EserAjanStreamClose(const char* handle)",
  "void EserAjanFree(void* ptr)",
];

/**
 * Parses a C prototype such as `void* EserAjanStreamRead(const char* handle)`
 * into its name and node:ffi definition.
 */
export const parseSignature = (
  signature: string,
): { name: string; definition: FfiDefinition } => {
  const match = /^\s*(.+?)\s*\b(\w+)\s*\((.*)\)\s*$/.exec(signature);
  if (match === null) {
    throw new Error(`unparsable FFI signature: ${signature}`);
  }

  const toType = (cType: string): string => {
    const ffiType =
      FFI_TYPES[cType.replace(/\s+/g, " ").replace(/ \*/g, "*").trim()];
    if (ffiType === undefined) {
      throw new Error(
        `unsupported C type "${cType}" in FFI signature: ${signature}`,
      );
    }

    return ffiType;
  };

  const params = match[3]!.trim();

  return {
    name: match[2]!,
    definition: {
      return: toType(match[1]!),
      arguments:
        params === ""
          ? []
          : params.split(",").map((param) =>
              // Drop the parameter name: "const char* path" -> "const char*".
              toType(param.trim().replace(/\s*\b\w+$/, "")),
            ),
    },
  };
};

/** The six exports as node:ffi hands them out. */
// node:ffi types its functions loosely; the casts below are where they meet
// the declared prototypes.
// oxlint-disable-next-line typescript/no-explicit-any
type RawFunctions = Readonly<Record<string, (...args: any[]) => any>>;

/**
 * Builds the transport over the six raw exports. `toString` reads a C string
 * the library returned.
 */
export const createTransport = (
  raw: RawFunctions,
  toString: (ptr: bigint) => string | null,
  closeLibrary: () => void,
): types.Transport => {
  const rawFree = raw["EserAjanFree"]!;

  // Every string the bridge returns was allocated by Go with C.CString, i.e.
  // malloc. The free sits in a `finally` because it must run even when the
  // read throws: the pointer is malloc'd memory the caller owns.
  const take = (ptr: unknown): string => {
    if (ptr === null || ptr === undefined || ptr === 0n) {
      return "";
    }

    try {
      return toString(ptr as bigint) ?? "";
    } finally {
      rawFree(ptr);
    }
  };

  const envelope = (ptr: unknown): types.Envelope =>
    JSON.parse(take(ptr)) as types.Envelope;

  const rawCall = raw["EserAjanCall"]!;
  const rawOpen = raw["EserAjanStreamOpen"]!;
  const rawRead = raw["EserAjanStreamRead"]!;
  const rawClose = raw["EserAjanStreamClose"]!;

  // node:ffi calls are synchronous, so every operation here runs on the
  // calling thread. The library sends the blocking names (bindings.ts) to the
  // workers of offload.ts instead, each of which runs this same transport.
  return {
    call: (name, request) => envelope(rawCall(name, request)),
    streamOpen: (name, request) => envelope(rawOpen(name, request)),
    streamRead: (handle) => envelope(rawRead(handle)),
    streamClose: (handle) => envelope(rawClose(handle)),
    close: closeLibrary,
  };
};

/**
 * Reads and checks the `EserAjanVersion` handshake.
 *
 * @throws {Error} When the library speaks another dispatcher ABI
 */
export const readHandshake = (
  raw: RawFunctions,
  toString: (ptr: bigint) => string | null,
  libraryPath: string,
): types.Handshake => {
  const ptr: unknown = raw["EserAjanVersion"]!();
  let text = "";
  try {
    text =
      ptr === null || ptr === undefined || ptr === 0n
        ? ""
        : (toString(ptr as bigint) ?? "");
  } finally {
    if (ptr !== null && ptr !== undefined && ptr !== 0n) {
      raw["EserAjanFree"]!(ptr);
    }
  }

  return library.checkHandshake(text, libraryPath);
};

/** A library opened through node:ffi, before the typed layer goes on top. */
export interface OpenedTransport {
  readonly handshake: types.Handshake;
  readonly transport: types.Transport;
}

/** The message of every failure to obtain node:ffi. */
const ffiUnavailable = (cause: unknown): Error =>
  new Error(
    `node:ffi is not available (it needs Node 26.9 or later, and is off under --no-experimental-ffi): ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    { cause },
  );

/**
 * Imports node:ffi.
 *
 * @throws {Error} If node:ffi cannot be imported (Node before 26.9, or
 *   `--no-experimental-ffi`).
 */
export const importFfi = async (): Promise<typeof nodeFfi> => {
  try {
    return await import("node:ffi");
  } catch (error) {
    throw ffiUnavailable(error);
  }
};

/**
 * Takes node:ffi synchronously, through `process.getBuiltinModule`.
 *
 * @throws {Error} If node:ffi is not available, as {@link importFfi} does.
 */
export const requireFfiSync = (): typeof nodeFfi => {
  const ffi = resolve.getBuiltinModuleSync<typeof nodeFfi>("node:ffi");
  if (ffi === undefined) {
    throw ffiUnavailable(
      new Error("process.getBuiltinModule did not return node:ffi"),
    );
  }

  return ffi;
};

/**
 * Opens the eser-ajan library at `libraryPath` with an already obtained
 * node:ffi and checks its handshake. Synchronous: the `dlopen` happens here.
 *
 * @throws {Error} If `dlopen` fails (a missing or foreign file, a library
 *   from before the dispatcher ABI, or `--permission` without `--allow-ffi`),
 *   or the library speaks another dispatcher ABI.
 */
export const openTransportWith = (
  ffi: typeof nodeFfi,
  libraryPath: string,
): OpenedTransport => {
  const definitions: Record<string, FfiDefinition> = {};
  for (const signature of SIGNATURES) {
    const { name, definition } = parseSignature(signature);
    definitions[name] = definition;
  }

  // The definitions are built from the prototype strings at run time, so
  // their literal types are unknown to the compiler.
  const opened = ffi.dlopen(
    libraryPath,
    definitions as nodeFfi.FunctionDefinitions,
  );
  const raw = opened.functions as unknown as RawFunctions;
  const toString = (ptr: bigint): string | null => ffi.toString(ptr);

  let handshake: types.Handshake;
  try {
    handshake = readHandshake(raw, toString, libraryPath);
  } catch (error) {
    opened.lib.close();
    throw error;
  }

  return {
    handshake,
    transport: createTransport(raw, toString, () => {
      opened.lib.close();
    }),
  };
};

/**
 * Opens the eser-ajan library at `libraryPath` through node:ffi and checks
 * its handshake. The main thread and every worker of offload.ts open it so.
 *
 * @throws {Error} When {@link importFfi} or {@link openTransportWith} does.
 */
export const openTransport = async (
  libraryPath: string,
): Promise<OpenedTransport> =>
  openTransportWith(await importFfi(), libraryPath);

/** Options for {@link open}. */
export interface OpenOptions {
  /**
   * How many pool workers run the blocking calls at once
   * (offload.DEFAULT_POOL_SIZE by default).
   */
  readonly poolSize?: number;
}

/**
 * Opens the eser-ajan library at `libraryPath` with an already obtained
 * node:ffi, with the workers of offload.ts for its blocking names. The workers
 * start on the first blocking call, so this is synchronous.
 *
 * @throws {Error} When {@link openTransportWith} does.
 */
export const openWith = (
  ffi: typeof nodeFfi,
  libraryPath: string,
  options: OpenOptions = {},
): types.FFILibrary => {
  const { handshake, transport } = openTransportWith(ffi, libraryPath);

  return library.createLibrary({
    backend: "native",
    handshake,
    transport,
    offload: offload.createOffload({
      libraryPath,
      poolSize: options.poolSize ?? offload.DEFAULT_POOL_SIZE,
      inline: transport,
    }),
  });
};

/**
 * Opens the eser-ajan library at `libraryPath` through node:ffi, with the
 * workers of offload.ts for its blocking names.
 *
 * @throws {Error} When {@link importFfi} or {@link openWith} does.
 */
export const open = async (
  libraryPath: string,
  options: OpenOptions = {},
): Promise<types.FFILibrary> =>
  openWith(await importFfi(), libraryPath, options);

/**
 * Opens the eser-ajan library at `libraryPath` through node:ffi without
 * awaiting: node:ffi comes from `process.getBuiltinModule`.
 *
 * @throws {Error} When {@link requireFfiSync} or {@link openWith} does.
 */
export const openSync = (
  libraryPath: string,
  options: OpenOptions = {},
): types.FFILibrary => openWith(requireFfiSync(), libraryPath, options);
