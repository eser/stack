// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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

// Helper to register all built-in formats at once (opt-in)
import { registerFormat } from "./format-registry.ts";
import { jsonFormat as _jsonFormat } from "./formats/json.ts";
import { jsonlFormat as _jsonlFormat } from "./formats/jsonl.ts";
import { yamlFormat as _yamlFormat } from "./formats/yaml.ts";
import { csvFormat as _csvFormat } from "./formats/csv.ts";
import { tomlFormat as _tomlFormat } from "./formats/toml.ts";

export function registerBuiltinFormats(): void {
  registerFormat(_jsonFormat);
  registerFormat(_jsonlFormat);
  registerFormat(_yamlFormat);
  registerFormat(_csvFormat);
  registerFormat(_tomlFormat);
}
