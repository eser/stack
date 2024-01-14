// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

export enum SupportedRuntimes {
  Unknown = 0,
  Deno = 1,
}

export const notImplemented = (name: string) => {
  return () => {
    throw new Error(`This feature is not implemented: ${name}`);
  };
};

export const notSupportedRuntime = (name: string) => {
  return () => {
    throw new Error(`Runtime is not supported: ${name}`);
  };
};

export interface Runtime {
  runtime: SupportedRuntimes;

  errors: {
    // deno-lint-ignore no-explicit-any
    NotFound: any;
  };

  execPath(): string;
  getArgs(): Array<string>;
  getEnv(): { [index: string]: string };
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
}

export const createDenoRuntime = (): Runtime => {
  const denoObjRef = globalThis.Deno;

  const instance = {
    runtime: SupportedRuntimes.Deno,
    errors: {
      NotFound: denoObjRef.errors.NotFound,
    },

    execPath: denoObjRef.execPath,
    getArgs: () => denoObjRef.args,
    getEnv: () => denoObjRef.env.toObject(),
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

export const createGenericRuntime = (): Runtime => {
  return {
    runtime: SupportedRuntimes.Unknown,
    errors: {
      NotFound: Error,
    },

    execPath: notImplemented("execPath"),
    getArgs: notImplemented("getArgs"),
    getEnv: notImplemented("getEnv"),
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

export const createRuntime = (): Runtime => {
  if (globalThis.Deno !== undefined) {
    return createDenoRuntime();
  }

  return createGenericRuntime();
};

export const current = createRuntime();

// export const addSignalListener = denoObjRef?.addSignalListener ??
//   notImplemented;
// // export const args: string[] = denoObjRef?.args ?? []; // FIXME(@eser) throw error if undefined?
// export const bench = denoObjRef?.bench ?? notImplemented;
// // export const build: typeof Deno.build = denoObjRef?.build ?? {};
// export const chdir = denoObjRef?.chdir ?? notImplemented;
// // export const ChildProcess = denoObjRef?.ChildProcess;
// // export const chmod = denoObjRef?.chmod ?? notImplemented;
// // export const chown = denoObjRef?.chown ?? notImplemented;
// // export const close = denoObjRef?.close ?? notImplemented;
// // export const Command = denoObjRef?.Command ?? notImplemented;
// // export const connect = denoObjRef?.connect ?? notImplemented;
// // export const connectTls = denoObjRef?.connectTls ?? notImplemented;
// // export const consoleSize = denoObjRef?.consoleSize ?? notImplemented;
// // export const copyFile = denoObjRef?.copyFile ?? notImplemented;
// // export const create = denoObjRef?.create ?? notImplemented;
// // export const cwd = denoObjRef?.cwd ?? notImplemented;
// // export const env: Deno.Env = denoObjRef?.env;
// // export const errors = denoObjRef?.errors;
// // export const execPath = denoObjRef?.execPath;
// // export const fdatasync = denoObjRef?.fdatasync ?? notImplemented;
// // export const FsFile = denoObjRef?.FsFile;
// // export const fstat = denoObjRef?.fstat ?? notImplemented;
// // export const fsync = denoObjRef?.fsync ?? notImplemented;
// // export const ftruncate = denoObjRef?.ftruncate ?? notImplemented;
// // export const futime = denoObjRef?.futime ?? notImplemented;
// // export const gid = denoObjRef?.gid ?? notImplemented;
// // export const hostname = denoObjRef?.hostname ?? notImplemented;
// // export const inspect = denoObjRef?.inspect ?? notImplemented;
// // export const isatty = denoObjRef?.isatty ?? notImplemented;
// // export const kill = denoObjRef?.kill ?? notImplemented;
// // export const link = denoObjRef?.link ?? notImplemented;
// // export const listen = denoObjRef?.listen ?? notImplemented;
// // export const listenTls = denoObjRef?.listenTls ?? notImplemented;
// // export const loadavg = denoObjRef?.loadavg ?? notImplemented;
// // export const lstat = denoObjRef?.lstat ?? notImplemented;
// // export const mainModule = denoObj?.permissions.querySync({ name: "read" })
// //   ? denoObj?.mainModule
// //   : undefined;
// // export const makeTempDir = denoObjRef?.makeTempDir ?? notImplemented;
// // export const makeTempFile = denoObjRef?.makeTempFile ?? notImplemented;
// // export const memoryUsage = denoObjRef?.memoryUsage ?? notImplemented;
// // export const mkdir = denoObjRef?.mkdir ?? notImplemented;
// // export const networkInterfaces = denoObjRef?.networkInterfaces ?? notImplemented;
// // export const noColor = denoObjRef?.noColor;
// // export const open = denoObjRef?.open ?? notImplemented;
// // export const osRelease = denoObjRef?.osRelease ?? notImplemented;
// // export const osUptime = denoObjRef?.osUptime ?? notImplemented;
// // export const permissions: Deno.Permissions = denoObjRef?.permissions;
// // export const Permissions = denoObjRef?.Permissions;
// // export const PermissionStatus = denoObjRef?.PermissionStatus;
// // export const pid = denoObjRef?.pid;
// // export const ppid = denoObjRef?.ppid;
// // export const read = denoObjRef?.read ?? notImplemented;
// // export const readDir = denoObjRef?.readDir ?? notImplemented;
// // export const readFile = denoObjRef?.readFile ?? notImplemented;
// // export const readLink = denoObjRef?.readLink ?? notImplemented;
// export const readTextFile = denoObjRef?.readTextFile ?? notImplemented;
// // export const realPath = denoObjRef?.realPath ?? notImplemented;
// // export const refTimer = denoObjRef?.refTimer ?? notImplemented;
// // export const remove = denoObjRef?.remove ?? notImplemented;
// // export const removeSignalListener = denoObjRef?.removeSignalListener ?? notImplemented;
// // export const rename = denoObjRef?.rename ?? notImplemented;
// // export const resolveDns = denoObjRef?.resolveDns ?? notImplemented;
// // export const resources = denoObjRef?.resources ?? notImplemented;
// // export const seek = denoObjRef?.seek ?? notImplemented;
// // export const SeekMode = denoObjRef?.SeekMode;
// // export const serve = denoObjRef?.serve ?? notImplemented;
// // export const serveHttp = denoObjRef?.serveHttp ?? notImplemented;
// // export const shutdown = denoObjRef?.shutdown ?? notImplemented;
// // export const startTls = denoObjRef?.startTls ?? notImplemented;
// export const stat = denoObjRef?.stat ?? notImplemented;
// // export const stderr = denoObjRef?.stderr;
// // export const stdin = denoObjRef?.stdin;
// // export const stdout = denoObjRef?.stdout;
// // export const symlink = denoObjRef?.symlink ?? notImplemented;
// // export const systemMemoryInfo = denoObjRef?.systemMemoryInfo ?? notImplemented;
// // export const test = denoObjRef?.test ?? notImplemented;
// // export const truncate = denoObjRef?.truncate ?? notImplemented;
// // export const uid = denoObjRef?.uid ?? notImplemented;
// // export const unrefTimer = denoObjRef?.unrefTimer ?? notImplemented;
// // export const upgradeWebSocket = denoObjRef?.upgradeWebSocket ?? notImplemented;
// // export const utime = denoObjRef?.utime ?? notImplemented;
// // export const version = { ...denoObjRef?.version, runtime: denoObjRef?.version.deno };
// // export const watchFs = denoObjRef?.watchFs ?? notImplemented;
// // export const write = denoObjRef?.write ?? notImplemented;
// // export const writeFile = denoObjRef?.writeFile ?? notImplemented;
