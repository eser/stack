// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as colors from "@std/fmt/colors";
import * as posix from "@std/path/posix";
import { NotFoundError, runtime } from "@eser/standards/runtime";
import { type BuildSnapshot, type BuildSnapshotSerialized } from "./mod.ts";
import { setBuildId } from "./build-id.ts";

export type AotSnapshotState = {
  files: Map<string, string>;
  dependencyMapping: Map<string, Array<string>>;
};

export const createAotSnapshotState = (
  files: Map<string, string>,
  dependencyMapping: Map<string, Array<string>>,
): AotSnapshotState => {
  return {
    files: files,
    dependencyMapping: dependencyMapping,
  };
};

export class AotSnapshot implements BuildSnapshot {
  readonly state: AotSnapshotState;

  constructor(state: AotSnapshotState) {
    this.state = state;
  }

  get paths(): Array<string> {
    return Array.from(this.state.files.keys());
  }

  async read(pathStr: string): Promise<ReadableStream<Uint8Array> | null> {
    const filePath = this.state.files.get(pathStr);

    if (filePath !== undefined) {
      try {
        const data = await runtime.fs.readFile(filePath);

        return new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
      } catch (_err) {
        return null;
      }
    }

    // Handler will turn this into a 404
    return null;
  }

  dependencies(pathStr: string): Array<string> {
    return this.state.dependencyMapping.get(pathStr) ?? [];
  }
}

export const loadAotSnapshot = async (
  snapshotDirPath: string,
): Promise<BuildSnapshot | null> => {
  try {
    if (!(await runtime.fs.stat(snapshotDirPath)).isDirectory) {
      return null;
    }

    console.log(
      `Using snapshot found at ${colors.cyan(snapshotDirPath)}`,
    );

    const snapshotPath = posix.join(snapshotDirPath, "snapshot.json");
    const json = JSON.parse(
      await runtime.fs.readTextFile(snapshotPath),
    ) as BuildSnapshotSerialized;
    setBuildId(json.build_id);

    const dependencies = new Map<string, Array<string>>(
      Object.entries(json.files),
    );

    const files = new Map<string, string>();
    Object.keys(json.files).forEach((name) => {
      const filePath = posix.join(snapshotDirPath, name);
      files.set(name, filePath);
    });

    return new AotSnapshot(createAotSnapshotState(files, dependencies));
  } catch (err) {
    if (!(err instanceof NotFoundError)) {
      throw err;
    }

    return null;
  }
};
