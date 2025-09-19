// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { write } from "@eser/writer";
import { load as loadEnv, parseEnvFromFile } from "@eser/config/dotenv";
import { loadConfig } from "./config.ts";
import { buildConfigMap, createConfigMapContext } from "./builders.ts";

export interface GenerateOptions {
  configPath?: string;
  format: "yaml" | "json";
  name?: string;
  namespace?: string;
  envFile?: string;
  baseDir?: string;
}

export const generate = async (options?: GenerateOptions): Promise<string> => {
  // Load configuration from environment and files
  const config = await loadConfig(options?.configPath);

  // Override config with options
  if (options?.name !== undefined) {
    config.configMap.name = options.name;
  }
  if (options?.namespace !== undefined) {
    config.configMap.namespace = options.namespace;
  }
  if (options?.envFile !== undefined) {
    config.configMap.envFile = options.envFile;
  }
  if (options?.format !== undefined) {
    config.output = { ...config.output, format: options.format };
  }

  // Load environment file data using @eser/config
  let envData: Record<string, string> = {};

  if (options?.envFile !== undefined) {
    // Load specific env file if provided
    const fileData = await parseEnvFromFile(options.envFile);
    envData = { ...fileData };

    // Add process environment variables (they take precedence)
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      envData[key] = value;
    }
  } else {
    // Use default @eser/config loading which handles .env files and precedence
    const baseDir = options?.baseDir ?? ".";
    const envMap = await loadEnv({ baseDir });

    // Convert Map to Record for compatibility with existing code
    envMap.forEach((value, key) => {
      if (typeof key === "string") {
        envData[key] = value;
      }
    });
  }

  // Create ConfigMap context
  const context = createConfigMapContext(config, envData);

  // Build ConfigMap resource
  const configMap = buildConfigMap(context);

  if (configMap === null) {
    return "# No ConfigMap to generate";
  }

  // Generate output based on format
  const format = config.output?.format ?? "yaml";

  // Use @eser/writer to serialize ConfigMap
  const writeOptions = {
    pretty: config.output?.pretty !== false,
  };

  return write([configMap], format, writeOptions);
};
