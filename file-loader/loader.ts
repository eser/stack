// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { fs, jsonc, path, toml, yaml } from "./deps.ts";

// TODO(@eser) introduce strategy pattern for "search parents" and "recursive search" options

export const locate = async (
  baseDir: string,
  filenames: Array<string>,
  searchParents = false,
): Promise<string | undefined> => {
  let dir = baseDir;

  while (true) {
    for (const name of filenames) {
      const filepath = path.join(dir, name);
      const isExists = await fs.exists(filepath, { isFile: true });

      if (isExists) {
        return filepath;
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
};

export const parse = async <T>(
  filepath: string,
  extension?: string,
): Promise<T> => {
  const ext = extension ?? path.extname(filepath);

  const file = await runtime.current.readTextFile(filepath);

  if (ext === ".json") {
    return JSON.parse(file) as T;
  }

  if (ext === ".jsonc") {
    return jsonc.parse(file) as T;
  }

  if (ext === ".yaml" || ext === ".yml") {
    return yaml.parse(file) as T;
  }

  if (ext === ".toml") {
    return toml.parse(file) as T;
  }

  throw new Error(`Unsupported file extension: ${ext}`);
};

export type LoadResult<T> = {
  content: T | undefined;
  path: string | undefined;
};

export const load = async <T>(
  baseDir: string,
  filenames: Array<string>,
  searchParents = false,
): Promise<LoadResult<T>> => {
  const filepath = await locate(baseDir, filenames, searchParents);

  if (filepath === undefined) {
    return {
      content: undefined,
      path: undefined,
    };
  }

  const result = await parse<T>(filepath);

  return {
    content: result,
    path: filepath,
  };
};
