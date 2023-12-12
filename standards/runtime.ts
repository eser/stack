// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import * as JSONC from "$std/jsonc/mod.ts";
import * as path from "$std/path/mod.ts";

if (globalThis.Deno === undefined) {
  throw new Error("Deno is not defined");
}

export const addSignalListener = Deno.addSignalListener;
export const args = Deno.args;
export const bench = Deno.bench;
export const build = Deno.build;
export const chdir = Deno.chdir;
export const ChildProcess = Deno.ChildProcess;
export const chmod = Deno.chmod;
export const chown = Deno.chown;
export const close = Deno.close;
export const Command = Deno.Command;
export const connect = Deno.connect;
export const connectTls = Deno.connectTls;
export const consoleSize = Deno.consoleSize;
export const copyFile = Deno.copyFile;
export const create = Deno.create;
export const cwd = Deno.cwd;
export const env = Deno.env;
export const errors = Deno.errors;
export const execPath = Deno.execPath;
export const exit = Deno.exit;
export const fdatasync = Deno.fdatasync;
export const FsFile = Deno.FsFile;
export const fstat = Deno.fstat;
export const fsync = Deno.fsync;
export const ftruncate = Deno.ftruncate;
export const futime = Deno.futime;
export const gid = Deno.gid;
export const hostname = Deno.hostname;
export const inspect = Deno.inspect;
export const isatty = Deno.isatty;
export const kill = Deno.kill;
export const link = Deno.link;
export const listen = Deno.listen;
export const listenTls = Deno.listenTls;
export const loadavg = Deno.loadavg;
export const lstat = Deno.lstat;
// export const mainModule = Deno.permissions.querySync({ name: "read" })
//   ? Deno.mainModule
//   : undefined;
export const makeTempDir = Deno.makeTempDir;
export const makeTempFile = Deno.makeTempFile;
export const memoryUsage = Deno.memoryUsage;
export const mkdir = Deno.mkdir;
export const networkInterfaces = Deno.networkInterfaces;
export const noColor = Deno.noColor;
export const open = Deno.open;
export const openKv = Deno.openKv;
export const osRelease = Deno.osRelease;
export const osUptime = Deno.osUptime;
export const permissions = Deno.permissions;
export const Permissions = Deno.Permissions;
export const PermissionStatus = Deno.PermissionStatus;
export const pid = Deno.pid;
export const ppid = Deno.ppid;
export const read = Deno.read;
export const readDir = Deno.readDir;
export const readFile = Deno.readFile;
export const readLink = Deno.readLink;
export const readTextFile = Deno.readTextFile;
export const realPath = Deno.realPath;
export const refTimer = Deno.refTimer;
export const remove = Deno.remove;
export const removeSignalListener = Deno.removeSignalListener;
export const rename = Deno.rename;
export const resolveDns = Deno.resolveDns;
export const resources = Deno.resources;
export const seek = Deno.seek;
export const SeekMode = Deno.SeekMode;
export const serve = Deno.serve;
export const serveHttp = Deno.serveHttp;
export const shutdown = Deno.shutdown;
export const startTls = Deno.startTls;
export const stat = Deno.stat;
export const stderr = Deno.stderr;
export const stdin = Deno.stdin;
export const stdout = Deno.stdout;
export const symlink = Deno.symlink;
export const systemMemoryInfo = Deno.systemMemoryInfo;
export const test = Deno.test;
export const truncate = Deno.truncate;
export const uid = Deno.uid;
export const unrefTimer = Deno.unrefTimer;
export const upgradeWebSocket = Deno.upgradeWebSocket;
export const utime = Deno.utime;
export const version = { ...Deno.version, runtime: Deno.version.deno };
export const watchFs = Deno.watchFs;
export const write = Deno.write;
export const writeFile = Deno.writeFile;
export const writeTextFile = Deno.writeTextFile;

export interface RuntimeConfig {
  imports?: Record<string, string>;
  importMap?: string;
  tasks?: Record<string, string>;
  lint?: {
    rules: { tags?: Array<string> };
    exclude?: Array<string>;
  };
  fmt?: {
    exclude?: Array<string>;
  };
  exclude?: Array<string>;
  compilerOptions?: {
    jsx?: string;
    jsxImportSource?: string;
  };
}

export async function locateRuntimeConfig(
  directory: string,
  searchParents = false,
): Promise<string | undefined> {
  let dir = directory;

  while (true) {
    for (const name of ["deno.jsonc", "deno.json"]) {
      const filePath = path.join(dir, name);
      const fileInfo = await Deno.stat(filePath);

      if (fileInfo.isFile) {
        return filePath;
      }
    }

    if (!searchParents) {
      break;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return undefined;
}

export async function readRuntimeConfig(
  configPath: string,
): Promise<{ config: RuntimeConfig; path: string }> {
  const file = await Deno.readTextFile(configPath);

  return {
    config: JSONC.parse(file) as RuntimeConfig,
    path: configPath,
  };
}

// function isObject(value: unknown) {
//   return value !== null && typeof value === "object" &&
//     !Array.isArray(value);
// }

export async function locateAndReadRuntimeConfig(
  baseDir: string,
): Promise<{ config: RuntimeConfig; path: string | undefined }> {
  const configPath = await locateRuntimeConfig(baseDir, true);

  if (configPath === undefined) {
    // throw new Error(
    //   `Could not find a deno.json(c) file in the current directory or any parent directory.`,
    // );
    return {
      config: {},
      path: undefined,
    };
  }

  const result = await readRuntimeConfig(baseDir);

  // if (
  //   typeof result.config.importMap !== "string" &&
  //   !isObject(result.config.imports)
  // ) {
  //   const filename = path.basename(result.path);
  //   throw new Error(
  //     `${filename} must contain an 'importMap' or 'imports' property.`,
  //   );
  // }

  return result;
}
