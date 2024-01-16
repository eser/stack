// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { colors, path } from "./deps.ts";
import { type BuildSnapshot, type BuildSnapshotJson } from "./mod.ts";
import { setBuildId } from "./build-id.ts";

export class AotSnapshot implements BuildSnapshot {
  #files: Map<string, string>;
  #dependencies: Map<string, Array<string>>;

  constructor(
    files: Map<string, string>,
    dependencies: Map<string, Array<string>>,
  ) {
    this.#files = files;
    this.#dependencies = dependencies;
  }

  get paths(): Array<string> {
    return Array.from(this.#files.keys());
  }

  async read(pathStr: string): Promise<ReadableStream<Uint8Array> | null> {
    const filePath = this.#files.get(pathStr);
    if (filePath !== undefined) {
      try {
        const file = await runtime.current.open(filePath, { read: true });
        return file.readable;
      } catch (_err) {
        return null;
      }
    }

    // Handler will turn this into a 404
    return null;
  }

  dependencies(pathStr: string): Array<string> {
    return this.#dependencies.get(pathStr) ?? [];
  }
}

export async function loadAotSnapshot(
  snapshotDirPath: string,
): Promise<AotSnapshot | null> {
  try {
    if ((await runtime.current.stat(snapshotDirPath)).isDirectory) {
      console.log(
        `Using snapshot found at ${colors.cyan(snapshotDirPath)}`,
      );

      const snapshotPath = path.join(snapshotDirPath, "snapshot.json");
      const json = JSON.parse(
        await runtime.current.readTextFile(snapshotPath),
      ) as BuildSnapshotJson;
      setBuildId(json.build_id);

      const dependencies = new Map<string, Array<string>>(
        Object.entries(json.files),
      );

      const files = new Map<string, string>();
      Object.keys(json.files).forEach((name) => {
        const filePath = path.join(snapshotDirPath, name);
        files.set(name, filePath);
      });

      return new AotSnapshot(files, dependencies);
    }
    return null;
  } catch (err) {
    if (!(err instanceof runtime.current.errors.NotFound)) {
      throw err;
    }

    return null;
  }
}
