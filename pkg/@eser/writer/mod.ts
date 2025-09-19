// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export * from "./types.ts";
export * from "./types.ts";
export * from "./format-registry.ts";
export * from "./writer.ts";

// Export format implementations
export { jsonFormat } from "./formats/json.ts";
export { yamlFormat } from "./formats/yaml.ts";
export { csvFormat } from "./formats/csv.ts";
export { tomlFormat } from "./formats/toml.ts";

// Auto-register built-in formats
import { registerFormat } from "./format-registry.ts";
import { jsonFormat } from "./formats/json.ts";
import { yamlFormat } from "./formats/yaml.ts";
import { csvFormat } from "./formats/csv.ts";
import { tomlFormat } from "./formats/toml.ts";

registerFormat(jsonFormat);
registerFormat(yamlFormat);
registerFormat(csvFormat);
registerFormat(tomlFormat);
