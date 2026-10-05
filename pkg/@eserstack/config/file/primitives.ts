// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** The configuration file formats `parse()` and `load()` understand. */
export const FileFormats = {
  Unknown: 0,
  EnvironmentFile: 1,
  Json: 2,
  JsonWithComments: 3,
  Toml: 4,
  Yaml: 5,
} as const;

/** The name of a file format, such as `"Json"`. */
export type FileFormatKey = Exclude<
  keyof typeof FileFormats,
  number
>;
/** A file format value from `FileFormats`. */
export type FileFormat = typeof FileFormats[FileFormatKey];
