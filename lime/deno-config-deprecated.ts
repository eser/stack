// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fileLoader from "../file-loader/mod.ts";

export type DenoConfig = {
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
};

export const loadDenoConfig = async (
  baseDir: string,
) => {
  const denoConfig = await fileLoader.load<DenoConfig>(
    baseDir,
    ["deno.json", "deno.jsonc"],
    false,
  );

  return denoConfig;
};
