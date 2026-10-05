// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as registry from "./format-registry.ts";
import * as json from "./formats/json.ts";
import * as jsonl from "./formats/jsonl.ts";
import * as yaml from "./formats/yaml.ts";
import * as csv from "./formats/csv.ts";
import * as toml from "./formats/toml.ts";

export {
  DeserializationError,
  type Format,
  FormatError,
  FormatNotFoundError,
  type FormatOptions,
  type FormatReader,
  type FormatRegistry,
  SerializationError,
  type WriteOptions,
} from "./types.ts";
export {
  createRegistry,
  formatRegistry,
  getFormat,
  hasFormat,
  listFormats,
  registerFormat,
  unregisterFormat,
} from "./format-registry.ts";

// Core: one-shot serialization
export { serialize } from "./serializer.ts";

// Core: one-shot deserialization
export { deserialize } from "./deserializer.ts";

// Export format implementations for manual registration
export { jsonFormat } from "./formats/json.ts";
export { jsonlFormat } from "./formats/jsonl.ts";
export { yamlFormat } from "./formats/yaml.ts";
export { csvFormat } from "./formats/csv.ts";
export { tomlFormat } from "./formats/toml.ts";

// Stream layer adapters for @eserstack/streams pipeline integration
export * as streamLayers from "./stream-layers.ts";

// FFI layer
export {
  decodeWith,
  encodeDocumentWith,
  encodeWith,
  type FormatEncodeDocumentOptions,
  type FormatEncodeOptions,
  type FormatListItem,
  listFormatsWith,
  type Loader,
} from "./business/formats.ts";
export {
  FORMAT_DECODE_FAILED,
  FORMAT_ENCODE_FAILED,
  FORMAT_LIST_FAILED,
  FORMAT_NOT_FOUND,
  FormatFfiError,
} from "./business/errors.ts";
export { ffiFormats } from "./adapters/ffi/loader.ts";

/**
 * Registers every built-in format (JSON, JSONL, YAML, CSV, TOML) in the global
 * registry at once. Opt-in: importing the package registers nothing.
 */
export function registerBuiltinFormats(): void {
  registry.registerFormat(json.jsonFormat);
  registry.registerFormat(jsonl.jsonlFormat);
  registry.registerFormat(yaml.yamlFormat);
  registry.registerFormat(csv.csvFormat);
  registry.registerFormat(toml.tomlFormat);
}
