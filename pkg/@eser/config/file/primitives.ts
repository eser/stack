// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const FileFormats = {
  Unknown: 0,
  EnvironmentFile: 1,
  Json: 2,
  JsonWithComments: 3,
  Toml: 4,
  Yaml: 5,
} as const;

export type FileFormatKey = Exclude<
  keyof typeof FileFormats,
  number
>;
export type FileFormat = typeof FileFormats[FileFormatKey];
