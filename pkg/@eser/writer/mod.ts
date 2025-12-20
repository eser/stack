// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export * from "./types.ts";
export * from "./format-registry.ts";
export * from "./writer.ts";

// Export format implementations for manual registration
export { jsonFormat } from "./formats/json.ts";
export { yamlFormat } from "./formats/yaml.ts";
export { csvFormat } from "./formats/csv.ts";
export { tomlFormat } from "./formats/toml.ts";

// Helper to register all built-in formats at once (opt-in)
import { registerFormat } from "./format-registry.ts";
import { jsonFormat as _jsonFormat } from "./formats/json.ts";
import { yamlFormat as _yamlFormat } from "./formats/yaml.ts";
import { csvFormat as _csvFormat } from "./formats/csv.ts";
import { tomlFormat as _tomlFormat } from "./formats/toml.ts";

export function registerBuiltinFormats(): void {
  registerFormat(_jsonFormat);
  registerFormat(_yamlFormat);
  registerFormat(_csvFormat);
  registerFormat(_tomlFormat);
}
