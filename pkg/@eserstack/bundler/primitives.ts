// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export interface Builder {
  build(): Promise<BuildSnapshot>;
}

export type BuildSnapshot = {
  /** The list of files contained in this snapshot, not prefixed by a slash. */
  readonly paths: Array<string>;

  /** For a given file, return it's contents.
   * @throws If the file is not contained in this snapshot. */
  read(
    path: string,
  ):
    | ReadableStream<Uint8Array>
    | Uint8Array
    | null
    | Promise<ReadableStream<Uint8Array> | Uint8Array | null>;

  /** For a given entrypoint, return it's list of dependencies.
   *
   * Returns an empty array if the entrypoint does not exist. */
  dependencies(pathStr: string): Array<string>;
};

export type BuildSnapshotSerialized = {
  build_id: string;
  files: Record<string, Array<string>>;
};
