// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const KnownJsRuntimes = {
  Unknown: 0,
  Deno: 1,
} as const;

export type KnownJsRuntimeKey = Exclude<
  keyof typeof KnownJsRuntimes,
  number
>;
export type KnownJsRuntime = typeof KnownJsRuntimes[KnownJsRuntimeKey];

export const notImplemented = (name: string): () => never => {
  return () => {
    throw new Error(`This feature is not implemented: ${name}`);
  };
};

export const notSupportedJsRuntime = (name: string): () => never => {
  return () => {
    throw new Error(`JavaScript Runtime is not supported: ${name}`);
  };
};

export type JsRuntime = {
  jsRuntime: KnownJsRuntime;
  version: string;

  errors: {
    // deno-lint-ignore no-explicit-any
    NotFound: any;
  };

  execPath(): string;
  getArgs(): Array<string>;
  getEnv(): { [index: string]: string };
  getMainModule(): string | undefined;

  getStdin(): ReadableStream;
  getStdout(): WritableStream;
  getStderr(): WritableStream;

  open(path: string | URL, options?: Deno.OpenOptions): Promise<Deno.FsFile>;
  stat(path: string | URL): Promise<Deno.FileInfo>;
  exit(code?: number): never;

  readFile(
    path: string | URL,
    options?: Deno.ReadFileOptions,
  ): Promise<Uint8Array>;
  readTextFile(
    path: string | URL,
    options?: Deno.ReadFileOptions,
  ): Promise<string>;
  writeFile(
    path: string | URL,
    data: Uint8Array | ReadableStream<Uint8Array>,
    options?: Deno.WriteFileOptions,
  ): Promise<void>;
  writeTextFile(
    path: string | URL,
    data: string | ReadableStream<string>,
    options?: Deno.WriteFileOptions,
  ): Promise<void>;

  openKv(path?: string): Promise<Deno.Kv>;
  Command: typeof Deno.Command;
};

export const createDenoJsRuntime = (): JsRuntime => {
  const denoObjRef = globalThis.Deno;

  const instance = {
    jsRuntime: KnownJsRuntimes.Deno,
    version: denoObjRef.version.deno,

    errors: {
      NotFound: denoObjRef.errors.NotFound,
    },

    execPath: denoObjRef.execPath,
    getArgs: () => denoObjRef.args,
    getEnv: () => denoObjRef.env.toObject(),
    getMainModule: () => denoObjRef.mainModule,

    getStdin: () => denoObjRef.stdin.readable,
    getStdout: () => denoObjRef.stdout.writable,
    getStderr: () => denoObjRef.stderr.writable,

    open: denoObjRef.open,
    stat: denoObjRef.stat,
    exit: denoObjRef.exit,

    readFile: denoObjRef.readFile,
    readTextFile: denoObjRef.readTextFile,
    writeFile: denoObjRef.writeFile,
    writeTextFile: denoObjRef.writeTextFile,

    openKv: denoObjRef.openKv ?? notImplemented("openKv"),
    Command: denoObjRef.Command,
  };

  return instance;
};

export const createGenericJsRuntime = (): JsRuntime => {
  return {
    jsRuntime: KnownJsRuntimes.Unknown,
    errors: {
      NotFound: Error,
    },

    execPath: notImplemented("execPath"),
    getArgs: notImplemented("getArgs"),
    getEnv: notImplemented("getEnv"),
    getMainModule: notImplemented("getMainModule"),

    getStdin: notImplemented("getStdin"),
    getStdout: notImplemented("getStdout"),
    getStderr: notImplemented("getStderr"),

    open: notImplemented("open"),
    stat: notImplemented("stat"),
    exit: notImplemented("exit"),

    readFile: notImplemented("readFile"),
    readTextFile: notImplemented("readTextFile"),
    writeFile: notImplemented("writeFile"),
    writeTextFile: notImplemented("writeTextFile"),

    openKv: notImplemented("openKv"),
    // @ts-expect-error Command is not implemented
    Command: notImplemented("Command"),
  };
};

export const createJsRuntime = (): JsRuntime => {
  if (globalThis.Deno !== undefined) {
    return createDenoJsRuntime();
  }

  return createGenericJsRuntime();
};

export const current: JsRuntime = createJsRuntime();
